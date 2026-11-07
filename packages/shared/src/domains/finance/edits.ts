// The owner's fixes to a transaction and its merchant (product/domains/finance.md §6, D-193), pure, each as one write
// and the write that takes it back (D-12): a category, remembered as a rule if asked; a split; a reimbursable part and
// the repayment that pays it back; a one-off; a merchant's name and a merge. A refusal answers a code and writes
// nothing. The store reads the rows and sends the ops (`store.svelte.ts`); #83's transaction detail calls it.
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { addMoney, money, type Money } from '../../money/index.js'
import { categoryOfRow, RAW_NAMES, ruleFor } from './classify.js'
import { merchantKey } from './merchants.js'
import {
	FINANCE,
	type Category,
	type CategoryPayload,
	type Merchant,
	type MerchantPayload,
	type Rule,
	type RulePayload,
	type TransactionPayload,
	type TxPart,
} from './types.js'

export interface Edit {
	ops: BatchOp[]
	inverse: BatchOp[]
}

export type Refused<C extends string> = { error: C }

export type SplitError =
	'split:too-few' | 'split:too-many' | 'split:sum' | 'split:sign' | 'split:currency' | 'split:zero' | 'split:note'
export type ReimbursableError =
	'reimbursable:money-in' | 'reimbursable:zero' | 'reimbursable:currency' | 'reimbursable:too-much'
export type RepaymentError =
	'repayment:same' | 'repayment:not-reimbursable' | 'repayment:money-out' | 'repayment:currency' | 'repayment:paired'

export const MIN_PARTS = 2
export const MAX_PARTS = 20
export const MAX_NOTE = 200
export const MAX_NAME = 100

type Row = Entity<TransactionPayload>

const update = (id: string, payload: object): BatchOp => ({ op: 'updateEntity', id, payload })
/** A row changed: its new payload, and the way back to the old. */
const rowEdit = (row: Row, next: TransactionPayload): Edit => ({
	ops: [update(row.id, next)],
	inverse: [update(row.id, row.payload)],
})
const ruleUri = (id: string) => toUri(FINANCE.rule, id)
const rulePayloadOf = ({ id: _id, updatedAt: _at, ...payload }: Rule): RulePayload => payload
const merchantPayloadOf = ({ id: _id, ...payload }: Merchant): MerchantPayload => payload

// ---- Category ------------------------------------------------------------------------------------------------------

export interface RecategoriseContext {
	/** The live transactions a rule may reach: every row of the merchant, or more. */
	rows: readonly Row[]
	merchants: readonly Merchant[]
	rules: readonly Rule[]
	newId: () => string
	/** Now, as the new rule's `updatedAt`, so it beats an older tie. */
	nowIso: string
}

/**
 * The owner's category on a row (none clears it, for the pass to derive again). Remembered, a normal merchant's rule
 * is merchant → category, a vague one's merchant + counterparty → category, and a vague row with no counterparty
 * makes none. The rule then recategorises every other row it wins on, except the owner's, a refund's and a move's.
 * The inverse puts back the row, the rule and those rows.
 */
export function recategoriseOps(
	row: Row,
	categoryId: string | undefined,
	remember: boolean,
	ctx: RecategoriseContext
): Edit & { rule?: Rule; created: boolean; changed: Row[] } {
	const next: TransactionPayload = { ...row.payload }
	if (categoryId) {
		next.categoryId = categoryId
		next.categoryBy = 'owner'
	} else {
		delete next.categoryId
		delete next.categoryBy
	}
	delete next.review
	const edit = rowEdit(row, next)
	const merchant = ctx.merchants.find((entry) => entry.id === row.payload.merchantId)
	const counterparty = merchant?.vague ? row.payload.counterparty : undefined
	if (!remember || !categoryId || !merchant || (merchant.vague && !counterparty))
		return { ...edit, created: false, changed: [] }

	const held = ctx.rules.find((rule) => rule.merchantId === merchant.id && rule.counterparty === counterparty)
	const rule: Rule = {
		...(held ?? { id: ctx.newId() }),
		categoryId,
		merchantId: merchant.id,
		...(counterparty ? { counterparty } : {}),
		learnedFrom: row.id,
		updatedAt: ctx.nowIso,
	}
	if (held) {
		edit.ops.push(update(rule.id, rulePayloadOf(rule)))
		edit.inverse.push(update(held.id, rulePayloadOf(held)))
	} else {
		edit.ops.push({ op: 'createEntity', input: { id: rule.id, type: FINANCE.rule, payload: rulePayloadOf(rule) } })
		edit.inverse.push({ op: 'delete', uri: ruleUri(rule.id) })
	}
	const rules = [...ctx.rules.filter((entry) => entry.id !== rule.id), rule]
	const changed: Row[] = []
	for (const other of ctx.rows) {
		const theirs = other.payload
		if (other.id === row.id || theirs.merchantId !== merchant.id) continue
		if (theirs.categoryBy === 'owner' || theirs.categoryBy === 'refund') continue
		if (theirs.kind === 'transfer' || theirs.kind === 'card-payment') continue
		if (ruleFor(rules, theirs.merchantId, theirs.counterparty)?.id !== rule.id) continue
		const payload: TransactionPayload = { ...theirs, categoryId, categoryBy: 'rule' }
		delete payload.review
		edit.ops.push(update(other.id, payload))
		edit.inverse.push(update(other.id, theirs))
		changed.push({ ...other, payload })
	}
	return { ...edit, rule, created: !held, changed }
}

// ---- Split ---------------------------------------------------------------------------------------------------------

/** A split of 2 to 20 parts, each the row's currency and sign, never zero, summing exactly to the amount. */
export function splitOps(row: Row, parts: readonly TxPart[]): Edit | Refused<SplitError> {
	const amount = row.payload.amount
	if (parts.length < MIN_PARTS) return { error: 'split:too-few' }
	if (parts.length > MAX_PARTS) return { error: 'split:too-many' }
	if (parts.some((part) => part.amount.currency !== amount.currency)) return { error: 'split:currency' }
	if (parts.some((part) => part.amount.minor === 0)) return { error: 'split:zero' }
	if (parts.some((part) => Math.sign(part.amount.minor) !== Math.sign(amount.minor))) return { error: 'split:sign' }
	if (parts.some((part) => (part.note?.trim().length ?? 0) > MAX_NOTE)) return { error: 'split:note' }
	let total: Money = money(0, amount.currency)
	for (const part of parts) total = addMoney(total, part.amount)
	if (total.minor !== amount.minor) return { error: 'split:sum' }
	const clean = parts.map((part): TxPart => {
		const note = part.note?.trim()
		return {
			amount: money(part.amount.minor, part.amount.currency),
			...(part.categoryId ? { categoryId: part.categoryId } : {}),
			...(note ? { note } : {}),
		}
	})
	return rowEdit(row, { ...row.payload, parts: clean })
}

export function unsplitOps(row: Row): Edit | undefined {
	if (!row.payload.parts) return undefined
	const next = { ...row.payload }
	delete next.parts
	return rowEdit(row, next)
}

// ---- Reimbursement -------------------------------------------------------------------------------------------------

/** The part of a money-out row someone owes back: positive, its currency, at most its size. None clears it. */
export function reimbursableOps(row: Row, amount: Money | undefined): Edit | Refused<ReimbursableError> {
	const next = { ...row.payload }
	if (!amount) {
		delete next.reimbursable
		return rowEdit(row, next)
	}
	const own = row.payload.amount
	if (own.minor >= 0) return { error: 'reimbursable:money-in' }
	if (amount.minor <= 0) return { error: 'reimbursable:zero' }
	if (amount.currency !== own.currency) return { error: 'reimbursable:currency' }
	if (amount.minor > -own.minor) return { error: 'reimbursable:too-much' }
	return rowEdit(row, { ...next, reimbursable: money(amount.minor, amount.currency) })
}

/**
 * Says a money-in row pays back a reimbursable one: the repayment becomes a refund in the original's category, so it
 * reduces that category's spending and is never income.
 */
export function repaymentOps(original: Row, repayment: Row): Edit | Refused<RepaymentError> {
	if (original.id === repayment.id) return { error: 'repayment:same' }
	if (!original.payload.reimbursable) return { error: 'repayment:not-reimbursable' }
	const theirs = repayment.payload
	if (theirs.amount.minor <= 0) return { error: 'repayment:money-out' }
	if (theirs.amount.currency !== original.payload.amount.currency) return { error: 'repayment:currency' }
	if (theirs.transferId) return { error: 'repayment:paired' }
	const next: TransactionPayload = { ...theirs, repays: original.id, kind: 'refund' }
	const categoryId = categoryOfRow(original.payload)
	if (categoryId) {
		next.categoryId = categoryId
		next.categoryBy = 'refund'
	} else {
		delete next.categoryId
		delete next.categoryBy
	}
	delete next.refundOf
	delete next.review
	return rowEdit(repayment, next)
}

/** The row no longer pays anything back; the pass derives its category again. */
export function unlinkRepaymentOps(repayment: Row): Edit | undefined {
	if (!repayment.payload.repays) return undefined
	const next = { ...repayment.payload }
	delete next.repays
	if (next.categoryBy === 'refund') {
		delete next.categoryId
		delete next.categoryBy
	}
	return rowEdit(repayment, next)
}

/** Counts in totals; `spendingOf` marks it so averages can leave it out. */
export function oneOffOps(row: Row, oneOff: boolean): Edit | undefined {
	if ((row.payload.oneOff === true) === oneOff) return undefined
	const next = { ...row.payload }
	if (oneOff) next.oneOff = true
	else delete next.oneOff
	return rowEdit(row, next)
}

// ---- Merchants -----------------------------------------------------------------------------------------------------

/** A merchant's display name; its key and raw names stay, so the pass still finds it. */
export function renameMerchantOps(merchant: Merchant, name: string): (Edit & { merchant: Merchant }) | undefined {
	const trimmed = name.trim()
	if (!trimmed || trimmed.length > MAX_NAME || trimmed === merchant.name) return undefined
	const next = { ...merchant, name: trimmed }
	return {
		ops: [update(merchant.id, merchantPayloadOf(next))],
		inverse: [update(merchant.id, merchantPayloadOf(merchant))],
		merchant: next,
	}
}

/**
 * Merges merchants into one: their raw names (and names), their rows and their rules move to `into`, and they are
 * tombstoned. The inverse brings them back and puts every row and rule back.
 */
export function mergeMerchantOps(
	into: Merchant,
	from: readonly Merchant[],
	rows: readonly Row[],
	rules: readonly Rule[]
): (Edit & { merchant: Merchant; rules: Rule[] }) | undefined {
	const others = from.filter((entry) => entry.id !== into.id)
	if (!others.length) return undefined
	const ids = new Set(others.map((entry) => entry.id))
	const names: string[] = []
	const keys = new Set<string>()
	for (const raw of [...into.rawNames, ...others.flatMap((entry) => [...entry.rawNames, entry.name])]) {
		const key = merchantKey(raw)
		if (!key || keys.has(key) || names.length >= RAW_NAMES) continue
		keys.add(key)
		names.push(raw)
	}
	const merchant: Merchant = { ...into, rawNames: names }
	const ops: BatchOp[] = [update(into.id, merchantPayloadOf(merchant))]
	const inverse: BatchOp[] = [update(into.id, merchantPayloadOf(into))]
	for (const entry of others) {
		const uri = toUri(FINANCE.merchant, entry.id)
		ops.push({ op: 'delete', uri })
		inverse.unshift({ op: 'restore', uri })
	}
	for (const row of rows) {
		if (!row.payload.merchantId || !ids.has(row.payload.merchantId)) continue
		ops.push(update(row.id, { ...row.payload, merchantId: into.id }))
		inverse.push(update(row.id, row.payload))
	}
	const moved: Rule[] = []
	for (const rule of rules) {
		if (!rule.merchantId || !ids.has(rule.merchantId)) continue
		const next = { ...rule, merchantId: into.id }
		ops.push(update(rule.id, rulePayloadOf(next)))
		inverse.push(update(rule.id, rulePayloadOf(rule)))
		moved.push(next)
	}
	return { ops, inverse, merchant, rules: moved }
}

// ---- Categories ----------------------------------------------------------------------------------------------------

export type CategoryDraft = Omit<CategoryPayload, 'key'> & { id?: string }

/** Creates a category or renames one; a default keeps its key. Budget fields beyond these are #84's. */
export function saveCategoryOps(
	draft: CategoryDraft,
	was: Category | undefined,
	newId: () => string
): (Edit & { category: Category }) | undefined {
	const name = draft.name.trim()
	if (!name || name.length > MAX_NAME) return undefined
	const category: Category = {
		...(was ?? {}),
		id: was?.id ?? newId(),
		name,
		group: draft.group,
		essential: draft.essential,
	}
	const { id, ...payload } = category
	if (!was)
		return {
			ops: [{ op: 'createEntity', input: { id, type: FINANCE.category, payload } }],
			inverse: [{ op: 'delete', uri: toUri(FINANCE.category, id) }],
			category,
		}
	const { id: _id, ...old } = was
	return { ops: [update(id, payload)], inverse: [update(id, old)], category }
}
