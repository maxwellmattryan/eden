// The Gardener's loop (docs/engineering/gardener.md, "The loop"; D-74, D-76): one owner message is one request and
// one audit entry. The conversation's grade resolves to a model, the pack is built from the declared reads of the
// tools in reach, the request streams from the crate, and each tool call runs its handler: a plain one inline, a
// write one behind its card's confirm, a model-backed one as a delegated request of its own with its own entry.
// The runtime never sends while a confirm is owed and never sends what the budget does not allow.
import { get } from 'svelte/store'
import { toast } from '@eden/ui-kit'
import { isTauri } from '@eden/shared/api'
import { dateIn, todayIso } from '@eden/shared/dates'
import {
	buildPack,
	budgetState,
	estimateBefore,
	estimateCost,
	formatCost,
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
	type MessageBlock,
	type Pack,
	type Resolution,
} from '@eden/shared/gardener'
import { recordAudit } from '@eden/shared/gardener'
import { locale, t } from '@eden/shared/i18n'
import { newId } from '@eden/shared/data'
import { grants } from '../grants.svelte.js'
import { profile } from '../profile/store.svelte.js'
import { undoToast } from '../undo.js'
import { handlerOf, toolByWireName, tools as everyTool } from './handlers.js'
import { gardenerUi } from './panel-ui.svelte.js'
import { readers } from './readers.js'
import { gardenerSetup } from './setup.svelte.js'
import { threads } from './threads.svelte.js'
import { transport } from './transport.js'
import { GRANT_SUBJECT, type ToolContext, type ToolImage, type ToolResult } from './types.js'

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
const WARNED_KEY = 'eden:gardener-warned'

interface Usage {
	tokensIn: number
	tokensOut: number
	cacheRead: number
}

interface StreamOutcome {
	text: string
	blocks: unknown[]
	calls: ToolCall[]
	usage: Usage
	stop: string
	refusal: string | null
	error?: { status: number | null; message: string }
}

const sum = (a: Usage, b: Usage): Usage => ({
	tokensIn: a.tokensIn + b.tokensIn,
	tokensOut: a.tokensOut + b.tokensOut,
	cacheRead: a.cacheRead + b.cacheRead,
})

export class GardenerRuntime {
	streaming = $state(false)
	/** A confirm the sheet shows; nothing is sent while it is owed. */
	pending = $state<ConfirmRequest | undefined>()
	/** Why the last ask could not run, as a kit string key, or nothing. */
	error = $state<string | undefined>()

	#cancel: (() => Promise<boolean>) | undefined
	/** The confirms owed on tool cards, by call id; not state, nothing renders from it. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain map: nothing reads it reactively
	#confirms = new Map<string, (ok: boolean) => void>()

	/** The latest can-see block of the current thread: what the chip shows. */
	readonly canSee = $derived.by(() => {
		for (let i = threads.messages.length - 1; i >= 0; i -= 1) {
			const block = (threads.messages[i]?.blocks as MessageBlock[]).find((entry) => entry.kind === 'can-see')
			if (block) return block
		}
		return undefined
	})

	#context(requestId: string): ToolContext {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
		return {
			domain: threads.current?.domain ?? undefined,
			threadId: threads.current?.id ?? '',
			requestId,
			grade: gardenerSetup.grade,
			lang: (get(locale) ?? 'en') as 'en' | 'ja',
			zone,
			today: dateIn(zone, Date.now()),
			undo: undoToast,
			focus: gardenerUi.focus,
		}
	}

	/** The owner asks; the reply streams into the thread. */
	async ask(text: string): Promise<void> {
		const message = text.trim()
		if (!message || this.streaming) return
		await Promise.all([gardenerSetup.load(), threads.load(), grants.load()])
		this.error = undefined
		// the browser has no key and no crate: its scripted stream still exercises the thread and the log
		if (!gardenerSetup.hasKey && isTauri()) {
			this.error = 'noKey'
			return
		}
		if (!threads.current) threads.newThread(gardenerUi.domain, message)
		const requestId = newId()
		const ctx = this.#context(requestId)
		const surface = gardenerUi.domain ? `${gardenerUi.domain}-chat` : 'global-chat'
		const resolution = resolveGrade(gardenerSetup.grade, ['tools'], gardenerSetup.map, gardenerSetup.models)
		threads.append('owner', [{ kind: 'text', text: message }])
		if (resolution.kind !== 'model') {
			this.#unavailable(resolution, requestId)
			return
		}
		const model = gardenerSetup.models({ provider: resolution.provider, model: resolution.model })
		if (!model) return this.#unavailable(resolution, requestId)
		const reach = toolsFor(everyTool, gardenerUi.domain)
		const pack = await buildPack(
			{
				reads: reach.flatMap((tool) => tool.declaration.reads).filter((id, i, all) => all.indexOf(id) === i),
				focus: gardenerUi.focus,
				thread: threads.messages.slice(0, -1),
				message,
				tools: reach,
				model,
				outputReserve: OUTPUT_RESERVE,
				tokenCap: requestTokenCap(gardenerSetup.policy, model),
				subject: GRANT_SUBJECT,
				now: Date.now(),
				zone: ctx.zone ?? 'UTC',
				lang: ctx.lang,
				domainName: gardenerUi.domain ? get(t)(`domains.${gardenerUi.domain}.name`) : undefined,
				grade: resolution.grade,
			},
			readers
		)
		const estimate = estimateBefore(pack.estimatedInputTokens, OUTPUT_RESERVE, model.pricing)
		if (!(await this.#budgetAllows(estimate, requestId, resolution))) return
		if (resolution.confirm && !(await this.#confirmCost(resolution.model, get(t)('gardener.conversation'), estimate))) {
			this.#declined(requestId, resolution)
			return
		}
		const reply = threads.append(
			'gardener',
			[{ kind: 'can-see', items: pack.canSee, locked: pack.locked, trimmed: pack.trimmed, rows: rowsOf(pack) }],
			requestId
		)
		threads.raiseTier(threads.current!.id, pack.tier)
		this.streaming = true
		const audit: AuditEntryInput = {
			id: requestId,
			at: Date.now(),
			surface,
			threadId: threads.current!.id,
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
		}
		try {
			let messages = [...pack.messages]
			let usage: Usage = { tokensIn: 0, tokensOut: 0, cacheRead: 0 }
			for (let round = 0; round < MAX_ROUNDS; round += 1) {
				const request: GardenerRequest = {
					id: requestId,
					model: resolution.model,
					maxTokens: OUTPUT_RESERVE,
					system: pack.system,
					messages,
					tools: pack.tools,
				}
				const outcome = await this.#stream(request, reply.id)
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
				const results: unknown[] = []
				for (const call of outcome.calls) {
					const { result, record } = await this.#runCall(call, reply.id, ctx)
					audit.tools.push(record)
					if (record.grantId) audit.grants.push(record.grantId)
					if (result.touched) audit.entities.push(...result.touched)
					results.push({
						type: 'tool_result',
						tool_use_id: call.id,
						content: JSON.stringify(result.output),
						is_error: typeof result.output === 'object' && result.output !== null && 'error' in result.output,
					})
				}
				messages = [...messages, { role: 'assistant', content: outcome.blocks }, { role: 'user', content: results }]
			}
			audit.tokensIn = usage.tokensIn
			audit.tokensOut = usage.tokensOut
			audit.cacheRead = usage.cacheRead
			audit.costUsd = estimateCost(usage, model.pricing)
		} finally {
			this.streaming = false
			this.#cancel = undefined
			threads.flush(reply.id)
			await this.#record(audit)
		}
	}

	/** Runs a tool the panel was opened with (an idea's brainstorm), as if the owner had asked for it. */
	async runPending(): Promise<void> {
		const pending = gardenerUi.pending
		if (!pending) return
		gardenerUi.pending = undefined
		const tool = everyTool.find((entry) => `${entry.domain}.${entry.declaration.id}` === pending.tool)
		if (!tool) return
		await Promise.all([gardenerSetup.load(), threads.load(), grants.load()])
		if (!gardenerSetup.hasKey && isTauri()) {
			this.error = 'noKey'
			return
		}
		const title = get(t)('gardener.ranTool', { values: { tool: tool.declaration.id } })
		if (!threads.current) threads.newThread(gardenerUi.domain, title)
		const requestId = newId()
		const reply = threads.append('gardener', [], requestId)
		const call: ToolCall = {
			id: `owner-${requestId}`,
			name: tool.wireName,
			domain: tool.domain,
			tool: tool.declaration.id,
			access: tool.declaration.access,
			input: pending.input,
		}
		this.streaming = true
		try {
			const { result } = await this.#runCall(call, reply.id, this.#context(requestId))
			const reply2 =
				typeof result.output === 'object' && result.output && 'reply' in result.output
					? String(result.output.reply)
					: ''
			if (reply2) this.#block(reply.id, { kind: 'text', text: reply2 })
		} finally {
			this.streaming = false
			threads.flush(reply.id)
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

	/** Streams one request into the reply; answers what came back. */
	#stream(request: GardenerRequest, replyId: string): Promise<StreamOutcome> {
		return new Promise((resolve) => {
			const outcome: StreamOutcome = {
				text: '',
				blocks: [],
				calls: [],
				usage: { tokensIn: 0, tokensOut: 0, cacheRead: 0 },
				stop: 'end_turn',
				refusal: null,
			}
			let textIndex = -1
			const onEvent = (event: GardenerEvent) => {
				if (event.type === 'text_delta') {
					outcome.text += event.text
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
				} else if (event.type === 'usage') {
					outcome.usage = { tokensIn: event.input, tokensOut: event.output, cacheRead: event.cacheRead }
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
		const index = this.#addBlock(replyId, { kind: 'tool', call, state: tool && handler ? 'pending' : 'cancelled' })
		const settle = (state: 'done' | 'cancelled', patch: Partial<ToolCall> = {}) =>
			threads.patch(replyId, (blocks) =>
				blocks.map((block, i) =>
					i === index && block.kind === 'tool' ? { ...block, state, call: { ...block.call, ...patch } } : block
				)
			)
		if (!tool || !handler) {
			return { result: { output: { error: `no such tool: ${call.name}` } }, record }
		}
		// a write needs a grant or a confirm; act-external always confirms (grants.md)
		const needsConfirm =
			call.access === 'act-external' ||
			(call.access === 'write' &&
				!(await grants.allows({ subject: GRANT_SUBJECT, resource: call.tool, resourceType: 'tool', access: 'write' }))
					.allowed)
		if (needsConfirm) {
			const ok = await new Promise<boolean>((resolve) => this.#confirms.set(call.id, resolve))
			record.confirm = ok ? 'confirmed' : 'cancelled'
			if (!ok) {
				settle('cancelled')
				return { result: { output: { error: 'cancelled by the owner' } }, record }
			}
			try {
				const granted = await grants.grant({
					subject: GRANT_SUBJECT,
					resource: call.tool,
					resourceType: 'tool',
					access: call.access,
					lifetime:
						call.access === 'act-external' ? 'per-request' : call.tool === 'log-quick' ? 'standing' : 'per-request',
					origin: 'confirm',
				})
				record.grantId = granted.id
			} catch {
				// the confirm stands on its own; the grant record is what failed
			}
		}
		try {
			const result = 'run' in handler ? await handler.run(call.input, ctx) : await this.#delegate(tool, call.input, ctx)
			settle('done', { output: result.output })
			if (result.card)
				this.#addBlock(replyId, { kind: 'draft', draft: result.card, state: 'pending', domain: tool.domain })
			if (result.proposal) {
				profile.propose(result.proposal as Parameters<typeof profile.propose>[0])
				this.#addBlock(replyId, {
					kind: 'proposal',
					proposal: result.proposal as Parameters<typeof profile.propose>[0],
					state: 'pending',
				})
			}
			return { result, record }
		} catch (error) {
			const message = String((error as Error)?.message ?? error)
			settle('cancelled', { error: message })
			return { result: { output: { error: message } }, record }
		}
	}

	/** A model-backed tool as its own request: its own resolution, pack, confirm and audit entry (D-74). */
	async #delegate(tool: GardenerTool, input: unknown, ctx: ToolContext): Promise<ToolResult> {
		const handler = handlerOf(tool)
		if (!handler || !('delegate' in handler)) return { output: { error: 'not a model-backed tool' } }
		const delegate = handler.delegate
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
				output: {
					error: resolution.kind === 'unavailable' ? `unavailable: ${resolution.reason} ${missing}`.trim() : 'plain',
				},
			}
		}
		const model = gardenerSetup.models({ provider: resolution.provider, model: resolution.model })
		if (!model) return { output: { error: 'unavailable: no-provider' } }
		let image: ToolImage | undefined
		if (delegate.image) {
			image = await delegate.image(input, ctx)
			if (!image) return { output: { cancelled: true } }
		}
		const prompt = await delegate.prompt(input, ctx)
		const focus = [...ctx.focus, ...((await delegate.focus?.(input, ctx)) ?? [])]
		const maxTokens = delegate.maxTokens ?? DELEGATED_OUTPUT
		const pack = await buildPack(
			{
				reads: [...tool.declaration.reads],
				focus,
				thread: [],
				message: prompt,
				tools: [],
				model,
				outputReserve: maxTokens,
				tokenCap: requestTokenCap(gardenerSetup.policy, model),
				subject: GRANT_SUBJECT,
				now: Date.now(),
				zone: ctx.zone ?? 'UTC',
				lang: ctx.lang,
				domainName: tool.domain !== 'substrate' ? get(t)(`domains.${tool.domain}.name`) : undefined,
				grade: resolution.grade,
			},
			readers
		)
		const estimate = estimateBefore(pack.estimatedInputTokens, maxTokens, model.pricing)
		const requestId = newId()
		const audit: AuditEntryInput = {
			id: requestId,
			at: Date.now(),
			surface: 'delegated',
			threadId: ctx.threadId || null,
			parentRequestId: ctx.requestId,
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
			image: image ? { hash: image.hash, width: image.width, height: image.height } : null,
		}
		if (!(await this.#budgetAllows(estimate, requestId, resolution, audit)))
			return { output: { error: 'budget reached' } }
		if (resolution.confirm) {
			const ok = await this.#confirmCost(resolution.model, tool.declaration.id, estimate)
			audit.confirmOutcome = ok ? 'confirmed' : 'cancelled'
			if (!ok) {
				audit.outcome = 'declined'
				await this.#record(audit)
				return { output: { error: 'declined by the owner' } }
			}
		}
		const messages = withImage(pack.messages, image)
		const request: GardenerRequest = {
			id: requestId,
			model: resolution.model,
			maxTokens,
			system: pack.system,
			messages,
			tools: [],
		}
		const holder = threads.append('gardener', [{ kind: 'text', text: '' }], requestId)
		// the delegated reply is read by the handler, not shown: the holder keeps the request's place in the thread
		const outcome = await this.#stream(request, holder.id)
		threads.patch(holder.id, () => [
			{ kind: 'text', text: get(t)('gardener.ranTool', { values: { tool: tool.declaration.id } }) },
		])
		threads.flush(holder.id)
		audit.tokensIn = outcome.usage.tokensIn
		audit.tokensOut = outcome.usage.tokensOut
		audit.cacheRead = outcome.usage.cacheRead
		audit.costUsd = estimateCost(outcome.usage, model.pricing)
		if (outcome.error) audit.outcome = 'error'
		else if (outcome.stop === 'refusal') audit.outcome = 'refusal'
		else if (outcome.stop === 'max_tokens') audit.outcome = 'max-tokens'
		else if (outcome.stop === 'cancelled') audit.outcome = 'cancelled'
		await this.#record(audit)
		if (outcome.error) return { output: { error: outcome.error.message } }
		if (outcome.stop === 'refusal') return { output: { error: `refused: ${outcome.refusal ?? ''}` } }
		const parsed = await delegate.parse(outcome.text, input, ctx)
		// a capture keeps where its photo is, for the attachment the commit makes
		if (parsed.card?.kind === 'capture' && image?.path) parsed.card = { ...parsed.card, path: image.path }
		return parsed
	}

	async #record(entry: AuditEntryInput): Promise<void> {
		try {
			await recordAudit(entry)
		} catch {
			// the entry is the log's; a failure to write it is logged by the queue, never shown twice
		}
		void gardenerSetup.refreshSpend()
		void profile.refreshUsage()
	}

	/** Whether the budget allows the estimate; declines in the thread when it does not (D-7). */
	async #budgetAllows(
		estimate: number,
		requestId: string,
		resolution: Extract<Resolution, { kind: 'model' }>,
		audit?: AuditEntryInput
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
		if (audit) {
			audit.outcome = 'budget'
			await this.#record(audit)
		} else {
			threads.append(
				'gardener',
				[{ kind: 'error', code: 'budget', message: get(t)('gardener.budgetReached') }],
				requestId
			)
			await this.#record({
				id: requestId,
				at: Date.now(),
				surface: gardenerUi.domain ? `${gardenerUi.domain}-chat` : 'global-chat',
				threadId: threads.current?.id ?? null,
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

	#unavailable(resolution: Resolution, requestId: string): void {
		const missing = resolution.kind === 'unavailable' ? resolution.missing.join(', ') : ''
		const reason = resolution.kind === 'unavailable' ? resolution.reason : 'plain'
		threads.append(
			'gardener',
			[{ kind: 'error', code: reason, message: get(t)(`gardener.unavailable.${reason}`, { values: { missing } }) }],
			requestId
		)
	}

	#declined(requestId: string, resolution: Extract<Resolution, { kind: 'model' }>): void {
		void this.#record({
			id: requestId,
			at: Date.now(),
			surface: gardenerUi.domain ? `${gardenerUi.domain}-chat` : 'global-chat',
			threadId: threads.current?.id ?? null,
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

/** The rows behind each id of the chip, from the audit's reads. */
function rowsOf(pack: Pack): Record<string, string[]> {
	return Object.fromEntries(pack.reads.map((read) => [read.id, read.rows]))
}

/** The image goes first in the last user turn, before the prompt (the API's shape for vision). */
function withImage(messages: unknown[], image: ToolImage | undefined): unknown[] {
	if (!image) return messages
	const copy = [...messages] as { role: string; content: unknown }[]
	for (let i = copy.length - 1; i >= 0; i -= 1) {
		const turn = copy[i]
		if (turn?.role !== 'user') continue
		const content = Array.isArray(turn.content) ? turn.content : [{ type: 'text', text: String(turn.content) }]
		copy[i] = {
			role: 'user',
			content: [
				{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
				...content,
			],
		}
		break
	}
	return copy
}

export type { DraftCard, Pack }
export const runtime = new GardenerRuntime()
