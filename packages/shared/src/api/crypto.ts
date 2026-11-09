// Orchard's crypto commands (src-tauri/src/domains/finance, D-204): Coinbase's read-only key and its wallets, the
// public spot price feed, and the watched addresses and extended public keys read from the chain. The crate holds the
// key and every extended key and makes every call; the webview gets whether a key exists, the wallets, the prices and
// each watch's quantity. Outside Tauri there is no crate: the status answers `undefined` and nothing binds. A refusal
// reads `coinbase:<code>: …` or `chain:<code>: …`; `cryptoErrorCode` takes the code.
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauri.js'

export interface CoinbaseStatus {
	hasKey: boolean
}

/** One Coinbase wallet: a coin's or a fiat currency's, with its exact amount as a decimal string. */
export interface CoinbaseWallet {
	id: string
	/** The coin's or currency's code, `BTC`, `USD`. */
	code: string
	name: string
	kind: 'crypto' | 'fiat'
	amount: string
}

export interface CoinbaseBalances {
	wallets: CoinbaseWallet[]
}

export interface CryptoPrices {
	/** One spot price per coin Coinbase priced, a decimal string in the quote currency. */
	prices: { code: string; price: string }[]
	/** The coins Coinbase has no price for. */
	missing: string[]
}

export type WatchChain = 'bitcoin' | 'ethereum'
export type WatchScript = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh'

export const CRYPTO_ERROR_CODES = [
	'invalid-key',
	'refused',
	'not-read-only',
	'needs-reauth',
	'rate-limited',
	'provider-down',
	'network',
	'no-key',
	'invalid-address',
	'private-key',
	'unsupported',
	'not-found',
	'too-many',
	'other',
] as const
export type CryptoErrorCode = (typeof CRYPTO_ERROR_CODES)[number]

const CODE = /(coinbase|chain):([a-z-]+)/

/** The code of a refusal from a crypto command; `other` for anything else. */
export function cryptoErrorCode(error: unknown): CryptoErrorCode {
	const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
	const code = CODE.exec(message)?.[2]
	return (CRYPTO_ERROR_CODES as readonly string[]).includes(code ?? '') ? (code as CryptoErrorCode) : 'other'
}

/** Whether this device holds a Coinbase key; `undefined` outside Tauri, where nothing binds. */
export async function coinbaseStatus(): Promise<CoinbaseStatus | undefined> {
	if (!isTauri()) return undefined
	return invoke<CoinbaseStatus>('coinbase_status')
}

/**
 * Stores the key once Coinbase has said it can only view; refuses `coinbase:invalid-key`, `coinbase:refused`,
 * `coinbase:not-read-only` or a retryable code, and stores nothing.
 */
export function coinbaseSetKey(name: string, privateKey: string): Promise<void> {
	return invoke('coinbase_set_key', { name, privateKey })
}

export function coinbaseClearKey(): Promise<void> {
	return invoke('coinbase_clear_key')
}

export function coinbaseBalances(): Promise<CoinbaseBalances> {
	return invoke<CoinbaseBalances>('coinbase_balances')
}

/** One spot price per distinct coin, in the quote currency (ISO 4217). */
export function cryptoPrices(codes: string[], quote: string): Promise<CryptoPrices> {
	return invoke<CryptoPrices>('crypto_prices', { codes, quote })
}

/** The address in its normal form, or `chain:invalid-address`. */
export function watchAddressCheck(chain: WatchChain, address: string): Promise<string> {
	return invoke<string>('watch_address_check', { chain, address })
}

/** Checks an extended public key and stores it under the asset's id; answers the script its addresses use. */
export function watchXpubSet(assetId: string, key: string, script?: WatchScript): Promise<{ script: WatchScript }> {
	return invoke<{ script: WatchScript }>('watch_xpub_set', { assetId, key, script: script ?? null })
}

/** Removes an asset's extended key from the device; idempotent. */
export function watchXpubClear(assetId: string): Promise<void> {
	return invoke('watch_xpub_clear', { assetId })
}

/** One watched asset's quantity, an exact decimal string. */
export function watchRead(
	assetId: string,
	chain: WatchChain,
	address?: string,
	script?: WatchScript
): Promise<{ quantity: string }> {
	return invoke<{ quantity: string }>('watch_read', {
		assetId,
		chain,
		address: address ?? null,
		script: script ?? null,
	})
}
