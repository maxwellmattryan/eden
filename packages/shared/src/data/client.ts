// The data layer as the apps call it (docs/engineering/data-layer.md, "The IPC boundary"): under Tauri each function
// is one command of the crate, and in a plain browser the same call goes to the engine over localStorage.
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../api/tauri.js'
import { call, fallback } from './call.js'
import { dataErrorCode } from './errors.js'
import type {
	AttachBytesInput,
	AttachInput,
	AttachmentPatch,
	AttachmentRow,
	BatchOp,
	BatchResult,
	Entity,
	EntityInput,
	EntityQuery,
	EventInput,
	EventPatch,
	EventRow,
	Link,
	LinkInput,
	LinkQuery,
	PlaceInput,
	PlacePatch,
	PlaceRow,
	PrimitiveRow,
	Query,
	Relation,
	Stamped,
	TaskInput,
	TaskPatch,
	TaskRow,
} from './types.js'

export function createEntity<T extends object>(input: EntityInput<T>): Promise<Entity<T>> {
	return call('create_entity', { input }, (engine) => engine.createEntity(input))
}

/** Replaces the payload whole. */
export function updateEntity<T extends object>(id: string, payload: T): Promise<Entity<T>> {
	return call('update_entity', { id, payload }, (engine) => engine.updateEntity(id, payload))
}

/** The rows of one type, in the order they were created. */
export function queryEntities<T extends object>(filter: EntityQuery): Promise<Entity<T>[]> {
	return call('query_entities', { filter }, (engine) => engine.queryEntities<T>(filter))
}

/** Tombstones the rows; the result lists the ones that changed. */
export function deleteRows(uris: string[]): Promise<Stamped[]> {
	return call('delete_rows', { uris }, (engine) => engine.deleteRows(uris))
}

/** Brings tombstoned rows back; the result lists the ones that changed. */
export function restoreRows(uris: string[]): Promise<Stamped[]> {
	return call('restore_rows', { uris }, (engine) => engine.restoreRows(uris))
}

/** Many writes as one, all or nothing. With a marker the batch is applied once, however often it is sent. */
export function applyBatch(ops: BatchOp[], marker?: string): Promise<BatchResult> {
	return call('apply_batch', { ops, marker }, (engine) => engine.applyBatch(ops, marker))
}

export function link(owner: string, input: LinkInput): Promise<Link> {
	return call('link', { owner, link: input }, (engine) => engine.link(owner, input))
}

export function unlink(owner: string, uri: string, relation: Relation): Promise<void> {
	return call('unlink', { owner, uri, relation }, (engine) => engine.unlink(owner, uri, relation))
}

export function queryLinks(filter: LinkQuery = {}): Promise<Link[]> {
	return call('query_links', { filter }, (engine) => engine.queryLinks(filter))
}

// The primitives (D-33): anything to do is a Task, anything timed an Event, anything located a Place, any file an
// Attachment. A create takes the fields it sets; an update takes a patch, which clears a field with `null`.

export function createTask(input: TaskInput): Promise<TaskRow> {
	return call('create_task', { input }, (engine) => engine.create('task', input))
}

/** An Event without a calendar source belongs to the local one. */
export function createEvent(input: EventInput): Promise<EventRow> {
	return call('create_event', { input }, (engine) => engine.create('event', input))
}

export function createPlace(input: PlaceInput): Promise<PlaceRow> {
	return call('create_place', { input }, (engine) => engine.create('place', input))
}

/** Copies the file at `path` into the workspace and writes its row. Only in the app: a browser has no paths. */
export function attach(input: AttachInput): Promise<AttachmentRow> {
	return call('attach', { input }, (engine) => engine.attach())
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Writes a file given as bytes into the workspace with its row. Under Tauri the bytes cross as the raw body of the
 * call and what describes them in a header, percent-encoded because a header is ASCII; in a browser the row is kept
 * and the bytes live in memory until the page is reloaded.
 */
export async function attachBytes(input: AttachBytesInput, bytes: Uint8Array): Promise<AttachmentRow> {
	if (isTauri()) {
		return invoke<AttachmentRow>('attach_bytes', bytes, {
			headers: { 'x-eden-attach': encodeURIComponent(JSON.stringify(input)) },
		})
	}
	const hash = await sha256(bytes)
	return fallback().attachBytes(input, bytes, hash)
}

/** The bytes of a live attachment, or `null` when the row or its file is not on this device. */
export async function readAttachment(id: string): Promise<Uint8Array | null> {
	try {
		if (isTauri()) return new Uint8Array(await invoke<ArrayBuffer>('read_attachment', { id }))
		return fallback().readAttachment(id)
	} catch (error) {
		if (dataErrorCode(error) === 'not-found') return null
		throw error
	}
}

export function updateTask(id: string, patch: TaskPatch): Promise<TaskRow> {
	return call('update_task', { id, patch }, (engine) => engine.update('task', id, patch))
}

export function updateEvent(id: string, patch: EventPatch): Promise<EventRow> {
	return call('update_event', { id, patch }, (engine) => engine.update('event', id, patch))
}

export function updatePlace(id: string, patch: PlacePatch): Promise<PlaceRow> {
	return call('update_place', { id, patch }, (engine) => engine.update('place', id, patch))
}

export function updateAttachment(id: string, patch: AttachmentPatch): Promise<AttachmentRow> {
	return call('update_attachment', { id, patch }, (engine) => engine.update('attachment', id, patch))
}

export function queryTasks(filter: Query = {}): Promise<TaskRow[]> {
	return call('query_tasks', { filter }, (engine) => engine.query('task', filter))
}

export function queryEvents(filter: Query = {}): Promise<EventRow[]> {
	return call('query_events', { filter }, (engine) => engine.query('event', filter))
}

export function queryPlaces(filter: Query = {}): Promise<PlaceRow[]> {
	return call('query_places', { filter }, (engine) => engine.query('place', filter))
}

export function queryAttachments(filter: Query = {}): Promise<AttachmentRow[]> {
	return call('query_attachments', { filter }, (engine) => engine.query('attachment', filter))
}

/** The row a URI names, deleted or not; `null` when there is none. */
export function getRow(uri: string): Promise<Entity | PrimitiveRow | null> {
	return call('get_row', { uri }, (engine) => engine.getRow(uri))
}

/** Sets what a row copied from the mirror it was derived from, so it renders where the mirror is absent (D-37). */
export function snapshot(uri: string, value: unknown): Promise<Entity | PrimitiveRow> {
	return call('snapshot', { uri, snapshot: value }, (engine) => engine.snapshot(uri, value))
}
