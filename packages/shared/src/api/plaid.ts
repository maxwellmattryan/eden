// Orchard's Plaid commands (src-tauri/src/domains/finance): the device's keys, a Link session (a hosted page on desktop,
// Plaid's native sheet on iOS, D-206), a sync run, an investments read, a revoke and the Sandbox's reset. The crate
// holds the keys and every token and makes every call; the webview gets a link token, the hosted page's URL where there
// is one, how the build links and whether keys exist. Outside Tauri there is no crate: the status answers `undefined`
// and nothing binds. A refusal reads `plaid:<code>: …`; `plaidErrorCode` takes the code.
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauri.js'

export interface PlaidStatus {
	environment: 'sandbox' | 'production'
	hasKeys: boolean
	/** How this build links (D-206): the system browser on desktop, Plaid's sheet on iOS, nothing on Android. */
	link: 'hosted' | 'sheet' | 'none'
}

export interface PlaidInstitution {
	id: string
	name: string
	colour?: string | null
	logo?: string | null
}

/** An account as Plaid reports it; the balances are decimal strings as Plaid stated them. */
export interface ProviderAccount {
	providerAccountId: string
	name: string
	mask?: string | null
	/** Plaid's type: `depository`, `credit`, `loan`, `investment`, … */
	kind: string
	subtype?: string | null
	/** ISO 4217, or nothing when Plaid gave only an unofficial code. */
	currency?: string | null
	current?: string | null
	available?: string | null
	/** A card's credit limit (#86), when Plaid states one. */
	limit?: string | null
}

/** A transaction as Plaid reports it: a positive amount is money out of the account. */
export interface ProviderTransaction {
	id: string
	providerAccountId: string
	amount: string
	currency?: string | null
	/** `YYYY-MM-DD`. */
	date: string
	authorizedDate?: string | null
	datetime?: string | null
	name: string
	merchantName?: string | null
	pending: boolean
	pendingTransactionId?: string | null
	category?: string | null
}

export interface SyncResult {
	status: 'ok' | 'needs-reauth'
	consentExpiresAt?: string | null
	accounts: ProviderAccount[]
	added: ProviderTransaction[]
	modified: ProviderTransaction[]
	removed: string[]
	cursor: string
	/** Each credit card's latest statement (#78); empty for an item with no card, or when Plaid would not say. */
	statements?: CardStatement[]
	/** Each student loan's and mortgage's terms (#86); empty for an item with no loan, or when Plaid would not say. */
	loans?: ProviderLoan[]
}

/** A credit card's latest statement, from Plaid's liabilities: decimal strings and `YYYY-MM-DD` days. */
export interface CardStatement {
	providerAccountId: string
	statementBalance?: string | null
	minimum?: string | null
	dueDate?: string | null
	statementDate?: string | null
	currency?: string | null
	/** The card's APRs (#86). */
	aprs?: ProviderApr[]
}

/** One of a card's APRs as Plaid states it: `percentage` is `"15.24"` for 15.24 %. */
export interface ProviderApr {
	/** Plaid's type: `purchase_apr`, `balance_transfer_apr`, `cash_apr`, `special`, … */
	kind: string
	percentage?: string | null
	balance?: string | null
	interest?: string | null
}

/** A student loan's or a mortgage's terms from Plaid's liabilities (#86): decimal strings and `YYYY-MM-DD` days. */
export interface ProviderLoan {
	providerAccountId: string
	kind: 'student' | 'mortgage'
	/** In percent. */
	rate?: string | null
	minimum?: string | null
	dueDate?: string | null
	payoffDate?: string | null
	original?: string | null
	currency?: string | null
}

/** A holding as Plaid lists it; every number is a decimal string as Plaid stated it. */
export interface ProviderHolding {
	providerAccountId: string
	securityId: string
	quantity: string
	institutionPrice?: string | null
	/** `YYYY-MM-DD`. */
	institutionPriceAsOf?: string | null
	institutionValue?: string | null
	/** The total paid, not per share. */
	costBasis?: string | null
	currency?: string | null
}

export interface ProviderSecurity {
	securityId: string
	name: string
	ticker?: string | null
	/** Plaid's type: `equity`, `etf`, `mutual fund`, `fixed income`, `cash`, `cryptocurrency`, … */
	kind?: string | null
	currency?: string | null
	closePrice?: string | null
	/** `YYYY-MM-DD`. */
	closePriceAsOf?: string | null
}

/** An investment transaction as Plaid reports it: a positive amount is money out of the account. */
export interface ProviderInvestmentTransaction {
	id: string
	providerAccountId: string
	securityId?: string | null
	/** `YYYY-MM-DD`. */
	date: string
	name: string
	quantity?: string | null
	amount: string
	price?: string | null
	/** Plaid's type: `buy`, `sell`, `cash`, `fee`, `transfer`, `cancel`. */
	kind: string
	subtype?: string | null
	currency?: string | null
}

/** One investments read (D-197); `none` when the Item has no investments. */
export interface InvestmentsResult {
	status: 'ok' | 'none'
	accounts: ProviderAccount[]
	holdings: ProviderHolding[]
	securities: ProviderSecurity[]
	transactions: ProviderInvestmentTransaction[]
}

export interface NewLink {
	linkId: string
	itemId: string
	institution: PlaidInstitution
	consentExpiresAt?: string | null
	accounts: ProviderAccount[]
}

export type LinkPoll =
	| { state: 'waiting' }
	| { state: 'exited'; reason?: string | null }
	| ({ state: 'linked' } & NewLink)
	| { state: 'reconnected' }
	| { state: 'expired' }

export interface LinkStart {
	linkToken: string
	/** The hosted page, on desktop; the sheet surface has none and is presented with `plaidLinkOpen`. */
	url?: string | null
	expiresAt?: string | null
}

export const PLAID_ERROR_CODES = [
	'needs-reauth',
	'invalid-keys',
	'rate-limited',
	'institution-down',
	'provider-down',
	'network',
	'no-keys',
	'not-found',
	'production',
	'other',
] as const
export type PlaidErrorCode = (typeof PLAID_ERROR_CODES)[number]

const CODE = /plaid:([a-z-]+)/

/** The code of a refusal from a Plaid command; `other` for anything else. */
export function plaidErrorCode(error: unknown): PlaidErrorCode {
	const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
	const code = CODE.exec(message)?.[1]
	return (PLAID_ERROR_CODES as readonly string[]).includes(code ?? '') ? (code as PlaidErrorCode) : 'other'
}

/** The environment and whether this device has keys; `undefined` outside Tauri, where nothing binds. */
export async function plaidStatus(): Promise<PlaidStatus | undefined> {
	if (!isTauri()) return undefined
	return invoke<PlaidStatus>('plaid_status')
}

/** Stores the keys once Plaid has accepted them; refuses `plaid:invalid-keys` or `plaid:network` and stores nothing. */
export function plaidSetKeys(clientId: string, secret: string): Promise<void> {
	return invoke('plaid_set_keys', { clientId, secret })
}

export function plaidClearKeys(): Promise<void> {
	return invoke('plaid_clear_keys')
}

/**
 * A Link session; with a link id, the update mode of that link's own Item. `brokerage` asks for investments first, so
 * an investments-only institution can link (D-197).
 */
export function plaidLinkStart(linkId?: string, brokerage?: boolean): Promise<LinkStart> {
	return invoke<LinkStart>('plaid_link_start', { linkId: linkId ?? null, brokerage: brokerage ?? null })
}

/** Presents Plaid's native sheet (iOS) on a link token the crate made for it; refuses `plaid:other` for any other. */
export function plaidLinkOpen(linkToken: string): Promise<void> {
	return invoke('plaid_link_open', { linkToken })
}

export function plaidLinkPoll(linkToken: string, linkId?: string): Promise<LinkPoll> {
	return invoke<LinkPoll>('plaid_link_poll', { linkToken, linkId: linkId ?? null })
}

export function plaidSync(linkId: string, cursor?: string): Promise<SyncResult> {
	return invoke<SyncResult>('plaid_sync', { linkId, cursor: cursor ?? null })
}

/** One investments read: holdings, securities with their closes, and the investment transactions between two days. */
export function plaidInvestments(linkId: string, startDay: string, endDay: string): Promise<InvestmentsResult> {
	return invoke<InvestmentsResult>('plaid_investments', { linkId, startDay, endDay })
}

/** Removes the link's Item at Plaid and its token here; answers whether there was a token. */
export function plaidRevoke(linkId: string): Promise<boolean> {
	return invoke<boolean>('plaid_revoke', { linkId })
}

export function plaidSandboxResetLogin(linkId: string): Promise<void> {
	return invoke('plaid_sandbox_reset_login', { linkId })
}
