// The Gardener's loop (docs/engineering/gardener.md, "The loop"; D-74, D-76): one owner message is one request and
// one audit entry. The conversation's grade resolves to a model, the pack is built from the declared reads of the
// tools in reach, the request streams from the crate, and each tool call runs its handler: a plain one inline, a
// write one behind its card's confirm, a model-backed one as a delegated request of its own with its own entry.
// The runtime never sends while a confirm is owed and never sends what the budget does not allow. A reply carries a
// `writing` block while its request runs, and the request's audit entry is kept on the device as open until it
// settles: a request the app closed on leaves a reply that reads as interrupted and an entry recorded as such.
import { get } from 'svelte/store'
import { toast } from '@eden/ui-kit'
import { isTauri, logError } from '../../api/index.js'
import { dateIn, todayIso } from '../../dates/index.js'
import {
	buildPack,
	budgetState,
	estimateBefore,
	estimateCost,
	formatCost,
	openRequests,
	requestTokenCap,
	resolveGrade,
	resolveTool,
	toolsFor,
	type AuditEntryInput,
	type AuditRead,
	type AuditTool,
	type DraftCard,
	type GardenerEvent,
	type GardenerRequest,
	type GardenerTool,
	type Message,
	type MessageBlock,
	type ModelGrade,
	type ModelRow,
	type Pack,
	type PackReaders,
	type Resolution,
	type ServerBlock,
	type Thread,
	type ToolState,
} from '../../gardener/index.js'
import {
	attachmentKind,
	attachmentsOf,
	hasVisual,
	holdsPage,
	linksOf,
	READ_PAGE,
	recordAudit,
	scrubValue,
	STANDING_ON_CONFIRM,
	SUBSTRATE,
	withBreakpoint,
	type AttachmentBlock,
} from '../../gardener/index.js'
import { locale, t } from '../../i18n/index.js'
import { newId } from '../../data/index.js'
import { declarations } from '../../domains/index.js'
import { grants } from '../grants.svelte.js'
import { profile } from '../profile/index.js'
import { undoToast } from '../undo.js'
import { threadAttachments } from './attachments.svelte.js'
import { storeFiles, type StagedFile } from './files.js'
import { handlerOf, toolByWireName, tools as everyTool } from './handlers.js'
import { gardenerUi } from './panel-ui.svelte.js'
import { readers } from './readers.js'
import { gardenerSetup } from './setup.svelte.js'
import { threads } from './threads.svelte.js'
import { transport } from './transport.js'
import {
	GRANT_SUBJECT,
	parseJson,
	type Delegate,
	type DirectPreview,
	type Research,
	type ToolContext,
	type ToolFailure,
	type ToolFiles,
	type ToolResult,
} from './types.js'

export type { DirectPreview }

/** A confirm the owner owes before a request is sent (D-74): the sheet's words and what answers it. */
export interface ConfirmRequest {
	title: string
	subject: string
	resource: string
	text: string
	verb: string
	resolve: (ok: boolean) => void
}

type ToolCall = Extract<MessageBlock, { kind: 'tool' }>['call']

const MAX_ROUNDS = 6
const OUTPUT_RESERVE = 4096
const DELEGATED_OUTPUT = 2048
/** The room a model that reasons before it answers is given on top, since its reasoning counts toward the limit. */
const THINKING_ROOM = { chat: 4096, delegated: 2048 } as const
/** What the model is told with the results of its last allowed round of tools. */
const LAST_ROUND = 'That was the last tool call this message allows. Answer the owner now with what you have.'
const WARNED_KEY = 'eden:gardener-warned'
/** The errors a second try may clear: the network, a rate limit, an overloaded provider. */
const RETRYABLE: readonly string[] = ['network', '429', '529']
const unsettled = openRequests(() => localStorage)

interface Usage {
	tokensIn: number
	tokensOut: number
	cacheRead: number
	/** What the provider wrote to its cache, billed at a rate of its own (D-116). */
	cacheWrite?: number
	/** The web searches the provider ran, each with a fee of its own (D-132). */
	searches?: number
}

/** Every registry id a conversation may read: the union of what the tools declared, each once (D-31). */
const REACH: readonly string[] = [...new Set(everyTool.flatMap((tool) => tool.declaration.reads))]

/** A tool that searches the web, by its domain and id: what it answers is a page's words (D-132). */
const searchesWeb = (domain: string, tool: string) =>
	everyTool.some(
		(entry) => entry.domain === domain && entry.declaration.id === tool && entry.declaration.needs.includes('search')
	)
/** What a research request's notes may run to, and what they are allowed for when the second request is estimated. */
const RESEARCH_OUTPUT = 3072
const NOTES_TOKENS = 2500

/** An entry with the owner's day it was made on, which the usage rollup files it under (D-115). */
const dated = (entry: AuditEntryInput): AuditEntryInput => ({
	...entry,
	day: entry.day ?? dateIn(Intl.DateTimeFormat().resolvedOptions().timeZone, entry.at),
})

interface StreamOutcome {
	text: string
	blocks: unknown[]
	calls: ToolCall[]
	usage: Usage
	stop: string
	refusal: string | null
	error?: { status: number | null; message: string }
	/** The blocks of a tool the provider ran itself (D-132): its calls and what each returned. */
	server: ServerBlock[]
}

const sum = (a: Usage, b: Usage): Usage => ({
	tokensIn: a.tokensIn + b.tokensIn,
	tokensOut: a.tokensOut + b.tokensOut,
	cacheRead: a.cacheRead + b.cacheRead,
	cacheWrite: (a.cacheWrite ?? 0) + (b.cacheWrite ?? 0),
	...((a.searches ?? 0) + (b.searches ?? 0) ? { searches: (a.searches ?? 0) + (b.searches ?? 0) } : {}),
})

export class GardenerRuntime {
	streaming = $state(false)
	/** The reply the request is writing, and its thread, while one runs. */
	live = $state<{ threadId: string; messageId: string } | undefined>()
	/** The thread being answered before its reply exists: the pack is being built and the budget read. */
	preparing = $state<string | undefined>()
	/** A confirm the sheet shows; nothing is sent while it is owed. */
	pending = $state<ConfirmRequest | undefined>()
	/** Why the last ask could not run, as a kit string key, or nothing. */
	error = $state<string | undefined>()
	/** A page is running a tool itself (`runDirect`): the one stream is taken, so a message waits. */
	direct = $state(false)

	#cancel: (() => Promise<boolean>) | undefined
	/** An ask or a retry is on its way to a request: a second one waits its turn by not starting. */
	#asking = false
	#settled: Promise<void> | undefined
	/** The confirms owed on tool cards, by call id; not state, nothing renders from it. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain map: nothing reads it reactively
	#confirms = new Map<string, (ok: boolean) => void>()
	/**
	 * The conversations that hold a page read from the web: each write in one is confirmed, whatever grant its tool
	 * has. It is read again from the stored thread before each request (`holdsPage`), so it outlasts a restart.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain set: nothing reads it reactively
	#pageRead = new Set<string>()

	#context(requestId: string, thread: Thread | undefined, domain?: string): ToolContext {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
		return {
			domain: thread ? (thread.domain ?? undefined) : domain,
			threadId: thread?.id ?? '',
			requestId,
			grade: gardenerSetup.grade,
			lang: (get(locale) ?? 'en') as 'en' | 'ja',
			zone,
			today: dateIn(zone, Date.now()),
			undo: undoToast,
			focus: thread ? gardenerUi.focus : [],
			links: [],
			reach: REACH,
		}
	}

	/**
	 * Records the requests the app closed on (D-76): what is still open when nothing can be running was interrupted.
	 * Once, before the first request and when the panel first opens.
	 */
	settleOpen(): Promise<void> {
		return (this.#settled ??= (async () => {
			const entries = unsettled.take()
			for (const entry of entries) await recordAudit(dated(entry)).catch(() => null)
			if (entries.length) void gardenerSetup.refreshSpend()
		})())
	}

	/** Whether a request can be made at all: everything read, and a key on this device. */
	async #ready(): Promise<boolean> {
		await Promise.all([gardenerSetup.load(), threads.load(), grants.load(), this.settleOpen()])
		this.error = undefined
		// the browser has no key and no crate: its scripted stream still exercises the thread and the log
		if (!gardenerSetup.hasKey && isTauri()) {
			this.error = 'noKey'
			return false
		}
		return true
	}

	/**
	 * The owner asks, with the files staged on the message if any; the reply streams into the thread. The files are
	 * written into the workspace first, as part of the thread (D-83), and the message names them. False when nothing
	 * was sent (not ready, already asking, a file that could not be stored), so the composer can give it all back.
	 */
	async ask(text: string, staged: readonly StagedFile[] = []): Promise<boolean> {
		const message = text.trim()
		if ((!message && !staged.length) || this.streaming || this.#asking || this.direct) return false
		this.#asking = true
		try {
			if (!(await this.#ready())) return false
			const thread = threads.current ?? threads.newThread(gardenerUi.domain, message || staged[0]!.name)
			let files: AttachmentBlock[] = []
			if (staged.length) {
				try {
					files = await storeFiles(staged, thread.uri)
				} catch (error) {
					void logError('gardener', 'The attached files could not be stored', String(error)).catch(() => null)
					return false
				}
				void threadAttachments.load(thread.uri)
			}
			threads.append(
				'owner',
				[...files, ...(message ? [{ kind: 'text' as const, text: message }] : [])],
				undefined,
				thread
			)
			await this.#answer(thread, message, files)
			return true
		} finally {
			this.#asking = false
			this.preparing = undefined
		}
	}

	/** Whether a reply can be asked for again: the thread's last message, right after the owner's, nothing running. */
	canRetry(messageId: string): boolean {
		const at = threads.messages.findIndex((entry) => entry.id === messageId)
		return !this.streaming && at > 0 && at === threads.messages.length - 1 && threads.messages[at - 1]?.role === 'owner'
	}

	/** Whether an error block is one a second try may clear. */
	retryable(code: string): boolean {
		return RETRYABLE.includes(code)
	}

	/** The owner asks again: the reply that was cut off or failed is deleted for good, and the message is answered anew. */
	async retry(messageId: string): Promise<void> {
		if (this.#asking || this.direct || !this.canRetry(messageId)) return
		this.#asking = true
		try {
			const thread = threads.current
			if (!thread || !(await this.#ready()) || threads.current?.id !== thread.id || !this.canRetry(messageId)) return
			const asked = threads.messages.at(-2)
			const message = textOf(asked)
			const files = attachmentsOf(asked?.blocks)
			if (!message && !files.length) return
			threads.removeMessages([messageId])
			await this.#answer(thread, message, files)
		} finally {
			this.#asking = false
			this.preparing = undefined
		}
	}

	/**
	 * The pack of a message in the conversation: every tool, and of what they declared they read, the little that
	 * goes up front and an index of the rest, which `read-rows` answers (D-148).
	 */
	#chatPack(
		prior: Message[],
		message: string,
		attachments: AttachmentBlock[],
		model: ModelRow,
		maxTokens: number,
		grade: ModelGrade,
		ctx: ToolContext,
		from: PackReaders
	): Promise<Pack> {
		return buildPack(
			{
				reads: [...REACH],
				focus: gardenerUi.focus,
				thread: prior,
				message,
				attachments,
				// the same list in the same order whatever panel asks, so the provider's cache holds (D-147)
				tools: toolsFor(everyTool),
				model,
				outputReserve: maxTokens,
				tokenCap: requestTokenCap(gardenerSetup.policy, model),
				subject: GRANT_SUBJECT,
				now: Date.now(),
				zone: ctx.zone ?? 'UTC',
				lang: ctx.lang,
				domain: gardenerUi.domain,
				domainName: gardenerUi.domain ? get(t)(`domains.${gardenerUi.domain}.name`) : undefined,
				domains: enabledDomains(),
				grade,
				markdown: true,
			},
			from
		)
	}

	/** Answers the owner's message, the thread's last: one request, one reply, one audit entry. */
	async #answer(thread: Thread, message: string, attachments: AttachmentBlock[] = []): Promise<void> {
		this.preparing = thread.id
		// read now, while the thread is the open one: the owner may open another before the pack is built
		const prior = threads.messages.slice(0, -1)
		const requestId = newId()
		const ctx = this.#context(requestId, thread)
		// a tool that reads files is given the message's, else the ones the owner last sent
		const given = attachments.length ? attachments : latestFiles(prior)
		if (given.length) ctx.files = { blocks: given }
		// the addresses the owner wrote are theirs to have read; a thread that already read a page is guarded
		ctx.links = linksOf(prior, message)
		if (holdsPage(prior, searchesWeb)) this.#pageRead.add(thread.id)
		const surface = gardenerUi.domain ? `${gardenerUi.domain}-chat` : 'global-chat'
		// an image or a PDF, the message's or an earlier turn's, needs a model that sees
		const needs = hasVisual(prior, attachments) ? (['tools', 'vision'] as const) : (['tools'] as const)
		const resolution = resolveGrade(gardenerSetup.grade, needs, gardenerSetup.map, gardenerSetup.models)
		if (resolution.kind !== 'model') {
			this.#unavailable(resolution, requestId, thread)
			return
		}
		const model = gardenerSetup.models({ provider: resolution.provider, model: resolution.model })
		if (!model) return this.#unavailable(resolution, requestId, thread)
		const maxTokens = OUTPUT_RESERVE + (model.thinks ? THINKING_ROOM.chat : 0)
		const pack = await this.#chatPack(prior, message, attachments, model, maxTokens, resolution.grade, ctx, readers)
		const estimate = estimateBefore(pack.estimatedInputTokens, maxTokens, model.pricing)
		if (!(await this.#budgetAllows(estimate, requestId, resolution, thread))) return
		if (resolution.confirm && !(await this.#confirmCost(resolution.model, get(t)('gardener.conversation'), estimate))) {
			this.#declined(requestId, resolution, thread)
			return
		}
		const reply = this.#begin(thread, [canSeeOf(pack)], requestId)
		threads.raiseTier(thread.id, pack.tier)
		const audit: AuditEntryInput = {
			id: requestId,
			at: Date.now(),
			surface,
			threadId: thread.id,
			parentRequestId: null,
			tool: null,
			domain: gardenerUi.domain ?? null,
			declaredGrade: gardenerSetup.grade,
			grade: resolution.grade,
			source: resolution.source,
			provider: resolution.provider,
			model: resolution.model,
			reads: pack.reads,
			entities: [...pack.entities],
			tools: [],
			confirmOutcome: resolution.confirm ? 'confirmed' : null,
			tokensIn: 0,
			tokensOut: 0,
			cacheRead: 0,
			costUsd: 0,
			outcome: 'ok',
			grants: [...pack.grants],
			image: null,
			attachments: pack.attachments,
		}
		await this.#grantDocuments(pack, audit)
		// kept as open, at what the pack is estimated to cost going in, until the provider says what it took
		const estimated: Usage = { tokensIn: pack.estimatedInputTokens, tokensOut: 0, cacheRead: 0 }
		unsettled.open({ ...audit, ...estimated, costUsd: estimateCost(estimated, model.pricing) })
		try {
			let messages = [...pack.messages]
			let usage: Usage = { tokensIn: 0, tokensOut: 0, cacheRead: 0 }
			const counted = (round: Usage) => {
				const so = sum(usage, round)
				unsettled.count(requestId, { ...so, costUsd: estimateCost(so, model.pricing) })
			}
			// six rounds of tools, and one more request for the words that close the reply
			for (let round = 0; round <= MAX_ROUNDS; round += 1) {
				const request: GardenerRequest = {
					id: requestId,
					model: resolution.model,
					maxTokens,
					system: pack.system,
					// the breakpoint moves to the end each round, so the next one reads all of this from the cache; the
					// pack's own, on the settled history, stay where they are (D-147)
					messages: withBreakpoint(messages, pack.messages.length - 1),
					tools: pack.tools,
					...(model.effort ? { effort: model.effort } : {}),
				}
				const outcome = await this.#stream(request, reply.id, counted)
				usage = sum(usage, outcome.usage)
				if (outcome.error) {
					this.#block(reply.id, {
						kind: 'error',
						code: outcome.error.status ? String(outcome.error.status) : 'network',
						message: outcome.error.message,
					})
					audit.outcome = 'error'
					break
				}
				if (outcome.stop === 'refusal') {
					this.#block(reply.id, { kind: 'error', code: 'refusal', message: outcome.refusal ?? 'refusal' })
					audit.outcome = 'refusal'
					break
				}
				if (outcome.stop === 'cancelled') {
					audit.outcome = 'cancelled'
					break
				}
				if (outcome.stop === 'max_tokens') {
					this.#block(reply.id, { kind: 'error', code: 'max-tokens', message: get(t)('gardener.cutShort') })
					audit.outcome = 'max-tokens'
					break
				}
				if (outcome.stop !== 'tool_use' || !outcome.calls.length) break
				// told it was out of rounds, it asked again: nothing more is run
				if (round === MAX_ROUNDS) break
				const results: unknown[] = []
				for (const call of outcome.calls) {
					const { result, record } = await this.#runCall(call, reply.id, ctx)
					audit.tools.push(record)
					if (record.grantId) audit.grants.push(record.grantId)
					if (result.touched) audit.entities.push(...result.touched.filter((uri) => !audit.entities.includes(uri)))
					// rows a tool read are the request's as the pack's are: on its entry, on the reply's eye, in the
					// thread's tier (D-148)
					if (result.reads?.length) {
						audit.reads = mergeReads(audit.reads, result.reads)
						for (const grant of result.grants ?? []) if (!audit.grants.includes(grant)) audit.grants.push(grant)
						if (result.tier) threads.raiseTier(thread.id, result.tier)
						const reads = audit.reads
						threads.patch(reply.id, (blocks) =>
							blocks.map((block) => (block.kind === 'can-see' ? { ...block, ...seenOf(reads) } : block))
						)
					}
					// what a tool answers leaves the device as the rows do: scrubbed (D-26); text goes as it is
					const answered = scrubValue(result.output)
					results.push({
						type: 'tool_result',
						tool_use_id: call.id,
						content: typeof answered === 'string' ? answered : JSON.stringify(answered),
						is_error: typeof result.output === 'object' && result.output !== null && 'error' in result.output,
					})
				}
				// after the last round's results the model is told to answer, so a reply never ends on a tool card
				if (round === MAX_ROUNDS - 1) results.push({ type: 'text', text: LAST_ROUND })
				messages = [...messages, { role: 'assistant', content: outcome.blocks }, { role: 'user', content: results }]
			}
			audit.tokensIn = usage.tokensIn
			audit.tokensOut = usage.tokensOut
			audit.cacheRead = usage.cacheRead
			audit.cacheWrite = usage.cacheWrite ?? 0
			audit.costUsd = estimateCost(usage, model.pricing)
		} finally {
			this.#settle(reply.id)
			await this.#record(audit)
		}
	}

	/** The reply a request writes: marked as being written, and held so the request reaches it in any thread. */
	#begin(thread: Thread, blocks: MessageBlock[], requestId: string): Message {
		const reply = threads.append('gardener', [...blocks, { kind: 'writing' }], requestId, thread)
		threads.hold(reply)
		this.preparing = undefined
		this.live = { threadId: thread.id, messageId: reply.id }
		this.streaming = true
		return reply
	}

	/** The request has ended, however it ended: the mark comes off and the reply is persisted as it stands. */
	#settle(replyId: string): void {
		this.streaming = false
		this.live = undefined
		this.#cancel = undefined
		threads.patch(replyId, (blocks) => blocks.filter((block) => block.kind !== 'writing'))
		threads.flush(replyId)
		threads.release(replyId)
	}

	/** Runs a tool the panel was opened with (an idea's brainstorm), as if the owner had asked for it. */
	async runPending(): Promise<void> {
		const pending = gardenerUi.pending
		if (!pending || this.direct) return
		gardenerUi.pending = undefined
		const tool = everyTool.find((entry) => `${entry.domain}.${entry.declaration.id}` === pending.tool)
		if (!tool) return
		if (!(await this.#ready())) return
		const title = get(t)('gardener.ranTool', { values: { tool: tool.declaration.id } })
		const thread = threads.current ?? threads.newThread(gardenerUi.domain, title)
		const requestId = newId()
		const reply = this.#begin(thread, [], requestId)
		const call: ToolCall = {
			id: `owner-${requestId}`,
			name: tool.wireName,
			domain: tool.domain,
			tool: tool.declaration.id,
			access: tool.declaration.access,
			input: pending.input,
		}
		if (holdsPage(threads.messages, searchesWeb)) this.#pageRead.add(thread.id)
		try {
			const { result } = await this.#runCall(call, reply.id, this.#context(requestId, thread))
			const reply2 =
				typeof result.output === 'object' && result.output && 'reply' in result.output
					? String(result.output.reply)
					: ''
			if (reply2) this.#block(reply.id, { kind: 'text', text: reply2 })
		} finally {
			this.#settle(reply.id)
		}
	}

	/** The owner confirms or cancels a tool card. */
	answerTool(callId: string, ok: boolean): void {
		const resolve = this.#confirms.get(callId)
		if (!resolve) return
		this.#confirms.delete(callId)
		resolve(ok)
	}

	/** Stops the stream. */
	async cancel(): Promise<void> {
		await this.#cancel?.()
	}

	/** A draft card's state, settled on its message. */
	settleDraft(messageId: string, index: number, state: 'committed' | 'discarded'): void {
		threads.patch(messageId, (blocks) =>
			blocks.map((block, i) => (i === index && block.kind === 'draft' ? { ...block, state } : block))
		)
		threads.flush(messageId)
	}

	/** A proposal card's state, settled on its message. */
	settleProposal(messageId: string, index: number, state: 'accepted' | 'dismissed'): void {
		threads.patch(messageId, (blocks) =>
			blocks.map((block, i) => (i === index && block.kind === 'proposal' ? { ...block, state } : block))
		)
		threads.flush(messageId)
	}

	/** Streams one request into the reply, or into nothing shown when there is none; answers what came back. */
	#stream(request: GardenerRequest, replyId?: string, counted?: (usage: Usage) => void): Promise<StreamOutcome> {
		return new Promise((resolve) => {
			const outcome: StreamOutcome = {
				text: '',
				blocks: [],
				calls: [],
				usage: { tokensIn: 0, tokensOut: 0, cacheRead: 0 },
				stop: 'end_turn',
				refusal: null,
				server: [],
			}
			let textIndex = -1
			const onEvent = (event: GardenerEvent) => {
				if (event.type === 'text_delta') {
					outcome.text += event.text
					if (!replyId) return
					threads.patch(replyId, (blocks) => {
						if (textIndex === -1 || blocks[textIndex]?.kind !== 'text') {
							textIndex = blocks.length
							return [...blocks, { kind: 'text', text: event.text }]
						}
						return blocks.map((block, i) =>
							i === textIndex && block.kind === 'text' ? { ...block, text: block.text + event.text } : block
						)
					})
				} else if (event.type === 'tool_use') {
					const tool = toolByWireName(event.name)
					if (outcome.text.trim()) outcome.blocks.push({ type: 'text', text: outcome.text })
					outcome.text = ''
					textIndex = -1
					outcome.blocks.push({ type: 'tool_use', id: event.id, name: event.name, input: event.input })
					outcome.calls.push({
						id: event.id,
						name: event.name,
						domain: tool?.domain ?? 'unknown',
						tool: tool?.declaration.id ?? event.name,
						access: tool?.declaration.access ?? 'read',
						input: event.input,
					})
				} else if (event.type === 'thinking') {
					// the model's reasoning goes back as it came while its request continues, and is kept nowhere else
					if (outcome.text.trim()) outcome.blocks.push({ type: 'text', text: outcome.text })
					outcome.text = ''
					textIndex = -1
					outcome.blocks.push(event.block)
				} else if (event.type === 'usage') {
					outcome.usage = {
						tokensIn: event.input,
						tokensOut: event.output,
						cacheRead: event.cacheRead,
						cacheWrite: event.cacheWrite,
						...(event.searches ? { searches: event.searches } : {}),
					}
					counted?.(outcome.usage)
				} else if (event.type === 'server_block') {
					outcome.server.push(event.block)
				} else if (event.type === 'stop') {
					outcome.stop = event.reason
					outcome.refusal = event.refusal
				} else if (event.type === 'error') {
					outcome.error = { status: event.status, message: event.message }
				}
			}
			const { done, cancel } = transport(request, onEvent)
			this.#cancel = cancel
			done
				.catch((error: unknown) => {
					outcome.error = { status: null, message: String((error as Error)?.message ?? error) }
				})
				.finally(() => {
					if (outcome.text.trim()) outcome.blocks.push({ type: 'text', text: outcome.text })
					resolve(outcome)
				})
		})
	}

	/** Runs one tool call: its card, its confirm when one is owed, its handler; answers the model's result. */
	async #runCall(
		call: ToolCall,
		replyId: string,
		ctx: ToolContext
	): Promise<{ result: ToolResult; record: AuditTool & { grantId?: string } }> {
		const tool = toolByWireName(call.name)
		const handler = tool && handlerOf(tool)
		const record: AuditTool & { grantId?: string } = { id: call.tool, access: call.access, confirm: null }
		// a write needs a grant or a confirm; act-external always confirms (grants.md). A handler may ask for this one
		// call whatever the grant (a delete, an address the owner did not give), and a conversation that has read a
		// page confirms every write: what a page says is never enough to change something on its own.
		const asked = !!handler && 'run' in handler && !!handler.asks?.(call.input, ctx)
		const guarded = call.access === 'write' && this.#pageRead.has(ctx.threadId)
		const needsConfirm =
			!!tool &&
			!!handler &&
			(asked ||
				guarded ||
				call.access === 'act-external' ||
				(call.access === 'write' &&
					!(await grants.allows({ subject: GRANT_SUBJECT, resource: call.tool, resourceType: 'tool', access: 'write' }))
						.allowed))
		// the card waits on the confirm when one is owed, and runs at once when none is
		const index = this.#addBlock(replyId, {
			kind: 'tool',
			call: tool && handler ? call : { ...call, error: noSuchTool(call.name) },
			state: !tool || !handler ? 'failed' : needsConfirm ? 'pending' : 'running',
		})
		const settle = (state: ToolState, patch: Partial<ToolCall> = {}) =>
			threads.patch(replyId, (blocks) =>
				blocks.map((block, i) =>
					i === index && block.kind === 'tool' ? { ...block, state, call: { ...block.call, ...patch } } : block
				)
			)
		if (!tool || !handler) {
			return { result: { output: { error: noSuchTool(call.name) } }, record }
		}
		if (needsConfirm) {
			const ok = await new Promise<boolean>((resolve) => this.#confirms.set(call.id, resolve))
			record.confirm = ok ? 'confirmed' : 'cancelled'
			if (!ok) {
				settle('cancelled')
				return { result: { output: { error: DECLINED, cancelled: true } }, record }
			}
			settle('running')
			// the first confirm of a quick write stands (`STANDING_ON_CONFIRM`); one that was asked for this call alone,
			// or owed to a page having been read, allows this call and no later one. A read that asked was confirmed
			// for its address, which is no grant on the tool.
			const stands =
				!asked &&
				!guarded &&
				call.access === 'write' &&
				tool.domain === SUBSTRATE &&
				STANDING_ON_CONFIRM.includes(call.tool)
			if (call.access !== 'read')
				try {
					const granted = await grants.grant({
						subject: GRANT_SUBJECT,
						resource: call.tool,
						resourceType: 'tool',
						access: call.access,
						lifetime: stands ? 'standing' : 'per-request',
						origin: 'confirm',
					})
					record.grantId = granted.id
				} catch {
					// the confirm stands on its own; the grant record is what failed
				}
		}
		try {
			const result = 'run' in handler ? await handler.run(call.input, ctx) : await this.#delegate(tool, call.input, ctx)
			// a handler that answers an error failed as surely as one that threw: the model is told so either way
			const failure = errorOf(result.output)
			if (stoodDown(result.output)) settle('cancelled', { output: result.output })
			else if (failure === undefined) settle('done', { output: result.output })
			else settle('failed', { output: result.output, error: failure })
			// from here on this conversation holds text written outside Eden
			// a page that was read, or what a search returned, is in the conversation from here on (D-126, D-132)
			if (
				failure === undefined &&
				ctx.threadId &&
				((tool.domain === SUBSTRATE && call.tool === READ_PAGE) || searchesWeb(tool.domain, call.tool))
			)
				this.#pageRead.add(ctx.threadId)
			if (result.card)
				this.#addBlock(replyId, {
					kind: 'draft',
					draft: result.card,
					state: 'pending',
					domain: tool.domain,
					callId: call.id,
				})
			if (result.proposal) {
				profile.propose(result.proposal)
				this.#addBlock(replyId, {
					kind: 'proposal',
					proposal: result.proposal,
					state: 'pending',
					callId: call.id,
				})
			}
			return { result, record }
		} catch (error) {
			const message = String((error as Error)?.message ?? error)
			settle('failed', { error: message })
			return { result: { output: { error: message } }, record }
		}
	}

	/**
	 * A page runs a model-backed tool itself, with no conversation (Hearth's capture sheet, D-86): the same
	 * resolution, pack, budget and audit entry as a delegated request, and the tool's result handed back to the page.
	 * `confirmed` says the page showed the estimate and the owner went ahead, so no second confirm is asked; without
	 * it a request that owes one is declined, since the confirm sheet is the panel's and the panel may not be open.
	 * Only a drafting or reading tool runs this way: a write keeps its card and its confirm in a conversation.
	 */
	async runDirect(
		toolKey: string,
		input: unknown,
		options: { files?: ToolFiles; confirmed?: boolean } = {}
	): Promise<ToolResult> {
		const fail = (failure: ToolFailure): ToolResult => ({ output: { error: failure }, failure })
		if (this.streaming || this.#asking || this.direct) return fail('busy')
		const tool = everyTool.find((entry) => `${entry.domain}.${entry.declaration.id}` === toolKey)
		const handler = tool && handlerOf(tool)
		const access = tool?.declaration.access
		if (!tool || !handler || !('delegate' in handler) || (access !== 'read' && access !== 'write-draft'))
			return fail('unavailable')
		this.direct = true
		try {
			if (!(await this.#ready())) return fail('no-key')
			const ctx = this.#context('', undefined, tool.domain === 'substrate' ? undefined : tool.domain)
			if (options.files) ctx.files = options.files
			return await this.#delegate(tool, input, ctx, { confirmed: options.confirmed ?? false, direct: true })
		} catch (error) {
			void logError('gardener', 'A tool run from a page failed', String(error)).catch(() => null)
			return fail('network')
		} finally {
			this.direct = false
			this.#cancel = undefined
		}
	}

	/**
	 * Who would answer a tool run from a page and roughly what it would cost, before anything is sent: the model the
	 * tool resolves to, and the estimate from the prompt and the files' sizes. No file is read and nothing leaves.
	 */
	async previewDirect(toolKey: string, input: unknown, options: { files?: ToolFiles } = {}): Promise<DirectPreview> {
		const tool = everyTool.find((entry) => `${entry.domain}.${entry.declaration.id}` === toolKey)
		const handler = tool && handlerOf(tool)
		if (!tool || !handler || !('delegate' in handler)) return { unavailable: 'unavailable' }
		await Promise.all([gardenerSetup.load(), grants.load()])
		if (!gardenerSetup.hasKey && isTauri()) return { unavailable: 'no-key' }
		const resolution = resolveTool({
			tool: tool.declaration,
			domain: tool.domain,
			overrides: gardenerSetup.overrides,
			map: gardenerSetup.map,
			models: gardenerSetup.models,
		})
		const model =
			resolution.kind === 'model'
				? gardenerSetup.models({ provider: resolution.provider, model: resolution.model })
				: undefined
		if (resolution.kind !== 'model' || !model) return { unavailable: 'unavailable' }
		const ctx = this.#context('', undefined, tool.domain === 'substrate' ? undefined : tool.domain)
		if (options.files) ctx.files = options.files
		const maxTokens = (handler.delegate.maxTokens ?? DELEGATED_OUTPUT) + (model.thinks ? THINKING_ROOM.delegated : 0)
		const pack = await this.#delegatedPack(tool, handler.delegate, input, ctx, resolution, model, maxTokens, {
			...readers,
			attachment: async () => undefined,
		})
		const research = handler.delegate.research
		// a searching tool is two requests: the one that searches, with every search it may make, and the one that reads
		const estimateUsd = research
			? estimateBefore(
					pack.estimatedInputTokens,
					RESEARCH_OUTPUT + (model.thinks ? THINKING_ROOM.delegated : 0),
					model.pricing,
					research.maxUses
				) + estimateBefore(pack.estimatedInputTokens + NOTES_TOKENS, maxTokens, model.pricing)
			: estimateBefore(pack.estimatedInputTokens, maxTokens, model.pricing)
		if (research && !gardenerSetup.provider.serverTools?.search) return { unavailable: 'unavailable' }
		const state = budgetState({
			spentThisMonth: gardenerSetup.spentThisMonth,
			capUsd: gardenerSetup.capUsd,
			estimateUsd,
			// a preview never warns: the request itself does, when it is sent
			warnedOn: todayIso(),
			today: todayIso(),
		})
		if (!state.allowed) return { unavailable: 'budget' }
		return { provider: resolution.provider, model: resolution.model, estimateUsd }
	}

	/** The pack of a delegated request: the tool's declared reads, its prompt and the files it was given. */
	async #delegatedPack(
		tool: GardenerTool,
		delegate: Delegate,
		input: unknown,
		ctx: ToolContext,
		resolution: Extract<Resolution, { kind: 'model' }>,
		model: ModelRow,
		maxTokens: number,
		from: PackReaders,
		files?: ToolFiles,
		/** The research request's own message, when the pack is that request's (D-132). */
		research?: string
	): Promise<Pack> {
		const given = files ?? (delegate.files ? await delegate.files(input, ctx) : undefined)
		const prompt = research ?? (await delegate.prompt(input, ctx))
		const focus = [...ctx.focus, ...((await delegate.focus?.(input, ctx)) ?? [])]
		return buildPack(
			{
				reads: [...tool.declaration.reads],
				focus,
				thread: [],
				message: prompt,
				attachments: given?.blocks ?? [],
				tools: [],
				model,
				outputReserve: maxTokens,
				tokenCap: requestTokenCap(gardenerSetup.policy, model),
				subject: GRANT_SUBJECT,
				now: Date.now(),
				zone: ctx.zone ?? 'UTC',
				lang: ctx.lang,
				domainName: tool.domain !== 'substrate' ? get(t)(`domains.${tool.domain}.name`) : undefined,
				domains: enabledDomains(),
				grade: resolution.grade,
				mode: research === undefined ? 'delegated' : 'research',
				json: research === undefined && !!delegate.schema,
			},
			// files a page staged are read by the page's own reader; stored ones by the workspace's
			given?.read && from === readers ? { ...from, attachment: given.read } : from
		)
	}

	/**
	 * A document is T2: attaching it and sending is the owner's consent for this request (D-82), kept as a per-request
	 * grant so the ledger shows what the Gardener was let read, and never a standing one.
	 */
	async #grantDocuments(pack: Pack, audit: AuditEntryInput): Promise<void> {
		if (!pack.attachments.some((file) => attachmentKind(file.mime) === 'document')) return
		try {
			const granted = await grants.grant({
				subject: GRANT_SUBJECT,
				resource: 'document',
				resourceType: 'registry',
				access: 'read',
				lifetime: 'per-request',
				origin: 'confirm',
			})
			audit.grants.push(granted.id)
		} catch {
			// the consent stands on its own; the grant record is what failed
		}
	}

	/** A model-backed tool as its own request: its own resolution, pack, confirm and audit entry (D-74). */
	async #delegate(
		tool: GardenerTool,
		input: unknown,
		ctx: ToolContext,
		options: { confirmed?: boolean; direct?: boolean } = {}
	): Promise<ToolResult> {
		const handler = handlerOf(tool)
		if (!handler || !('delegate' in handler))
			return { output: { error: 'This tool cannot run here.' }, failure: 'unavailable' }
		const delegate = handler.delegate
		const refusal = delegate.check?.(input, ctx)
		if (refusal) return { output: { error: refusal }, failure: 'unreadable' }
		const resolution = resolveTool({
			tool: tool.declaration,
			domain: tool.domain,
			overrides: gardenerSetup.overrides,
			map: gardenerSetup.map,
			models: gardenerSetup.models,
		})
		if (resolution.kind !== 'model') {
			const missing = resolution.kind === 'unavailable' ? resolution.missing.join(', ') : ''
			return {
				output: { error: `${UNAVAILABLE}${missing ? ` It needs a model with: ${missing}.` : ''}` },
				failure: 'unavailable',
			}
		}
		const model = gardenerSetup.models({ provider: resolution.provider, model: resolution.model })
		if (!model) return { output: { error: UNAVAILABLE }, failure: 'unavailable' }
		const files = delegate.files ? await delegate.files(input, ctx) : undefined
		if (delegate.files && !files?.blocks.length && !delegate.filesOptional?.(input))
			return { output: { error: NO_FILES }, failure: 'no-files' }
		const maxTokens = (delegate.maxTokens ?? DELEGATED_OUTPUT) + (model.thinks ? THINKING_ROOM.delegated : 0)
		// A searching tool is two requests (D-132): the research request searches and answers notes, and this one
		// reads them. The budget and the confirm were settled for both before the first was sent.
		let researched = false
		if (delegate.research) {
			const found = await this.#research(tool, delegate, delegate.research, input, ctx, resolution, model, maxTokens, {
				confirmed: options.confirmed ?? false,
				direct: options.direct ?? false,
			})
			if ('failure' in found) return found.failure
			ctx = { ...ctx, research: found }
			researched = true
		}
		const pack = await this.#delegatedPack(tool, delegate, input, ctx, resolution, model, maxTokens, readers, files)
		// the files are counted with the prompt: the pack estimates each from its size
		const inputTokens = pack.estimatedInputTokens
		const estimate = estimateBefore(inputTokens, maxTokens, model.pricing)
		const requestId = newId()
		const audit: AuditEntryInput = {
			id: requestId,
			at: Date.now(),
			surface: 'delegated',
			threadId: ctx.threadId || null,
			parentRequestId: ctx.requestId || null,
			tool: tool.declaration.id,
			domain: tool.domain === 'substrate' ? null : tool.domain,
			declaredGrade: resolution.declared,
			grade: resolution.grade,
			source: resolution.source,
			provider: resolution.provider,
			model: resolution.model,
			reads: pack.reads as AuditRead[],
			entities: [...pack.entities],
			tools: [],
			confirmOutcome: null,
			tokensIn: 0,
			tokensOut: 0,
			cacheRead: 0,
			costUsd: 0,
			outcome: 'ok',
			grants: [...pack.grants],
			image: null,
			attachments: pack.attachments,
		}
		if (!researched && !(await this.#budgetAllows(estimate, requestId, resolution, audit)))
			return { output: { error: OVER_CAP }, failure: 'budget' }
		if (options.confirmed || researched) {
			// the page showed the estimate and the owner pressed on: that is the confirm, whatever the grade
			audit.confirmOutcome = 'confirmed'
		} else if (resolution.confirm) {
			// the confirm sheet is the panel's: a page that did not confirm for itself cannot be asked through it
			const ok = !options.direct && (await this.#confirmCost(resolution.model, tool.declaration.id, estimate))
			audit.confirmOutcome = ok ? 'confirmed' : 'cancelled'
			if (!ok) {
				audit.outcome = 'declined'
				await this.#record(audit)
				return { output: { error: DECLINED, cancelled: true }, failure: 'cancelled' }
			}
		}
		await this.#grantDocuments(pack, audit)
		const request: GardenerRequest = {
			id: requestId,
			model: resolution.model,
			maxTokens,
			system: pack.system,
			messages: pack.messages,
			tools: [],
			...(delegate.schema ? { outputFormat: delegate.schema } : {}),
			...(model.effort ? { effort: model.effort } : {}),
		}
		const estimated: Usage = { tokensIn: inputTokens, tokensOut: 0, cacheRead: 0 }
		unsettled.open({ ...audit, ...estimated, costUsd: estimateCost(estimated, model.pricing) })
		// the delegated reply is read by the handler and never shown: the tool's own card is its place in the thread
		const outcome = await this.#stream(request, undefined, (usage) =>
			unsettled.count(requestId, { ...usage, costUsd: estimateCost(usage, model.pricing) })
		)
		audit.tokensIn = outcome.usage.tokensIn
		audit.tokensOut = outcome.usage.tokensOut
		audit.cacheRead = outcome.usage.cacheRead
		audit.cacheWrite = outcome.usage.cacheWrite ?? 0
		audit.costUsd = estimateCost(outcome.usage, model.pricing)
		if (outcome.error) audit.outcome = 'error'
		else if (outcome.stop === 'refusal') audit.outcome = 'refusal'
		else if (outcome.stop === 'max_tokens') audit.outcome = 'max-tokens'
		else if (outcome.stop === 'cancelled') audit.outcome = 'cancelled'
		await this.#record(audit)
		if (outcome.error) return { output: { error: outcome.error.message }, failure: 'network' }
		if (outcome.stop === 'refusal')
			return {
				output: { error: 'The model declined this request. Tell the owner; do not retry it.' },
				failure: 'refusal',
			}
		// an answer cut short, or one that is not the JSON asked for, is no answer: no card is made of half of one
		if (outcome.stop === 'max_tokens')
			return {
				output: { error: 'The answer was cut short before it finished, so nothing was drafted. Tell the owner.' },
				failure: 'max-tokens',
			}
		if (outcome.stop === 'cancelled')
			return { output: { error: 'The owner stopped this.', cancelled: true }, failure: 'cancelled' }
		if (delegate.schema && parseJson(outcome.text) === undefined)
			return {
				output: { error: 'The answer could not be read, so nothing was drafted. Tell the owner.' },
				failure: 'unreadable',
			}
		return delegate.parse(outcome.text, input, { ...ctx, files })
	}

	/**
	 * The research request of a searching tool (D-132): the tool's declared reads and its research prompt, with the
	 * provider's web search among its tools and a cap on its uses. The provider runs the searches on its own side,
	 * so nothing loops here. It answers the notes and the addresses the searches returned, or why there are none.
	 * The budget check and the confirm are made once, here, for this request and the one that reads its notes.
	 */
	async #research(
		tool: GardenerTool,
		delegate: Delegate,
		research: Research,
		input: unknown,
		ctx: ToolContext,
		resolution: Extract<Resolution, { kind: 'model' }>,
		model: ModelRow,
		readingTokens: number,
		options: { confirmed: boolean; direct: boolean }
	): Promise<{ notes: string; sources: { url: string; title: string }[] } | { failure: ToolResult }> {
		const fail = (failure: ToolFailure, error: string, cancelled = false): { failure: ToolResult } => ({
			failure: { output: { error, ...(cancelled ? { cancelled: true } : {}) }, failure },
		})
		const serverTool = gardenerSetup.provider.serverTools?.search
		if (!serverTool) return fail('unavailable', UNAVAILABLE)
		const maxTokens = RESEARCH_OUTPUT + (model.thinks ? THINKING_ROOM.delegated : 0)
		const prompt = await research.prompt(input, ctx)
		const pack = await this.#delegatedPack(
			tool,
			delegate,
			input,
			ctx,
			resolution,
			model,
			maxTokens,
			readers,
			undefined,
			prompt
		)
		const inputTokens = pack.estimatedInputTokens
		// both requests: this one with every search it may make, and the one that reads the notes
		const estimate =
			estimateBefore(inputTokens, maxTokens, model.pricing, research.maxUses) +
			estimateBefore(inputTokens + NOTES_TOKENS, readingTokens, model.pricing)
		const requestId = newId()
		const audit: AuditEntryInput = {
			id: requestId,
			at: Date.now(),
			surface: 'delegated',
			threadId: ctx.threadId || null,
			parentRequestId: ctx.requestId || null,
			tool: tool.declaration.id,
			domain: tool.domain === 'substrate' ? null : tool.domain,
			declaredGrade: resolution.declared,
			grade: resolution.grade,
			source: resolution.source,
			provider: resolution.provider,
			model: resolution.model,
			reads: pack.reads as AuditRead[],
			entities: [...pack.entities],
			tools: [],
			confirmOutcome: null,
			tokensIn: 0,
			tokensOut: 0,
			cacheRead: 0,
			costUsd: 0,
			outcome: 'ok',
			grants: [...pack.grants],
			image: null,
		}
		if (!(await this.#budgetAllows(estimate, requestId, resolution, audit))) return fail('budget', OVER_CAP)
		if (options.confirmed) {
			audit.confirmOutcome = 'confirmed'
		} else if (resolution.confirm) {
			const ok = !options.direct && (await this.#confirmCost(resolution.model, tool.declaration.id, estimate))
			audit.confirmOutcome = ok ? 'confirmed' : 'cancelled'
			if (!ok) {
				audit.outcome = 'declined'
				await this.#record(audit)
				return fail('cancelled', DECLINED, true)
			}
		}
		const location = research.location?.(input, ctx)
		const request: GardenerRequest = {
			id: requestId,
			model: resolution.model,
			maxTokens,
			system: pack.system,
			messages: pack.messages,
			tools: [
				{
					...serverTool,
					max_uses: research.maxUses,
					...(location && Object.keys(location).length ? { user_location: { type: 'approximate', ...location } } : {}),
				},
			],
			...(model.effort ? { effort: model.effort } : {}),
		}
		const estimated: Usage = { tokensIn: inputTokens, tokensOut: 0, cacheRead: 0 }
		unsettled.open({ ...audit, ...estimated, costUsd: estimateCost(estimated, model.pricing) })
		const outcome = await this.#stream(request, undefined, (usage) =>
			unsettled.count(requestId, { ...usage, costUsd: estimateCost(usage, model.pricing) })
		)
		const calls = outcome.server.filter((block) => block.type === 'server_tool_use')
		const results = outcome.server.flatMap((block) => ('results' in block ? [block] : []))
		audit.tokensIn = outcome.usage.tokensIn
		audit.tokensOut = outcome.usage.tokensOut
		audit.cacheRead = outcome.usage.cacheRead
		audit.cacheWrite = outcome.usage.cacheWrite ?? 0
		// the search's fee is part of the request's cost, so the cap and the usage page count it with no column of its own
		audit.costUsd = estimateCost({ ...outcome.usage, searches: outcome.usage.searches ?? calls.length }, model.pricing)
		// the entry lists the search once for each time the provider ran it
		audit.tools = calls.map(() => ({ id: serverTool.name, access: 'read', confirm: null }))
		if (outcome.error) audit.outcome = 'error'
		else if (outcome.stop === 'refusal') audit.outcome = 'refusal'
		else if (outcome.stop === 'max_tokens') audit.outcome = 'max-tokens'
		else if (outcome.stop === 'cancelled') audit.outcome = 'cancelled'
		await this.#record(audit)
		if (outcome.error) {
			// the provider refused the request as it was sent (web search turned off for the organisation, say): its
			// own words are what the owner can act on
			if (outcome.error.status === 400 || outcome.error.status === 403)
				return fail('search-refused', outcome.error.message)
			return fail('network', outcome.error.message)
		}
		if (outcome.stop === 'refusal')
			return fail('refusal', 'The model declined this request. Tell the owner; do not retry it.')
		if (outcome.stop === 'cancelled') return fail('cancelled', 'The owner stopped this.', true)
		const notes = outcome.text.trim()
		const sources = results.flatMap((block) => block.results)
		// no notes, or notes with no search behind them, is no research: a turn the provider paused with nothing
		// written, a search that failed, a model that answered from memory
		if (!notes || !sources.length) {
			const error = results.find((block) => block.error)?.error
			return fail('search-failed', `The web search brought nothing back${error ? ` (${error})` : ''}. Tell the owner.`)
		}
		return { notes, sources }
	}

	async #record(entry: AuditEntryInput): Promise<void> {
		try {
			await recordAudit(dated(entry))
		} catch {
			// the entry is the log's; a failure to write it is logged by the queue, never shown twice
		}
		if (entry.id) unsettled.close(entry.id)
		void gardenerSetup.refreshSpend()
		void profile.refreshUsage()
	}

	/** Whether the budget allows the estimate; declines in the thread when it does not (D-7). */
	async #budgetAllows(
		estimate: number,
		requestId: string,
		resolution: Extract<Resolution, { kind: 'model' }>,
		on: AuditEntryInput | Thread
	): Promise<boolean> {
		const today = todayIso()
		let warnedOn: string | null
		try {
			warnedOn = localStorage.getItem(WARNED_KEY)
		} catch {
			warnedOn = null
		}
		const state = budgetState({
			spentThisMonth: gardenerSetup.spentThisMonth,
			capUsd: gardenerSetup.capUsd,
			estimateUsd: estimate,
			warnedOn,
			today,
		})
		if (state.warn) {
			try {
				localStorage.setItem(WARNED_KEY, today)
			} catch {
				// no storage: the warning shows again tomorrow
			}
			toast({ message: get(t)('gardener.budgetWarning', { values: { percent: state.percent } }) })
		}
		if (state.allowed) return true
		if ('outcome' in on) {
			on.outcome = 'budget'
			await this.#record(on)
		} else {
			threads.append(
				'gardener',
				[{ kind: 'error', code: 'budget', message: get(t)('gardener.budgetReached') }],
				requestId,
				on
			)
			await this.#record({
				id: requestId,
				at: Date.now(),
				surface: gardenerUi.domain ? `${gardenerUi.domain}-chat` : 'global-chat',
				threadId: on.id,
				parentRequestId: null,
				tool: null,
				domain: gardenerUi.domain ?? null,
				declaredGrade: gardenerSetup.grade,
				grade: resolution.grade,
				source: resolution.source,
				provider: resolution.provider,
				model: resolution.model,
				reads: [],
				entities: [],
				tools: [],
				confirmOutcome: null,
				tokensIn: 0,
				tokensOut: 0,
				cacheRead: 0,
				costUsd: 0,
				outcome: 'budget',
				grants: [],
				image: null,
			})
		}
		return false
	}

	/** The cost confirm before a deep or an escalated request (D-74). */
	#confirmCost(model: string, resource: string, estimate: number): Promise<boolean> {
		return new Promise((resolve) => {
			this.pending = {
				title: get(t)('gardener.confirm.title'),
				subject: `${get(t)('shell.gardener')} · ${model}`,
				resource,
				text: get(t)('gardener.confirm.text', { values: { estimate: formatCost(estimate) } }),
				verb: get(t)('gardener.confirm.verb'),
				resolve: (ok) => {
					this.pending = undefined
					resolve(ok)
				},
			}
		})
	}

	#unavailable(resolution: Resolution, requestId: string, thread: Thread): void {
		const missing = resolution.kind === 'unavailable' ? resolution.missing.join(', ') : ''
		const reason = resolution.kind === 'unavailable' ? resolution.reason : 'plain'
		threads.append(
			'gardener',
			[{ kind: 'error', code: reason, message: get(t)(`gardener.unavailable.${reason}`, { values: { missing } }) }],
			requestId,
			thread
		)
	}

	#declined(requestId: string, resolution: Extract<Resolution, { kind: 'model' }>, thread: Thread): void {
		void this.#record({
			id: requestId,
			at: Date.now(),
			surface: gardenerUi.domain ? `${gardenerUi.domain}-chat` : 'global-chat',
			threadId: thread.id,
			parentRequestId: null,
			tool: null,
			domain: gardenerUi.domain ?? null,
			declaredGrade: gardenerSetup.grade,
			grade: resolution.grade,
			source: resolution.source,
			provider: resolution.provider,
			model: resolution.model,
			reads: [],
			entities: [],
			tools: [],
			confirmOutcome: 'cancelled',
			tokensIn: 0,
			tokensOut: 0,
			cacheRead: 0,
			costUsd: 0,
			outcome: 'declined',
			grants: [],
			image: null,
		})
	}

	#addBlock(messageId: string, block: MessageBlock): number {
		let index = -1
		threads.patch(messageId, (blocks) => {
			index = blocks.length
			return [...blocks, block]
		})
		return index
	}

	#block(messageId: string, block: MessageBlock): void {
		this.#addBlock(messageId, block)
	}
}

/** The error a tool's output carries, when it is one: what the model is told with `is_error`. */
function errorOf(output: unknown): string | undefined {
	if (typeof output !== 'object' || output === null || !('error' in output)) return undefined
	return String((output as { error: unknown }).error)
}

const noSuchTool = (name: string) => `There is no tool named ${name}. Use only the tools this request offers.`
const DECLINED = 'The owner declined this. Do not retry it unless they ask.'
const OVER_CAP =
	"This tool was not run: it would pass the owner's monthly spending cap. They can raise the cap in Settings, under Gardener."
const UNAVAILABLE =
	'This tool is unavailable: no model the owner has set up can run it. Tell them; they can change models in Settings, under Gardener.'
const NO_FILES =
	'No photo or file came with this. Ask the owner to attach one to their message (a photo, a receipt, a PDF or text), then run the tool again.'

/** The files of the latest owner message that had any: what "this photo" means a turn or two later. */
function latestFiles(prior: readonly Message[]): AttachmentBlock[] {
	for (let i = prior.length - 1; i >= 0; i -= 1) {
		const message = prior[i]
		if (message?.role !== 'owner') continue
		const files = attachmentsOf(message.blocks)
		if (files.length) return files
	}
	return []
}

/** The enabled domains as the system prompt names them: the id, and the name the owner knows. */
function enabledDomains(): { id: string; name: string }[] {
	return declarations.map((domain) => ({ id: domain.id, name: get(t)(`domains.${domain.id}.name`) }))
}

/** The owner stood the tool down part-way (no photo chosen, the cost declined): a cancel, not a failure. */
function stoodDown(output: unknown): boolean {
	return typeof output === 'object' && output !== null && (output as { cancelled?: unknown }).cancelled === true
}

/** The words of a message: its text blocks, as the owner wrote them. */
function textOf(message: Message | undefined): string {
	return ((message?.blocks ?? []) as MessageBlock[])
		.filter((block): block is Extract<MessageBlock, { kind: 'text' }> => block.kind === 'text')
		.map((block) => block.text)
		.join('\n\n')
		.trim()
}

/** The reads with more joined to them: one entry an id, its rows each once, in the order they were first read. */
function mergeReads(reads: readonly AuditRead[], more: readonly AuditRead[]): AuditRead[] {
	const merged = reads.map((read) => ({ ...read, rows: [...read.rows] }))
	for (const read of more) {
		const known = merged.find((entry) => entry.id === read.id)
		if (!known) {
			merged.push({ ...read, rows: [...read.rows] })
			continue
		}
		for (const row of read.rows) if (!known.rows.includes(row)) known.rows.push(row)
		known.count = known.rows.length
	}
	return merged
}

/** What a can-see block shows of the reads: each id with its count, and the rows behind it. */
function seenOf(reads: readonly AuditRead[]): Pick<CanSeeBlock, 'items' | 'rows'> {
	return {
		items: reads.map((read) => ({ id: read.id, count: read.count })),
		rows: Object.fromEntries(reads.map((read) => [read.id, read.rows])),
	}
}

export type CanSeeBlock = Extract<MessageBlock, { kind: 'can-see' }>

/**
 * The can-see block of a pack: the ids sent up front with their counts and rows, what is kept out and what was cut.
 * The rows the reply's tools read join it as they are read, so the eye under a reply lists exactly what it read.
 */
function canSeeOf(pack: Pack): CanSeeBlock {
	return {
		kind: 'can-see',
		...seenOf(pack.reads),
		locked: pack.locked,
		trimmed: pack.trimmed,
		...(pack.attached.length ? { attachments: pack.attached } : {}),
	}
}

export type { DraftCard, Pack }
export const runtime = new GardenerRuntime()
