import { describe, expect, it } from 'vitest'
import type { CoinbaseWallet } from '../../api/crypto.js'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import type { BatchOp, Entity } from '../../data/index.js'
import { createIdGenerator } from '../../data/ulid.js'
import { addDays } from '../../dates/index.js'
import en from '../../i18n/locales/en.json' with { type: 'json' }
import { money } from '../../money/index.js'
import { payloadOf } from './accounts.js'
import {
	assetLine,
	assetValueOps,
	COINBASE_COLOUR,
	COINBASE_SOURCE,
	coinbaseLinkOps,
	coinbaseOps,
	isPrivateKey,
	priceAged,
	priceOps,
	pricesDue,
	secretsToClear,
	shortAddress,
	watchedAsset,
	watchesDue,
	watchOps,
} from './crypto.js'
import { PRICE_DAYS } from './investments.js'
import {
	FINANCE,
	WHOLE,
	type Account,
	type Asset,
	type Holding,
	type HoldingPayload,
	type ProviderLink,
	type SecurityPayload,
} from './types.js'
import { dayLine } from './words.js'

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

const DAY = '2026-11-08'
const NOW = '2026-11-08T15:00:00.000Z'
const usd = (minor: number) => money(minor, 'USD')
const flat = (chunks: BatchOp[][]) => chunks.flat()

const wallet = (fields: Partial<CoinbaseWallet> & { id: string; code: string; amount: string }): CoinbaseWallet => ({
	name: fields.code,
	kind: 'crypto',
	...fields,
})

function setup() {
	const engine = createEngine(memory())
	const newId = createIdGenerator()
	const made = coinbaseLinkOps('USD', newId)
	engine.applyBatch(made.ops)
	let link: ProviderLink = { ...made.link, status: 'error', failures: 3, lastErrorCode: 'network' }
	engine.applyBatch([{ op: 'updateEntity', id: link.id, payload: payloadOf(link) }])
	let accounts: Account[] = [made.account]
	const rows = () => ({
		holdings: engine.queryEntities({ type: FINANCE.holding, includeDeleted: true }) as Entity<HoldingPayload>[],
		securities: engine.queryEntities({ type: FINANCE.security }) as Entity<SecurityPayload>[],
	})
	const live = () => rows().holdings.filter((row) => !row.deletedAt)
	const read = (wallets: CoinbaseWallet[], nowIso = NOW) => {
		const held = rows()
		const out = coinbaseOps({
			link,
			accounts,
			holdings: held.holdings,
			securities: held.securities,
			wallets,
			home: 'USD',
			nowIso,
			day: DAY,
			newId,
		})
		for (const chunk of out.chunks) engine.applyBatch(chunk)
		link = out.link
		accounts = accounts.map((account) => out.accounts.find((entry) => entry.id === account.id) ?? account)
		return out
	}
	const price = (code: string, value: string, day = DAY, home = 'USD') => {
		const out = priceOps({ securities: rows().securities, prices: [{ code, price: value }], home, day, newId })
		engine.applyBatch(out.ops)
		return out
	}
	return { engine, newId, link: () => link, account: () => accounts[0]!, rows, live, read, price }
}

const BTC = wallet({ id: 'w-btc', code: 'BTC', name: 'Bitcoin', amount: '0.5' })
const ETH = wallet({ id: 'w-eth', code: 'ETH', name: 'Ethereum', amount: '0' })
const CASH = wallet({ id: 'w-usd', code: 'USD', name: 'US Dollar', kind: 'fiat', amount: '12.34' })

describe('coinbaseOps', () => {
	it('makes one link and one open investment account in the home currency', () => {
		const made = coinbaseLinkOps('USD', createIdGenerator())
		expect(made.link).toMatchObject({
			provider: 'coinbase',
			institution: { name: 'Coinbase', colour: COINBASE_COLOUR },
			status: 'ok',
		})
		expect(made.account).toMatchObject({
			name: 'Coinbase',
			kind: 'investment',
			currency: 'USD',
			linkId: made.link.id,
			share: WHOLE,
		})
		expect(made.account.closedOn).toBeUndefined()
	})

	it('writes a holding per non-zero wallet and a security per code on the first read, a fiat one with its value', () => {
		const { read, live, rows, account } = setup()
		const out = read([BTC, ETH, CASH])
		const holdings = live()
		expect(holdings.map((row) => [row.source, row.externalId, row.payload.quantity])).toEqual([
			[COINBASE_SOURCE, 'w-btc', '0.5'],
			[COINBASE_SOURCE, 'w-usd', '12.34'],
		])
		expect(holdings.every((row) => row.payload.accountId === account().id)).toBe(true)
		const btc = holdings.find((row) => row.externalId === 'w-btc')!
		expect(btc.payload.currency).toBe('USD')
		expect(btc.payload.value).toBeUndefined()
		expect(holdings.find((row) => row.externalId === 'w-usd')!.payload.value).toEqual(usd(1234))
		expect(rows().securities.map((row) => [row.source, row.externalId, row.payload.type, row.payload.ticker])).toEqual([
			[COINBASE_SOURCE, 'BTC', 'cryptocurrency', 'BTC'],
			[COINBASE_SOURCE, 'USD', 'cash', 'USD'],
		])
		expect(out.holdings).toHaveLength(2)
		expect(out.securities).toHaveLength(2)
	})

	it("leaves the link fresh: ok, no failures, the read's instant and no code", () => {
		const { read, link } = setup()
		read([BTC])
		expect(link()).toMatchObject({ status: 'ok', failures: 0, lastSyncedAt: NOW })
		expect(link().lastErrorCode).toBeUndefined()
	})

	it('writes nothing on a replay, and tombstones the holding of a wallet at zero or gone', () => {
		const { read, live } = setup()
		read([BTC, CASH])
		expect(flat(read([BTC, CASH]).chunks)).toEqual([])
		const out = read([{ ...BTC, amount: '0.00000000' }])
		expect(out.removedHoldings).toHaveLength(2)
		expect(live()).toEqual([])
	})

	it("keeps the owner's cost basis through a later read", () => {
		const { read, live, engine } = setup()
		read([BTC])
		const row = live()[0]!
		const basis: HoldingPayload = { ...row.payload, costBasis: usd(2000000), costBasisBy: 'owner' }
		engine.applyBatch([{ op: 'updateEntity', id: row.id, payload: basis }])
		read([{ ...BTC, amount: '0.6' }])
		expect(live()[0]!.payload).toMatchObject({ quantity: '0.6', costBasis: usd(2000000), costBasisBy: 'owner' })
	})

	it("sets the account's balance to the home-currency sum of the priced holdings, through balanceOps", () => {
		const { read, account, price, engine } = setup()
		const first = read([BTC, CASH])
		// BTC has no price yet: only the cash counts
		expect(first.accounts[0]!.balance).toEqual(usd(1234))
		expect(flat(first.chunks).some((op) => op.op === 'createEntity' && op.input.type === FINANCE.snapshot)).toBe(true)
		price('BTC', '60000.005')
		const second = read([BTC, CASH, wallet({ id: 'w-eur', code: 'EUR', kind: 'fiat', amount: '5' })])
		// 0.5 × 60000.005 = 30000.0025 → 3000000 cents, plus 1234; the euros are left out
		expect(account().balance).toEqual(usd(3000000 + 1234))
		expect(second.accounts[0]!.lastSnapshot?.id).toBe(first.accounts[0]!.lastSnapshot?.id)
		const snapshots = engine.queryEntities({ type: FINANCE.snapshot })
		expect(snapshots).toHaveLength(1)
		expect(snapshots[0]!.payload).toMatchObject({ day: DAY, balance: usd(3001234) })
	})
})

describe('prices', () => {
	const account = (fields: Partial<Account>): Account => ({
		id: 'a-cb',
		name: 'Coinbase',
		kind: 'investment',
		currency: 'USD',
		linkId: 'l-cb',
		share: WHOLE,
		...fields,
	})
	const links: ProviderLink[] = [
		{ id: 'l-cb', provider: 'coinbase', institution: { name: 'Coinbase' }, status: 'ok' },
		{ id: 'l-m1', provider: 'plaid', institution: { name: 'M1' }, status: 'ok' },
	]
	const asset = (fields: Partial<Asset>): Asset => ({
		id: 'x',
		name: 'Cold',
		kind: 'crypto',
		value: usd(0),
		valuedOn: '',
		share: WHOLE,
		...fields,
	})
	const hold = (id: string, accountId: string, securityId: string): Holding => ({
		id,
		accountId,
		securityId,
		quantity: '1',
		currency: 'USD',
	})

	it('lists the units of crypto assets with a quantity and the coins on open Coinbase accounts, once each', () => {
		const securities = [
			sec('s-sol', 'SOL', 'cryptocurrency'),
			sec('s-usd', 'USD', 'cash'),
			sec('s-ada', 'ADA', 'cryptocurrency'),
			{ ...sec('s-m1', 'BTC', 'cryptocurrency'), source: 'plaid', externalId: 'm1-btc' },
		]
		const due = pricesDue({
			assets: [
				asset({ id: 'a1', quantity: '0.04', unit: 'btc' }),
				asset({ id: 'a2', quantity: '1', unit: 'BTC' }),
				asset({ id: 'a3', unit: 'ETH' }),
				asset({ id: 'a4', kind: 'valuables', quantity: '3', unit: 'OZ' }),
				asset({ id: 'a5', quantity: '2', unit: 'not a code' }),
			],
			holdings: [
				hold('h1', 'a-cb', 's-sol'),
				hold('h2', 'a-cb', 's-usd'),
				hold('h3', 'a-closed', 's-ada'),
				hold('h4', 'a-m1', 's-m1'),
			],
			accounts: [
				account({}),
				account({ id: 'a-closed', closedOn: '2026-10-01' }),
				account({ id: 'a-m1', linkId: 'l-m1' }),
			],
			links,
			securities,
			home: 'USD',
			today: DAY,
		})
		expect(due).toEqual(['BTC', 'SOL'])
	})

	it('leaves out a coin whose security already has the day’s price in the home currency', () => {
		const { rows, price } = setup()
		price('BTC', '60000')
		const input = {
			assets: [asset({ quantity: '1', unit: 'BTC' })],
			holdings: [],
			accounts: [],
			links,
			securities: rows().securities,
			today: DAY,
		}
		expect(pricesDue({ ...input, home: 'USD' })).toEqual([])
		expect(pricesDue({ ...input, home: 'EUR' })).toEqual(['BTC'])
		expect(pricesDue({ ...input, home: 'USD', today: '2026-11-09' })).toEqual(['BTC'])
	})

	it(`replaces the day's entry, keeps at most ${PRICE_DAYS} and resets the prices when the currency is not the home one`, () => {
		const { rows, price } = setup()
		const made = price('BTC', '60000')
		expect(rows().securities[0]).toMatchObject({
			source: COINBASE_SOURCE,
			externalId: 'BTC',
			payload: { type: 'cryptocurrency', currency: 'USD', prices: [{ day: DAY, price: '60000' }] },
		})
		expect(made.securities).toHaveLength(1)
		price('BTC', '61000')
		expect(rows().securities[0]!.payload.prices).toEqual([{ day: DAY, price: '61000' }])
		// the same price again writes nothing
		expect(price('BTC', '61000').ops).toEqual([])

		const many = Array.from({ length: PRICE_DAYS }, (_, at) => ({ day: addDays('2020-01-01', at), price: '1' }))
		const row = rows().securities[0]!
		const full = priceOps({
			securities: [{ ...row, payload: { ...row.payload, prices: many } }],
			prices: [{ code: 'BTC', price: '2' }],
			home: 'USD',
			day: DAY,
			newId: createIdGenerator(),
		})
		const payload = (full.ops[0] as Extract<BatchOp, { op: 'updateEntity' }>).payload as SecurityPayload
		expect(payload.prices).toHaveLength(PRICE_DAYS)
		expect(payload.prices.at(-1)).toEqual({ day: DAY, price: '2' })

		price('BTC', '56000', '2026-11-09', 'EUR')
		expect(rows().securities[0]!.payload).toMatchObject({
			currency: 'EUR',
			prices: [{ day: '2026-11-09', price: '56000' }],
		})
	})
})

/** A security row as the engine answers it. */
const sec = (id: string, code: string, type: SecurityPayload['type']): Entity<SecurityPayload> => ({
	id,
	uri: `eden://finance/security/${id}`,
	type: FINANCE.security,
	payload: { name: code, ticker: code, type, prices: [] },
	createdAt: '',
	updatedAt: '',
	deletedAt: null,
	mirror: false,
	source: COINBASE_SOURCE,
	externalId: code,
	snapshot: null,
	links: [],
})

describe('assetValueOps', () => {
	const asset = (fields: Partial<Asset>): Asset => ({
		id: 'x',
		name: 'Cold',
		kind: 'crypto',
		value: usd(10000),
		valuedOn: '2026-10-01',
		share: WHOLE,
		...fields,
	})

	it('prices a crypto asset with a quantity, a unit and a home-currency price, and nothing else', () => {
		const { rows, price } = setup()
		price('BTC', '63000.5', '2026-11-07')
		const out = assetValueOps({
			assets: [
				asset({ id: 'priced', quantity: '0.0412', unit: 'btc' }),
				asset({ id: 'unpriced', quantity: '12', unit: 'FOO' }),
				asset({ id: 'uncounted' }),
				asset({ id: 'house', kind: 'property', quantity: '1', unit: 'BTC' }),
				asset({ id: 'watch', unit: 'BTC', value: usd(0), valuedOn: '', watch: { chain: 'bitcoin', address: 'bc1q' } }),
			],
			securities: rows().securities,
			home: 'USD',
		})
		// 0.0412 × 63000.5 = 2595.6206 → $2,595.62
		expect(out.assets).toEqual([
			asset({
				id: 'priced',
				quantity: '0.0412',
				unit: 'btc',
				value: usd(259562),
				valuedOn: '2026-11-07',
				valuedBy: 'price',
			}),
		])
		expect(out.ops).toHaveLength(1)
		// unchanged: nothing written
		expect(assetValueOps({ assets: out.assets, securities: rows().securities, home: 'USD' }).ops).toEqual([])
		// a price in another currency than the home one is no price
		expect(
			assetValueOps({ assets: [asset({ quantity: '1', unit: 'BTC' })], securities: rows().securities, home: 'EUR' }).ops
		).toEqual([])
	})
})

describe('watches', () => {
	const watched = (fields: Partial<Asset>): Asset => ({
		id: 'w',
		name: 'Ledger',
		kind: 'crypto',
		value: usd(0),
		valuedOn: '',
		unit: 'BTC',
		share: WHOLE,
		watch: { chain: 'bitcoin', address: 'bc1qexample' },
		...fields,
	})

	it('answers the live watched assets not read today', () => {
		const due = watchesDue(
			[
				watched({ id: 'never' }),
				watched({ id: 'yesterday', readOn: '2026-11-07' }),
				watched({ id: 'today', readOn: DAY }),
				{ ...watched({ id: 'owner' }), watch: undefined },
			],
			DAY
		)
		expect(due.map((asset) => asset.id)).toEqual(['never', 'yesterday'])
	})

	it('sets the quantity and the day from a good read and changes nothing else', () => {
		const asset = watched({ readOn: '2026-11-07', quantity: '0.4' })
		const out = watchOps(asset, '0.50000000', DAY)!
		expect(out.asset).toEqual({ ...asset, quantity: '0.50000000', readOn: DAY })
		expect(out.op).toEqual({ op: 'updateEntity', id: 'w', payload: payloadOf(out.asset) })
		expect(watchOps(out.asset, '0.50000000', DAY)).toBeUndefined()
	})

	it('builds a watched asset with no value yet, and never with the extended key in it', () => {
		const key = ['zpub', 'X'.repeat(107)].join('')
		const address = watchedAsset({
			name: 'Ether',
			share: WHOLE,
			home: 'USD',
			chain: 'ethereum',
			address: '0xabc',
		})
		expect(address).toEqual({
			name: 'Ether',
			kind: 'crypto',
			value: usd(0),
			valuedOn: '',
			unit: 'ETH',
			share: WHOLE,
			watch: { chain: 'ethereum', address: '0xabc' },
		})
		const xpub = watchedAsset({
			id: 'a1',
			name: 'Ledger',
			share: WHOLE,
			home: 'USD',
			chain: 'bitcoin',
			key,
			script: 'p2sh-p2wpkh',
		})
		expect(xpub).toMatchObject({
			id: 'a1',
			unit: 'BTC',
			watch: { chain: 'bitcoin', xpub: true, script: 'p2sh-p2wpkh' },
		})
		expect(JSON.stringify(xpub)).not.toContain(key)
		expect(watchedAsset({ name: 'L', share: WHOLE, home: 'USD', chain: 'bitcoin', key }).watch?.script).toBe('p2wpkh')
	})
})

describe('secretsToClear', () => {
	const now = Date.parse(NOW)
	const ago = (ms: number) => new Date(now - ms).toISOString()
	const link = (deletedAt: string | null, provider: 'plaid' | 'coinbase' = 'coinbase') => ({
		deletedAt,
		payload: { provider },
	})
	const asset = (id: string, deletedAt: string | null, xpub = true) => ({
		id,
		deletedAt,
		payload: { watch: xpub ? { chain: 'bitcoin' as const, xpub: true as const } : { chain: 'bitcoin' as const } },
	})

	it('answers the Coinbase key once no Coinbase link is live and one was tombstoned 2 minutes ago or more', () => {
		const clear = (links: ReturnType<typeof link>[]) => secretsToClear({ links, assets: [], now }).coinbase
		expect(clear([link(ago(120_000))])).toBe(true)
		expect(clear([link(ago(119_000))])).toBe(false)
		expect(clear([link(ago(600_000)), link(null)])).toBe(false)
		expect(clear([link(ago(600_000), 'plaid')])).toBe(false)
		expect(clear([])).toBe(false)
	})

	it('answers the extended-key assets tombstoned 2 minutes ago or more, and nothing younger', () => {
		const out = secretsToClear({
			links: [],
			assets: [
				asset('old', ago(120_000)),
				asset('young', ago(60_000)),
				asset('live', null),
				asset('address', ago(600_000), false),
			],
			now,
		})
		expect(out.xpubs).toEqual(['old'])
	})
})

describe('ageing and the form', () => {
	it('ages a price or a read only past 7 days', () => {
		expect(priceAged('2026-11-01', DAY)).toBe(false)
		expect(priceAged('2026-10-31', DAY)).toBe(true)
		expect(priceAged('', DAY)).toBe(false)
	})

	it('knows an extended private key by its prefix, and a public one is not', () => {
		for (const prefix of ['xprv', 'yprv', 'zprv', 'tprv', 'uprv', 'vprv'])
			expect(isPrivateKey(` ${prefix}9s21ZrQH143K3`), prefix).toBe(true)
		for (const text of ['xpub6CUGRUo', 'zpub6rFR7y4', 'ypub6Ww3ibx', '', 'prv'])
			expect(isPrivateKey(text), text).toBe(false)
	})

	it('shortens an address to its first 6 and last 4 characters', () => {
		expect(shortAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe('bc1qar…5mdq')
	})
})

describe('assetLine', () => {
	const strings = en as unknown as Record<string, unknown>
	const tr = (key: string, options?: { values?: Record<string, string | number> }) => {
		const found = key.split('.').reduce<unknown>((at, part) => (at as Record<string, unknown>)?.[part], strings)
		const text = typeof found === 'string' ? found : key
		return text.replace(/\{(\w+)\}/g, (_, name: string) => String(options?.values?.[name] ?? `{${name}}`))
	}
	const day = (iso: string) => dayLine(iso, 'en')
	const ADDRESS = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
	const asset = (fields: Partial<Asset>): Asset => ({
		id: 'x',
		name: 'Cold',
		kind: 'crypto',
		value: usd(259560),
		valuedOn: '2026-11-07',
		share: WHOLE,
		...fields,
	})
	const line = (fields: Partial<Asset>, home = 'USD') => assetLine(asset(fields), DAY, tr, 'en', home)

	it('reads a priced coin by quantity', () => {
		expect(line({ quantity: '0.0412', unit: 'BTC', valuedBy: 'price' })).toEqual({
			secondary: `0.0412 BTC · Priced ${day('2026-11-07')}`,
			meta: '≈ $2,595.60',
			warn: false,
			ownerValued: false,
		})
	})

	it('reads a priced watched address', () => {
		expect(
			line({
				quantity: '0.50000000',
				unit: 'BTC',
				valuedBy: 'price',
				readOn: DAY,
				watch: { chain: 'bitcoin', address: ADDRESS },
			})
		).toEqual({
			secondary: `0.5 BTC · bc1qar…5mdq · Priced ${day('2026-11-07')}`,
			meta: '≈ $2,595.60',
			warn: false,
			ownerValued: false,
		})
	})

	it('reads a priced extended key', () => {
		expect(
			line({
				quantity: '0.5',
				unit: 'BTC',
				valuedBy: 'price',
				readOn: DAY,
				watch: { chain: 'bitcoin', xpub: true, script: 'p2wpkh' },
			}).secondary
		).toBe(`0.5 BTC · Extended key · Priced ${day('2026-11-07')}`)
	})

	it('reads a watch not read yet', () => {
		const fresh = { value: usd(0), valuedOn: '', unit: 'BTC' }
		expect(line({ ...fresh, watch: { chain: 'bitcoin', address: ADDRESS } })).toEqual({
			secondary: 'bc1qar…5mdq · Not read yet',
			meta: 'Not read yet',
			warn: false,
			ownerValued: false,
		})
		expect(line({ ...fresh, watch: { chain: 'bitcoin', xpub: true } }).secondary).toBe('Extended key · Not read yet')
	})

	it('reads a price or a watch read older than 7 days as out of date', () => {
		expect(line({ quantity: '0.0412', unit: 'BTC', valuedBy: 'price', valuedOn: '2026-10-30' })).toEqual({
			secondary: `0.0412 BTC · Priced ${day('2026-10-30')} · out of date`,
			meta: '≈ $2,595.60',
			warn: true,
			ownerValued: false,
		})
		expect(
			line({
				quantity: '0.5',
				unit: 'BTC',
				valuedBy: 'price',
				readOn: '2026-10-30',
				watch: { chain: 'bitcoin', address: ADDRESS },
			})
		).toMatchObject({
			secondary: `0.5 BTC · bc1qar…5mdq · Priced ${day('2026-11-07')} · Read ${day('2026-10-30')} · out of date`,
			warn: true,
		})
	})

	it("reads a coin with no price by the owner's value, out of date past 90 days", () => {
		expect(line({ quantity: '12', unit: 'FOO', valuedOn: '2026-10-01', value: usd(1200) })).toEqual({
			secondary: `12 FOO · Valued ${day('2026-10-01')}`,
			meta: '≈ $12.00',
			warn: false,
			ownerValued: true,
		})
		expect(line({ quantity: '12', unit: 'FOO', valuedOn: '2026-08-01', value: usd(1200) })).toMatchObject({
			secondary: `12 FOO · Valued ${day('2026-08-01')} · out of date`,
			warn: true,
		})
	})

	it('reads any other asset as before, with Not in totals in another currency', () => {
		expect(line({ kind: 'vehicle', value: money(1500000, 'EUR'), valuedOn: '2026-10-01' })).toEqual({
			secondary: `Valued ${day('2026-10-01')} · Not in totals`,
			meta: '€15,000.00',
			warn: false,
			ownerValued: true,
		})
		expect(line({ kind: 'valuables', quantity: '3', unit: 'oz', value: usd(600000) })).toMatchObject({
			secondary: '3 oz',
			meta: '≈ $6,000.00',
		})
	})
})
