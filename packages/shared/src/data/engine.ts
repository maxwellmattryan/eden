// The data layer outside Tauri. `yarn dev:web` serves the app to a plain browser, where there is no crate and no
// database; this is the same API over one JSON document in the storage it is given, with real ids and real stamps,
// so a store cannot tell the difference. It follows the crate's rules (`src-tauri/src/substrate/*`), the registry
// among them, with one exception: it cannot attach a file, because a browser has no path to copy from.
import { todayIso } from '../dates/index.js'
import { VAULT_AI, type EgressQuery, type EgressRow } from '../egress/types.js'
import { checkShape, decide, validateGrant } from '../grants/rules.js'
import {
	NEVER_AUTOMATED,
	type Grant,
	type GrantCheck,
	type GrantDecision,
	type GrantInput,
	type GrantQuery,
} from '../grants/types.js'
import {
	checkWindow,
	effectiveOrder,
	historyCutoff,
	isInWindow,
	validateFact,
	validatePatch,
} from '../profile/rules.js'
import type { Fact, FactHistoryEntry, FactInput, FactPatch, FactQuery } from '../profile/types.js'
import { factsOf, isEntityType, kindsOf } from '../registry/index.js'
import { declare, setOnce, takeDue, validateDeclared, validateOnce } from '../scheduler/rules.js'
import type { DeclaredSchedule, FiredSchedule, ScheduleRow } from '../scheduler/types.js'
import { signalCutoff, validateSignal } from '../signals/rules.js'
import type { Delivery, Emitted, InboxEntry, InboxQuery, Signal, SignalInput } from '../signals/types.js'
import {
	auditCutoff,
	validateAudit,
	validateMessage,
	validatePolicy,
	validateThread,
	validateThreadPatch,
} from '../gardener/rules.js'
import type {
	AuditEntry,
	AuditEntryInput,
	AuditQuery,
	Message,
	MessageInput,
	PolicyRow,
	Thread,
	ThreadInput,
	ThreadPatch,
	ThreadQuery,
} from '../gardener/runtime-types.js'
import { DataError } from './errors.js'
import { formatStamp, parseStamp, tick, type Hlc } from './hlc.js'
import { createIdGenerator, isUlid } from './ulid.js'
import { isResourceId, parseUri, toUri } from './uri.js'
import {
	RELATIONS,
	type BatchOp,
	type BatchResult,
	type Entity,
	type EntityInput,
	type EntityQuery,
	type Link,
	type LinkInput,
	type LinkQuery,
	type PrimitiveRow,
	type Primitives,
	type PrimitiveType,
	type Query,
	type Relation,
	type Row,
	type RowInput,
	type Stamped,
} from './types.js'

/** The storage key of the document. */
export const DATA_KEY = 'eden:data:v1'

/** The id of the local calendar source, which every workspace has. An Event without a source belongs to it. */
export const LOCAL_CALENDAR_SOURCE = '00000000000000000000000001'

/** What the engine needs of a storage: `localStorage` in the browser, a map in the tests. */
export interface EngineStorage {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
}

export interface EngineOptions {
	now?: () => number
	newId?: () => string
	/** This device's node; a random one is made and kept when it is left out. */
	node?: number
	/** The local day the ledger files a request under; today when it is left out. */
	today?: () => string
}

/** How long a day stays in the ledger, as in the crate. */
export const EGRESS_RETENTION_DAYS = 90

type Fields = Record<string, unknown>
type StoredRow = Omit<Row, 'links'> & Fields

interface State {
	clock: Hlc
	markers: string[]
	rows: Record<string, StoredRow>
	links: Link[]
	/** The grant store (`grants.rs`), revocations included. */
	grants: Grant[]
	/** The egress ledger (`egress.rs`), one row per destination and day. */
	egress: EgressRow[]
	/** The profile (`facts.rs`), tombstones included. */
	facts: Fact[]
	/** What a fact held before each edit, thirty days. */
	factHistory: FactHistoryEntry[]
	/** The scheduler (`scheduler.rs`): each named schedule and the instant it is next due. */
	schedules: ScheduleRow[]
	/** What happened (`signals.rs`), thirty days. */
	signals: Omit<Signal, 'at'>[]
	/** One rule's card for one signal; its words are the signal's. */
	inbox: InboxRow[]
	/** The audit log (`audit.rs`): this browser's, ninety days. */
	audit: AuditEntry[]
	/** The Gardener's threads and their messages (`threads.rs`), tombstones included. */
	threads: Thread[]
	messages: Message[]
	/** Workspace policy (`policy.rs`): the Gardener's settings, tombstones included. */
	policy: PolicyRow[]
}

interface InboxRow extends Delivery {
	id: string
	signalId: string
	read: boolean
}

const INBOX_LIMIT = { default: 50, max: 200 }

/**
 * A primitive as the crate describes it (`primitives.rs`): its kinds, which are the registry's, and each field with
 * what it is when left out.
 */
interface Primitive {
	kinds: readonly string[]
	required: readonly string[]
	/** What a patch may not change. */
	fixed: readonly string[]
	fields: Readonly<Fields>
}

const PRIMITIVES: Record<PrimitiveType, Primitive> = {
	task: {
		kinds: kindsOf('task'),
		required: ['kind', 'title'],
		fixed: [],
		fields: {
			kind: null,
			title: null,
			notes: null,
			due: null,
			priority: 'none',
			at: null,
			timeOfDay: null,
			recurrence: null,
			items: null,
			target: null,
			grace: null,
			streak: 0,
			progress: null,
			done: false,
			completedAt: null,
		},
	},
	event: {
		kinds: kindsOf('event'),
		required: ['kind', 'title', 'startAt'],
		fixed: [],
		fields: {
			kind: null,
			title: null,
			startAt: null,
			endAt: null,
			allDay: false,
			timezone: null,
			recurrence: null,
			status: 'confirmed',
			notes: null,
			reminders: null,
			attendees: null,
			calendarSourceId: LOCAL_CALENDAR_SOURCE,
		},
	},
	place: {
		kinds: kindsOf('place'),
		required: ['kind', 'name'],
		fixed: [],
		fields: { kind: null, name: null, lat: null, lng: null, address: null, category: null, phone: null, url: null },
	},
	attachment: {
		kinds: kindsOf('attachment'),
		required: ['kind', 'fileName'],
		fixed: ['mime', 'size', 'hash', 'store'],
		fields: {
			kind: null,
			fileName: null,
			mime: null,
			size: null,
			hash: null,
			store: 'workspace',
			thumbnail: null,
			ocrText: null,
			captured: null,
		},
	},
}

const COMMON_KEYS = ['id', 'mirror', 'source', 'externalId', 'snapshot', 'links']
const MARKER = /^[a-z0-9:-]+$/

const invalid = (detail: string) => new DataError('invalid', detail)
const notFound = (detail: string) => new DataError('not-found', detail)

const isPrimitive = (type: string): type is PrimitiveType => Object.hasOwn(PRIMITIVES, type)
const isObject = (value: unknown): value is Fields =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const sameLink = (link: Link, owner: string, uri: string, relation: string) =>
	link.owner === owner && link.uri === uri && link.relation === relation
const text = (value: unknown) => (typeof value === 'string' ? value : null)

export type Engine = ReturnType<typeof createEngine>

export function createEngine(storage: EngineStorage, options: EngineOptions = {}) {
	const now = options.now ?? Date.now
	const newId = options.newId ?? createIdGenerator()
	const today = options.today ?? todayIso

	function fresh(): State {
		const node = options.node ?? ((crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) | 1) >>> 0
		const state: State = {
			clock: { wallMs: 0, counter: 0, node },
			markers: [],
			rows: {},
			links: [],
			grants: [],
			egress: [],
			facts: [],
			factHistory: [],
			schedules: [],
			signals: [],
			inbox: [],
			audit: [],
			threads: [],
			messages: [],
			policy: [],
		}
		// what the first migration seeds in the crate
		const stamp = formatStamp({ wallMs: 0, counter: 0, node: 0 })
		state.rows[LOCAL_CALENDAR_SOURCE] = {
			...common('calendar-source', LOCAL_CALENDAR_SOURCE, stamp, {}),
			payload: { kind: 'local' },
		}
		return state
	}

	function load(): State {
		const stored = storage.getItem(DATA_KEY)
		if (stored) {
			try {
				const state = JSON.parse(stored) as State
				if (isObject(state.rows) && Array.isArray(state.links)) {
					// A document from before a store was added has no list for it; it reads as if it had one, empty.
					state.grants ??= []
					state.egress ??= []
					state.facts ??= []
					state.factHistory ??= []
					state.schedules ??= []
					state.signals ??= []
					state.inbox ??= []
					state.audit ??= []
					state.threads ??= []
					state.messages ??= []
					state.policy ??= []
					// The log is swept when the workspace opens, as in the crate.
					const cutoff = auditCutoff(now())
					state.audit = state.audit.filter((entry) => entry.at >= cutoff)
					return state
				}
			} catch {
				// An unreadable document is a fresh start; this is a preview, not the owner's workspace.
			}
		}
		return fresh()
	}

	/** One write: all of it is stored, or none of it. */
	function write<T>(apply: (state: State) => T): T {
		const state = load()
		const value = apply(state)
		storage.setItem(DATA_KEY, JSON.stringify(state))
		return value
	}

	function stamp(state: State): string {
		state.clock = tick(state.clock, now())
		return formatStamp(state.clock)
	}

	/** Keeps what a fact held before an edit, under the edit's stamp, and lets go of what is past thirty days. */
	function keepHistory(state: State, before: Fact, replacedAt: string): void {
		state.factHistory.push({
			factId: before.id,
			type: before.type,
			value: structuredClone(before.value),
			note: before.note,
			validFrom: before.validFrom,
			validUntil: before.validUntil,
			replacedAt,
		})
	}

	/** Lets go of the signals past thirty days, and of the cards made of them. */
	function sweepSignals(state: State): void {
		const cutoff = signalCutoff(now())
		state.signals = state.signals.filter((signal) => signal.createdAt >= cutoff)
		state.inbox = state.inbox.filter((card) => state.signals.some((signal) => signal.id === card.signalId))
	}

	function entryOf(card: InboxRow, signal: Omit<Signal, 'at'>): InboxEntry {
		return structuredClone({
			...card,
			name: signal.name,
			payload: signal.payload,
			tier: signal.tier,
			at: parseStamp(signal.createdAt)?.wallMs ?? 0,
		})
	}

	function sweepHistory(state: State): void {
		const cutoff = historyCutoff(now())
		state.factHistory = state.factHistory.filter((entry) => entry.replacedAt >= cutoff)
	}

	/** Whether an edit changed what the history keeps: the value, the note or the window. */
	function keptChanged(before: Fact, after: Fact): boolean {
		return (
			JSON.stringify(before.value) !== JSON.stringify(after.value) ||
			before.note !== after.note ||
			before.validFrom !== after.validFrom ||
			before.validUntil !== after.validUntil
		)
	}

	function liveSystemFact(state: State, type: string): Fact | undefined {
		return state.facts.find((fact) => !fact.deletedAt && fact.provenance === 'system-derived' && fact.type === type)
	}

	function common(type: string, id: string, at: string, input: RowInput): Omit<Row, 'links'> {
		return {
			uri: toUri(type, id),
			id,
			type,
			createdAt: at,
			updatedAt: at,
			deletedAt: null,
			mirror: input.mirror ?? false,
			source: input.source ?? null,
			externalId: input.externalId ?? null,
			snapshot: input.snapshot ?? null,
		}
	}

	function withLinks<T>(state: State, row: StoredRow): T {
		const links = state.links
			.filter((entry) => entry.owner === row.uri && !entry.deletedAt)
			.sort((a, b) => byText(a.uri, b.uri) || byText(a.relation, b.relation))
		return structuredClone({ ...row, links }) as T
	}

	/** Checks what every create shares, and answers the id the row takes. */
	function claim(state: State, type: string, input: RowInput): string {
		if (input.id !== undefined && !isUlid(input.id)) throw invalid(`not an id: ${JSON.stringify(input.id)}`)
		if ((input.source === undefined) !== (input.externalId === undefined) || (input.mirror && !input.source)) {
			throw invalid('a source and an external id come together, and a mirror has both')
		}
		const id = input.id ?? newId()
		if (state.rows[id]) throw invalid(`the id is taken: ${id}`)
		// A mirror is unique by its source and external id; so is an overlay, among the live rows. A primitive's
		// mirrors share one key whatever their kind, as in the crate.
		const mirror = input.mirror ?? false
		const taken = Object.values(state.rows).some(
			(other) =>
				input.source !== undefined &&
				other.type === type &&
				other.mirror === mirror &&
				other.source === input.source &&
				other.externalId === input.externalId &&
				(mirror || (!other.deletedAt && !isPrimitive(type)))
		)
		if (taken) throw invalid(`there is already a row for ${input.source}, ${input.externalId}`)
		return id
	}

	function createEntity(state: State, input: EntityInput<object>): Entity {
		if (!isEntityType(input.type)) throw invalid(`not a registered entity type: ${JSON.stringify(input.type)}`)
		if (!isObject(input.payload)) throw invalid("an entity's payload is a JSON object")
		const id = claim(state, input.type, input)
		const row = { ...common(input.type, id, stamp(state), input), payload: structuredClone(input.payload) }
		state.rows[id] = row
		return withLinks(state, row)
	}

	function updateEntity(state: State, id: string, payload: object): Entity {
		const row = state.rows[id]
		if (!row || row.deletedAt || isPrimitive(row.type)) throw notFound(`entity ${id}`)
		if (!isObject(payload)) throw invalid("an entity's payload is a JSON object")
		row.payload = structuredClone(payload)
		row.updatedAt = stamp(state)
		return withLinks(state, row)
	}

	function checkFields(type: PrimitiveType, fields: Fields): void {
		const primitive = PRIMITIVES[type]
		if ('kind' in fields && !primitive.kinds.includes(String(fields.kind))) {
			throw invalid(`not a registered ${type} kind: ${JSON.stringify(fields.kind)}`)
		}
		for (const name of primitive.required) {
			if (name in fields && (fields[name] === null || fields[name] === undefined)) {
				throw invalid(`${type}.${name} is required`)
			}
		}
		if (fields.store !== undefined && fields.store !== 'workspace') {
			throw invalid('the Vault does not exist yet; an attachment is stored in the workspace')
		}
	}

	/** What the schema checks in the crate, on the row as it would be stored. */
	function checkRow(state: State, row: StoredRow): void {
		if ((row.lat === null) !== (row.lng === null)) throw invalid('a place has both of lat and lng, or neither')
		if (row.type === 'event' && !row.mirror && row.attendees !== null) {
			throw invalid('attendees are read-only, on mirrors only')
		}
		const secondHome =
			row.type === 'place' &&
			row.kind === 'home' &&
			!row.mirror &&
			!row.deletedAt &&
			Object.values(state.rows).some(
				(other) =>
					other.id !== row.id && other.type === 'place' && other.kind === 'home' && !other.mirror && !other.deletedAt
			)
		if (secondHome) throw invalid('there is one home')
	}

	function createPrimitive<T extends PrimitiveType>(state: State, type: T, input: object): Primitives[T]['row'] {
		if (!isObject(input)) throw invalid(`a ${type} is a JSON object`)
		const primitive = PRIMITIVES[type]
		const unknown = Object.keys(input).find((key) => !(key in primitive.fields) && !COMMON_KEYS.includes(key))
		if (unknown) throw invalid(`${type} has no field ${JSON.stringify(unknown)}`)
		for (const name of primitive.required) {
			if (!(name in input)) throw invalid(`${type}.${name} is required`)
		}
		const {
			id: _id,
			mirror: _mirror,
			source: _source,
			externalId: _externalId,
			snapshot: _snapshot,
			links,
			...fields
		} = input
		checkFields(type, fields)

		const rowInput = input as RowInput
		const id = claim(state, type, rowInput)
		const set = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
		const row: StoredRow = { ...common(type, id, stamp(state), rowInput), ...primitive.fields, ...set }
		checkRow(state, row)
		state.rows[id] = row
		for (const entry of (links as LinkInput[] | undefined) ?? []) link(state, row.uri, entry)
		return withLinks(state, row)
	}

	function updatePrimitive<T extends PrimitiveType>(
		state: State,
		type: T,
		id: string,
		patch: object
	): Primitives[T]['row'] {
		if (!isObject(patch)) throw invalid('a patch is a JSON object')
		const primitive = PRIMITIVES[type]
		const row = state.rows[id]
		if (!row || row.type !== type || row.deletedAt) throw notFound(toUri(type, id))
		const unknown = Object.keys(patch).find((key) => !(key in primitive.fields) || primitive.fixed.includes(key))
		if (unknown) throw invalid(`${type} has no field ${JSON.stringify(unknown)} to change`)
		checkFields(type, patch)

		const next = { ...row, ...structuredClone(patch) }
		checkRow(state, next)
		next.updatedAt = stamp(state)
		state.rows[id] = next
		return withLinks(state, next)
	}

	function find(state: State, uri: string): StoredRow {
		const parsed = parseUri(uri)
		if (!parsed) throw invalid(`not an entity URI: ${JSON.stringify(uri)}`)
		const row = state.rows[parsed.id]
		if (!row || row.type !== parsed.type) throw notFound(uri)
		return row
	}

	function setDeleted(state: State, uri: string, deleted: boolean): Stamped | null {
		const row = find(state, uri)
		if (!!row.deletedAt === deleted) return null
		if (!deleted) checkRow(state, { ...row, deletedAt: null })
		row.updatedAt = stamp(state)
		row.deletedAt = deleted ? row.updatedAt : null
		return { uri, updatedAt: row.updatedAt }
	}

	function link(state: State, owner: string, input: LinkInput): Link {
		if (!parseUri(input.uri)) throw invalid(`not an entity URI: ${JSON.stringify(input.uri)}`)
		if (!RELATIONS.includes(input.relation)) throw invalid(`not a relation: ${JSON.stringify(input.relation)}`)
		if (find(state, owner).deletedAt) throw notFound(owner)
		const at = stamp(state)
		const existing = state.links.find((entry) => sameLink(entry, owner, input.uri, input.relation))
		if (existing) {
			Object.assign(existing, { label: input.label ?? '', updatedAt: at, deletedAt: null })
			return structuredClone(existing)
		}
		const made: Link = {
			owner,
			uri: input.uri,
			relation: input.relation,
			label: input.label ?? '',
			createdAt: at,
			updatedAt: at,
			deletedAt: null,
		}
		state.links.push(made)
		return structuredClone(made)
	}

	const linked = (state: State, row: StoredRow, target: string, relation?: string) =>
		state.links.some(
			(entry) =>
				entry.owner === row.uri &&
				entry.uri === target &&
				!entry.deletedAt &&
				(relation === undefined || entry.relation === relation)
		)

	/** The start and the end of what a row covers in time; a row with no time is outside every range. */
	function span(row: StoredRow): [string, string] | null {
		const start = row.type === 'task' ? (text(row.due) ?? text(row.at)) : text(row.startAt)
		if (start === null) return null
		return [start, row.type === 'event' ? (text(row.endAt) ?? start) : start]
	}

	function inRange(row: StoredRow, filter: Query): boolean {
		if (filter.from === undefined && filter.to === undefined) return true
		if (row.type !== 'task' && row.type !== 'event') return true
		const covered = span(row)
		if (!covered) return false
		return (
			(filter.from === undefined || covered[1] >= filter.from) && (filter.to === undefined || covered[0] <= filter.to)
		)
	}

	const batchable = (type: string): Exclude<PrimitiveType, 'attachment'> => {
		if (type === 'task' || type === 'event' || type === 'place') return type
		throw invalid(`not a primitive a batch can write: ${JSON.stringify(type)}`)
	}

	return {
		createEntity<T extends object>(input: EntityInput<T>): Entity<T> {
			return write((state) => createEntity(state, input)) as Entity<T>
		},

		/** Replaces the payload whole. */
		updateEntity<T extends object>(id: string, payload: T): Entity<T> {
			return write((state) => updateEntity(state, id, payload)) as Entity<T>
		},

		/** The rows of one type, in the order they were created. */
		queryEntities<T extends object>(filter: EntityQuery): Entity<T>[] {
			const state = load()
			if (isPrimitive(filter.type)) return []
			return Object.values(state.rows)
				.filter((row) => row.type === filter.type)
				.filter((row) => filter.includeDeleted || !row.deletedAt)
				.filter((row) => !filter.ids || filter.ids.includes(row.id))
				.filter((row) => !filter.linkedTo || linked(state, row, filter.linkedTo))
				.sort((a, b) => byText(a.id, b.id))
				.map((row) => withLinks<Entity<T>>(state, row))
		},

		create<T extends Exclude<PrimitiveType, 'attachment'>>(
			type: T,
			input: Primitives[T]['input']
		): Primitives[T]['row'] {
			return write((state) => createPrimitive(state, type, input))
		},

		/** A browser has no path to copy a file from. */
		attach(): never {
			throw new DataError('unavailable', 'a file can only be attached in the app')
		},

		/** Sets what the patch names, clears with `null` and leaves the rest. */
		update<T extends PrimitiveType>(type: T, id: string, patch: Primitives[T]['patch']): Primitives[T]['row'] {
			return write((state) => updatePrimitive(state, type, id, patch))
		},

		/** The rows that match, in the order they were created. */
		query<T extends PrimitiveType>(type: T, filter: Query = {}): Primitives[T]['row'][] {
			const state = load()
			return Object.values(state.rows)
				.filter((row) => row.type === type)
				.filter((row) => filter.includeDeleted || !row.deletedAt)
				.filter((row) => !filter.kinds || filter.kinds.includes(String(row.kind)))
				.filter((row) => inRange(row, filter))
				.filter((row) => !filter.place || linked(state, row, filter.place, 'at'))
				.filter((row) => !filter.linkedTo || linked(state, row, filter.linkedTo, filter.relation))
				.sort((a, b) => byText(a.id, b.id))
				.map((row) => withLinks<Primitives[T]['row']>(state, row))
		},

		/** The row a URI names, deleted or not; `null` when there is none. */
		getRow(uri: string): Entity | PrimitiveRow | null {
			const parsed = parseUri(uri)
			if (!parsed) throw invalid(`not an entity URI: ${JSON.stringify(uri)}`)
			const state = load()
			const row = state.rows[parsed.id]
			return row && row.type === parsed.type ? withLinks(state, row) : null
		},

		snapshot(uri: string, snapshot: unknown): Entity | PrimitiveRow {
			return write((state) => {
				const row = find(state, uri)
				if (row.deletedAt) throw notFound(uri)
				row.snapshot = structuredClone(snapshot) ?? null
				row.updatedAt = stamp(state)
				return withLinks(state, row)
			})
		},

		/** Tombstones the rows; the result lists the ones that changed. */
		deleteRows(uris: string[]): Stamped[] {
			return write((state) => uris.flatMap((uri) => setDeleted(state, uri, true) ?? []))
		},

		/** Brings tombstoned rows back; the result lists the ones that changed. */
		restoreRows(uris: string[]): Stamped[] {
			return write((state) => uris.flatMap((uri) => setDeleted(state, uri, false) ?? []))
		},

		applyBatch(ops: BatchOp[], marker?: string): BatchResult {
			if (marker !== undefined && !MARKER.test(marker)) throw invalid(`not a marker: ${JSON.stringify(marker)}`)
			return write((state) => {
				if (marker !== undefined && state.markers.includes(marker)) return { applied: false, rows: [] }
				const rows: BatchResult['rows'] = []
				for (const op of ops) {
					if (op.op === 'createEntity') rows.push(createEntity(state, op.input))
					else if (op.op === 'updateEntity') rows.push(updateEntity(state, op.id, op.payload))
					else if (op.op === 'createPrimitive') rows.push(createPrimitive(state, batchable(op.type), op.input))
					else if (op.op === 'updatePrimitive') rows.push(updatePrimitive(state, batchable(op.type), op.id, op.patch))
					else if (op.op === 'delete') setDeleted(state, op.uri, true)
					else if (op.op === 'restore') setDeleted(state, op.uri, false)
					else link(state, op.owner, op.link)
				}
				if (marker !== undefined) state.markers.push(marker)
				return { applied: true, rows }
			})
		},

		/** Linking again renews the label, and brings back a link that was removed. */
		link(owner: string, input: LinkInput): Link {
			return write((state) => link(state, owner, input))
		},

		unlink(owner: string, uri: string, relation: Relation): void {
			write((state) => {
				const existing = state.links.find((entry) => sameLink(entry, owner, uri, relation))
				if (!existing || existing.deletedAt) return
				existing.updatedAt = stamp(state)
				existing.deletedAt = existing.updatedAt
			})
		},

		queryLinks(filter: LinkQuery = {}): Link[] {
			return structuredClone(
				load()
					.links.filter((entry) => !entry.deletedAt)
					.filter((entry) => !filter.owner || entry.owner === filter.owner)
					.filter((entry) => !filter.target || entry.uri === filter.target)
					.filter((entry) => !filter.relation || entry.relation === filter.relation)
					.sort((a, b) => byText(a.owner, b.owner) || byText(a.uri, b.uri) || byText(a.relation, b.relation))
			)
		},

		// The grant store (`grants.rs`, D-70): the crate's rules, from `../grants/rules.js`.

		/** Gives a grant. A standing or session grant that is already there is renewed rather than doubled. */
		grant(input: GrantInput): Grant {
			const refusal = validateGrant(input)
			if (refusal) throw new DataError(refusal[0], refusal[1])
			return write((state) => {
				const narrowing = input.narrowing == null ? null : structuredClone(input.narrowing)
				if (input.lifetime !== 'per-request') {
					const existing = state.grants.find(
						(grant) =>
							!grant.deletedAt &&
							grant.lifetime !== 'per-request' &&
							grant.subject === input.subject &&
							grant.resourceType === input.resourceType &&
							grant.resource === input.resource &&
							grant.access === input.access
					)
					if (existing) {
						existing.lifetime = input.lifetime
						existing.narrowing = narrowing
						existing.origin = input.origin
						existing.updatedAt = stamp(state)
						return structuredClone(existing)
					}
				}
				if (input.id !== undefined && !isUlid(input.id)) throw invalid(`not an id: ${JSON.stringify(input.id)}`)
				const id = input.id ?? newId()
				if (state.grants.some((grant) => grant.id === id))
					throw new DataError('grant:invalid', `the id is taken: ${id}`)
				const at = stamp(state)
				const grant: Grant = {
					uri: toUri('grant', id),
					id,
					subject: input.subject,
					resource: input.resource,
					resourceType: input.resourceType,
					access: input.access,
					lifetime: input.lifetime,
					narrowing,
					origin: input.origin,
					createdAt: at,
					updatedAt: at,
					deletedAt: null,
				}
				state.grants.push(grant)
				return structuredClone(grant)
			})
		},

		/** Ends a grant. Revoking a revoked grant changes nothing. */
		revoke(id: string): Grant {
			return write((state) => {
				const grant = state.grants.find((entry) => entry.id === id)
				if (!grant) throw notFound(`grant ${id}`)
				if (!grant.deletedAt) {
					grant.updatedAt = stamp(state)
					grant.deletedAt = grant.updatedAt
				}
				return structuredClone(grant)
			})
		},

		/** The grants, by id: the live ones unless the query asks for the revoked ones too. */
		queryGrants(filter: GrantQuery = {}): Grant[] {
			return structuredClone(
				load()
					.grants.filter((grant) => filter.includeRevoked || !grant.deletedAt)
					.filter((grant) => !filter.subject || grant.subject === filter.subject)
					.filter((grant) => !filter.resource || grant.resource === filter.resource)
					.filter((grant) => !filter.resourceType || grant.resourceType === filter.resourceType)
					.sort((a, b) => byText(a.id, b.id))
			)
		},

		/** Whether the subject may do this now, and by what right. */
		checkGrant(check: GrantCheck): GrantDecision {
			if (!(NEVER_AUTOMATED as readonly string[]).includes(check.resource)) {
				const refusal = checkShape(check)
				if (refusal) throw new DataError(refusal[0], refusal[1])
			}
			return decide(check, load().grants)
		},

		// The profile (`facts.rs`, D-72): the crate's rules, from `../profile/rules.js`.

		/** Asserts a fact. A `system-derived` fact of a type the substrate already derived is renewed in place. */
		assertFact(input: FactInput): Fact {
			const refusal = validateFact(input)
			if (refusal) throw new DataError(refusal[0], refusal[1])
			return write((state) => {
				sweepHistory(state)
				const fields = {
					value: structuredClone(input.value),
					confidence: input.confidence ?? null,
					validFrom: input.validFrom ?? null,
					validUntil: input.validUntil ?? null,
					source: input.source ?? null,
					note: input.note ?? null,
				}
				if (input.provenance === 'system-derived') {
					const existing = liveSystemFact(state, input.type)
					if (existing) {
						const before = structuredClone(existing)
						Object.assign(existing, fields)
						existing.updatedAt = stamp(state)
						if (keptChanged(before, existing)) keepHistory(state, before, existing.updatedAt)
						return structuredClone(existing)
					}
				}
				if (input.id !== undefined && !isUlid(input.id)) throw invalid(`not an id: ${JSON.stringify(input.id)}`)
				const id = input.id ?? newId()
				if (state.facts.some((fact) => fact.id === id)) throw new DataError('fact:invalid', `the id is taken: ${id}`)
				const at = stamp(state)
				const fact: Fact = {
					uri: toUri('fact', id),
					id,
					type: input.type,
					provenance: input.provenance,
					...fields,
					createdAt: at,
					updatedAt: at,
					deletedAt: null,
				}
				state.facts.push(fact)
				return structuredClone(fact)
			})
		},

		/** Edits a fact in place; the provenance moves only to the owner's own word, which drops the confidence. */
		updateFact(id: string, patch: FactPatch): Fact {
			const shape = validatePatch(patch)
			if (shape) throw new DataError(shape[0], shape[1])
			return write((state) => {
				sweepHistory(state)
				const fact = state.facts.find((entry) => entry.id === id)
				if (!fact || fact.deletedAt) throw notFound(`fact ${id}`)
				const after: Fact = structuredClone(fact)
				if (patch.provenance === 'user-asserted') {
					after.provenance = 'user-asserted'
					after.confidence = null
				}
				if ('value' in patch) after.value = structuredClone(patch.value)
				if ('confidence' in patch) after.confidence = patch.confidence ?? null
				if ('validFrom' in patch) after.validFrom = patch.validFrom ?? null
				if ('validUntil' in patch) after.validUntil = patch.validUntil ?? null
				if ('source' in patch) after.source = patch.source ?? null
				if ('note' in patch) after.note = patch.note ?? null
				const refusal = validateFact(after)
				if (refusal) throw new DataError(refusal[0], refusal[1])
				after.updatedAt = stamp(state)
				if (keptChanged(fact, after)) keepHistory(state, fact, after.updatedAt)
				Object.assign(fact, after)
				return structuredClone(fact)
			})
		},

		/** Deletes a fact: the row stays as its tombstone. Deleting a deleted fact changes nothing. */
		deleteFact(id: string): Fact {
			return write((state) => {
				const fact = state.facts.find((entry) => entry.id === id)
				if (!fact) throw notFound(`fact ${id}`)
				if (!fact.deletedAt) {
					fact.updatedAt = stamp(state)
					fact.deletedAt = fact.updatedAt
				}
				return structuredClone(fact)
			})
		},

		/** Lifts a tombstone. Restoring a live fact changes nothing. */
		restoreFact(id: string): Fact {
			return write((state) => {
				const fact = state.facts.find((entry) => entry.id === id)
				if (!fact) throw notFound(`fact ${id}`)
				if (fact.deletedAt) {
					if (fact.provenance === 'system-derived' && liveSystemFact(state, fact.type)) {
						throw new DataError('fact:invalid', `the substrate has derived ${fact.type} again since`)
					}
					fact.updatedAt = stamp(state)
					fact.deletedAt = null
				}
				return structuredClone(fact)
			})
		},

		/** The facts a reader gets: by type, the owner's own word first, then the latest. */
		queryFacts(filter: FactQuery = {}): Fact[] {
			if (filter.at !== undefined) {
				const window = checkWindow(filter.at, null)
				if (window) throw new DataError(window[0], window[1])
			}
			const day = filter.at ?? today()
			const owned = filter.owner === undefined ? undefined : factsOf(filter.owner)
			return structuredClone(
				load()
					.facts.filter((fact) => filter.includeDeleted || !fact.deletedAt)
					.filter((fact) => filter.includeExpired || isInWindow(fact, day))
					.filter((fact) => !filter.types || (filter.types as readonly string[]).includes(fact.type))
					.filter((fact) => !owned || (owned as readonly string[]).includes(fact.type))
					.sort(effectiveOrder)
			)
		},

		/** What a fact held before each of its edits, the latest first. */
		queryFactHistory(factId: string): FactHistoryEntry[] {
			const cutoff = historyCutoff(now())
			return structuredClone(
				load()
					.factHistory.filter((entry) => entry.factId === factId && entry.replacedAt >= cutoff)
					.sort((a, b) => byText(b.replacedAt, a.replacedAt))
			)
		},

		// The egress ledger (`egress.rs`, D-71): this browser's, by destination and local day.

		/** Counts one request to the destination today, with the bytes it hands over. */
		recordEgress(destination: string, bytesOut: number): void {
			if (destination === VAULT_AI) throw new DataError('egress:never', 'nothing in the Vault goes to a model')
			if (!isResourceId(destination)) {
				throw new DataError('egress:invalid', `not a destination: ${JSON.stringify(destination)}`)
			}
			write((state) => {
				const day = today()
				const first = shiftDay(day, -EGRESS_RETENTION_DAYS)
				state.egress = state.egress.filter((row) => row.day >= first)
				const row = state.egress.find((entry) => entry.destination === destination && entry.day === day)
				if (row) {
					row.requests += 1
					row.bytesOut += Math.max(0, Math.round(bytesOut))
				} else {
					state.egress.push({ destination, day, requests: 1, bytesOut: Math.max(0, Math.round(bytesOut)) })
				}
			})
		},

		/** The rows within the days asked for, the latest day first and the destinations in order within it. */
		queryEgress(filter: EgressQuery = {}): EgressRow[] {
			return structuredClone(
				load()
					.egress.filter((row) => !filter.from || row.day >= filter.from)
					.filter((row) => !filter.to || row.day <= filter.to)
					.sort((a, b) => byText(b.day, a.day) || byText(a.destination, b.destination))
			)
		},

		// The scheduler (`scheduler.rs`, D-73): this browser's schedules. The rules are `scheduler/rules.ts`.

		/** Makes the repeating schedules what the manifests declare; one that stands as declared keeps its instant. */
		declareSchedules(declared: DeclaredSchedule[]): void {
			const refusal = validateDeclared(declared)
			if (refusal) throw new DataError(refusal[0], refusal[1])
			write((state) => {
				state.schedules = declare(state.schedules, declared, now())
			})
		},

		/** Sets a one-shot for an instant, or moves it. */
		setSchedule(name: string, atMs: number): void {
			write((state) => {
				const refusal = validateOnce(state.schedules, name, atMs)
				if (refusal) throw new DataError(refusal[0], refusal[1])
				state.schedules = setOnce(state.schedules, name, atMs)
			})
		},

		/** Takes a one-shot back before it is due. Answers whether there was one. */
		cancelSchedule(name: string): boolean {
			return write((state) => {
				const before = state.schedules.length
				state.schedules = state.schedules.filter((row) => !(row.name === name && row.kind === 'once'))
				return state.schedules.length < before
			})
		},

		/** What is due now, each moved on as it is taken. */
		takeDueSchedules(): FiredSchedule[] {
			return write((state) => {
				const taken = takeDue(state.schedules, now())
				state.schedules = taken.rows
				return taken.fired
			})
		},

		// Signals and the inbox (`signals.rs`, D-73): this browser's. The store's rules are `signals/rules.ts`.

		/**
		 * Keeps a signal with the cards its rules ask for, all of it or none. A signal whose key was already emitted
		 * under the same name changes nothing and answers `null`.
		 */
		emitSignal(input: SignalInput): Emitted | null {
			const refusal = validateSignal(input)
			if (refusal) throw new DataError(refusal[0], refusal[1])
			return write((state) => {
				sweepSignals(state)
				const dedupeKey = input.dedupeKey ?? null
				if (dedupeKey !== null) {
					if (state.signals.some((signal) => signal.name === input.name && signal.dedupeKey === dedupeKey)) return null
				}
				const signal = {
					id: newId(),
					name: input.name,
					payload: structuredClone(input.payload ?? {}),
					tier: input.tier,
					dedupeKey,
					createdAt: stamp(state),
				}
				state.signals.push(signal)
				const cards = (input.deliveries ?? []).map((delivery): InboxRow => ({
					id: newId(),
					signalId: signal.id,
					rule: delivery.rule,
					channel: delivery.channel,
					read: false,
				}))
				state.inbox.push(...cards)
				return structuredClone({
					signal: { ...signal, at: parseStamp(signal.createdAt)?.wallMs ?? 0 },
					deliveries: cards.map((card) => entryOf(card, signal)),
				})
			})
		},

		/** The cards, the latest first. */
		queryInbox(filter: InboxQuery = {}): InboxEntry[] {
			const state = load()
			const limit = Math.min(Math.max(filter.limit ?? INBOX_LIMIT.default, 1), INBOX_LIMIT.max)
			const signals = new Map(state.signals.map((signal) => [signal.id, signal]))
			return state.inbox
				.filter((card) => !filter.unreadOnly || !card.read)
				.flatMap((card) => {
					const signal = signals.get(card.signalId)
					return signal ? [{ card, signal }] : []
				})
				.sort((a, b) => byText(b.signal.createdAt, a.signal.createdAt) || byText(b.card.id, a.card.id))
				.slice(0, limit)
				.map(({ card, signal }) => entryOf(card, signal))
		},

		/** Marks the cards as read. Answers how many were unread. */
		markInboxRead(ids: string[]): number {
			return write((state) => {
				const unread = state.inbox.filter((card) => ids.includes(card.id) && !card.read)
				for (const card of unread) card.read = true
				return unread.length
			})
		},

		// The audit log (`audit.rs`; docs/product/substrate/ai.md, "Audit log"): this browser's, never exported.

		/** Keeps one entry, whole. */
		recordAudit(input: AuditEntryInput): AuditEntry {
			const refusal = validateAudit(input)
			if (refusal) throw new DataError(refusal[0], refusal[1])
			return write((state) => {
				const id = input.id ?? newId()
				if (state.audit.some((entry) => entry.id === id)) throw new DataError('audit:invalid', `the id is taken: ${id}`)
				const entry: AuditEntry = structuredClone({ ...input, id })
				state.audit.push(entry)
				return structuredClone(entry)
			})
		},

		/** The entries within the filter, the newest first. */
		queryAudit(filter: AuditQuery = {}): AuditEntry[] {
			const limit = Math.max(1, Math.min(filter.limit ?? 200, 1000))
			return structuredClone(
				load()
					.audit.filter((entry) => !filter.threadId || entry.threadId === filter.threadId)
					.filter((entry) => filter.fromMs === undefined || entry.at >= filter.fromMs)
					.filter((entry) => filter.toMs === undefined || entry.at <= filter.toMs)
					.sort((a, b) => b.at - a.at || byText(b.id, a.id))
					.slice(0, limit)
			)
		},

		/** Every row id any entry read, with how many entries read it: what a fact's "used by N requests" shows. */
		auditUsage(): Record<string, number> {
			const usage: Record<string, number> = {}
			for (const entry of load().audit) {
				const rows = new Set(entry.reads.flatMap((read) => read.rows))
				for (const row of rows) usage[row] = (usage[row] ?? 0) + 1
			}
			return usage
		},

		/** What the entries at or after the instant cost, together. */
		auditSpend(fromMs: number): number {
			return load()
				.audit.filter((entry) => entry.at >= fromMs)
				.reduce((sum, entry) => sum + entry.costUsd, 0)
		},

		// Threads and messages (`threads.rs`): stamped rows with tombstones, exported and merged like facts.

		createThread(input: ThreadInput): Thread {
			const refusal = validateThread(input)
			if (refusal) throw new DataError(refusal[0], refusal[1])
			return write((state) => {
				const id = input.id ?? newId()
				if (state.threads.some((row) => row.id === id)) throw new DataError('thread:invalid', `the id is taken: ${id}`)
				const at = stamp(state)
				const row: Thread = {
					uri: toUri('thread', id),
					id,
					domain: input.domain ?? null,
					title: input.title,
					tier: input.tier ?? 'T0',
					createdAt: at,
					updatedAt: at,
					deletedAt: null,
				}
				state.threads.push(row)
				return structuredClone(row)
			})
		},

		updateThread(id: string, patch: ThreadPatch): Thread {
			const refusal = validateThreadPatch(patch)
			if (refusal) throw new DataError(refusal[0], refusal[1])
			return write((state) => {
				const row = state.threads.find((entry) => entry.id === id)
				if (!row || row.deletedAt) throw notFound(`thread ${id}`)
				if (patch.title !== undefined) row.title = patch.title
				if (patch.tier !== undefined) row.tier = patch.tier
				if ('domain' in patch) row.domain = patch.domain ?? null
				row.updatedAt = stamp(state)
				return structuredClone(row)
			})
		},

		/** Tombstones the thread and its live messages at the same stamp. Deleting a deleted thread changes nothing. */
		deleteThread(id: string): Thread {
			return write((state) => {
				const row = state.threads.find((entry) => entry.id === id)
				if (!row) throw notFound(`thread ${id}`)
				if (!row.deletedAt) {
					const at = stamp(state)
					row.updatedAt = at
					row.deletedAt = at
					for (const message of state.messages) {
						if (message.threadId === id && !message.deletedAt) {
							message.updatedAt = at
							message.deletedAt = at
						}
					}
				}
				return structuredClone(row)
			})
		},

		/** Lifts the tombstone, and those of the messages deleted with it. Restoring a live thread changes nothing. */
		restoreThread(id: string): Thread {
			return write((state) => {
				const row = state.threads.find((entry) => entry.id === id)
				if (!row) throw notFound(`thread ${id}`)
				if (row.deletedAt) {
					const deletedAt = row.deletedAt
					const at = stamp(state)
					row.updatedAt = at
					row.deletedAt = null
					for (const message of state.messages) {
						if (message.threadId === id && message.deletedAt === deletedAt) {
							message.updatedAt = at
							message.deletedAt = null
						}
					}
				}
				return structuredClone(row)
			})
		},

		/** The threads, the latest updated first: the live ones unless the query asks for the deleted ones too. */
		queryThreads(filter: ThreadQuery = {}): Thread[] {
			return structuredClone(
				load()
					.threads.filter((row) => filter.includeDeleted || !row.deletedAt)
					.filter((row) => !filter.domain || row.domain === filter.domain)
					.sort((a, b) => byText(b.updatedAt, a.updatedAt) || byText(b.id, a.id))
			)
		},

		/** Appends a message to a live thread, which is touched. */
		appendMessage(input: MessageInput): Message {
			const refusal = validateMessage(input)
			if (refusal) throw new DataError(refusal[0], refusal[1])
			return write((state) => {
				const thread = state.threads.find((entry) => entry.id === input.threadId)
				if (!thread || thread.deletedAt) throw new DataError('thread:invalid', `no live thread ${input.threadId}`)
				const id = input.id ?? newId()
				if (state.messages.some((row) => row.id === id)) throw new DataError('thread:invalid', `the id is taken: ${id}`)
				const at = stamp(state)
				const row: Message = {
					uri: toUri('message', id),
					id,
					threadId: input.threadId,
					role: input.role,
					blocks: structuredClone(input.blocks),
					requestId: input.requestId ?? null,
					createdAt: at,
					updatedAt: at,
					deletedAt: null,
				}
				state.messages.push(row)
				thread.updatedAt = at
				return structuredClone(row)
			})
		},

		/** Replaces the blocks whole, under a new stamp. */
		updateMessage(id: string, blocks: unknown[]): Message {
			if (!Array.isArray(blocks)) throw new DataError('thread:invalid', 'blocks are a list')
			return write((state) => {
				const row = state.messages.find((entry) => entry.id === id)
				if (!row || row.deletedAt) throw notFound(`message ${id}`)
				row.blocks = structuredClone(blocks)
				row.updatedAt = stamp(state)
				return structuredClone(row)
			})
		},

		/** The live messages of a thread, in id order, which is the order they were made in. */
		queryMessages(threadId: string): Message[] {
			return structuredClone(
				load()
					.messages.filter((row) => row.threadId === threadId && !row.deletedAt)
					.sort((a, b) => byText(a.id, b.id))
			)
		},

		// Workspace policy (`policy.rs`, D-37): one JSON value per key, renewed in place.

		/** The live row under the key, or nothing. */
		getPolicy(key: string): PolicyRow | null {
			const row = load().policy.find((entry) => entry.key === key && !entry.deletedAt)
			return row ? structuredClone(row) : null
		},

		/** Sets the value under the key: the row is renewed in place, or made, or its tombstone lifted. */
		setPolicy(key: string, value: unknown): PolicyRow {
			const refusal = validatePolicy(key, value)
			if (refusal) throw new DataError(refusal[0], refusal[1])
			return write((state) => {
				const at = stamp(state)
				const existing = state.policy.find((entry) => entry.key === key)
				if (existing) {
					existing.value = structuredClone(value)
					existing.updatedAt = at
					existing.deletedAt = null
					return structuredClone(existing)
				}
				const row: PolicyRow = { key, value: structuredClone(value), createdAt: at, updatedAt: at, deletedAt: null }
				state.policy.push(row)
				return structuredClone(row)
			})
		},
	}
}

/** An ISO date `days` from another, in local time. */
function shiftDay(isoDate: string, days: number): string {
	const [y, m, d] = isoDate.split('-').map(Number)
	const date = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
