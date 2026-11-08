// Orchard's shapes (product/domains/finance.md): a bank's link, the accounts, a balance per account per day, what
// the owner owns besides, the transactions, and the bills with the letters they were read from (#78). Every one is an `entities` row of its type, so no migration is needed (D-67). A balance is
// kept as the bank states it and the kind says whether it is owed; a share is in basis points; a link is the device's
// that made it and is never in the domain's export (D-191).
import type { Money } from '../../money/index.js'

export const FINANCE = {
	link: 'provider-link',
	account: 'account',
	snapshot: 'balance-snapshot',
	asset: 'asset',
	transaction: 'transaction',
	category: 'budget-category',
	rule: 'category-rule',
	merchant: 'merchant',
	recurring: 'recurring-charge',
	bill: 'bill',
	fileImport: 'file-import',
	holding: 'holding',
	security: 'security',
	income: 'income-source',
	budget: 'budget',
} as const

/** Where a bill came from (#78): a letter read on the device, a card's statement, a series, or the owner's hand. */
export const BILL_SOURCES = ['letter', 'statement', 'repeating', 'manual'] as const
export type BillSource = (typeof BILL_SOURCES)[number]

/** How many months a repeating bill moves on by. */
export const BILL_REPEATS = [1, 2, 3, 6, 12] as const
export type BillRepeat = (typeof BILL_REPEATS)[number]

/** One payment towards a bill: a matched transaction's, or one the owner recorded with none ("Paid another way"). */
export interface BillPayment {
	transactionId?: string
	/** Positive, in the bill's currency. */
	amount: Money
	/** `YYYY-MM-DD`. */
	day: string
	/** The account the payment left. */
	accountId?: string
}

/**
 * A `bill` (#78, D-196): what the owner owes a payee for a period. Its state (`billState`) is derived on read and
 * never stored. A bill with `accountId` is a card statement: its amount is the statement balance and it is settled
 * once its payments reach the minimum.
 */
export interface BillPayload {
	payee: string
	/** `YYYY-MM`: the month the bill is for (a statement's month for a card). */
	period: string
	/** `YYYY-MM-DD`; absent, the bill is Expected ("not a bill yet"). */
	due?: string
	/** Positive. */
	amount: Money
	estimate?: true
	source: BillSource
	repeat?: { months: BillRepeat }
	/** A repeating bill whose amount does not change. */
	fixed?: true
	/** The first bill's id, on every occurrence of a series. */
	seriesId?: string
	/** A card statement's card. */
	accountId?: string
	minimum?: Money
	/** `YYYY-MM-DD`, a card statement's. */
	statementDay?: string
	/** Interest charged on the card since the previous statement. */
	interest?: Money
	/** `https://` only. */
	url?: string
	/** Learned from confirmed matches, distinct, at most 10. */
	merchantIds?: string[]
	payments?: BillPayment[]
	/** Candidate transaction ids awaiting the owner. */
	ask?: string[]
	dismissed?: string[]
	/** The Orchard task made for this due day. */
	task?: { id: string; due: string }
	/** Set on an occurrence the bill pass made that an owner's undo took back: its tombstone ends no series. */
	undone?: true
}

/** A `file-import` with `source: 'document'` (#78; #74's statement files have `source: 'file'`): a document read on this device, by its fingerprint (`externalId`), and what it made (D-189). */
export interface LetterImportPayload {
	kind: 'letter'
	/** `YYYY-MM-DD`. */
	day: string
	billId: string
	rows: 1
}

/** The source a `file-import` row is stored with; its `externalId` is the fingerprint. */
export const FILE_IMPORT_SOURCE = 'document'

/**
 * What a transaction is (finance.md §6). #75 derives all but the investment kinds (#76, D-197); `bill-payment` is an unpaired
 * money-out row with a `billId` (#78).
 */
export const TX_KINDS = [
	'purchase',
	'refund',
	'transfer',
	'card-payment',
	'bill-payment',
	'income',
	'interest-earned',
	'dividend',
	'interest-charged',
	'fee',
	'investment-buy',
	'investment-sell',
] as const
export type TxKind = (typeof TX_KINDS)[number]

/** One part of a split row: the row's currency and sign, never zero. */
export interface TxPart {
	amount: Money
	categoryId?: string
	/** At most 200 characters. */
	note?: string
}

/** Who chose a row's category: the owner, the purchase a refund returns, a rule, or the provider's category. */
export type CategoryBy = 'owner' | 'refund' | 'rule' | 'provider'

export const ACCOUNT_KINDS = [
	'checking',
	'savings',
	'credit-card',
	'loan',
	'investment',
	'retirement',
	'cash',
	'other',
] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export const ASSET_KINDS = ['vehicle', 'property', 'crypto', 'valuables', 'other'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

/** A kind whose balance is an amount owed. */
export const isDebt = (kind: AccountKind) => kind === 'credit-card' || kind === 'loan'

/** The whole of a share, in basis points. */
export const WHOLE = 10000

export type LinkStatus = 'ok' | 'needs-reauth' | 'error'
export type LinkState = 'ok' | 'stale' | 'expiring'

export interface ProviderLinkPayload {
	provider: 'plaid'
	institution: {
		/** The provider's institution id (`ins_56`). */
		id?: string
		name: string
		/** `#RRGGBB`, the swatch beside the group's name. */
		colour?: string
		/** A `data:image/png;base64,…` URL, drawn in the swatch's place. */
		logo?: string
	}
	/** The provider's Item id. */
	itemId?: string
	status: LinkStatus
	/** ISO instant the consent ends. */
	consentExpiresAt?: string
	/** ISO instant of the last good sync. */
	lastSyncedAt?: string
	/** Where the next `/transactions/sync` starts. */
	cursor?: string
	/** Consecutive failed runs; 0 or absent after a good one. */
	failures?: number
	/** The code of the last failure, never a message. */
	lastErrorCode?: string
	/** The local day of the last good investments read (D-197); one read a day. */
	investmentsReadOn?: string
}

export interface AccountPayload {
	name: string
	kind: AccountKind
	/** ISO 4217; the balance is in it. */
	currency: string
	/** The link's name for a linked account; free text for one entered by hand. */
	institution?: string
	/** A `provider-link` id; absent, the account was entered by hand. */
	linkId?: string
	/** #73's. */
	providerAccountId?: string
	last4?: string
	/** As the bank shows it: a debt's is the positive amount owed. */
	balance?: Money
	/** ISO instant the balance is as of. */
	balanceAt?: string
	/** Basis points, 1 to 10000. */
	share: number
	/** `YYYY-MM-DD`; set, the account is closed and counts in no total. */
	closedOn?: string
	/** The id of the account this one replaced. */
	replaces?: string
	/** The latest day's snapshot, so a second balance that day updates it. */
	lastSnapshot?: { id: string; day: string }
}

/** One per account per local day. */
export interface SnapshotPayload {
	accountId: string
	day: string
	balance: Money
}

export interface AssetPayload {
	name: string
	kind: AssetKind
	/** What the owner says it is worth. */
	value: Money
	/** `YYYY-MM-DD`. */
	valuedOn: string
	/** A decimal string, "0.0412". */
	quantity?: string
	/** "BTC"; set whenever a quantity is. */
	unit?: string
	/** Basis points, 1 to 10000. */
	share: number
}

/**
 * A bank's transaction, read from the provider: an ordinary row with `source: 'plaid'` and the provider's id as its
 * `externalId`, so it is unique among the live rows, exported, and never swept. The keys below are the provider's
 * (a sync overwrites them, `accountId` aside); any other key is another feature's (#75) and a sync keeps it.
 */
export interface TransactionPayload {
	/** The Eden account's id. */
	accountId: string
	/** Negative is money out of the account. */
	amount: Money
	/** `YYYY-MM-DD`, the provider's `date`. */
	day: string
	authorizedDay?: string
	/** ISO instant, when the provider gives one. */
	datetime?: string
	/** The provider's `name`, raw. */
	name: string
	/** The provider's `merchant_name`, as given; cleaning it is #75's. */
	merchantName?: string
	pending: boolean
	/** `personal_finance_category.detailed`, a hint for #75. */
	providerCategory?: string

	// ---- #75's own keys: the classification pass (`classify.ts`) derives them, the owner's edits (`edits.ts`) set them

	/** The pass's, from the provider's category, the sign and the transfer pair; a repayment's is `refund`. */
	kind?: TxKind
	/** The pass's: a `merchant` row, found by cleaned name or created. */
	merchantId?: string
	/** The pass's: the person on the other side of a vague merchant (Zelle, Venmo…), normalised, for rules. */
	counterparty?: string
	/** The owner's, a refund's purchase's, a rule's or the provider's, as `categoryBy` says. */
	categoryId?: string
	categoryBy?: CategoryBy
	/** The pass's: the other side of a move between two of the owner's accounts. */
	transferId?: string
	/** The pass's: the purchase this refund returns. */
	refundOf?: string
	/** The owner's: the reimbursable row this money-in row pays back. */
	repays?: string
	/** The owner's: the part of a money-out row someone owes back, positive, at most its size. */
	reimbursable?: Money
	/** The owner's split, summing exactly to `amount`. */
	parts?: TxPart[]
	/** The owner's: counts in totals, left out of averages. */
	oneOff?: true
	/** The pass's: a vague merchant with no category from the owner or a rule; #90 asks about it. */
	review?: 'vague'
	/** The sync's: the pending row this posted row took over. */
	replaced?: string
	/** The owner's (#83's detail); searched by the ledger. */
	notes?: string

	// ---- #76's: an investment transaction's own detail, a provider key, and the pass's reinvestment pointer

	/** The provider's: set only on a `plaid-investments` row. */
	investment?: { type: string; subtype?: string; securityId?: string; quantity?: string; price?: string }
	/** The pass's: the reinvestment buy that put this dividend or interest straight back in. */
	reinvested?: string

	// ---- #78's own key: the bill pass and the owner's Mark paid set it, and a sync keeps it

	/** The bill this row paid; an unpaired money-out row with one is a `bill-payment`. */
	billId?: string

	// ---- #74's key: a row read from a statement file has no `source`, and names the import that made it

	/** The `file-import` that made this row, so its undo and later audits find it. */
	importId?: string

	// ---- #79's key: the recurring pass (`recurring.ts`) derives it

	/** The recurring pass's: the `recurring-charge` row whose series this charge is in. */
	recurringId?: string
}

/**
 * A `file-import` (#74, D-195): one statement file brought in, kept as its fingerprint only (D-189). The row has
 * `source: 'file'` and the fingerprint as its `externalId`, so a second live record of the same file is refused.
 */
export interface FileImportPayload {
	what: 'csv' | 'ofx' | 'pdf' | 'picture'
	/** The account the rows went into. */
	accountId: string
	/** `YYYY-MM-DD`, the first and last day of the file's rows; absent when it held none. */
	from?: string
	to?: string
	/** How many rows were written. */
	rows: number
	/** How many were already in Orchard. */
	matched: number
	/** How many lines could not be read. */
	skipped: number
	/** ISO instant of the import. */
	at: string
}

/** How often a recurring charge comes (finance.md §3). */
export const CADENCES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const
export type Cadence = (typeof CADENCES)[number]

/** Two consecutive charges of a fixed series whose amounts differ; `day` is the later charge's. */
export interface PriceChange {
	day: string
	from: Money
	to: Money
}

/** What the owner said about a recurring charge. */
export type RecurringState = 'kept' | 'cancelled' | 'dismissed'

/**
 * A `recurring-charge` (#79): one series of charges at one merchant (and person, for a vague one) in one currency.
 * The recurring pass derives every field but the owner's four, which it keeps; none depends on today, so the pass is
 * idempotent and the status is computed (`statusOf`). Amounts keep the charges' sign, so they are negative.
 */
export interface RecurringPayload {
	merchantId: string
	counterparty?: string
	currency: string
	cadence: Cadence
	/** More than half of the recent intervals join two charges of different amounts. */
	variable?: true
	/** The last amount (fixed), or the median by size of the last three (variable). */
	expected: Money
	firstDay: string
	lastDay: string
	lastAmount: Money
	/** The day the next charge is expected. */
	nextDay: string
	/** The last charge's account. */
	accountId: string
	/** The last charge's category (`categoryOfRow`). */
	categoryId?: string
	/** The charges in the series. */
	count: number
	/** A fixed series' changes, the newest 12, oldest first; a variable series has none. */
	priceChanges: PriceChange[]

	// ---- the owner's: the pass keeps them

	state?: RecurringState
	/** `YYYY-MM-DD`, the day the owner set `state`. */
	stateOn?: string
	/** The owner turned down tracking it as a bill. */
	billOffer?: 'declined'
	/** The `bill` row that tracks it (#78). */
	billId?: string
}

/** A security's type, from Plaid's (`fixed income` → `fixed-income`; `loan` and anything unknown → `other`). */
export const SECURITY_TYPES = [
	'equity',
	'etf',
	'mutual-fund',
	'fixed-income',
	'cash',
	'cryptocurrency',
	'derivative',
	'other',
] as const
export type SecurityType = (typeof SECURITY_TYPES)[number]

/** The allocation's classes, in the order the owner reads them (D-197). */
export const ALLOCATION_CLASSES = ['stocks', 'funds', 'bonds', 'cash', 'crypto', 'other'] as const
export type AllocationClass = (typeof ALLOCATION_CLASSES)[number]

/** A `security`, upserted by the provider's `security_id`; one closing price per day, the newest last. */
export interface SecurityPayload {
	name: string
	ticker?: string
	type: SecurityType
	currency?: string
	prices: { day: string; price: string }[]
}

/** Who set a holding's cost basis: the provider, the owner, or a move from a replaced account. */
export type CostBasisBy = 'provider' | 'owner' | 'carried'

/** A `holding`: what one account holds of one security, upserted by `${providerAccountId}:${securityId}`. */
export interface HoldingPayload {
	/** The Eden account's id. */
	accountId: string
	/** The Eden security's id. */
	securityId: string
	/** A decimal string, exact. */
	quantity: string
	/** ISO 4217. */
	currency: string
	/** The provider's `institution_value`. */
	value?: Money
	/** The provider's `institution_price`, a decimal string. */
	price?: string
	/** `YYYY-MM-DD` the price is as of. */
	pricedOn?: string
	/** The total paid, not per share. */
	costBasis?: Money
	costBasisBy?: CostBasisBy
	/** The owner's value for a holding the provider gives no price for, with the day it was set. */
	typedValue?: { value: Money; on: string }
}

export type Security = SecurityPayload & { id: string }
export type Holding = HoldingPayload & { id: string }

/** A `budget-category`. A default one keeps its `key`, so the provider mapping finds it after a rename. */
export interface CategoryPayload {
	key?: string
	name: string
	group: 'fixed' | 'variable' | 'income'
	essential: boolean
}

/** A `category-rule`: at least one of `merchantId` or `counterparty`. */
export interface RulePayload {
	categoryId: string
	merchantId?: string
	counterparty?: string
	/** The row whose fix made it. */
	learnedFrom?: string
}

/** A `merchant`. A vague one (Zelle, PayPal…) is one per brand and names it in `vague`. */
export interface MerchantPayload {
	name: string
	/** `merchantKey` of the name it was made from. */
	key: string
	/** The brand of a vague merchant. */
	vague?: string
	/** The cleaned names that lead here, distinct, at most 50; a merge moves them. */
	rawNames: string[]
}

/** How often an income source pays (#80, D-200): `yearly` is a tax refund's or payment's. */
export const INCOME_CADENCES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular', 'yearly'] as const
export type IncomeCadence = (typeof INCOME_CADENCES)[number]

/**
 * An `income-source` (#80, D-200): a paycheck, other repeating income, or the yearly tax refund or payment, found by
 * the income pass (`income.ts`) from the live transactions. Its identity across passes is `kind` with `merchantId`
 * and `counterparty`, or `nameKey`. The pass writes the detected keys; the owner's keys are only ever the owner's.
 */
export interface IncomeSourcePayload {
	kind: 'income' | 'tax-refund' | 'tax-payment'
	merchantId?: string
	counterparty?: string
	/** `foldText` of the raw name, when the rows have no merchant. */
	nameKey?: string
	/** The merchant's name when detected; the page reads the merchant live. */
	name: string
	/** The latest row's account. */
	accountId: string
	cadence: IncomeCadence
	/** Semimonthly and monthly: days of the month, 31 is the last day. */
	anchors?: number[]
	/** Signed as the rows. */
	expected: Money
	firstDay: string
	/** The latest pay day: the last day the cadence was read from, or the latest row's for an irregular source. */
	lastDay: string
	nextDay?: string

	// ---- the owner's keys: the pass never writes them

	/** The job ended on this day. */
	endedOn?: string
	/** Lean mode is on since this day. */
	leanSince?: string
	/** The owner said the paycheck due this day is just late. */
	lateOk?: string
	/** Not income (or not a tax payment): hidden, and asked nothing about. */
	ignored?: true
	/** The owner has seen that this source is new. */
	seenNew?: true
	/** The extra rows answered on the bonus sheet, the newest last, at most 20. */
	handled?: string[]
}

export type IncomeSource = IncomeSourcePayload & { id: string }

/**
 * A `budget` row (#84, D-201): one category's line from a month on. There is one live row per month and category; a
 * month reads each category's latest row at or before it.
 */
export interface BudgetPayload {
	/** `YYYY-MM`: the first month the line holds; it holds until a later row of its category. */
	month: string
	categoryId: string
	/** Positive, home currency. */
	amount: Money
	rollover?: true
	/** A sinking fund: always rolls over. `by` is `YYYY-MM`; `every` is in months, from a repeating bill. */
	sinking?: { target: Money; by: string; every?: number }
	/** No line from this month on. */
	off?: true
	by: 'draft' | 'owner'
}

export type Budget = BudgetPayload & { id: string }

export type Category = CategoryPayload & { id: string }
export type Rule = RulePayload & { id: string; updatedAt: string }
export type Merchant = MerchantPayload & { id: string }
export type RecurringCharge = RecurringPayload & { id: string }

export type ProviderLink = ProviderLinkPayload & { id: string }
export type Account = AccountPayload & { id: string }
export type Snapshot = SnapshotPayload & { id: string }
export type Asset = AssetPayload & { id: string }
export type Bill = BillPayload & { id: string }

/** What the store holds; the snapshots only travel in the sample data, the store never reads them. */
export interface FinanceData {
	links: ProviderLink[]
	accounts: Account[]
	assets: Asset[]
	snapshots?: Snapshot[]
	holdings?: Holding[]
	securities?: Security[]
}
