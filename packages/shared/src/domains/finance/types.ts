// Orchard's shapes (product/domains/finance.md): a bank's link, the accounts, a balance per account per day and what
// the owner owns besides. Every one is an `entities` row of its type, so no migration is needed (D-67). A balance is
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
	fileImport: 'file-import',
	income: 'income-source',
} as const

/**
 * What a transaction is (finance.md §6). #75 derives all but `bill-payment` (#78) and the investment kinds (#76).
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

	// ---- #74's key: a row read from a statement file has no `source`, and names the import that made it

	/** The `file-import` that made this row, so its undo and later audits find it. */
	importId?: string
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

/** How often an income source pays (#80, D-196): `yearly` is a tax refund's or payment's. */
export const INCOME_CADENCES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular', 'yearly'] as const
export type IncomeCadence = (typeof INCOME_CADENCES)[number]

/**
 * An `income-source` (#80, D-196): a paycheck, other repeating income, or the yearly tax refund or payment, found by
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

export type Category = CategoryPayload & { id: string }
export type Rule = RulePayload & { id: string; updatedAt: string }
export type Merchant = MerchantPayload & { id: string }

export type ProviderLink = ProviderLinkPayload & { id: string }
export type Account = AccountPayload & { id: string }
export type Snapshot = SnapshotPayload & { id: string }
export type Asset = AssetPayload & { id: string }

/** What the store holds; the snapshots only travel in the sample data, the store never reads them. */
export interface FinanceData {
	links: ProviderLink[]
	accounts: Account[]
	assets: Asset[]
	snapshots?: Snapshot[]
}
