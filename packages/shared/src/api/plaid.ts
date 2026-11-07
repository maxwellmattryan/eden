// Orchard's Plaid commands (src-tauri/src/domains/finance): the device's keys, a hosted Link session, a sync run, a
// revoke and the Sandbox's reset. The crate holds the keys and every token and makes every call; the webview gets a
// link token, the hosted page's URL and whether keys exist. Outside Tauri there is no crate: the status answers
// `undefined` and nothing binds. A refusal reads `plaid:<code>: …`; `plaidErrorCode` takes the code.
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauri.js'

export interface PlaidStatus {
	environment: 'sandbox' | 'production'
	hasKeys: boolean
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
	url: string
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

/** A hosted Link session; with a link id, the update mode of that link's own Item. */
export function plaidLinkStart(linkId?: string): Promise<LinkStart> {
	return invoke<LinkStart>('plaid_link_start', { linkId: linkId ?? null })
}

export function plaidLinkPoll(linkToken: string, linkId?: string): Promise<LinkPoll> {
	return invoke<LinkPoll>('plaid_link_poll', { linkToken, linkId: linkId ?? null })
}

export function plaidSync(linkId: string, cursor?: string): Promise<SyncResult> {
	return invoke<SyncResult>('plaid_sync', { linkId, cursor: cursor ?? null })
}

/** Removes the link's Item at Plaid and its token here; answers whether there was a token. */
export function plaidRevoke(linkId: string): Promise<boolean> {
	return invoke<boolean>('plaid_revoke', { linkId })
}

export function plaidSandboxResetLogin(linkId: string): Promise<void> {
	return invoke('plaid_sandbox_reset_login', { linkId })
}
