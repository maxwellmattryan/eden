// Orchard's crypto on the desktop (product/domains/finance.md §8, D-201). The crate holds the Coinbase key and every
// extended key and makes every call (`api/crypto.ts`); this module is the key sheet's save and the run: at launch and
// every hour (`finance.crypto`), one at a time. A run clears the secrets a removal left once its undo has passed, reads
// the Coinbase wallets, prices the coins held once a local day, reads each watched asset once a local day, and values
// the crypto assets and the Coinbase account from the prices held. It writes no transactions, so it classifies
// nothing and runs no bill pass. The phone and a plain browser bind nothing.
//
// Nothing here logs more than a code: no key, no address, no amount.
import { toast } from '@eden/ui-kit'
import { get } from 'svelte/store'
import {
	coinbaseBalances,
	coinbaseClearKey,
	coinbaseSetKey,
	coinbaseStatus,
	cryptoErrorCode,
	cryptoPrices,
	watchRead,
	watchXpubClear,
	type CoinbaseStatus,
	type CryptoErrorCode,
} from '../../api/crypto.js'
import { logError } from '../../api/diagnostics.js'
import { newId, queryEntities, type Entity } from '../../data/index.js'
import { nowIso, todayIso } from '../../dates/index.js'
import { t } from '../../i18n/index.js'
import { settings } from '../../settings/index.js'
import { onSchedule } from '../../signals/runtime.js'
import { payloadOf } from './accounts.js'
import {
	assetValueOps,
	COINBASE_SOURCE,
	coinbaseBalanceOps,
	coinbaseLink,
	coinbaseLinkOps,
	coinbaseOps,
	linkRestored,
	PRICE_BATCH,
	priceOps,
	pricesDue,
	secretsToClear,
	watchesDue,
	watchOps,
} from './crypto.js'
import { finance } from './store.svelte.js'
import { chunked, linkAfterFailure } from './sync.js'
import {
	FINANCE,
	type Account,
	type AssetPayload,
	type HoldingPayload,
	type ProviderLink,
	type ProviderLinkPayload,
	type SecurityPayload,
} from './types.js'

/** The repeating run the manifest declares. */
export const CRYPTO_SCHEDULE = 'finance.crypto'

class CryptoState {
	/** The crate's answer: whether this device holds a Coinbase key. */
	status = $state<CoinbaseStatus>()
	/** Under Tauri on the desktop: the key sheet, Connect Coinbase and the watch modes show. */
	bound = $state(false)
	/** The sheet showing. */
	sheet = $state<'none' | 'key'>('none')
	/** The sheet opens on the empty fields though a key is held: Replace key and Reconnect. */
	replacing = $state(false)
}

export const crypto = new CryptoState()

const tr = (key: string) => get(t)(key)
const report = (what: string, code: string) => void logError('finance', what, code).catch(() => null)
const snapshot = <T>(value: T): T => $state.snapshot(value) as T
const withId = <T>(row: Entity<T>): T & { id: string } => ({ ...row.payload, id: row.id })

/** Opens the key sheet; `replacing` opens it on the empty fields. */
export function openKeySheet(replacing: boolean): void {
	crypto.replacing = replacing
	crypto.sheet = 'key'
}

/**
 * Tries the key and stores it once Coinbase says it can only view. The first good key makes the link and its account;
 * a later one sets the live link right again. Then a run reads at once. Answers the refusal's code, or nothing.
 */
export async function saveCoinbaseKey(name: string, privateKey: string): Promise<CryptoErrorCode | undefined> {
	try {
		await coinbaseSetKey(name.trim(), privateKey)
	} catch (error) {
		return cryptoErrorCode(error)
	}
	crypto.status = (await coinbaseStatus().catch(() => undefined)) ?? { hasKey: true }
	await finance.load()
	const live = coinbaseLink(finance.links)
	if (live) {
		const next = linkRestored(snapshot(live))
		await finance.applySync([[{ op: 'updateEntity', id: next.id, payload: payloadOf(next) }]], { links: [next] })
	} else {
		const made = coinbaseLinkOps(settings.homeCurrency, newId)
		await finance.applySync([made.ops], { links: [made.link], accounts: [made.account] })
	}
	toast({ message: tr('domains.finance.crypto.connected') })
	crypto.sheet = 'none'
	crypto.replacing = false
	void runCrypto()
	return undefined
}

// ---- The run -------------------------------------------------------------------------------------------------------

let running: Promise<void> | undefined
let again = false

/** One run; a second ask while one runs joins it. */
export function runCrypto(): Promise<void> {
	return (running ??= run().finally(() => {
		running = undefined
		if (again) {
			again = false
			void runCrypto()
		}
	}))
}

/** A run as soon as it can: now, or once the one going ends, so an asset saved during it is valued. */
export function readSoon(): void {
	if (running) again = true
	else void runCrypto()
}

async function run() {
	if (!crypto.bound) return
	const status = await coinbaseStatus().catch(() => undefined)
	if (status) crypto.status = status
	await finance.load()
	await clearSecrets()
	await readCoinbase()
	await readPrices()
	await readWatches()
	await valuePass()
}

/** The extended keys already let go of in this launch, so an old tombstone is not asked about every hour. */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- the run's own note, never shown
const cleared = new Set<string>()

/** Lets go of the Coinbase key and the extended keys whose removal's undo has passed. */
async function clearSecrets() {
	const [links, assets] = await Promise.all([
		queryEntities<ProviderLinkPayload>({ type: FINANCE.link, includeDeleted: true }),
		queryEntities<AssetPayload>({ type: FINANCE.asset, includeDeleted: true }),
	]).catch(() => [[], []] as const)
	const clear = secretsToClear({ links, assets, now: Date.now() })
	if (clear.coinbase && crypto.status?.hasKey) {
		try {
			await coinbaseClearKey()
			crypto.status = { hasKey: false }
		} catch (error) {
			report('The Coinbase key could not be removed', cryptoErrorCode(error))
		}
	}
	for (const id of clear.xpubs) {
		if (cleared.has(id)) continue
		try {
			await watchXpubClear(id)
			cleared.add(id)
		} catch (error) {
			report('An extended key could not be removed', cryptoErrorCode(error))
		}
	}
}

/** The wallets, read and written in one queue job; a failure counts on the link (D-192). */
async function readCoinbase() {
	const live = coinbaseLink(finance.links)
	if (!live || !crypto.status?.hasKey) return
	const link = snapshot(live)
	try {
		const { wallets } = await coinbaseBalances()
		await finance.applySync(async () => {
			const [holdings, securities] = await Promise.all([
				queryEntities<HoldingPayload>({ type: FINANCE.holding, source: COINBASE_SOURCE }),
				queryEntities<SecurityPayload>({ type: FINANCE.security }),
			])
			const latest = finance.linkById(link.id)
			const out = coinbaseOps({
				link: latest ? snapshot(latest) : link,
				accounts: finance.data().accounts,
				holdings,
				securities,
				wallets,
				home: settings.homeCurrency,
				nowIso: nowIso(),
				day: todayIso(),
				newId,
			})
			return {
				chunks: out.chunks,
				links: [out.link],
				accounts: out.accounts,
				holdings: out.holdings,
				removedHoldings: out.removedHoldings,
				securities: out.securities,
			}
		})
	} catch (error) {
		const code = cryptoErrorCode(error)
		// the key went while the run was going: nothing to write
		if (code === 'no-key') return
		report('A Coinbase read failed', code)
		const latest = finance.linkById(link.id)
		if (!latest) return
		const next = linkAfterFailure(snapshot(latest), code)
		await finance.applySync([[{ op: 'updateEntity', id: next.id, payload: payloadOf(next) }]], { links: [next] })
	}
}

/** The day's prices for the coins held that have none yet, in requests of `PRICE_BATCH`. */
async function readPrices() {
	const home = settings.homeCurrency
	const today = todayIso()
	const data = finance.data()
	const securities = await queryEntities<SecurityPayload>({ type: FINANCE.security, source: COINBASE_SOURCE })
	const due = pricesDue({
		assets: data.assets,
		holdings: data.holdings ?? [],
		accounts: data.accounts,
		links: data.links,
		securities,
		home,
		today,
	})
	const found: { code: string; price: string }[] = []
	for (let at = 0; at < due.length; at += PRICE_BATCH) {
		try {
			const answer = await cryptoPrices(due.slice(at, at + PRICE_BATCH), home)
			found.push(...answer.prices)
		} catch (error) {
			report('Crypto prices could not be read', cryptoErrorCode(error))
		}
	}
	if (!found.length) return
	await finance
		.applySync(async () => {
			const rows = await queryEntities<SecurityPayload>({ type: FINANCE.security, source: COINBASE_SOURCE })
			const out = priceOps({ securities: rows, prices: found, home, day: today, newId })
			return { chunks: chunked(out.ops), securities: out.securities }
		})
		.catch((error: unknown) => report('Crypto prices could not be written', cryptoErrorCode(error)))
}

/** Each watched asset not read today, one at a time; a failed read is logged by its code and writes nothing. */
async function readWatches() {
	const today = todayIso()
	for (const asset of watchesDue(finance.data().assets, today)) {
		const watch = asset.watch!
		try {
			const { quantity } = await watchRead(asset.id, watch.chain, watch.address, watch.script)
			await finance.applySync(async () => {
				// the owner may have deleted it while it was read
				const latest = finance.assetById(asset.id)
				const out = latest ? watchOps(snapshot(latest), quantity, today) : undefined
				return out ? { chunks: [[out.op]], assets: [out.asset] } : { chunks: [] }
			})
		} catch (error) {
			report('A watched asset could not be read', cryptoErrorCode(error))
		}
	}
}

/** The crypto assets and the Coinbase account valued from the prices held; nothing that did not move is written. */
async function valuePass() {
	await finance
		.applySync(async () => {
			const home = settings.homeCurrency
			const data = finance.data()
			const securities = await queryEntities<SecurityPayload>({ type: FINANCE.security })
			const assets = assetValueOps({ assets: data.assets, securities, home })
			const ops = [...assets.ops]
			const accounts: Account[] = []
			const link: ProviderLink | undefined = coinbaseLink(data.links)
			const account = link && data.accounts.find((entry) => entry.linkId === link.id && !entry.closedOn)
			if (account) {
				const balance = coinbaseBalanceOps({
					account,
					holdings: data.holdings ?? [],
					securities: securities.map(withId),
					home,
					nowIso: nowIso(),
					day: todayIso(),
					newId,
				})
				if (balance) {
					ops.push(...balance.ops)
					accounts.push(balance.account)
				}
			}
			return { chunks: chunked(ops), assets: assets.assets, accounts }
		})
		.catch((error: unknown) => report('Crypto values could not be written', cryptoErrorCode(error)))
}

/**
 * Binds crypto where the crate is (the desktop under Tauri): the hourly schedule and one run now. The phone never
 * calls it, and in a plain browser the status is `undefined` and nothing binds. The answer unbinds.
 */
export function bindCrypto(): () => void {
	const stops: (() => void)[] = []
	let stopped = false
	void (async () => {
		const status = await coinbaseStatus()
		if (!status || stopped) return
		crypto.status = status
		crypto.bound = true
		stops.push(onSchedule(CRYPTO_SCHEDULE, () => runCrypto()))
		await finance.load()
		await runCrypto()
	})().catch((error: unknown) => report('Crypto did not bind', cryptoErrorCode(error)))
	return () => {
		stopped = true
		crypto.bound = false
		for (const stop of stops.splice(0)) stop()
	}
}
