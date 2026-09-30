// The context pack (docs/product/substrate/ai.md, "Declared reads and the context pack"): what one request is given,
// assembled in order within the model's budget from the declared reads. The grants gate each T2 read, a T3 read
// never passes, every string is scrubbed, a mirrored row is marked untrusted, and trimming drops the oldest entity
// rows first and says which. Pure over the readers it is handed, so the tests run it on fixtures and the apps on the
// data layer; the "can see" chip is drawn from what it answers, so the chip is literal.
import { DataError } from '../data/errors.js'
import type { GrantCheck, GrantDecision } from '../grants/types.js'
import type { ModelGrade } from '../manifest/types.js'
import type { Fact } from '../profile/types.js'
import { resource, type Resource } from '../registry/index.js'
import { persona } from './persona.js'
import type { AuditRead, Message, MessageBlock, ThreadTier } from './runtime-types.js'
import { scrubValue } from './scrub.js'
import { toApiTool, type GardenerTool } from './tools.js'
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

export interface PackReaders {
	/** The effective facts of the types, in the reader's order. */
	facts(types: string[]): Promise<Fact[]>
	/** The live rows of an entity type. */
	entities(type: string): Promise<PackRow[]>
	/** The live rows of a primitive, by kind and window when given. */
	primitives(primitive: PackPrimitive, query: { kinds?: string[]; from?: string; to?: string }): Promise<PackRow[]>
	check(check: GrantCheck): Promise<GrantDecision>
}

export interface PackRequest {
	/** The registry ids declared. */
	reads: string[]
	/** URIs pinned first in their section and never trimmed; their type is among the reads. */
	focus?: string[]
	thread: Message[]
	message: string
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
	domainName?: string
	grade: ModelGrade
}

export interface SystemBlock {
	type: 'text'
	text: string
	cache_control?: { type: 'ephemeral' }
}

export interface Pack {
	system: SystemBlock[]
	/** API messages: the prior thread as user and assistant turns, then the owner's message with the context. */
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
}

const DAY_MS = 24 * 60 * 60 * 1000
/** The window primitives are read in: a week back, two ahead. */
export const WINDOW = { back: 7, ahead: 14 } as const

const TIERS: ThreadTier[] = ['T0', 'T1', 'T2']
const rank = (tier: string) => Math.max(0, TIERS.indexOf(tier as ThreadTier))

/** The fields a row is sent without: what only the store needs. */
const OMITTED = ['uri', 'links', 'snapshot', 'deletedAt', 'createdAt', 'mirror', 'source', 'externalId']

interface Section {
	id: string
	tier: ThreadTier
	/** Facts are never trimmed. */
	facts: boolean
	rows: PackRow[]
	pinned: Set<string>
}

function line(row: PackRow): string {
	const compact: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(row)) {
		if (!OMITTED.includes(key) && value !== null && value !== undefined) compact[key] = value
	}
	const json = JSON.stringify(scrubValue(compact))
	return row.mirror ? `<untrusted source="${row.source ?? ''}">${json}</untrusted>` : json
}

const tokensOf = (text: string) => Math.ceil(text.length / 4)

const byNewest = (a: PackRow, b: PackRow) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)

function sortFacts(facts: Fact[]): Fact[] {
	const own = (fact: Fact) => (fact.provenance === 'user-asserted' ? 0 : 1)
	return [...facts].sort((a, b) => own(a) - own(b) || byNewest(a, b))
}

/** The text blocks of a message as one turn; nothing for a message with no text. */
function turnOf(message: Message): { role: 'user' | 'assistant'; content: string } | undefined {
	const text = (message.blocks as MessageBlock[])
		.filter((block): block is Extract<MessageBlock, { kind: 'text' }> => block?.kind === 'text')
		.map((block) => block.text.trim())
		.filter(Boolean)
		.join('\n\n')
	if (!text) return undefined
	return { role: message.role === 'owner' ? 'user' : 'assistant', content: text }
}

function tierOfRow(row: PackRow): string | undefined {
	const kind = (row as { kind?: unknown }).kind
	return typeof kind === 'string' ? resource(kind)?.tier : undefined
}

export async function buildPack(request: PackRequest, readers: PackReaders): Promise<Pack> {
	const locked: string[] = []
	const grants: string[] = []
	const focus = new Set(request.focus ?? [])
	const granted = new Map<string, boolean>()

	/** Whether a T2 id may be read now; asked once per id. */
	async function allowed(id: string): Promise<boolean> {
		const known = granted.get(id)
		if (known !== undefined) return known
		const decision = await readers.check({
			subject: request.subject,
			resource: id,
			resourceType: 'registry',
			access: 'read',
		})
		if (decision.allowed && decision.grantId && !grants.includes(decision.grantId)) grants.push(decision.grantId)
		granted.set(id, decision.allowed)
		return decision.allowed
	}

	// The ids that pass the gate, in the order declared, each once.
	const passed: Resource[] = []
	for (const id of [...new Set(request.reads)]) {
		const row = resource(id)
		if (!row) throw new DataError('gardener:invalid', `not a registry id: ${JSON.stringify(id)}`)
		if (row.tier === 'T3') throw new DataError('gardener:never', `${id} is T3 and never leaves`)
		if (row.tier === 'T2' && !(await allowed(id))) {
			locked.push(id)
			continue
		}
		passed.push(row)
	}

	const from = new Date(request.now - WINDOW.back * DAY_MS).toISOString()
	const to = new Date(request.now + WINDOW.ahead * DAY_MS).toISOString()

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

	const factIds = passed.filter((row) => row.category === 'fact').map((row) => row.id)
	const facts = factIds.length ? await readers.facts(factIds) : []

	const sections: Section[] = []
	for (const row of passed) {
		let rows: PackRow[]
		let tier: ThreadTier = row.tier === 'T2' ? 'T2' : row.tier === 'T0' ? 'T0' : 'T1'
		if (row.category === 'fact') {
			rows = sortFacts(facts.filter((fact) => fact.type === row.id))
		} else if (row.category === 'entity') {
			rows = [...(await readers.entities(row.id))].sort(byNewest)
		} else if (row.category === 'kind' && row.primitive && row.primitive !== 'attachment') {
			const primitive = row.primitive
			const window = primitive === 'task' ? {} : { from, to }
			rows = [...(await readers.primitives(primitive, { kinds: [row.id], ...window }))].sort(byNewest)
		} else if (row.category === 'primitive' && row.id !== 'attachment') {
			const primitive = row.id as PackPrimitive
			rows = await gated([...(await readers.primitives(primitive, primitive === 'task' ? {} : { from, to }))])
			rows.sort(byNewest)
			tier = rows.reduce<ThreadTier>((highest, item) => {
				const of = tierOfRow(item) ?? 'T1'
				return rank(of) > rank(highest) ? (of as ThreadTier) : highest
			}, 'T0')
		} else {
			rows = []
		}
		const pinned = new Set(rows.filter((item) => focus.has(item.uri)).map((item) => item.uri))
		rows = [...rows.filter((item) => pinned.has(item.uri)), ...rows.filter((item) => !pinned.has(item.uri))]
		sections.push({ id: row.id, tier, facts: row.category === 'fact', rows, pinned })
	}

	// The thread as turns, and the owner's message.
	let turns = request.thread.flatMap((message) => {
		const turn = turnOf(message)
		return turn ? [turn] : []
	})
	const trimmed: string[] = []
	const toolNames = request.tools.map((tool) => tool.wireName)
	const of = { grade: request.grade, model: request.model.id, zone: request.zone, lang: request.lang, toolNames }
	if (request.domainName) Object.assign(of, { domainName: request.domainName })
	const stable = persona({ ...of, now: '', canSee: [], locked, trimmed: [] }).stable

	const canSee = () => sections.map((section) => ({ id: section.id, count: section.rows.length }))
	const volatile = () =>
		persona({ ...of, now: new Date(request.now).toISOString(), canSee: canSee(), locked, trimmed }).volatile
	const context = () =>
		sections
			.filter((section) => section.rows.length)
			.map((section) => [`## ${section.id} (${section.rows.length} rows)`, ...section.rows.map(line)].join('\n'))
			.join('\n\n')
	const estimate = () =>
		tokensOf(stable) +
		tokensOf(volatile()) +
		tokensOf(context()) +
		turns.reduce((sum, turn) => sum + tokensOf(turn.content), 0) +
		tokensOf(request.message)

	const budget = Math.min(request.model.contextTokens, request.tokenCap ?? Infinity) - request.outputReserve
	const droppable = sections.filter((section) => !section.facts)
	let cursor = 0
	while (estimate() > budget) {
		// The oldest entity row of the next section that has one to give, round-robin; then the oldest turns.
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
		if (dropped) continue
		if (!turns.length) break
		turns = turns.slice(1)
		if (!trimmed.includes('thread')) trimmed.push('thread')
	}

	const contextText = context()
	const messages: unknown[] = [
		...turns.map((turn) => ({ role: turn.role, content: turn.content })),
		{
			role: 'user',
			content: contextText
				? [
						{ type: 'text', text: contextText },
						{ type: 'text', text: request.message },
					]
				: request.message,
		},
	]
	const included = sections.filter((section) => section.rows.length)
	const tier = included.reduce<ThreadTier>(
		(highest, section) => (rank(section.tier) > rank(highest) ? section.tier : highest),
		'T0'
	)
	return {
		system: [
			{ type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
			{ type: 'text', text: volatile() },
		],
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
	}
}
