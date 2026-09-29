// The data layer outside Tauri. `yarn dev:web` serves the app to a plain browser, where there is no crate and no
// database; this is the same API over one JSON document in the storage it is given, with real ids and real stamps,
// so a store cannot tell the difference. It follows the crate's rules (`src-tauri/src/substrate/*`) with two
// exceptions: it does not know the registry of entity types, so it accepts any well-formed one, and it cannot attach
// a file, because a browser has no path to copy from.
import { DataError } from './errors.js'
import { formatStamp, tick, type Hlc } from './hlc.js'
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
}

type Fields = Record<string, unknown>
type StoredRow = Omit<Row, 'links'> & Fields

interface State {
	clock: Hlc
	markers: string[]
	rows: Record<string, StoredRow>
	links: Link[]
}

/** A primitive as the crate describes it (`primitives.rs`): its kinds, and each field with what it is when left out. */
interface Primitive {
	kinds: readonly string[]
	required: readonly string[]
	/** What a patch may not change. */
	fixed: readonly string[]
	fields: Readonly<Fields>
}

const PRIMITIVES: Record<PrimitiveType, Primitive> = {
	task: {
		kinds: ['todo', 'checklist', 'routine', 'habit', 'reminder'],
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
		kinds: ['local-event', 'shop-day'],
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
		kinds: ['home', 'venue'],
		required: ['kind', 'name'],
		fixed: [],
		fields: { kind: null, name: null, lat: null, lng: null, address: null, category: null, phone: null, url: null },
	},
	attachment: {
		kinds: ['document', 'photo', 'haul-photo', 'render'],
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

	function fresh(): State {
		const node = options.node ?? ((crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) | 1) >>> 0
		const state: State = { clock: { wallMs: 0, counter: 0, node }, markers: [], rows: {}, links: [] }
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
				if (isObject(state.rows) && Array.isArray(state.links)) return state
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
		if (!isResourceId(input.type) || isPrimitive(input.type)) {
			throw invalid(`not an entity type: ${JSON.stringify(input.type)}`)
		}
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
	}
}
