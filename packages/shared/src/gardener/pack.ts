// The context pack (docs/product/substrate/ai.md, "Declared reads and the context pack"): what one request is given,
// assembled in order within the model's budget from the declared reads. The grants gate each T2 read, a T3 read
// never passes, every string is scrubbed (the rows, the thread and the message), a mirrored row is marked untrusted.
// A tool's own request carries every row it declared, trimmed oldest first to fit. A conversation carries little
// (D-148): the facts the substrate owns and those of the domain it was opened in, the rows it was opened on, and an
// index of every other id in reach with its count; `readRows` answers the rest on demand, through the same gate and
// the same writer. The system prompt is one stable block and the clock rides with the newest message, so the
// provider's cache holds from one message to the next (D-147). Pure over the readers it is handed, so the tests run
// it on fixtures and the apps on the data layer.
// The files the owner attached to their messages ride with the turns they belong to (D-82): the pack counts them
// without their bytes, lets go of the oldest when the request would be too large, and only then asks the reader for
// what is sent of each. A text file is sent as text, scrubbed like the message.
import { DataError } from '../data/errors.js'
import type { GrantCheck, GrantDecision } from '../grants/types.js'
import type { ModelGrade } from '../manifest/types.js'
import type { Fact } from '../profile/types.js'
import { resource, type Resource } from '../registry/index.js'
import { tasksForPack } from '../tasks/pack.js'
import { REQUEST_MAX_BYTES } from './attachment-limits.js'
import { attachmentKind, attachmentTokens, auditOf, sentBytes } from './attachments.js'
import { marked } from './cache.js'
import { persona } from './persona.js'
import { sentRow, TABLE_MIN_ROWS, writeSection } from './rows.js'
import type { AttachmentBlock, AuditAttachment, AuditRead, Message, MessageBlock, ThreadTier } from './runtime-types.js'
import { scrub, scrubValue } from './scrub.js'
import { DOMAIN_BLURBS, SUBSTRATE, toApiTool, type GardenerTool } from './tools.js'
import type { ModelRow } from './types.js'

/** What the pack needs of a row, whatever its type: the rest is serialised as it comes. */
export interface PackRow {
	uri: string
	id: string
	updatedAt: string
	mirror?: boolean
	source?: string | null
}

export type PackPrimitive = 'task' | 'event' | 'place'

/** A file as it is sent: an image or a PDF as base64, a text file as its text. */
export type PackAttachment =
	{ kind: 'image'; mediaType: string; data: string } | { kind: 'pdf'; data: string } | { kind: 'text'; text: string }

export interface PackReaders {
	/** The effective facts of the types, in the reader's order. */
	facts(types: string[]): Promise<Fact[]>
	/** The live rows of an entity type. */
	entities(type: string): Promise<PackRow[]>
	/** The live rows of a primitive, by kind and window when given. */
	primitives(primitive: PackPrimitive, query: { kinds?: string[]; from?: string; to?: string }): Promise<PackRow[]>
	check(check: GrantCheck): Promise<GrantDecision>
	/** What is sent of an attached file; nothing when its bytes are not on this device. */
	attachment?(block: AttachmentBlock): Promise<PackAttachment | undefined>
}

export interface PackRequest {
	/** The registry ids declared. */
	reads: string[]
	/** URIs pinned first in their section and never trimmed; their type is among the reads. */
	focus?: string[]
	thread: Message[]
	message: string
	/** The files attached to the message; they are never trimmed. */
	attachments?: AttachmentBlock[]
	tools: GardenerTool[]
	model: ModelRow
	/** The tokens kept for the answer. */
	outputReserve: number
	tokenCap: number | null
	/** The grant subject: the provider. */
	subject: string
	now: number
	zone: string
	lang: 'en' | 'ja'
	/** The domain the conversation was opened in, by its id: its facts go up front (D-148). */
	domain?: string
	domainName?: string
	/** The enabled domains, each by its id and the name the owner knows. */
	domains?: { id: string; name: string }[]
	grade: ModelGrade
	/** The reply is read in the panel, so the persona asks for Markdown; a delegated request leaves it off. */
	markdown?: boolean
	/** A chat with the owner (the default), or one tool's delegated request, which has a system prompt of its own. */
	mode?: 'chat' | 'delegated' | 'research'
	/** A delegated reply held to a JSON schema. */
	json?: boolean
}

export interface SystemBlock {
	type: 'text'
	text: string
	cache_control?: { type: 'ephemeral' }
}

export interface Pack {
	system: SystemBlock[]
	/**
	 * API messages: the prior thread as user and assistant turns, then the owner's message, which opens with the
	 * clock, the rows sent whole and, in a conversation, the index of what `read-rows` answers.
	 */
	messages: unknown[]
	tools: unknown[]
	canSee: { id: string; count: number }[]
	locked: string[]
	trimmed: string[]
	reads: AuditRead[]
	/** The URIs of every entity and primitive row included. */
	entities: string[]
	/** The grants the T2 reads were allowed by. */
	grants: string[]
	estimatedInputTokens: number
	tier: ThreadTier
	/** The owner's files this request carries, the message's and the earlier ones still in it, for the audit log. */
	attachments: AuditAttachment[]
	/** The same files by name, for the "can see" chip. */
	attached: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000
/** The window primitives are read in: a week back, two ahead. */
export const WINDOW = { back: 7, ahead: 14 } as const

const TIERS: ThreadTier[] = ['T0', 'T1', 'T2']
const rank = (tier: string) => Math.max(0, TIERS.indexOf(tier as ThreadTier))

interface Section {
	id: string
	tier: ThreadTier
	/** Facts are never trimmed. */
	facts: boolean
	rows: PackRow[]
	pinned: Set<string>
	/** Written as a JSON object a line and not as a table; settled before any row is trimmed, so trimming only shrinks it. */
	lines?: boolean
}

const tokensOf = (text: string) => Math.ceil(text.length / 4)

const byNewest = (a: PackRow, b: PackRow) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)

function sortFacts(facts: Fact[]): Fact[] {
	const own = (fact: Fact) => (fact.provenance === 'user-asserted' ? 0 : 1)
	return [...facts].sort((a, b) => own(a) - own(b) || byNewest(a, b))
}

/** One turn as the API takes it: plain words, or the blocks of a turn that called tools or answers them. */
interface Turn {
	role: 'user' | 'assistant'
	content: string | Record<string, unknown>[]
}

/** A stored result longer than this is not replayed from an earlier reply: the model is told to call again. */
const REPLAY_LIMIT = 2_000
const OMITTED_RESULT = JSON.stringify({
	omitted: 'This result is no longer kept in the conversation. Call the tool again if it is needed.',
})
const RAN_FROM_APP = '(The owner started this from a button in Eden, without a message.)'
const INTERRUPTED = JSON.stringify({ error: 'This call did not finish: the request was interrupted.' })
/** What became of the card a call left, in the words its replayed result carries. */
const CARD_STATES: Record<string, string> = {
	pending: 'not yet kept or discarded by the owner',
	committed: 'kept by the owner',
	discarded: 'discarded by the owner',
	accepted: 'accepted by the owner',
	dismissed: 'dismissed by the owner',
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The part of a turn that stands for one of the owner's files until the pack knows what it keeps: it is counted by
 * what the block says of the file, and becomes the API's block (or a line that says the file is gone) at the end.
 */
const FILE = 'eden:file'
const fileOf = (part: Record<string, unknown>) => (part.type === FILE ? (part.block as AttachmentBlock) : undefined)
const filesOf = (turn: Turn) =>
	typeof turn.content === 'string' ? [] : turn.content.flatMap((part) => fileOf(part) ?? [])

const unavailable = (block: AttachmentBlock) => `[attachment unavailable: ${block.name}]`
const notSent = (block: AttachmentBlock) => `[attachment no longer sent: ${block.name}]`

/** What the API is given for one file, or the line that says it could not be read. */
function fileBlock(block: AttachmentBlock, sent: PackAttachment | undefined): Record<string, unknown> {
	if (!sent) return { type: 'text', text: unavailable(block) }
	if (sent.kind === 'image') {
		return { type: 'image', source: { type: 'base64', media_type: sent.mediaType, data: sent.data } }
	}
	if (sent.kind === 'pdf') {
		return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: sent.data } }
	}
	return { type: 'text', text: `<file name=${JSON.stringify(block.name)}>\n${scrub(sent.text).text}\n</file>` }
}

/**
 * A stored message as the turns it was: the owner's words, or a reply's words with the tools it called and what
 * each answered, in the order they happened, so a follow-up knows what was drafted, read and refused. A call's
 * result carries what became of the card it left. `full` keeps a long result whole; an earlier reply's is left out.
 */
function turnsOf(message: Message, full: boolean): Turn[] {
	const blocks = (message.blocks as MessageBlock[]).filter(Boolean)
	const role = message.role === 'owner' ? 'user' : 'assistant'
	const cards = new Map<string, string>()
	for (const block of blocks) {
		if ((block.kind === 'draft' || block.kind === 'proposal') && block.callId)
			cards.set(block.callId, CARD_STATES[block.state] ?? block.state)
	}
	const turns: Turn[] = []
	let said: Record<string, unknown>[] = []
	let answered: Record<string, unknown>[] = []
	const flush = () => {
		// a reply with no tool call is its words alone, as a plain string
		if (said.length && !answered.length && said.every((part) => part.type === 'text'))
			turns.push({ role, content: said.map((part) => part.text as string).join('\n\n') })
		else if (said.length) turns.push({ role, content: said })
		if (answered.length) turns.push({ role: 'user', content: answered })
		said = []
		answered = []
	}
	for (const block of blocks) {
		if (block.kind === 'text') {
			const text = scrub(block.text.trim()).text
			if (!text) continue
			// words after a tool's answer are the next round of the reply
			if (answered.length) flush()
			said.push({ type: 'text', text })
		} else if (block.kind === 'attachment' && role === 'user') {
			said.push({ type: FILE, block })
		} else if (block.kind === 'tool' && role === 'assistant' && block.call?.id && block.call.name) {
			const { call } = block
			const settled = block.state === 'done' || block.state === 'failed' || block.state === 'cancelled'
			const card = cards.get(call.id)
			const output = card && isObject(call.output) ? { ...call.output, card } : call.output
			// a result that is text already (rows as `read-rows` writes them) is replayed as it was sent
			const replayed = scrubValue(output)
			let content =
				settled && output !== undefined
					? typeof replayed === 'string'
						? replayed
						: JSON.stringify(replayed)
					: settled && call.error
						? JSON.stringify({ error: scrub(call.error).text })
						: INTERRUPTED
			if (!full && content.length > REPLAY_LIMIT) content = OMITTED_RESULT
			said.push({ type: 'tool_use', id: call.id, name: call.name, input: scrubValue(call.input ?? {}) })
			answered.push({
				type: 'tool_result',
				tool_use_id: call.id,
				content,
				is_error: block.state !== 'done' || (isObject(call.output) && 'error' in call.output),
			})
		}
	}
	flush()
	return turns
}

function tierOfRow(row: PackRow): string | undefined {
	const kind = (row as { kind?: unknown }).kind
	return typeof kind === 'string' ? resource(kind)?.tier : undefined
}

/** What gates and shapes a read, whoever asks for it: the pack building a request, or `read-rows` answering one. */
interface Gate {
	/** The grant subject: the provider. */
	subject: string
	now: number
	zone: string
	/** Every task, as a delegated request's tool works from them; a conversation's are trimmed. */
	wholeTasks: boolean
	/** URIs put first in their section and never left out. */
	focus: ReadonlySet<string>
}

/**
 * The reader of one registry id's rows as a model may be given them (`readSection`): the tier gate and the grant
 * check, the domain's own projection through the readers, the tasks trimmed for a conversation, the primitives in
 * their window, the newest first with what the conversation is about ahead of them. One reader asks for each grant
 * once and keeps the grants that allowed a read.
 */
function sectionReader(gate: Gate, readers: PackReaders) {
	const grants: string[] = []
	const granted = new Map<string, boolean>()
	const from = new Date(gate.now - WINDOW.back * DAY_MS).toISOString()
	const to = new Date(gate.now + WINDOW.ahead * DAY_MS).toISOString()

	/** Whether a T2 id may be read now; asked once per id. */
	async function allowed(id: string): Promise<boolean> {
		const known = granted.get(id)
		if (known !== undefined) return known
		const decision = await readers.check({
			subject: gate.subject,
			resource: id,
			resourceType: 'registry',
			access: 'read',
		})
		if (decision.allowed && decision.grantId && !grants.includes(decision.grantId)) grants.push(decision.grantId)
		granted.set(id, decision.allowed)
		return decision.allowed
	}

	/** The rows of a by-kind primitive that may be sent: T2 kinds under a grant, T3 kinds never. */
	async function gated(rows: PackRow[]): Promise<PackRow[]> {
		const kept: PackRow[] = []
		for (const row of rows) {
			const tier = tierOfRow(row)
			if (tier === 'T3') continue
			if (tier === 'T2') {
				if (!(await allowed((row as { kind?: string }).kind ?? ''))) continue
			}
			kept.push(row)
		}
		return kept
	}

	/**
	 * The rows of a primitive: events and places in the window, tasks without one, since a routine has no due. A
	 * conversation carries the tasks trimmed (what is open, and what was done lately); a delegated request, whose
	 * tool works from the tasks it declared, carries them all.
	 */
	async function primitives(primitive: PackPrimitive, kinds?: string[]): Promise<PackRow[]> {
		if (primitive !== 'task')
			return [...(await readers.primitives(primitive, { ...(kinds ? { kinds } : {}), from, to }))]
		const rows = await readers.primitives(primitive, kinds ? { kinds } : {})
		return gate.wholeTasks ? [...rows] : tasksForPack(rows, gate.now, gate.zone, gate.focus)
	}

	/** One id's section. The id has passed the gate; `facts` are the ones already read, when the caller read many. */
	async function read(row: Resource, facts?: Fact[]): Promise<Section> {
		let rows: PackRow[]
		let tier: ThreadTier = row.tier === 'T2' ? 'T2' : row.tier === 'T0' ? 'T0' : 'T1'
		if (row.category === 'fact') {
			rows = sortFacts((facts ?? (await readers.facts([row.id]))).filter((fact) => fact.type === row.id))
		} else if (row.category === 'entity') {
			rows = [...(await readers.entities(row.id))].sort(byNewest)
		} else if (row.category === 'kind' && row.primitive && row.primitive !== 'attachment') {
			rows = (await primitives(row.primitive, [row.id])).sort(byNewest)
		} else if (row.category === 'primitive' && row.id !== 'attachment') {
			const primitive = row.id as PackPrimitive
			rows = await gated(await primitives(primitive))
			rows.sort(byNewest)
			tier = rows.reduce<ThreadTier>((highest, item) => {
				const of = tierOfRow(item) ?? 'T1'
				return rank(of) > rank(highest) ? (of as ThreadTier) : highest
			}, 'T0')
		} else {
			rows = []
		}
		const pinned = new Set(rows.filter((item) => gate.focus.has(item.uri)).map((item) => item.uri))
		rows = [...rows.filter((item) => pinned.has(item.uri)), ...rows.filter((item) => !pinned.has(item.uri))]
		return { id: row.id, tier, facts: row.category === 'fact', rows, pinned }
	}

	return { allowed, read, grants }
}

/** A `read-rows` answer longer than this, with no `ids` asked for, is the rows' ids and names instead. */
export const READ_ROWS_CHARS = 12_000

export interface ReadRowsRequest {
	/** The registry id asked for. */
	type: string
	/** The rows wanted, by `id`; every row when left out. */
	ids?: string[]
	/** The registry ids the conversation may read: the union of what its tools declared. */
	reach: readonly string[]
	subject: string
	now: number
	zone: string
	/** What a row is called where it holds no name of its own (a grocery list by its store). */
	label?: (type: string, row: PackRow) => Promise<string | undefined> | string | undefined
}

export interface ReadRowsResult {
	/** The section as the pack would have written it, or the rows' ids and names when it is too long to send whole. */
	text?: string
	/** Why nothing was read, in words the model can act on. */
	error?: string
	/** The id the owner has not shared, when that is why. */
	locked?: string
	/** What was read, for the audit entry and the reply's eye; nothing when only names were listed. */
	read?: AuditRead
	/** The URIs of the entity and primitive rows sent. */
	entities: string[]
	grants: string[]
	tier: ThreadTier
}

const NAME_KEYS = ['name', 'title', 'label'] as const

/**
 * What `read-rows` answers (D-148): one registry id's rows, read and written exactly as the pack writes a section,
 * so the tier gate, the grant check, the scrub, the domain's projection (D-101) and the untrusted wrap hold on this
 * path as they do up front. An id outside the conversation's reach, a T3 id and a T2 id with no grant are refused.
 */
export async function readRows(request: ReadRowsRequest, readers: PackReaders): Promise<ReadRowsResult> {
	const none = { entities: [], grants: [], tier: 'T0' as ThreadTier }
	const row = resource(request.type)
	if (!row || !request.reach.includes(request.type))
		return {
			...none,
			error: `${JSON.stringify(request.type)} is not a type you can read. \`type\` is one of the ids in the index of the newest message.`,
		}
	if (row.tier === 'T3') return { ...none, error: `${row.id} is never shared with a model.` }
	const ids = [...new Set(request.ids ?? [])]
	const primitive = row.category === 'kind' ? (row.primitive ?? row.id) : row.id
	const reader = sectionReader(
		{
			subject: request.subject,
			now: request.now,
			zone: request.zone,
			wholeTasks: false,
			// a row asked for by its id is never trimmed away
			focus: new Set(ids.map((id) => `eden://${primitive}/${id}`)),
		},
		readers
	)
	if (row.tier === 'T2' && !(await reader.allowed(row.id)))
		return {
			...none,
			locked: row.id,
			error: `${row.id} is locked: the owner has not shared it with you. Say so; they can allow it from the eye under this reply.`,
		}
	const section = await reader.read(row)
	const found = ids.length ? section.rows.filter((item) => ids.includes(item.id)) : section.rows
	const missing = ids.filter((id) => !found.some((item) => item.id === id))
	const whole = writeSection(row.id, found, section.facts ? { lines: true } : {})
	const notes = missing.length
		? `\n\nNo row of ${row.id} in reach has the id ${missing.map((id) => JSON.stringify(id)).join(', ')}.`
		: ''
	if (!ids.length && whole.length > READ_ROWS_CHARS) {
		const named = await Promise.all(
			found.map(async (item) => {
				const sent = sentRow(item)
				const own = await request.label?.(row.id, item)
				const name = own ?? NAME_KEYS.map((key) => sent[key]).find((value) => typeof value === 'string')
				return {
					id: item.id,
					...(typeof name === 'string' ? { name } : {}),
					// a mirrored row's name was written outside Eden as surely as the row was
					...(item.mirror ? { mirror: true, source: item.source } : {}),
				}
			})
		)
		return {
			...none,
			grants: reader.grants,
			text: `${writeSection(row.id, named, {
				note: 'too many to send whole, so each row is its `id` and its name: call again with `ids` for the rows you need',
			})}`,
		}
	}
	return {
		text: `${whole}${notes}`,
		read: { id: row.id, count: found.length, rows: found.map((item) => item.id) },
		entities: section.facts ? [] : found.map((item) => item.uri),
		grants: reader.grants,
		tier: found.length ? section.tier : 'T0',
	}
}

export async function buildPack(request: PackRequest, readers: PackReaders): Promise<Pack> {
	const locked: string[] = []
	const focus = new Set(request.focus ?? [])
	// A conversation sends an index and reads rows on demand (D-148); a tool's own request has no tools to fetch
	// with, so it carries everything it declared.
	const onDemand = (request.mode ?? 'chat') === 'chat'
	const reader = sectionReader(
		{ subject: request.subject, now: request.now, zone: request.zone, wholeTasks: !onDemand, focus },
		readers
	)
	const { grants } = reader

	// The ids that pass the gate, in the order declared, each once.
	const passed: Resource[] = []
	for (const id of [...new Set(request.reads)]) {
		const row = resource(id)
		if (!row) throw new DataError('gardener:invalid', `not a registry id: ${JSON.stringify(id)}`)
		if (row.tier === 'T3') throw new DataError('gardener:never', `${id} is T3 and never leaves`)
		if (row.tier === 'T2' && !(await reader.allowed(id))) {
			locked.push(id)
			continue
		}
		passed.push(row)
	}

	const factIds = passed.filter((row) => row.category === 'fact').map((row) => row.id)
	const facts = factIds.length ? await readers.facts(factIds) : []

	const reached: Section[] = []
	for (const row of passed) reached.push(await reader.read(row, facts))

	// What goes up front. A tool's request: every section. A conversation: the facts the substrate owns and the ones
	// of the domain it was opened in, whole, and the rows it was opened on; every other id is a line of the index.
	const upFront = (section: Section) => {
		const owner = resource(section.id)?.owner
		return section.facts && (owner === SUBSTRATE || (!!request.domain && owner === request.domain))
	}
	const sections: Section[] = onDemand
		? reached.flatMap((section) => {
				if (upFront(section)) return [section]
				const about = section.rows.filter((row) => section.pinned.has(row.uri))
				return about.length ? [{ ...section, rows: about }] : []
			})
		: reached
	const indexed = onDemand ? reached.filter((section) => !upFront(section)) : []
	// a fact is one object a line, and so are the few rows a conversation was opened on
	for (const section of sections) section.lines = section.facts || onDemand || section.rows.length < TABLE_MIN_ROWS

	// The thread as exchanges (one stored message's turns each, so trimming never parts a call from its answer), and
	// the owner's message. The last reply keeps its results whole; an earlier one's long results are left out.
	const lastReply = [...request.thread].reverse().find((message) => message.role !== 'owner')
	let exchanges = request.thread
		.map((message) => ({ reply: message.role !== 'owner', turns: turnsOf(message, message === lastReply) }))
		.filter((exchange) => exchange.turns.length > 0)
	const threadTurns = () => exchanges.flatMap((exchange) => exchange.turns)
	// a file is counted by its own estimate, not by the few characters of the part that stands for it
	const sizeOf = (turn: Turn) =>
		typeof turn.content === 'string' ? turn.content : JSON.stringify(turn.content.filter((part) => !fileOf(part)))
	const attached = request.attachments ?? []
	const filesTokens = (blocks: AttachmentBlock[]) => blocks.reduce((sum, block) => sum + attachmentTokens(block), 0)
	const earlier = () => threadTurns().flatMap(filesOf)
	/** Lets go of the files on the oldest turn that still has any; false when no earlier turn has one. */
	const dropFiles = () => {
		const turn = threadTurns().find((entry) => filesOf(entry).length)
		if (!turn || typeof turn.content === 'string') return false
		turn.content = turn.content.map((part) => {
			const block = fileOf(part)
			return block ? { type: 'text', text: notSent(block) } : part
		})
		if (!trimmed.includes('thread')) trimmed.push('thread')
		return true
	}
	const trimmed: string[] = []
	const message = scrub(request.message).text
	const of = {
		grade: request.grade,
		model: request.model.id,
		zone: request.zone,
		lang: request.lang,
		tools: request.tools.length > 0,
		domains: (request.domains ?? []).map((domain) => ({ ...domain, blurb: DOMAIN_BLURBS[domain.id] ?? '' })),
		now: request.now,
	}
	if (request.domainName) Object.assign(of, { domainName: request.domainName })
	if (request.markdown) Object.assign(of, { markdown: true })
	if (request.mode) Object.assign(of, { mode: request.mode })
	if (request.json) Object.assign(of, { json: true })
	const stable = persona({ ...of, canSee: [], locked, trimmed: [] }).stable

	const canSee = () => sections.map((section) => ({ id: section.id, count: section.rows.length }))
	const volatile = () => persona({ ...of, canSee: canSee(), locked, trimmed }).volatile
	const context = () => {
		const rows = sections
			.filter((section) => section.rows.length)
			.map((section) => writeSection(section.id, section.rows, { lines: section.lines }))
			.join('\n\n')
		return rows ? `<context>\n${rows}\n</context>` : ''
	}
	// every other id in reach, by its owner, with how many rows it has now; a locked one says so
	const index = () => {
		if (!onDemand) return ''
		const lines = [
			...indexed.map((section) => `- ${section.id} (${resource(section.id)?.owner}): ${section.rows.length} rows`),
			...locked.map((id) => `- ${id} (${resource(id)?.owner}): locked`),
		]
		return lines.length ? `<index>\n${lines.join('\n')}\n</index>` : ''
	}
	// What the newest message opens with: the clock and where the conversation is, the rows sent whole, the index.
	// None of it is in the system prompt, which is therefore the same from one message to the next (D-147).
	const head = () => [volatile(), context(), index()].filter(Boolean).join('\n\n')
	const estimate = () =>
		tokensOf(stable) +
		tokensOf(head()) +
		threadTurns().reduce((sum, turn) => sum + tokensOf(sizeOf(turn)), 0) +
		filesTokens(earlier()) +
		tokensOf(message) +
		filesTokens(attached)

	const budget = Math.min(request.model.contextTokens, request.tokenCap ?? Infinity) - request.outputReserve
	const droppable = sections.filter((section) => !section.facts)
	// The request has a size as well as a budget: earlier files go first, the oldest turn's before the next. The
	// message's own files are never let go.
	const bytes = () => [...earlier(), ...attached].reduce((sum, block) => sum + sentBytes(block), 0)
	while (bytes() > REQUEST_MAX_BYTES && dropFiles());
	let cursor = 0
	while (estimate() > budget) {
		// The oldest entity row of the next section that has one to give, round-robin; then the earlier turns' files,
		// the oldest first, so one old file does not cost the words around it; then the oldest turns.
		let dropped = false
		for (let step = 0; step < droppable.length && !dropped; step += 1) {
			const section = droppable[(cursor + step) % droppable.length]!
			let at = section.rows.length - 1
			while (at >= 0 && section.pinned.has(section.rows[at]!.uri)) at -= 1
			if (at < 0) continue
			section.rows.splice(at, 1)
			if (!trimmed.includes(section.id)) trimmed.push(section.id)
			cursor = (cursor + step + 1) % droppable.length
			dropped = true
		}
		if (dropped || dropFiles()) continue
		if (!exchanges.length) break
		exchanges = exchanges.slice(1)
		if (!trimmed.includes('thread')) trimmed.push('thread')
	}

	const headText = head()
	const turns = threadTurns()
	// The settled history (D-147): everything ahead of the last reply is sent the same way next time, so it ends on
	// a cache breakpoint, and so does everything ahead of the reply before it, which is where the last request left
	// its own. The last reply is not behind one: its long results are whole now and left out next time.
	const settled = new Set<Turn>()
	const replies = exchanges.flatMap((exchange, at) => (exchange.reply ? [at] : []))
	for (const at of replies.slice(-2)) {
		const before = exchanges[at - 1]?.turns.at(-1)
		if (before) settled.add(before)
	}
	// the API's first turn is the owner's: a thread that opens on a reply (a tool run from a button) says so
	if (turns[0]?.role === 'assistant') turns.unshift({ role: 'user', content: RAN_FROM_APP })
	// Only now are the files read: the ones still to be sent, each once.
	const carried = [...turns.flatMap(filesOf), ...attached]
	const sent = new Map<string, PackAttachment | undefined>()
	for (const block of carried) {
		if (!sent.has(block.id)) sent.set(block.id, await readers.attachment?.(block))
	}
	const filePart = (block: AttachmentBlock) => fileBlock(block, sent.get(block.id))
	const last = [
		{ type: 'text', text: headText },
		...attached.map(filePart),
		// a message of files alone has no words to send
		...(message || !attached.length ? [{ type: 'text', text: message }] : []),
	]
	const messages: unknown[] = [
		...turns.map((turn) => {
			const sentTurn = {
				role: turn.role,
				content:
					typeof turn.content === 'string'
						? turn.content
						: turn.content.map((part) => {
								const block = fileOf(part)
								return block ? filePart(block) : part
							}),
			}
			return settled.has(turn) ? marked(sentTurn) : sentTurn
		}),
		{ role: 'user', content: last },
	]
	const included = sections.filter((section) => section.rows.length)
	// a file raises the tier as a row of its kind would: a photo is T1, a document T2
	const reachedFiles = carried.filter((block) => sent.get(block.id))
	const fileTiers = reachedFiles.map((block): ThreadTier => (attachmentKind(block.mime) === 'document' ? 'T2' : 'T1'))
	const tier = [...included.map((section) => section.tier), ...fileTiers].reduce<ThreadTier>(
		(highest, next) => (rank(next) > rank(highest) ? next : highest),
		'T0'
	)
	return {
		system: [{ type: 'text', text: stable, cache_control: { type: 'ephemeral' } }],
		messages,
		tools: request.tools.map(toApiTool),
		canSee: canSee(),
		locked,
		trimmed,
		reads: sections.map((section) => ({
			id: section.id,
			count: section.rows.length,
			rows: section.rows.map((row) => row.id),
		})),
		entities: sections.filter((section) => !section.facts).flatMap((section) => section.rows.map((row) => row.uri)),
		grants,
		estimatedInputTokens: estimate(),
		tier,
		attachments: reachedFiles.map(auditOf),
		attached: reachedFiles.map((block) => block.name),
	}
}
