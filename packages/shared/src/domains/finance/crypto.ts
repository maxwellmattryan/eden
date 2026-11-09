// Orchard's crypto (product/domains/finance.md §8, D-204), pure so it is tested here: the Coinbase link and its one
// account, the writes one read of the wallets makes, which coins want a price today and the writes the prices make,
// the value pass over the crypto assets, which watched assets want a read and what a read writes, the watched asset a
// form makes, the secrets a removal leaves to clear, how old a price may be, a private key's refusal and an asset
// row's lines. Every quantity and price is a decimal string and every value Money; nothing is multiplied as a float.
import type { CoinbaseWallet, WatchChain, WatchScript } from '../../api/crypto.js'
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { addDays } from '../../dates/index.js'
import { addMoney, formatMoney, money, type Money } from '../../money/index.js'
import { balanceOps, payloadOf } from './accounts.js'
import { aged, holdingValue, priced, quantityText, roundedMoney, timesDecimal } from './investments.js'
import { chunked, REVOKE_AFTER, same } from './sync.js'
import {
	FINANCE,
	WHOLE,
	type Account,
	type Asset,
	type AssetPayload,
	type Holding,
	type HoldingPayload,
	type ProviderLink,
	type ProviderLinkPayload,
	type Security,
	type SecurityPayload,
} from './types.js'
import { dayLine, type Translate } from './words.js'

/** The source of a Coinbase holding's row (its external id the wallet's id) and of a coin's security (the code). */
export const COINBASE_SOURCE = 'coinbase'
/** A coin's price or a watch's read older than this many days is out of date (D-204). */
export const PRICE_AGED_DAYS = 7
/** Coinbase's blue, the link's swatch. */
export const COINBASE_COLOUR = '#0052FF'
/** The link's institution and its account's name. */
export const COINBASE_NAME = 'Coinbase'

const CODE = /^[A-Z0-9]{2,10}$/
/** The most coins one price request may ask for; the crate refuses more. */
export const PRICE_BATCH = 50

const withId = <T>(row: Entity<T>): T & { id: string } => ({ ...row.payload, id: row.id })
const sameMoney = (a?: Money, b?: Money) => a?.minor === b?.minor && a?.currency === b?.currency
const isZero = (amount: string) => amount.replace(/[-.0]/g, '') === ''

// ---- Age ---------------------------------------------------------------------------------------------------------

/** Whether a price or a read of the day is out of date by today: more than `PRICE_AGED_DAYS` before it. */
export function priceAged(day: string, today: string): boolean {
	return Boolean(day) && addDays(day, PRICE_AGED_DAYS) < today
}

// ---- The link ----------------------------------------------------------------------------------------------------

/** A new Coinbase link and its one open account in the home currency, and the writes that make them. */
export function coinbaseLinkOps(
	home: string,
	newId: () => string
): { link: ProviderLink; account: Account; ops: BatchOp[] } {
	const link: ProviderLink = {
		id: newId(),
		provider: 'coinbase',
		institution: { name: COINBASE_NAME, colour: COINBASE_COLOUR },
		status: 'ok',
		failures: 0,
	}
	const account: Account = {
		id: newId(),
		name: COINBASE_NAME,
		kind: 'investment',
		currency: home,
		institution: COINBASE_NAME,
		linkId: link.id,
		share: WHOLE,
	}
	return {
		link,
		account,
		ops: [
			{ op: 'createEntity', input: { id: link.id, type: FINANCE.link, payload: payloadOf(link) } },
			{ op: 'createEntity', input: { id: account.id, type: FINANCE.account, payload: payloadOf(account) } },
		],
	}
}

/** A link a good key set right again: `ok`, no failures, no code. */
export function linkRestored(link: ProviderLink): ProviderLink {
	const { lastErrorCode: _code, ...rest } = link
	return { ...rest, status: 'ok', failures: 0 }
}

/** The live Coinbase link, if this device has one. */
export const coinbaseLink = (links: readonly ProviderLink[]) => links.find((link) => link.provider === 'coinbase')

// ---- One read of the wallets -------------------------------------------------------------------------------------

export interface CoinbaseInput {
	link: ProviderLink
	accounts: readonly Account[]
	/** The holding rows; the tombstoned ones may come too and are ignored. */
	holdings: readonly Entity<HoldingPayload>[]
	/** The live security rows. */
	securities: readonly Entity<SecurityPayload>[]
	wallets: readonly CoinbaseWallet[]
	home: string
	nowIso: string
	day: string
	newId: () => string
}

export interface CoinbaseWrites {
	chunks: BatchOp[][]
	link: ProviderLink
	accounts: Account[]
	holdings: Holding[]
	removedHoldings: string[]
	securities: Security[]
}

/**
 * The account's balance from its holdings: the sum of their values in the home currency, unpriced coins and fiat in
 * another currency left out, through `balanceOps` when it moved or is the first of the day. Nothing when it did not.
 */
export function coinbaseBalanceOps(input: {
	account: Account
	holdings: readonly Holding[]
	securities: readonly Security[]
	home: string
	nowIso: string
	day: string
	newId: () => string
}): { ops: BatchOp[]; account: Account } | undefined {
	const { account, home } = input
	const securities = new Map(input.securities.map((security) => [security.id, security]))
	let balance = money(0, home)
	for (const holding of input.holdings) {
		if (holding.accountId !== account.id) continue
		const found = holdingValue(holding, securities.get(holding.securityId))
		if (found && found.value.currency === home) balance = addMoney(balance, found.value)
	}
	if (sameMoney(balance, account.balance) && account.lastSnapshot?.day === input.day) return undefined
	const set = balanceOps(account, balance, input.nowIso, input.day, input.newId)
	return { ops: set.ops, account: set.account }
}

/**
 * One read of the Coinbase wallets as writes (D-204): a security per code (`cryptocurrency`, or `cash` for fiat), a
 * holding per wallet with a non-zero balance on the link's open account (a fiat one carries its value), the holding
 * of a wallet gone or at zero tombstoned, the owner's cost basis kept, the account's balance from the holdings, and
 * the link fresh. A replay writes only the link's freshness.
 */
export function coinbaseOps(input: CoinbaseInput): CoinbaseWrites {
	const { home, newId } = input
	const ops: BatchOp[] = []
	const changedSecurities: Security[] = []
	const changedHoldings: Holding[] = []
	const removedHoldings: string[] = []
	const changedAccounts: Account[] = []
	const account = input.accounts.find((entry) => entry.linkId === input.link.id && !entry.closedOn)

	const securityRows = new Map<string, Entity<SecurityPayload>>()
	for (const row of input.securities)
		if (!row.deletedAt && row.source === COINBASE_SOURCE && row.externalId) securityRows.set(row.externalId, row)
	const securities = new Map<string, Security>(input.securities.map((row) => [row.id, withId(row)]))
	const live = new Map<string, Entity<HoldingPayload>>()
	for (const row of input.holdings)
		if (!row.deletedAt && row.source === COINBASE_SOURCE && row.externalId && row.payload.accountId === account?.id)
			live.set(row.externalId, row)
	const holdings: Holding[] = []
	const seen = new Set<string>()

	if (account)
		for (const wallet of input.wallets) {
			if (isZero(wallet.amount)) continue
			const code = wallet.code.toUpperCase()
			const fiat = wallet.kind === 'fiat'
			const value = fiat ? roundedMoney(wallet.amount, code) : undefined
			// a fiat wallet in a currency Eden cannot count is left out
			if (fiat && !value) continue

			const held = securityRows.get(code)
			const was = held?.payload
			const security: SecurityPayload = {
				...(was ?? {}),
				name: wallet.name || was?.name || code,
				ticker: code,
				type: fiat ? 'cash' : 'cryptocurrency',
				prices: was?.prices ?? [],
			}
			if (fiat) security.currency = code
			let securityId = held?.id
			if (!held || !same(security, was)) {
				securityId ??= newId()
				ops.push(
					held
						? { op: 'updateEntity', id: securityId, payload: security }
						: {
								op: 'createEntity',
								input: {
									id: securityId,
									type: FINANCE.security,
									source: COINBASE_SOURCE,
									externalId: code,
									payload: security,
								},
							}
				)
				const next = { ...security, id: securityId }
				securityRows.set(code, { ...(held ?? blank(securityId, FINANCE.security, code)), payload: security })
				securities.set(securityId, next)
				changedSecurities.push(next)
			}

			const row = live.get(wallet.id)
			const holding: Holding = {
				...(row?.payload ?? {}),
				id: row?.id ?? newId(),
				accountId: account.id,
				securityId: securityId!,
				quantity: wallet.amount,
				currency: fiat ? code : home,
			}
			if (value) holding.value = value
			else delete holding.value
			seen.add(holding.id)
			holdings.push(holding)
			const payload = payloadOf(holding)
			if (row && same(payload, row.payload)) continue
			ops.push(
				row
					? { op: 'updateEntity', id: holding.id, payload }
					: {
							op: 'createEntity',
							input: {
								id: holding.id,
								type: FINANCE.holding,
								source: COINBASE_SOURCE,
								externalId: wallet.id,
								payload,
							},
						}
			)
			changedHoldings.push(holding)
		}
	for (const row of live.values()) {
		if (seen.has(row.id)) continue
		ops.push({ op: 'delete', uri: toUri(FINANCE.holding, row.id) })
		removedHoldings.push(row.id)
	}

	if (account) {
		const balance = coinbaseBalanceOps({
			account,
			holdings,
			securities: [...securities.values()],
			home,
			nowIso: input.nowIso,
			day: input.day,
			newId,
		})
		if (balance) {
			ops.push(...balance.ops)
			changedAccounts.push(balance.account)
		}
	}

	const link: ProviderLink = { ...linkRestored(input.link), lastSyncedAt: input.nowIso }
	const write: BatchOp | undefined = same(payloadOf(link), payloadOf(input.link))
		? undefined
		: { op: 'updateEntity', id: link.id, payload: payloadOf(link) }
	return {
		chunks: chunked(ops, write),
		link,
		accounts: changedAccounts,
		holdings: changedHoldings,
		removedHoldings,
		securities: changedSecurities,
	}
}

/** A row made in this pass, before the engine has it. */
function blank<T>(id: string, type: string, externalId: string): Entity<T> {
	return {
		id,
		uri: toUri(type, id),
		type,
		payload: {} as T,
		createdAt: '',
		updatedAt: '',
		deletedAt: null,
		mirror: false,
		source: COINBASE_SOURCE,
		externalId,
		snapshot: null,
		links: [],
	}
}

// ---- Prices ------------------------------------------------------------------------------------------------------

/** The coin's own security row: Coinbase's, by code. */
const priceRows = (securities: readonly Entity<SecurityPayload>[]) => {
	const rows = new Map<string, Entity<SecurityPayload>>()
	for (const row of securities)
		if (!row.deletedAt && row.source === COINBASE_SOURCE && row.externalId) rows.set(row.externalId, row)
	return rows
}

/** A coin's last price in the home currency, from its security row. */
function lastPrice(row: Entity<SecurityPayload> | undefined, home: string) {
	return row && row.payload.currency === home ? row.payload.prices.at(-1) : undefined
}

/**
 * The coins that want a price today (D-204), in the order met: the unit of every live `crypto` asset with a quantity,
 * then the code of every `cryptocurrency` holding on an open Coinbase account. One whose security already has today's
 * price in the home currency is left out, and so is anything that is not a coin's code.
 */
export function pricesDue(input: {
	assets: readonly Asset[]
	holdings: readonly Holding[]
	accounts: readonly Account[]
	links: readonly ProviderLink[]
	securities: readonly Entity<SecurityPayload>[]
	home: string
	today: string
}): string[] {
	const rows = priceRows(input.securities)
	const byId = new Map(input.securities.map((row) => [row.id, row]))
	const coinbase = new Set(input.links.filter((link) => link.provider === 'coinbase').map((link) => link.id))
	const accounts = new Set(
		input.accounts
			.filter((account) => !account.closedOn && account.linkId && coinbase.has(account.linkId))
			.map((account) => account.id)
	)
	const codes: string[] = []
	for (const asset of input.assets)
		if (asset.kind === 'crypto' && asset.quantity && asset.unit) codes.push(asset.unit.trim().toUpperCase())
	for (const holding of input.holdings) {
		if (!accounts.has(holding.accountId)) continue
		const row = byId.get(holding.securityId)
		if (row?.source === COINBASE_SOURCE && row.payload.type === 'cryptocurrency' && row.externalId)
			codes.push(row.externalId)
	}
	return [...new Set(codes)].filter(
		(code) => CODE.test(code) && lastPrice(rows.get(code), input.home)?.day !== input.today
	)
}

/**
 * The day's prices as writes on each coin's security (source `coinbase`, external id the code, `cryptocurrency`): one
 * entry a day, at most `PRICE_DAYS`, and the old prices dropped when they were in another currency than the home one.
 */
export function priceOps(input: {
	securities: readonly Entity<SecurityPayload>[]
	prices: readonly { code: string; price: string }[]
	home: string
	day: string
	newId: () => string
}): { ops: BatchOp[]; securities: Security[] } {
	const rows = priceRows(input.securities)
	const ops: BatchOp[] = []
	const securities: Security[] = []
	for (const { code, price } of input.prices) {
		const held = rows.get(code)
		const was = held?.payload
		const kept = was && was.currency === input.home ? was.prices : []
		const payload: SecurityPayload = {
			...(was ?? {}),
			name: was?.name || code,
			ticker: code,
			type: 'cryptocurrency',
			currency: input.home,
			prices: priced(kept, input.day, price),
		}
		if (held && same(payload, was)) continue
		const id = held?.id ?? input.newId()
		ops.push(
			held
				? { op: 'updateEntity', id, payload }
				: {
						op: 'createEntity',
						input: { id, type: FINANCE.security, source: COINBASE_SOURCE, externalId: code, payload },
					}
		)
		rows.set(code, { ...(held ?? blank(id, FINANCE.security, code)), payload })
		securities.push({ ...payload, id })
	}
	return { ops, securities }
}

/**
 * The value pass (D-204): each live `crypto` asset with a quantity, a unit and a price in the home currency is worth
 * quantity × that price, as of the price's day, `valuedBy: 'price'`. An unpriced coin keeps the owner's value, a new
 * watch keeps 0 with no day, and an asset whose value did not move is not written.
 */
export function assetValueOps(input: {
	assets: readonly Asset[]
	securities: readonly Entity<SecurityPayload>[]
	home: string
}): { ops: BatchOp[]; assets: Asset[] } {
	const rows = priceRows(input.securities)
	const ops: BatchOp[] = []
	const assets: Asset[] = []
	for (const asset of input.assets) {
		if (asset.kind !== 'crypto' || !asset.quantity || !asset.unit) continue
		const last = lastPrice(rows.get(asset.unit.trim().toUpperCase()), input.home)
		if (!last) continue
		const value = timesDecimal(asset.quantity, last.price, input.home)
		if (!value) continue
		const next: Asset = { ...asset, value, valuedOn: last.day, valuedBy: 'price' }
		if (same(payloadOf(next), payloadOf(asset))) continue
		ops.push({ op: 'updateEntity', id: next.id, payload: payloadOf(next) })
		assets.push(next)
	}
	return { ops, assets }
}

// ---- Watches -----------------------------------------------------------------------------------------------------

/** The live watched assets not read yet today. */
export const watchesDue = (assets: readonly Asset[], today: string): Asset[] =>
	assets.filter((asset) => asset.watch && asset.readOn !== today)

const unitOf = (chain: WatchChain) => (chain === 'bitcoin' ? 'BTC' : 'ETH')

/** A good read's write: the quantity and the day, nothing else; nothing when neither moved. */
export function watchOps(asset: Asset, quantity: string, day: string): { op: BatchOp; asset: Asset } | undefined {
	const next: Asset = { ...asset, quantity, readOn: day }
	if (same(payloadOf(next), payloadOf(asset))) return undefined
	return { op: { op: 'updateEntity', id: next.id, payload: payloadOf(next) }, asset: next }
}

export interface WatchDraft {
	id?: string
	name: string
	share: number
	home: string
	chain: WatchChain
	/** The address, normalised by the crate; absent, the asset watches an extended key. */
	address?: string
	/** The extended key's script, as the crate answered it. */
	script?: WatchScript
	/** The extended key as typed: it goes to the secure store, never into the row. */
	key?: string
}

/**
 * The watched asset a form makes: kind `crypto`, the chain's unit, no value yet (0 in the home currency, no day) and
 * what it watches. An extended key is named only by `xpub: true` and its script; the key itself is never in it.
 */
export function watchedAsset(draft: WatchDraft): AssetPayload & { id?: string } {
	const watch: AssetPayload['watch'] = draft.address
		? { chain: draft.chain, address: draft.address }
		: { chain: 'bitcoin', xpub: true, script: draft.script ?? 'p2wpkh' }
	return {
		...(draft.id ? { id: draft.id } : {}),
		name: draft.name,
		kind: 'crypto',
		value: money(0, draft.home),
		valuedOn: '',
		unit: unitOf(watch.chain),
		share: draft.share,
		watch,
	}
}

/**
 * What the secure store may let go of once a removal's Undo has passed (`REVOKE_AFTER`): the Coinbase key when there
 * is no live Coinbase link and one was tombstoned long enough ago, and the extended key of every watched asset
 * tombstoned long enough ago. Anything younger waits for a later run.
 */
export function secretsToClear(input: {
	links: readonly Pick<Entity<Pick<ProviderLinkPayload, 'provider'>>, 'deletedAt' | 'payload'>[]
	assets: readonly Pick<Entity<Pick<AssetPayload, 'watch'>>, 'id' | 'deletedAt' | 'payload'>[]
	now: number
}): { coinbase: boolean; xpubs: string[] } {
	const old = (deletedAt: string | null | undefined) =>
		Boolean(deletedAt) && input.now - Date.parse(deletedAt!) >= REVOKE_AFTER
	const links = input.links.filter((row) => row.payload.provider === 'coinbase')
	return {
		coinbase: !links.some((row) => !row.deletedAt) && links.some((row) => old(row.deletedAt)),
		xpubs: input.assets.filter((row) => row.payload.watch?.xpub && old(row.deletedAt)).map((row) => row.id),
	}
}

// ---- The form's checks -------------------------------------------------------------------------------------------

const PRIVATE = ['xprv', 'yprv', 'zprv', 'tprv', 'uprv', 'vprv']

/** Whether the text is an extended private key: it is refused in the sheet and never sent anywhere. */
export const isPrivateKey = (text: string) => PRIVATE.includes(text.trim().slice(0, 4).toLowerCase())

/** An address as a row shows it: its first 6 and last 4 characters ("bc1qar…5mdq"). */
export const shortAddress = (address: string) =>
	address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address

// ---- An asset's row ----------------------------------------------------------------------------------------------

export interface AssetLine {
	secondary: string
	meta: string
	/** Out of date: the meta rises to the warning ink. */
	warn: boolean
	/** The owner says what it is worth, so its menu may offer Update value. */
	ownerValued: boolean
}

/**
 * An asset row's lines on Accounts (D-197, D-204): a priced coin's quantity and the price's day, a watch's address or
 * "Extended key", "Not read yet" before its first read, "out of date" for a price or read past `PRICE_AGED_DAYS` and
 * an owner's value past `AGED_DAYS`, and "Not in totals" when its value is in another currency than `home`. Any
 * other asset reads as before.
 */
export function assetLine(asset: Asset, today: string, tr: Translate, lang: string, home: string): AssetLine {
	const amount = formatMoney(asset.value, lang)
	const day = (iso: string) => dayLine(iso, lang)
	const away = asset.value.currency === home ? [] : [tr('domains.finance.row.notInTotals')]
	const approx = tr('domains.finance.row.approx', { values: { amount } })
	const quantity = asset.quantity ? `${quantityText(asset.quantity)} ${asset.unit ?? ''}`.trim() : undefined
	const outOfDate = tr('domains.finance.investments.outOfDate')
	const valued = asset.valuedOn ? tr('domains.finance.row.valued', { values: { day: day(asset.valuedOn) } }) : ''

	if (asset.watch) {
		const what = asset.watch.address ? shortAddress(asset.watch.address) : tr('domains.finance.row.extendedKey')
		if (!asset.readOn) {
			const notRead = tr('domains.finance.row.notReadYet')
			return { secondary: [what, notRead, ...away].join(' · '), meta: notRead, warn: false, ownerValued: false }
		}
		const staleRead = priceAged(asset.readOn, today)
		const priced = asset.valuedBy === 'price' && asset.valuedOn
		const stalePrice = Boolean(priced) && priceAged(asset.valuedOn, today)
		const parts = [
			...(quantity ? [quantity] : []),
			what,
			...(priced ? [tr('domains.finance.row.priced', { values: { day: day(asset.valuedOn) } })] : []),
			...(staleRead ? [tr('domains.finance.row.read', { values: { day: day(asset.readOn) } })] : []),
			...(staleRead || stalePrice ? [outOfDate] : []),
			...away,
		]
		return {
			secondary: parts.join(' · '),
			meta: priced ? approx : tr('domains.finance.row.notPriced'),
			warn: staleRead || stalePrice,
			ownerValued: false,
		}
	}

	if (asset.kind === 'crypto' && quantity) {
		if (asset.valuedBy === 'price') {
			const old = priceAged(asset.valuedOn, today)
			const parts = [
				quantity,
				tr('domains.finance.row.priced', { values: { day: day(asset.valuedOn) } }),
				...(old ? [outOfDate] : []),
				...away,
			]
			return { secondary: parts.join(' · '), meta: approx, warn: old, ownerValued: false }
		}
		const old = aged(asset.valuedOn, today)
		const parts = [quantity, ...(valued ? [valued] : []), ...(old ? [outOfDate] : []), ...away]
		return { secondary: parts.join(' · '), meta: approx, warn: old, ownerValued: true }
	}

	// any other asset, as before: a counted one shows its quantity, an uncounted one the day it was valued
	const old = aged(asset.valuedOn, today)
	const when = old ? [valued, outOfDate] : quantity ? [] : [valued]
	return {
		secondary: [...(quantity ? [quantity] : []), ...when, ...away].join(' · '),
		meta: quantity ? approx : amount,
		warn: old,
		ownerValued: true,
	}
}
