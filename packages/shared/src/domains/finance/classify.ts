// The classification pass (product/domains/finance.md §6, D-193): after a sync, every live transaction gets a
// merchant, a kind and a category, the moves between the owner's own accounts are paired, and a refund points at the
// purchase it returns. Pointers to a pending row follow it to the posted row that took it over, and the owner's split
// and reimbursable amount are fitted to a new amount. Pure and idempotent: a second pass over the first one's result
// writes nothing. `spendingOf` is what a row adds to its categories, for the consumers (#77, #83).
import type { BatchOp, Entity } from '../../data/index.js'
import { addDays } from '../../dates/index.js'
import { addMoney, money, negate, type Money } from '../../money/index.js'
import { ensureCategoryOps, providerCategoryOf } from './categories.js'
import { cleanMerchant, merchantKey, vagueOf } from './merchants.js'
import { same } from './sync.js'
import {
	FINANCE,
	type Account,
	type Category,
	type CategoryPayload,
	type Merchant,
	type MerchantPayload,
	type Rule,
	type RulePayload,
	type TransactionPayload,
	type TxKind,
	type TxPart,
} from './types.js'

/** The most days between the two sides of a transfer pair. */
export const PAIR_DAYS = 3
/** How many days back a refund looks for its purchase. */
export const REFUND_DAYS = 120
/** The most cleaned names a merchant keeps. */
export const RAW_NAMES = 50

/** Kinds that never take a derived category and add nothing to spending. */
const MOVES: readonly TxKind[] = ['transfer', 'card-payment']
const NO_SPENDING: readonly TxKind[] = ['transfer', 'card-payment', 'income', 'interest-earned', 'dividend']
/** Kinds a money-in row turns into a refund. */
const SPENDING: readonly TxKind[] = ['purchase', 'fee', 'interest-charged']

/** A row's sign: -1 money out, 1 money in, 0 neither. */
const signOf = (amount: Money) => Math.sign(amount.minor)
const size = (amount: Money) => Math.abs(amount.minor)
const DAY_MS = 24 * 60 * 60 * 1000
/** Whole days between two `YYYY-MM-DD`. */
const daysApart = (a: string, b: string) =>
	Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS)
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// ---- Rules ---------------------------------------------------------------------------------------------------------

/**
 * The rule for a merchant and counterparty: merchant and counterparty beats merchant alone, which beats counterparty
 * alone; a tie goes to the most recently updated, then the higher id.
 */
export function ruleFor(
	rules: readonly Rule[],
	merchantId: string | undefined,
	counterparty: string | undefined
): Rule | undefined {
	let best: { rule: Rule; score: number } | undefined
	for (const rule of rules) {
		const merchantOk = rule.merchantId ? rule.merchantId === merchantId : true
		const counterpartyOk = rule.counterparty ? rule.counterparty === counterparty : true
		if (!merchantOk || !counterpartyOk || (!rule.merchantId && !rule.counterparty)) continue
		const score = (rule.merchantId ? 2 : 0) + (rule.counterparty ? 1 : 0)
		if (
			!best ||
			score > best.score ||
			(score === best.score &&
				(rule.updatedAt > best.rule.updatedAt || (rule.updatedAt === best.rule.updatedAt && rule.id > best.rule.id)))
		)
			best = { rule, score }
	}
	return best?.rule
}

// ---- Parts and spending --------------------------------------------------------------------------------------------

/**
 * A split fitted to a new amount: the difference goes into the largest part (the first of equals). When that would
 * flip the part's sign or make it zero, or the currency moved, the split is dropped and the part is named, so the row
 * can take its category.
 */
export function fitParts(parts: readonly TxPart[], amount: Money): { parts: TxPart[] } | { dropped: TxPart } {
	const largest = parts.reduce((best, part, at) => (size(part.amount) > size(parts[best]!.amount) ? at : best), 0)
	if (parts.some((part) => part.amount.currency !== amount.currency)) return { dropped: parts[largest]! }
	let total = money(0, amount.currency)
	for (const part of parts) total = addMoney(total, part.amount)
	if (total.minor === amount.minor) return { parts: [...parts] }
	const part = parts[largest]!
	const fitted = addMoney(part.amount, addMoney(amount, negate(total)))
	if (fitted.minor === 0 || signOf(fitted) !== signOf(part.amount)) return { dropped: part }
	return { parts: parts.map((entry, at) => (at === largest ? { ...entry, amount: fitted } : entry)) }
}

export interface Spending {
	categoryId?: string
	/** Signed as the row: a purchase is negative, a refund positive. */
	amount: Money
	oneOff: boolean
	pending: boolean
}

/**
 * What a row adds to its categories: nothing for a transfer, a card payment, income, interest earned or a dividend;
 * one entry per part of a split; the row's amount otherwise, so a refund (a repayment too) is positive and nets
 * against its category.
 */
export function spendingOf(row: TransactionPayload): Spending[] {
	if (row.kind && NO_SPENDING.includes(row.kind)) return []
	const oneOff = row.oneOff === true
	const entry = (amount: Money, categoryId?: string): Spending => ({
		...(categoryId ? { categoryId } : {}),
		amount,
		oneOff,
		pending: row.pending,
	})
	if (row.parts?.length) return row.parts.map((part) => entry(part.amount, part.categoryId))
	return [entry(row.amount, row.categoryId)]
}

/** The category a row stands under for a refund or a repayment: its own, or its largest part's. */
export function categoryOfRow(row: TransactionPayload): string | undefined {
	if (row.categoryId) return row.categoryId
	if (!row.parts?.length) return undefined
	const largest = row.parts.reduce((best, part) => (size(part.amount) > size(best.amount) ? part : best))
	return largest.categoryId
}

// ---- The pass ------------------------------------------------------------------------------------------------------

export interface ClassifyInput {
	/** Every live transaction. */
	rows: readonly Entity<TransactionPayload>[]
	/** A gone row's id → the live row that took it over; the live rows' `replaced` add to it. */
	dead?: ReadonlyMap<string, string>
	accounts: readonly Account[]
	/** The live categories. */
	categories: readonly Category[]
	/** The live rules. */
	rules: readonly Rule[]
	/** The live merchants. */
	merchants: readonly Merchant[]
	newId: () => string
}

interface Work {
	id: string
	was: TransactionPayload
	next: TransactionPayload
	vague: boolean
	transferLike: boolean
	provider: ReturnType<typeof providerCategoryOf>
}

/** One merchant index: a cleaned name's key, found by the names a merchant holds first, then by its own key. */
function merchantIndex(merchants: readonly Merchant[]) {
	const index = new Map<string, Merchant>()
	for (const merchant of merchants)
		for (const raw of merchant.rawNames) {
			const key = merchantKey(raw)
			if (key && !index.has(key)) index.set(key, merchant)
		}
	for (const merchant of merchants) if (merchant.key && !index.has(merchant.key)) index.set(merchant.key, merchant)
	return index
}

const merchantPayloadOf = ({ id: _id, ...payload }: Merchant): MerchantPayload => payload

/**
 * Every live row's target, as `updateEntity` ops for the rows that change and `createEntity` ops for the new
 * merchants, at the head. Each row goes through, in order: merchant, pointer repair, transfer pairing, kind, refund
 * link, parts fit, category, review.
 */
export function classifyOps(input: ClassifyInput): { ops: BatchOp[]; merchants: Merchant[] } {
	const { newId } = input
	const merchants = [...input.merchants]
	const created: BatchOp[] = []
	const index = merchantIndex(merchants)
	const accounts = new Map(input.accounts.map((account) => [account.id, account]))
	const categories = new Map(input.categories.map((category) => [category.id, category]))
	const byKey = new Map(input.categories.filter((entry) => entry.key).map((entry) => [entry.key!, entry]))
	const rules = input.rules.filter((rule) => categories.has(rule.categoryId))
	const dead = new Map(input.dead ?? [])
	for (const row of input.rows) if (row.payload.replaced) dead.set(row.payload.replaced, row.id)

	// merchant
	const work = new Map<string, Work>()
	for (const row of input.rows) {
		const was = row.payload
		const next: TransactionPayload = { ...was }
		const vague = vagueOf(was.name) ?? vagueOf(was.merchantName)
		const clean = cleanMerchant(was.name, was.merchantName)
		const key = merchantKey(clean)
		let merchant = key ? index.get(key) : undefined
		if (!merchant && key) {
			merchant = { id: newId(), name: clean, key, ...(vague ? { vague: vague.brand } : {}), rawNames: [clean] }
			merchants.push(merchant)
			index.set(key, merchant)
			created.push({
				op: 'createEntity',
				input: { id: merchant.id, type: FINANCE.merchant, payload: merchantPayloadOf(merchant) },
			})
		}
		if (merchant) next.merchantId = merchant.id
		else delete next.merchantId
		const isVague = Boolean(vague) && Boolean(merchant?.vague)
		if (isVague && vague?.counterparty) next.counterparty = vague.counterparty
		else delete next.counterparty
		const provider = providerCategoryOf(was.providerCategory)
		work.set(row.id, {
			id: row.id,
			was,
			next,
			vague: isVague,
			transferLike: provider.transferLike || isVague,
			provider,
		})
	}

	// pointer repair: a pointer to a gone row follows it to the row that took it over, or is let go
	const follow = (id: string | undefined): string | undefined => {
		for (let hops = 0; id && hops < 4; hops += 1) {
			if (work.has(id)) return id
			id = dead.get(id)
		}
		return undefined
	}
	for (const item of work.values()) {
		for (const key of ['transferId', 'refundOf', 'repays'] as const) {
			const to = follow(item.next[key])
			if (to && to !== item.id) item.next[key] = to
			else delete item.next[key]
		}
	}

	// transfer pairing: a kept pair still cancels, both ways; the rest pair greedily
	const pairable = (a: Work, b: Work) => {
		const x = a.next
		const y = b.next
		return (
			x.accountId !== y.accountId &&
			x.amount.currency === y.amount.currency &&
			x.amount.minor !== 0 &&
			x.amount.minor === -y.amount.minor &&
			!x.repays &&
			!y.repays &&
			daysApart(x.day, y.day) <= PAIR_DAYS &&
			(a.transferLike || b.transferLike)
		)
	}
	for (const item of work.values()) {
		const partner = item.next.transferId ? work.get(item.next.transferId) : undefined
		if (!partner || partner.next.transferId !== item.id || !pairable(item, partner)) delete item.next.transferId
	}
	for (const item of work.values()) {
		// a partner whose own pointer was let go lets this one go too
		const partner = item.next.transferId ? work.get(item.next.transferId) : undefined
		if (partner && partner.next.transferId !== item.id) delete item.next.transferId
	}
	pairTransfers(
		[...work.values()].filter((item) => !item.next.transferId && !item.next.repays),
		pairable
	)

	// kind
	for (const item of work.values())
		item.next.kind = kindOf(item, item.next.transferId ? work.get(item.next.transferId) : undefined, accounts)

	// refund link
	const purchases = new Map<string, Work[]>()
	for (const item of work.values()) {
		if (item.next.kind !== 'purchase' || !item.next.merchantId) continue
		const list = purchases.get(item.next.merchantId) ?? []
		list.push(item)
		purchases.set(item.next.merchantId, list)
	}
	for (const item of work.values()) {
		const found = item.next.kind === 'refund' && !item.next.repays ? refundTarget(item, purchases) : undefined
		if (found) item.next.refundOf = found.id
		else delete item.next.refundOf
	}

	// parts fit and the reimbursable cap
	for (const item of work.values()) fitOwnerKeys(item.next)

	// category: the rows a refund or repayment points at first, so theirs is settled when the refund reads it
	const derive = (item: Work) => {
		const next = item.next
		if (next.categoryBy === 'owner' && next.categoryId) return
		delete next.categoryId
		delete next.categoryBy
		if (next.kind && MOVES.includes(next.kind)) return
		const target = next.repays ?? next.refundOf
		const from = target ? work.get(target) : undefined
		const theirs = from ? categoryOfRow(from.next) : undefined
		if (theirs) return set(next, theirs, 'refund')
		const rule = next.merchantId || next.counterparty ? ruleFor(rules, next.merchantId, next.counterparty) : undefined
		if (rule) return set(next, rule.categoryId, 'rule')
		const mapped = item.provider.key ? byKey.get(item.provider.key) : undefined
		if (mapped && item.provider.kind && !MOVES.includes(item.provider.kind)) return set(next, mapped.id, 'provider')
	}
	const later: Work[] = []
	for (const item of work.values()) {
		if (item.next.repays || item.next.refundOf) later.push(item)
		else derive(item)
	}
	for (const item of later) derive(item)

	// review
	for (const item of work.values()) {
		const next = item.next
		const asks =
			item.vague &&
			!next.repays &&
			!(next.kind && MOVES.includes(next.kind)) &&
			next.categoryBy !== 'owner' &&
			next.categoryBy !== 'rule'
		if (asks) next.review = 'vague'
		else delete next.review
	}

	const updates: BatchOp[] = []
	for (const item of work.values())
		if (!same(item.next, item.was)) updates.push({ op: 'updateEntity', id: item.id, payload: item.next })
	return { ops: [...created, ...updates], merchants }
}

function set(next: TransactionPayload, categoryId: string, by: TransactionPayload['categoryBy']) {
	next.categoryId = categoryId
	next.categoryBy = by
}

/**
 * The greedy pairing: every candidate pair, bucketed by currency and size so the cost stays near linear, then the
 * smallest day gap first, the earlier day, then the ids; a row is in one pair at most.
 */
function pairTransfers(open: Work[], pairable: (a: Work, b: Work) => boolean) {
	const buckets = new Map<string, { out: Work[]; in: Work[] }>()
	for (const item of open) {
		const amount = item.next.amount
		if (amount.minor === 0) continue
		const key = `${amount.currency}:${size(amount)}`
		const bucket = buckets.get(key) ?? { out: [], in: [] }
		;(amount.minor < 0 ? bucket.out : bucket.in).push(item)
		buckets.set(key, bucket)
	}
	const edges: { out: Work; in: Work; gap: number; day: string }[] = []
	for (const bucket of buckets.values()) {
		if (!bucket.out.length || !bucket.in.length) continue
		bucket.in.sort((a, b) => byText(a.next.day, b.next.day))
		for (const out of bucket.out) {
			const from = addDays(out.next.day, -PAIR_DAYS)
			const to = addDays(out.next.day, PAIR_DAYS)
			let at = lowerBound(bucket.in, from)
			for (; at < bucket.in.length && bucket.in[at]!.next.day <= to; at += 1) {
				const into = bucket.in[at]!
				if (!pairable(out, into)) continue
				const gap = daysApart(out.next.day, into.next.day)
				edges.push({ out, in: into, gap, day: out.next.day < into.next.day ? out.next.day : into.next.day })
			}
		}
	}
	edges.sort((a, b) => a.gap - b.gap || byText(a.day, b.day) || byText(a.out.id, b.out.id) || byText(a.in.id, b.in.id))
	for (const edge of edges) {
		if (edge.out.next.transferId || edge.in.next.transferId) continue
		edge.out.next.transferId = edge.in.id
		edge.in.next.transferId = edge.out.id
	}
}

function lowerBound(sorted: readonly Work[], day: string): number {
	let low = 0
	let high = sorted.length
	while (low < high) {
		const mid = (low + high) >> 1
		if (sorted[mid]!.next.day < day) low = mid + 1
		else high = mid
	}
	return low
}

/** Words that name a paycheck in a bank's description. */
const PAYROLL = /\b(payroll|direct dep(osit)?|dir dep|salary|wages)\b/i
const looksLikePay = (row: TransactionPayload) =>
	PAYROLL.test(row.name) || (row.merchantName !== undefined && PAYROLL.test(row.merchantName))

/**
 * A row's kind: a pair's is `card-payment` when the side the money goes into is a credit card, else `transfer`; a
 * repayment is a refund; a vague merchant with no partner is a purchase or a refund by sign; an unpaired move stays
 * the provider's; a money-in row of a spending kind is a refund; nothing known is a purchase or a refund by sign, or
 * income when a money-in row's words name a paycheck.
 */
function kindOf(item: Work, partner: Work | undefined, accounts: ReadonlyMap<string, Account>): TxKind {
	const next = item.next
	const bySign: TxKind = signOf(next.amount) > 0 ? 'refund' : 'purchase'
	if (partner) {
		const into = signOf(next.amount) > 0 ? next : partner.next
		return accounts.get(into.accountId)?.kind === 'credit-card' ? 'card-payment' : 'transfer'
	}
	if (next.repays) return 'refund'
	if (item.vague) return bySign
	const kind = item.provider.kind
	// a statement's payroll line has no provider category: its words say it is income (#80)
	if (!kind) return bySign === 'refund' && looksLikePay(next) ? 'income' : bySign
	if (SPENDING.includes(kind)) return bySign === 'refund' ? 'refund' : kind
	return kind
}

/** The purchase a refund returns: same merchant (and person, for a vague one), currency, within 120 days before. */
function refundTarget(item: Work, purchases: ReadonlyMap<string, Work[]>): Work | undefined {
	const next = item.next
	if (signOf(next.amount) <= 0 || !next.merchantId) return undefined
	const since = addDays(next.day, -REFUND_DAYS)
	let best: { work: Work; gap: number; off: number } | undefined
	for (const candidate of purchases.get(next.merchantId) ?? []) {
		const theirs = candidate.next
		if (candidate.id === item.id || theirs.amount.currency !== next.amount.currency) continue
		if (theirs.day > next.day || theirs.day < since || size(theirs.amount) < size(next.amount)) continue
		if (item.vague && (!next.counterparty || theirs.counterparty !== next.counterparty)) continue
		const gap = daysApart(theirs.day, next.day)
		const off = size(theirs.amount) - size(next.amount)
		if (
			!best ||
			gap < best.gap ||
			(gap === best.gap && (off < best.off || (off === best.off && candidate.id < best.work.id)))
		)
			best = { work: candidate, gap, off }
	}
	return best?.work
}

/**
 * The owner's split and reimbursable amount fitted to the row's amount: a split that cannot absorb the difference
 * is dropped and its largest part's category becomes the owner's; a reimbursable amount larger than the row is
 * capped, and one on a row that is no longer money out is let go.
 */
function fitOwnerKeys(next: TransactionPayload) {
	if (next.parts?.length) {
		const fitted = fitParts(next.parts, next.amount)
		if ('parts' in fitted) next.parts = fitted.parts
		else {
			delete next.parts
			if (fitted.dropped.categoryId) {
				next.categoryId = fitted.dropped.categoryId
				next.categoryBy = 'owner'
			}
		}
	}
	const owed = next.reimbursable
	if (owed) {
		if (owed.currency !== next.amount.currency || signOf(next.amount) >= 0) delete next.reimbursable
		else if (owed.minor > size(next.amount)) next.reimbursable = money(size(next.amount), owed.currency)
	}
}

// ---- One whole pass over what was read ----------------------------------------------------------------------------

export interface PassInput {
	/** Every live transaction. */
	transactions: readonly Entity<TransactionPayload>[]
	/** Every category row, the tombstoned ones too: one ever existing stops the defaults. */
	categories: readonly Entity<CategoryPayload>[]
	rules: readonly Entity<RulePayload>[]
	merchants: readonly Entity<MerchantPayload>[]
	accounts: readonly Account[]
	/** A default category's name in the current language. */
	name: (key: string) => string
	newId: () => string
}

/** The defaults when none ever existed, then the pass: what the store writes after a sync, and the sets it shows. */
export function classifyPass(input: PassInput): {
	ops: BatchOp[]
	categories: Category[]
	rules: Rule[]
	merchants: Merchant[]
} {
	const seeded = ensureCategoryOps(input.categories.length > 0, input.name, input.newId)
	const categories = [
		...input.categories.filter((row) => !row.deletedAt).map((row) => ({ ...row.payload, id: row.id })),
		...seeded.categories,
	]
	const rules = input.rules
		.filter((row) => !row.deletedAt)
		.map((row) => ({ ...row.payload, id: row.id, updatedAt: row.updatedAt }))
	const pass = classifyOps({
		rows: input.transactions.filter((row) => !row.deletedAt),
		accounts: input.accounts,
		categories,
		rules,
		merchants: input.merchants.filter((row) => !row.deletedAt).map((row) => ({ ...row.payload, id: row.id })),
		newId: input.newId,
	})
	return { ops: [...seeded.ops, ...pass.ops], categories, rules, merchants: pass.merchants }
}
