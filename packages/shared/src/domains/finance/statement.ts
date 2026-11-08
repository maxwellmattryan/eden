// A bank statement brought in from a file (#74, D-194; product/domains/finance.md, "Statement import"): the shapes
// the CSV and OFX readers (`csv.ts`, `ofx.ts`) and the document reader's answer all come to, which files are taken,
// how the bytes become text, the sign flip, how a row is matched against the rows Orchard already holds, and the
// writes an import makes with the way back. Pure, so it is tested here; the store and the session drive it.
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { attachmentMime } from '../../gardener/attachment-limits.js'
import { answer, type JsonSchema } from '../../gardener/tools.js'
import type { ToolContext } from '../../shell/gardener/types.js'
import { negate, type Money } from '../../money/index.js'
import { cleanMerchant, merchantKey } from './merchants.js'
import { READ_ACCEPT, refuses } from './reader.js'
import { chunked, moneyOf } from './sync.js'
import { FINANCE, isDebt, type AccountKind, type FileImportPayload, type TransactionPayload } from './types.js'

/** One line of a statement: its day, its description as printed, and its amount, money out negative. */
export interface StatementRow {
	/** `YYYY-MM-DD`. */
	day: string
	description: string
	/** In the account's currency; negative is money out. */
	amount: Money
	/** The OFX `FITID`, unique within the file. */
	fitId?: string
}

export type StatementKind = FileImportPayload['what']

/** What a file was read as: its rows, the lines left out, its first and last day, and the account it names. */
export interface ParsedStatement {
	rows: StatementRow[]
	/** Lines that could not be read and are left out. */
	skipped: number
	from?: string
	to?: string
	/** The last four digits of the OFX account number; never the whole number. */
	last4?: string
	kind: StatementKind
}

/** Why a file could not be imported. */
export type ImportFailure =
	'no-columns' | 'no-rows' | 'too-many' | 'currency' | 'several-accounts' | 'unreadable' | 'empty' | 'failed'

/** A reader's answer: the statement, or why there is none. */
export type StatementRead = ParsedStatement | { failure: ImportFailure }

/** The most rows one file may bring. */
export const MAX_IMPORT_ROWS = 5000
/** The largest CSV or OFX file, in bytes. */
export const MAX_TEXT_BYTES = 5 * 1024 * 1024
/** The longest description kept. */
export const MAX_DESCRIPTION = 200
/** A byte-order mark at the start of a text. */
export const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`)
/** The source a `file-import` carries, with the file's fingerprint as its external id. */
export const FILE_SOURCE = 'file'

const TEXT_EXTENSIONS: Readonly<Record<string, 'csv' | 'ofx'>> = { csv: 'csv', ofx: 'ofx', qfx: 'ofx' }
const TEXT_TYPES: Readonly<Record<string, 'csv' | 'ofx'>> = {
	'text/csv': 'csv',
	'application/csv': 'csv',
	'application/x-ofx': 'ofx',
	'application/ofx': 'ofx',
	'application/vnd.intu.qfx': 'ofx',
	'application/x-qfx': 'ofx',
}

/** What the zone and the picker take: the extensions first, as a browser may give a CSV or an OFX no type. */
export const IMPORT_ACCEPT: readonly string[] = [
	'.csv',
	'.ofx',
	'.qfx',
	'.pdf',
	...Object.keys(TEXT_TYPES),
	...READ_ACCEPT,
]

const extensionOf = (name: string) => {
	const dot = name.lastIndexOf('.')
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** How a file is read: on the device as CSV or OFX, or by the document reader; nothing for a type not taken. */
export function importKindOf(file: Pick<File, 'name' | 'type'>): 'csv' | 'ofx' | 'reader' | undefined {
	const byExtension = TEXT_EXTENSIONS[extensionOf(file.name)]
	if (byExtension) return byExtension
	const byType = TEXT_TYPES[file.type.toLowerCase()]
	if (byType) return byType
	return READ_ACCEPT.includes(attachmentMime(file.name, file.type)) ? 'reader' : undefined
}

/** Why the files cannot be imported, before any is read: several, a type not taken, or too large. */
export function refusesImport(
	files: readonly Pick<File, 'name' | 'type' | 'size'>[]
): 'several' | 'unsupported' | 'too-large' | undefined {
	if (files.length > 1) return 'several'
	const [file] = files
	if (!file) return undefined
	const kind = importKindOf(file)
	if (!kind) return 'unsupported'
	if (kind !== 'reader') return file.size > MAX_TEXT_BYTES ? 'too-large' : undefined
	// a PDF or a picture is held to the reader's own caps
	const refused = refuses([file])
	return refused === 'unsupported' || refused === 'too-large' ? refused : undefined
}

/** The bytes as text: UTF-8 when they are, else Windows-1252, as older bank exports are; the BOM left out. */
export function decodeText(bytes: Uint8Array): string | { failure: 'unreadable' } {
	let text: string
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
	} catch {
		try {
			text = new TextDecoder('windows-1252').decode(bytes)
		} catch {
			return { failure: 'unreadable' }
		}
	}
	text = text.replace(BOM, '')
	// a binary file decodes as Windows-1252 too: one with NULs in it is not a statement
	return text.includes('\u0000') ? { failure: 'unreadable' } : text
}

/** The description as kept: single spaces, at most `MAX_DESCRIPTION` characters. */
export function cleanDescription(text: string): string {
	return text.replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION).trim()
}

/** Whether a string is a real calendar day, `YYYY-MM-DD`. */
export function isDay(day: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
	if (!match) return false
	const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])]
	const at = new Date(Date.UTC(year, month - 1, date))
	return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === date
}

/** The statement from its rows: the first and last day, with the lines left out. */
export function statementOf(
	rows: StatementRow[],
	skipped: number,
	kind: StatementKind,
	last4?: string
): ParsedStatement {
	const days = rows.map((row) => row.day).sort()
	return {
		rows,
		skipped,
		...(days.length ? { from: days[0], to: days.at(-1) } : {}),
		...(last4 ? { last4 } : {}),
		kind,
	}
}

/** Every amount the other way round: for a file that writes charges as positive. */
export function flipped(rows: readonly StatementRow[]): StatementRow[] {
	return rows.map((row) => ({ ...row, amount: negate(row.amount) }))
}

/** Whether the flip starts on: a card or a loan whose rows are mostly positive, as card issuers write charges. */
export function defaultFlip(account: { kind: AccountKind }, rows: readonly StatementRow[]): boolean {
	if (!isDebt(account.kind) || !rows.length) return false
	return rows.filter((row) => row.amount.minor > 0).length > rows.length / 2
}

const LETTERS = /^\p{L}{3,}$/u
const keyOf = (text: string) => merchantKey(cleanMerchant(text))

/**
 * Whether two descriptions name the same merchant: their cleaned keys share a word of three or more letters, or one
 * starts with the other.
 */
export function sameDescription(a: string, b: string): boolean {
	const left = keyOf(a)
	const right = keyOf(b)
	if (!left || !right) return false
	if (left.startsWith(right) || right.startsWith(left)) return true
	const words = new Set(left.split(' ').filter((word) => LETTERS.test(word)))
	return right.split(' ').some((word) => words.has(word))
}

const DAY_MS = 24 * 60 * 60 * 1000
const dayNumber = (day: string) =>
	Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS

/** The most days between a statement line and a row it matches when their descriptions agree. */
export const MATCH_DAYS = 3

/**
 * The statement's rows against the live rows on the account, of any source, pending or posted: a row matches one
 * with the same amount on the same day, or 1 to 3 days apart (from its day or its authorised day) when the
 * descriptions agree. Each existing row matches one line at most; the lines are taken in day order, a same-day
 * match first (one whose description agrees wins the tie), then the smallest gap, then the earliest day and the
 * lowest id. With `flip`, every amount is turned round first, and the fresh rows are the flipped ones.
 */
export function matchRows(
	rows: readonly StatementRow[],
	existing: readonly Entity<TransactionPayload>[],
	accountId: string,
	options: { flip?: boolean } = {}
): { fresh: StatementRow[]; matched: number } {
	const lines = options.flip ? flipped(rows) : [...rows]
	const index = new Map<string, Entity<TransactionPayload>[]>()
	for (const row of existing) {
		if (row.deletedAt || row.payload.accountId !== accountId) continue
		const key = `${row.payload.amount.currency}:${row.payload.amount.minor}`
		const list = index.get(key)
		if (list) list.push(row)
		else index.set(key, [row])
	}
	for (const list of index.values())
		list.sort((a, b) => (a.payload.day < b.payload.day ? -1 : a.payload.day > b.payload.day ? 1 : a.id < b.id ? -1 : 1))
	const claimed = new Set<string>()
	const fresh: StatementRow[] = []
	let matched = 0
	const order = lines
		.map((row, at) => ({ row, at }))
		.sort((a, b) => (a.row.day < b.row.day ? -1 : a.row.day > b.row.day ? 1 : a.at - b.at))
	const agrees = (row: StatementRow, held: Entity<TransactionPayload>) =>
		sameDescription(row.description, held.payload.name) ||
		(!!held.payload.merchantName && sameDescription(row.description, held.payload.merchantName))
	const kept: { row: StatementRow; at: number }[] = []
	for (const entry of order) {
		const { row } = entry
		const candidates = index.get(`${row.amount.currency}:${row.amount.minor}`) ?? []
		const at = dayNumber(row.day)
		let best: Entity<TransactionPayload> | undefined
		let bestGap = Infinity
		let bestAgrees = false
		for (const held of candidates) {
			if (claimed.has(held.id)) continue
			const gaps = [held.payload.day, held.payload.authorizedDay]
				.filter((day): day is string => !!day)
				.map((day) => Math.abs(dayNumber(day) - at))
			const gap = Math.min(...gaps)
			if (gap > MATCH_DAYS) continue
			if (gap === 0) {
				const same = agrees(row, held)
				// the candidates are in day and id order, so the first of a kind is the tie's winner
				if (bestGap > 0 || (same && !bestAgrees)) {
					best = held
					bestGap = 0
					bestAgrees = same
				}
				continue
			}
			if (bestGap === 0 || gap >= bestGap || !agrees(row, held)) continue
			best = held
			bestGap = gap
			bestAgrees = true
		}
		if (best) {
			claimed.add(best.id)
			matched += 1
		} else kept.push(entry)
	}
	for (const { row } of kept.sort((a, b) => a.at - b.at)) fresh.push(row)
	return { fresh, matched }
}

/** What an import writes: the fresh rows into the account, and the file's record. */
export interface ImportPlan {
	accountId: string
	kind: StatementKind
	/** The file's SHA-256, as hex. */
	fingerprint: string
	fresh: readonly StatementRow[]
	matched: number
	skipped: number
	from?: string
	to?: string
}

/**
 * An import's writes: a `transaction` per fresh row, with no source and the import's id, then the `file-import`, in
 * batches of `CHUNK` with the record in the last; and the way back, which deletes every row it made, the record first.
 */
export function importOps(
	plan: ImportPlan,
	newId: () => string,
	nowIso: string
): { chunks: BatchOp[][]; inverse: BatchOp[][]; fileImportId: string } {
	const fileImportId = newId()
	const rows: BatchOp[] = plan.fresh.map((row) => {
		const payload: TransactionPayload = {
			accountId: plan.accountId,
			amount: row.amount,
			day: row.day,
			name: row.description,
			pending: false,
			importId: fileImportId,
		}
		return { op: 'createEntity', input: { id: newId(), type: FINANCE.transaction, payload } }
	})
	const record: FileImportPayload = {
		what: plan.kind,
		accountId: plan.accountId,
		...(plan.from ? { from: plan.from } : {}),
		...(plan.to ? { to: plan.to } : {}),
		rows: plan.fresh.length,
		matched: plan.matched,
		skipped: plan.skipped,
		at: nowIso,
	}
	const file: BatchOp = {
		op: 'createEntity',
		input: {
			id: fileImportId,
			type: FINANCE.fileImport,
			source: FILE_SOURCE,
			externalId: plan.fingerprint,
			payload: record,
		},
	}
	const uris = [
		toUri(FINANCE.fileImport, fileImportId),
		...rows.map((op) => toUri(FINANCE.transaction, (op as { input: { id: string } }).input.id)),
	]
	return {
		chunks: chunked(rows, file),
		inverse: chunked(uris.map((uri): BatchOp => ({ op: 'delete', uri }))),
		fileImportId,
	}
}

/** The shape the document reader's statement answer is held to (`finance.read-statement`). */
export const STATEMENT_ANSWER: JsonSchema = answer.object({
	rows: answer.list(
		answer.object({
			day: answer.text('The day the line posted, as YYYY-MM-DD.'),
			description: answer.text('The line’s description as printed.'),
			amount: answer.text(
				'The amount as a decimal string from the account holder’s side, money out negative: "-12.34", "1200.00".'
			),
		}),
		'Every transaction line, in the order printed.'
	),
})

/** The answer's lines that hold: a real day, a description and an amount in the currency; the rest left out. */
export function answerRows(
	json: unknown,
	currency: string
): { rows: StatementRow[]; kept: unknown[]; skipped: number } {
	const list = (json as { rows?: unknown } | null)?.rows
	const rows: StatementRow[] = []
	const kept: unknown[] = []
	let skipped = 0
	for (const raw of Array.isArray(list) ? list : []) {
		const line = (raw ?? {}) as Record<string, unknown>
		const day = typeof line.day === 'string' ? line.day.trim() : ''
		const description = typeof line.description === 'string' ? cleanDescription(line.description) : ''
		const amount = typeof line.amount === 'string' ? moneyOf(line.amount.trim(), currency) : undefined
		if (!isDay(day) || !description || !amount) {
			skipped += 1
			continue
		}
		rows.push({ day, description, amount })
		kept.push({ day, description, amount: (line.amount as string).trim() })
	}
	return { rows, kept, skipped }
}

/** The document reader's answer as a statement, or `empty` when no line of it holds. */
export function statementFromAnswer(
	json: unknown,
	currency: string,
	kind: Extract<StatementKind, 'pdf' | 'picture'> = 'pdf'
): StatementRead {
	const { rows, skipped } = answerRows(json, currency)
	const before = Number((json as { skipped?: unknown } | null)?.skipped)
	const earlier = Number.isInteger(before) && before > 0 ? before : 0
	return rows.length ? statementOf(rows, skipped + earlier, kind) : { failure: 'empty' }
}

/** What `read-statement` says in a conversation: it runs from Orchard's Import alone. */
export const READ_STATEMENT_REFUSAL =
	'Statements are imported from Orchard’s Accounts page, with Import; tell the owner.'

/** The tool's check: a page's own run has no thread, and a conversation's is refused before any request. */
export function readStatementCheck(_input: unknown, ctx: Pick<ToolContext, 'threadId'>): string | undefined {
	return ctx.threadId ? READ_STATEMENT_REFUSAL : undefined
}
