// The shapes of the data layer, mirrored by hand from the crate (`src-tauri/src/substrate/*`). A stamp is a hybrid
// logical clock stamp as text (`hlc.ts`); an id is a ULID (`ulid.ts`); a URI is `eden://<type>/<id>` (`uri.ts`).

export const RELATIONS = ['about', 'at', 'from', 'for', 'part-of', 'see-also'] as const
export type Relation = (typeof RELATIONS)[number]

export interface Link {
	/** The owner's URI. */
	owner: string
	/** The target's URI. */
	uri: string
	relation: Relation
	/** The target's name when the link was made; what is shown when the target is gone. */
	label: string
	createdAt: string
	updatedAt: string
	deletedAt: string | null
}

export interface LinkInput {
	uri: string
	relation: Relation
	label?: string
}

export interface LinkQuery {
	owner?: string
	target?: string
	relation?: Relation
}

/** What every row carries, whatever its type. */
export interface Row {
	uri: string
	id: string
	type: string
	createdAt: string
	updatedAt: string
	/** Set on a tombstone, to the same stamp as `updatedAt`. */
	deletedAt: string | null
	/** The row caches external state (D-32): kept per device, never synced or exported. */
	mirror: boolean
	source: string | null
	externalId: string | null
	snapshot: unknown
	links: Link[]
}

/** A domain entity: the substrate knows its type, the owning domain shapes its payload. */
export interface Entity<T = Record<string, unknown>> extends Row {
	payload: T
}

export interface EntityInput<T = Record<string, unknown>> {
	/** A ULID made here, so the row can be shown before the write returns. */
	id?: string
	type: string
	payload: T
	mirror?: boolean
	source?: string
	externalId?: string
	snapshot?: unknown
}

/** A mirror as a refresh writes it (D-32): the row is named by its type, its source and its external id. */
export interface MirrorInput<T = Record<string, unknown>> {
	type: string
	source: string
	externalId: string
	payload: T
	snapshot?: unknown
}

export interface EntityQuery {
	type: string
	ids?: string[]
	/** Only rows with a live link to this URI. */
	linkedTo?: string
	includeDeleted?: boolean
}

export interface Stamped {
	uri: string
	updatedAt: string
}

/** The primitives a batch can write. An attachment has a file, and is attached on its own. */
export type BatchPrimitive = Exclude<PrimitiveType, 'attachment'>

export type BatchOp =
	| { op: 'createEntity'; input: EntityInput<object> }
	| { op: 'updateEntity'; id: string; payload: object }
	| { [T in BatchPrimitive]: { op: 'createPrimitive'; type: T; input: Primitives[T]['input'] } }[BatchPrimitive]
	| {
			[T in BatchPrimitive]: { op: 'updatePrimitive'; type: T; id: string; patch: Primitives[T]['patch'] }
	  }[BatchPrimitive]
	| { op: 'delete'; uri: string }
	| { op: 'restore'; uri: string }
	| { op: 'link'; owner: string; link: LinkInput }
	/** Creates the mirror its source and external id name, or replaces it and brings it back, keeping its id. */
	| { op: 'putMirror'; input: MirrorInput<object> }
	/** Removes a mirror outright, with its links; a row that is not a mirror is refused. */
	| { op: 'dropMirror'; uri: string }

export interface BatchResult {
	/** False when the batch carried a marker that was already there, and so did nothing. */
	applied: boolean
	/** The rows the batch created or updated, in the order of its operations. */
	rows: (Entity | PrimitiveRow)[]
}

// The primitives (D-23; docs/product/substrate/primitives.md, tasks.md). A row has every field, `null` where it has
// no value; an input names what it sets; a patch sets what it names, clears with `null` and leaves the rest.

/** What a create may set beside the primitive's own fields. */
export interface RowInput {
	id?: string
	mirror?: boolean
	source?: string
	externalId?: string
	snapshot?: unknown
	/** Links made with the row, in the same write. */
	links?: LinkInput[]
}

/** The fields as a patch takes them: any of them, and `null` where the field may be cleared. */
type Patch<Fields, Required extends keyof Fields> = {
	[K in keyof Fields]?: K extends Required ? Fields[K] : Fields[K] | null
}
/** The fields as a create takes them: the required ones, and any of the rest. */
type Input<Fields, Required extends keyof Fields> = RowInput & Pick<Fields, Required> & Partial<Fields>
/** The fields as a row has them. */
type Stored<Fields, Defaulted extends keyof Fields> = {
	[K in keyof Fields]-?: K extends Defaulted ? Fields[K] : Fields[K] | null
}

export type TaskKind = 'todo' | 'checklist' | 'routine' | 'habit' | 'reminder'
export interface TaskItem {
	text: string
	done: boolean
}
export interface TaskFields {
	kind: TaskKind
	title: string
	notes: string
	/** A date (`YYYY-MM-DD`) or an instant. */
	due: string
	priority: 'none' | 'low' | 'high'
	/** When a reminder fires, as an instant. */
	at: string
	timeOfDay: string
	recurrence: unknown
	items: TaskItem[]
	target: unknown
	grace: number
	streak: number
	progress: unknown
	done: boolean
	completedAt: string
}
export type TaskRow = Row & { type: 'task' } & Stored<TaskFields, 'kind' | 'title' | 'priority' | 'streak' | 'done'>
export type TaskInput = Input<TaskFields, 'kind' | 'title'>
export type TaskPatch = Patch<TaskFields, 'kind' | 'title' | 'priority' | 'streak' | 'done'>

export type EventKind = 'local-event' | 'shop-day' | 'outing'
export interface EventFields {
	kind: EventKind
	title: string
	/** A date (`YYYY-MM-DD`) for an all-day Event, an instant otherwise. */
	startAt: string
	endAt: string
	allDay: boolean
	timezone: string
	recurrence: unknown
	status: 'tentative' | 'confirmed' | 'cancelled'
	notes: string
	reminders: unknown
	/** Read-only, on mirrors only. */
	attendees: unknown
	/** The id of the `calendar-source` entity; the local source when it is left out. */
	calendarSourceId: string
}
type EventSet = 'kind' | 'title' | 'startAt' | 'allDay' | 'status' | 'calendarSourceId'
export type EventRow = Row & { type: 'event' } & Stored<EventFields, EventSet>
export type EventInput = Input<EventFields, 'kind' | 'title' | 'startAt'>
export type EventPatch = Patch<EventFields, EventSet>

export type PlaceKind = 'home' | 'venue'
export interface PlaceFields {
	kind: PlaceKind
	name: string
	/** With `lng`, or not at all. */
	lat: number
	lng: number
	address: string
	category: string
	phone: string
	url: string
}
export type PlaceRow = Row & { type: 'place' } & Stored<PlaceFields, 'kind' | 'name'>
export type PlaceInput = Input<PlaceFields, 'kind' | 'name'>
export type PlacePatch = Patch<PlaceFields, 'kind' | 'name'>

export type AttachmentKind =
	'document' | 'photo' | 'haul-photo' | 'item-photo' | 'recipe-photo' | 'store-photo' | 'place-photo' | 'render'
export interface AttachmentRow extends Row {
	type: 'attachment'
	kind: AttachmentKind
	fileName: string
	mime: string
	size: number
	/** The SHA-256 of the file's bytes, as hex. */
	hash: string
	store: 'workspace' | 'vault'
	thumbnail: string | null
	ocrText: string | null
	captured: unknown
}
export interface AttachInput {
	id?: string
	kind: AttachmentKind
	/** The file to copy into the workspace; it is left where it is. */
	path: string
	fileName?: string
	mime?: string
	captured?: unknown
	links?: LinkInput[]
}
/** A file given as its bytes, as the webview holds one that was dropped, picked or pasted (D-84). */
export interface AttachBytesInput {
	id?: string
	kind: AttachmentKind
	fileName: string
	/** The media type; guessed from the extension when it is left out. */
	mime?: string
	/** A small picture of the file, as a data URL. */
	thumbnail?: string
	captured?: unknown
	links?: LinkInput[]
}
/** What describes the file's bytes is fixed when it is attached. */
export interface AttachmentPatch {
	kind?: AttachmentKind
	fileName?: string
	thumbnail?: string | null
	ocrText?: string | null
	captured?: unknown
}

export interface Primitives {
	task: { row: TaskRow; input: TaskInput; patch: TaskPatch }
	event: { row: EventRow; input: EventInput; patch: EventPatch }
	place: { row: PlaceRow; input: PlaceInput; patch: PlacePatch }
	attachment: { row: AttachmentRow; input: AttachInput; patch: AttachmentPatch }
}
export type PrimitiveType = keyof Primitives
export type PrimitiveRow = Primitives[PrimitiveType]['row']

export interface Query {
	kinds?: string[]
	/** The start of a time range, as ISO 8601 text. Tasks answer by `due` or `at`, Events by when they run. */
	from?: string
	to?: string
	/** The URI of a Place: only rows that are `at` it. */
	place?: string
	/** Only rows with a live link to this URI, of `relation` when it is given. */
	linkedTo?: string
	relation?: Relation
	includeDeleted?: boolean
}
