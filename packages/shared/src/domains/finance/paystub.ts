// Pay stub deductions (product/domains/finance.md §6, #85, D-201), pure so they are tested here: the shape the
// document reader's answer is held to (`finance.read-pay-stub`), the deductions of it that hold, what of them are
// insurance premiums, and the ops that keep them on their income source with the stub's `file-import` row. Health
// premiums leave through the paycheck and are never a transaction, so nothing here touches the ledger. The figures
// are read in the source's currency and worked in minor units (D-188).
import { toUri, type BatchOp } from '../../data/index.js'
import { answer, type JsonSchema } from '../../gardener/tools.js'
import type { ToolContext } from '../../shell/gardener/types.js'
import { addMoney, money, toDecimal, type Money } from '../../money/index.js'
import { payloadOf, type Ops } from './accounts.js'
import { moneyOf } from './sync.js'
import {
	DEDUCTION_KINDS,
	FILE_IMPORT_SOURCE,
	FINANCE,
	INSURANCE_DEDUCTIONS,
	type Deduction,
	type DeductionKind,
	type IncomeSource,
	type PayStub,
	type PayStubImportPayload,
} from './types.js'

/** A deduction's name is cut to 60 characters. */
export const DEDUCTION_NAME_MAX = 60
/** A pay stub keeps at most 30 deductions. */
export const DEDUCTIONS_MAX = 30

const DAY = /^\d{4}-\d{2}-\d{2}$/
const isDay = (value: unknown): value is string =>
	typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

/** The shape the document reader's pay stub answer is held to. */
export const PAY_STUB_ANSWER: JsonSchema = answer.object({
	isPayStub: { type: 'boolean', description: 'False when the document is not a pay stub.' },
	payDay: answer.text('The pay day printed on the stub, YYYY-MM-DD; empty when none is printed.'),
	deductions: answer.list(
		answer.object({
			name: answer.text('The deduction as printed: "Medical PPO", "401(k)".'),
			kind: answer.oneOf(DEDUCTION_KINDS, 'What the deduction is for; `other` when it is none of these.'),
			amount: answer.text('This paycheck’s amount as a decimal, never the year to date: "92.30".'),
		}),
		'Every deduction taken from this paycheck, in the order printed.'
	),
})

const isKind = (value: unknown): value is DeductionKind => (DEDUCTION_KINDS as readonly unknown[]).includes(value)

/**
 * The answer's deductions that hold: a name (trimmed, cut to 60 characters), a kind (`other` for one not known), and
 * an amount that reads in the currency and is not zero, kept as its absolute value. At most 30; the rest are skipped.
 * `kept` is what the tool hands back (the amounts as decimals), `deductions` the same as money.
 */
export function answerDeductions(
	json: unknown,
	currency: string
): { kept: { name: string; kind: DeductionKind; amount: string }[]; deductions: Deduction[]; skipped: number } {
	const list = (json as { deductions?: unknown } | null)?.deductions
	const kept: { name: string; kind: DeductionKind; amount: string }[] = []
	const deductions: Deduction[] = []
	let skipped = 0
	for (const raw of Array.isArray(list) ? list : []) {
		const line = (raw ?? {}) as Record<string, unknown>
		const name = typeof line.name === 'string' ? line.name.trim().slice(0, DEDUCTION_NAME_MAX).trim() : ''
		const read = typeof line.amount === 'string' ? moneyOf(line.amount.trim(), currency) : undefined
		if (!name || !read || read.minor === 0 || deductions.length >= DEDUCTIONS_MAX) {
			skipped += 1
			continue
		}
		const amount = money(Math.abs(read.minor), read.currency)
		const kind = isKind(line.kind) ? line.kind : 'other'
		deductions.push({ name, kind, amount })
		kept.push({ name, kind, amount: toDecimal(amount) })
	}
	return { kept, deductions, skipped }
}

/**
 * The tool's output as a pay stub for the sheet to check: its pay day (empty when it named none) and the deductions
 * that hold, or `empty` when none does.
 */
export function payStubFromAnswer(output: unknown, currency: string): PayStub | { failure: 'empty' } {
	const { deductions } = answerDeductions(output, currency)
	if (!deductions.length) return { failure: 'empty' }
	const payDay = (output as { payDay?: unknown } | null)?.payDay
	return { day: isDay(payDay) ? payDay : '', deductions }
}

/** What a paycheck's insurance premiums (medical, dental, vision, life, disability) come to in the currency; nothing with none. */
export function premiumsOf(stub: PayStub | undefined, currency: string): Money | undefined {
	const premiums = (stub?.deductions ?? []).filter(
		(entry) => INSURANCE_DEDUCTIONS.includes(entry.kind) && entry.amount.currency === currency
	)
	if (!premiums.length) return undefined
	return premiums.reduce((total, entry) => addMoney(total, entry.amount), money(0, currency))
}

/** A pay stub read on this device: the `file-import` row's id, the file's fingerprint and the day. */
export interface PayStubRead {
	id: string
	fingerprint: string
	day: string
}

/**
 * Keeps a pay stub's deductions on their income source, in one write with one undo: a capture's with the stub's
 * `file-import` row, an edit's as they are. With no stub (or no deduction left) the stored ones are cleared and the
 * row of the file they came from is tombstoned, so that file can be read again. The inverse takes it all back.
 */
export function payStubOps(
	source: IncomeSource,
	stub: PayStub | undefined,
	read?: PayStubRead
): Ops & { source: IncomeSource } {
	const was = source
	const next: IncomeSource = { ...source }
	const ops: BatchOp[] = []
	const inverse: BatchOp[] = []
	if (!stub?.deductions.length) {
		delete next.payStub
		ops.push({ op: 'updateEntity', id: next.id, payload: payloadOf(next) })
		inverse.push({ op: 'updateEntity', id: was.id, payload: payloadOf(was) })
		const importId = was.payStub?.importId
		if (importId) {
			const uri = toUri(FINANCE.fileImport, importId)
			ops.push({ op: 'delete', uri })
			inverse.push({ op: 'restore', uri })
		}
		return { ops, inverse, source: next }
	}
	const importId = read?.id ?? stub.importId ?? was.payStub?.importId
	next.payStub = {
		day: stub.day,
		deductions: stub.deductions.map((entry) => ({ ...entry })),
		...(importId ? { importId } : {}),
	}
	ops.push({ op: 'updateEntity', id: next.id, payload: payloadOf(next) })
	inverse.push({ op: 'updateEntity', id: was.id, payload: payloadOf(was) })
	if (read) {
		const payload: PayStubImportPayload = {
			kind: 'pay-stub',
			day: read.day,
			sourceId: source.id,
			rows: stub.deductions.length,
		}
		ops.push({
			op: 'createEntity',
			input: {
				id: read.id,
				type: FINANCE.fileImport,
				source: FILE_IMPORT_SOURCE,
				externalId: read.fingerprint,
				payload,
			},
		})
		inverse.push({ op: 'delete', uri: toUri(FINANCE.fileImport, read.id) })
	}
	return { ops, inverse, source: next }
}

/** What `read-pay-stub` says in a conversation: it runs from Orchard's Income section alone. */
export const READ_PAY_STUB_REFUSAL =
	'Pay stubs are read from Orchard’s Income section, with Read a pay stub; tell the owner.'

/** The tool's check: a page's own run has no thread, and a conversation's is refused before any request. */
export function readPayStubCheck(_input: unknown, ctx: Pick<ToolContext, 'threadId'>): string | undefined {
	return ctx.threadId ? READ_PAY_STUB_REFUSAL : undefined
}
