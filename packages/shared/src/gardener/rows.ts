// How rows are written for a model (D-151): the one writer behind the context pack, `read-rows` and `agenda`. A row
// is sent without what only the store needs, with an entity's payload fields beside its id (the names the write
// tools take), and with an instant cut to the minute. A section of three rows or more is a table: one header of the
// field names, then a delimited line a row, so a field's name is paid for once; fewer rows, and every fact, stay one
// JSON object a line. Every string is scrubbed (D-26), a mirrored row is wrapped as untrusted, and no cell can start
// a row or close the wrap. The bytes depend on the rows alone, in the order given, so the cache prefix holds (D-147).
import { scrubValue } from './scrub.js'

/** What the writer needs of a row, whatever its type. */
export interface WrittenRow {
	id: string
	mirror?: boolean
	source?: string | null
}

/** The fields a row is sent without: what only the store needs, and the stamp no tool takes. */
const OMITTED = ['uri', 'links', 'snapshot', 'deletedAt', 'createdAt', 'updatedAt', 'mirror', 'source', 'externalId']

/** A section of fewer rows than this is written as JSON lines: a header would cost more than it saves. */
export const TABLE_MIN_ROWS = 3

const DELIMITER = '|'
const INSTANT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\d{2}(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?$/

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** A value with every instant in it cut to the minute; anything else as it is. */
function trimmed(value: unknown): unknown {
	if (typeof value === 'string') return value.replace(INSTANT, '$1$2')
	if (Array.isArray(value)) return value.map(trimmed)
	if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, trimmed(entry)]))
	return value
}

/**
 * The row as it is sent: without the store's fields and the empty ones, an entity's payload fields raised beside
 * its id where none shares a name with the row's own, instants to the minute, every string scrubbed.
 */
export function sentRow(row: WrittenRow): Record<string, unknown> {
	const kept: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(row)) {
		if (!OMITTED.includes(key) && value !== null && value !== undefined) kept[key] = value
	}
	const { payload } = kept
	if (isObject(payload) && !Object.keys(payload).some((key) => key !== 'payload' && key in kept)) {
		delete kept.payload
		for (const [key, value] of Object.entries(payload)) {
			if (value !== null && value !== undefined) kept[key] = value
		}
	}
	return scrubValue(trimmed(kept)) as Record<string, unknown>
}

/** Text that cannot close an `<untrusted>` wrap from inside, nor open one. */
const sealed = (text: string) => text.replace(/<(\/?untrusted)/gi, '&lt;$1')

const wrapped = (row: WrittenRow, text: string) =>
	row.mirror ? `<untrusted source="${(row.source ?? '').replace(/"/g, '%22')}">${sealed(text)}</untrusted>` : text

/** One row as one JSON object on one line. */
export function line(row: WrittenRow): string {
	return wrapped(row, JSON.stringify(sentRow(row)))
}

/** A cell: a string as it is, a number or a boolean as its text, a list or an object as JSON, nothing as nothing. */
function cell(value: unknown): string {
	if (value === null || value === undefined) return ''
	const text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value)
	return text
		.replace(/\\/g, '\\\\')
		.replace(/\|/g, '\\|')
		.replace(/\r\n?|\n/g, '\\n')
}

/**
 * Rows as a table: the field names once, `id` first and the rest in the order the rows first carry them, then a
 * line a row with an empty cell where a row has no such field. `constant` names the fields left out because the
 * heading already says them (a section's `type`).
 */
export function table(rows: readonly WrittenRow[], constant: readonly string[] = []): string {
	const sent = rows.map(sentRow)
	const columns: string[] = []
	for (const row of sent) {
		for (const key of Object.keys(row)) {
			if (!columns.includes(key) && !constant.includes(key)) columns.push(key)
		}
	}
	if (columns.includes('id')) columns.unshift(...columns.splice(columns.indexOf('id'), 1))
	return [
		columns.map(cell).join(DELIMITER),
		...sent.map((row, at) => wrapped(rows[at]!, columns.map((column) => cell(row[column])).join(DELIMITER))),
	].join('\n')
}

/** The fields every row of a section holds with the one value the section's heading already gives. */
function saidByHeading(id: string, rows: readonly WrittenRow[]): string[] {
	const all = (key: string) => rows.every((row) => (row as unknown as Record<string, unknown>)[key] === id)
	return ['type', 'kind'].filter(all)
}

/**
 * The rows of a section under no heading: a table from three rows on, else a JSON object a line. `lines` settles
 * it either way, for a section whose form was chosen before rows were trimmed from it.
 */
export function writeRows(id: string, rows: readonly WrittenRow[], options: { lines?: boolean } = {}): string {
	if (options.lines ?? rows.length < TABLE_MIN_ROWS) return rows.map(line).join('\n')
	return table(rows, saidByHeading(id, rows))
}

/** A section as the model reads it: its heading with the count, then its rows. `lines` keeps it JSON, as facts are. */
export function writeSection(
	id: string,
	rows: readonly WrittenRow[],
	options: { lines?: boolean; note?: string } = {}
): string {
	const heading = `## ${id} (${rows.length} rows${options.note ? `; ${options.note}` : ''})`
	return rows.length ? `${heading}\n${writeRows(id, rows, options)}` : heading
}
