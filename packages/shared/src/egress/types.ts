// The egress ledger's shapes (docs/product/substrate/privacy.md, "The owner's controls"; D-71), mirrored by hand from
// the crate (`src-tauri/src/substrate/egress.rs`): one row per destination and local day, counting the requests and
// the bytes Eden handed over.

/** Everywhere a request leaves for. A new destination is added here, to the CSP's `connect-src` in
 * `src-tauri/tauri.conf.json`, and to `settings.privacy.destinations` in both locales. */
export const DESTINATIONS = [
	'open-meteo',
	'open-meteo-air-quality',
	'open-meteo-geocoding',
	'nws',
	'weatherkit',
	'updater',
] as const
export type Destination = (typeof DESTINATIONS)[number]

/** The row that is always zero: the Vault's contents on their way to a model. The store refuses it; the interface
 * draws it. */
export const VAULT_AI = 'vault-ai'

export interface EgressRow {
	destination: string
	/** The local calendar day, `YYYY-MM-DD`. */
	day: string
	requests: number
	bytesOut: number
}

export interface EgressQuery {
	/** The first day, inclusive. */
	from?: string
	/** The last day, inclusive. */
	to?: string
}
