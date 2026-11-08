// A bank's CSV export as a statement (#74, D-194): RFC 4180 fields, a `;` or tab delimiter where the header has more
// of them than commas, up to ten lines of preamble before the header, the date, description and amount found by the
// usual names, and a line that cannot be read left out and counted. Pure, read on the device with no model.
import { negate, type Money } from '../../money/index.js'
import {
	BOM,
	cleanDescription,
	isDay,
	MAX_IMPORT_ROWS,
	statementOf,
	type StatementRead,
	type StatementRow,
} from './statement.js'
import { moneyOf } from './sync.js'

/** The rows of a CSV text: quoted fields may hold the delimiter, doubled quotes and line breaks; CRLF or LF. */
export function parseCsv(text: string, delimiter = ','): string[][] {
	const rows: string[][] = []
	let row: string[] = []
	let field = ''
	let quoted = false
	const source = text.replace(BOM, '')
	for (let at = 0; at < source.length; at++) {
		const char = source[at]!
		if (quoted) {
			if (char === '"') {
				if (source[at + 1] === '"') {
					field += '"'
					at++
				} else quoted = false
			} else field += char
			continue
		}
		if (char === '"' && field === '') quoted = true
		else if (char === delimiter) {
			row.push(field)
			field = ''
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && source[at + 1] === '\n') at++
			row.push(field)
			rows.push(row)
			row = []
			field = ''
		} else field += char
	}
	if (field !== '' || row.length) {
		row.push(field)
		rows.push(row)
	}
	return rows
}

/** The header names each column goes by, the preferred first; compared without case or spaces. */
const ALIASES = {
	// a posted date first, as the provider's `date` is the posted one
	date: ['posting date', 'post date', 'posted date', 'date', 'transaction date', 'trans. date'],
	description: ['description', 'payee', 'name', 'merchant', 'transaction description', 'details', 'memo'],
	amount: ['amount', 'transaction amount'],
	debit: ['debit', 'withdrawal', 'withdrawals'],
	credit: ['credit', 'deposit', 'deposits'],
} as const
type Column = keyof typeof ALIASES

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '')

/** The column of each kind in a header row, by the earliest alias it has; nothing when it is not a header. */
function headerOf(cells: readonly string[]): Partial<Record<Column, number>> | undefined {
	const names = cells.map(squash)
	const found: Partial<Record<Column, number>> = {}
	for (const column of Object.keys(ALIASES) as Column[]) {
		for (const alias of ALIASES[column]) {
			const at = names.indexOf(squash(alias))
			if (at !== -1) {
				found[column] = at
				break
			}
		}
	}
	const money = found.amount !== undefined || (found.debit !== undefined && found.credit !== undefined)
	return found.date !== undefined && found.description !== undefined && money ? found : undefined
}

/** How many lines may come before the header. */
const PREAMBLE = 10

const count = (line: string, char: string) => line.split(char).length - 1

/** The delimiter of a line: `;` or a tab when it has more of them than commas. */
function delimiterOf(line: string): string {
	const commas = count(line, ',')
	const semis = count(line, ';')
	const tabs = count(line, '\t')
	if (tabs > commas && tabs >= semis) return '\t'
	if (semis > commas) return ';'
	return ','
}

/** An amount as a bank writes it: `(12.34)` and a trailing `DR` are negative, `CR` positive; nothing when unread. */
export function amountOf(text: string, currency: string): Money | undefined {
	let rest = text.trim()
	if (!rest) return undefined
	let negative = false
	const crdr = /\s*(CR|DR)\.?$/i.exec(rest)
	if (crdr) {
		negative = crdr[1]!.toUpperCase() === 'DR'
		rest = rest.slice(0, crdr.index).trim()
	}
	const brackets = /^\((.*)\)$/.exec(rest)
	if (brackets) {
		negative = true
		rest = brackets[1]!.trim()
	}
	// "$-12.34" is written with the sign after the symbol: the sign goes first
	rest = rest.replace(/^([^\d\-−+.]+)([-−])/, '$2$1')
	const amount = moneyOf(rest, currency)
	if (!amount) return undefined
	return negative && amount.minor > 0 ? negate(amount) : amount
}

type DateOrder = 'md' | 'dm'

/** A date as a day, in the file's order of month and day; nothing when it is no real day. */
function dayOf(text: string, order: DateOrder): string | undefined {
	const value = text.trim().split(/[ T]/)[0] ?? ''
	const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value)
	let day: string | undefined
	if (iso) day = `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`
	else {
		const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(value)
		if (!parts) return undefined
		const [first, second, year] = [parts[1]!, parts[2]!, parts[3]!]
		const [month, date] = order === 'dm' ? [second, first] : [first, second]
		const fullYear = year.length === 2 ? `20${year}` : year
		day = `${fullYear}-${month.padStart(2, '0')}-${date.padStart(2, '0')}`
	}
	return isDay(day) ? day : undefined
}

/** Day before month for the whole file, when any slashed date's first part is over 12. */
function orderOf(values: readonly string[]): DateOrder {
	for (const value of values) {
		const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})/.exec(value.trim())
		if (parts && Number(parts[1]) > 12) return 'dm'
	}
	return 'md'
}

/**
 * A CSV statement in the account's currency: `no-columns` when no line in the first eleven is a header with a date, a
 * description and an amount (or a debit and a credit), `no-rows` when nothing under it reads, `too-many` past
 * `MAX_IMPORT_ROWS`. A debit is money out. Every other column is ignored.
 */
export function statementFromCsv(text: string, currency: string): StatementRead {
	const source = text.replace(BOM, '')
	const lines = source.split(/\r\n|\n|\r/, PREAMBLE + 1)
	const at = lines.findIndex((line) => headerOf(parseCsv(line, delimiterOf(line))[0] ?? []))
	if (at === -1) return { failure: 'no-columns' }
	const delimiter = delimiterOf(lines[at]!)
	const all = parseCsv(source, delimiter)
	const start = all.findIndex((cells) => headerOf(cells))
	if (start === -1) return { failure: 'no-columns' }
	const header = headerOf(all[start]!)!
	const body = all.slice(start + 1).filter((cells) => cells.some((cell) => cell.trim()))
	if (!body.length) return { failure: 'no-rows' }
	if (body.length > MAX_IMPORT_ROWS) return { failure: 'too-many' }
	const order = orderOf(body.map((cells) => cells[header.date!] ?? ''))
	const rows: StatementRow[] = []
	let skipped = 0
	for (const cells of body) {
		const day = dayOf(cells[header.date!] ?? '', order)
		const description = cleanDescription(cells[header.description!] ?? '')
		const amount =
			header.amount !== undefined ? amountOf(cells[header.amount] ?? '', currency) : pairOf(cells, header, currency)
		if (!day || !description || !amount) {
			skipped += 1
			continue
		}
		rows.push({ day, description, amount })
	}
	return rows.length ? statementOf(rows, skipped, 'csv') : { failure: 'no-rows' }
}

/** A debit and credit pair as one signed amount: the debit out, the credit in; nothing when neither reads. */
function pairOf(
	cells: readonly string[],
	header: Partial<Record<Column, number>>,
	currency: string
): Money | undefined {
	const debit = (cells[header.debit!] ?? '').trim()
	const credit = (cells[header.credit!] ?? '').trim()
	const out = debit ? amountOf(debit, currency) : undefined
	const into = credit ? amountOf(credit, currency) : undefined
	if (out && out.minor !== 0) return out.minor > 0 ? negate(out) : out
	if (into) return into.minor < 0 ? negate(into) : into
	return out
}
