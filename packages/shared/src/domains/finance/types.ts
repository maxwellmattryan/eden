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
} as const

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
		name: string
		/** `#RRGGBB`, the swatch beside the group's name. */
		colour?: string
		/** A data URL; #73's. */
		logo?: string
	}
	status: LinkStatus
	/** ISO instant the consent ends. */
	consentExpiresAt?: string
	/** ISO instant of the last good sync. */
	lastSyncedAt?: string
	/** #73's. */
	cursor?: string
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
