// A bank's OFX or QFX export as a statement (#74, D-195): OFX 1.x SGML, whose tags need not close, and OFX 2.x XML,
// read by a tag scanner with no XML library. One statement per file; its currency must be the account's. The account
// number is read only for its last four digits, compared in memory and never kept whole. Pure, read on the device.
import {
	cleanDescription,
	isDay,
	MAX_IMPORT_ROWS,
	statementOf,
	type StatementRead,
	type StatementRow,
} from './statement.js'
import { moneyOf } from './sync.js'

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** The five XML entities, and numeric ones, as their characters. */
function decode(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, name: string) => {
		const lower = name.toLowerCase()
		if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16))
		if (lower.startsWith('#')) return String.fromCodePoint(Number(lower.slice(1)))
		return ENTITIES[lower] ?? whole
	})
}

/** A leaf tag's value: up to the next tag or the line's end, as SGML leaves it unclosed. */
function field(block: string, tag: string): string | undefined {
	const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block)
	const value = match?.[1]?.trim()
	return value ? decode(value) : undefined
}

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0

/** The `STMTTRN` blocks: each ends at its close, the next one, or the list's end. */
function transactions(body: string): string[] {
	const blocks: string[] = []
	const open = /<STMTTRN>/gi
	const starts: number[] = []
	for (let found = open.exec(body); found; found = open.exec(body)) starts.push(found.index + found[0].length)
	for (const [index, start] of starts.entries()) {
		const rest = body.slice(start, starts[index + 1] ?? body.length)
		const end = rest.search(/<\/STMTTRN>|<\/BANKTRANLIST>/i)
		blocks.push(end === -1 ? rest : rest.slice(0, end))
	}
	return blocks
}

/** A `TRNAMT` in the currency: a comma with no point is the decimal mark. */
function amountOf(text: string, currency: string) {
	const value = text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text
	return moneyOf(value, currency)
}

/**
 * An OFX statement in the account's currency: `several-accounts` for more than one statement, `currency` when its
 * `CURDEF` is another, `no-rows` with no transaction that reads, `too-many` past `MAX_IMPORT_ROWS`. A `FITID` seen
 * before in the file is kept once. The result carries the account number's last four digits at most.
 */
export function statementFromOfx(text: string, currency: string): StatementRead {
	// the SGML header lines, or the XML declaration and processing instruction, come before it
	const start = text.search(/<OFX[\s>]/i)
	if (start === -1) return { failure: 'unreadable' }
	const body = text.slice(start)
	if (count(body, /<(?:CC)?STMTRS>/gi) > 1) return { failure: 'several-accounts' }
	const curdef = field(body, 'CURDEF')
	if (curdef && curdef.toUpperCase() !== currency.toUpperCase()) return { failure: 'currency' }
	const blocks = transactions(body)
	if (!blocks.length) return { failure: 'no-rows' }
	if (blocks.length > MAX_IMPORT_ROWS) return { failure: 'too-many' }
	const rows: StatementRow[] = []
	const seen = new Set<string>()
	let skipped = 0
	for (const block of blocks) {
		const fitId = field(block, 'FITID')
		if (fitId && seen.has(fitId)) continue
		if (fitId) seen.add(fitId)
		const posted = /^(\d{4})(\d{2})(\d{2})/.exec(field(block, 'DTPOSTED') ?? '')
		const day = posted ? `${posted[1]}-${posted[2]}-${posted[3]}` : ''
		const amount = amountOf(field(block, 'TRNAMT') ?? '', currency)
		const description = cleanDescription(field(block, 'NAME') ?? field(block, 'MEMO') ?? '')
		if (!isDay(day) || !amount || !description) {
			skipped += 1
			continue
		}
		rows.push({ day, description, amount, ...(fitId ? { fitId } : {}) })
	}
	if (!rows.length) return { failure: 'no-rows' }
	return statementOf(rows, skipped, 'ofx', lastFour(field(body, 'ACCTID')))
}

/** The last four digits of an account number, when it has four; the number itself goes no further. */
function lastFour(account: string | undefined): string | undefined {
	const digits = (account ?? '').replace(/\D/g, '')
	return digits.length >= 4 ? digits.slice(-4) : undefined
}
