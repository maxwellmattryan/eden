// What is inside Orchard's brokerage and retirement accounts (product/domains/finance.md §3, D-197), pure so it is
// tested here: exact decimal arithmetic for values and cost basis, a holding's value and how old it is, when a link's
// daily investments read is due and over what window, the cost basis a holding carries over from a replaced account,
// the writes one read makes, the allocation by class and the tab's grouped rows and totals. Every amount is Money and
// every quantity or price a decimal string; nothing is multiplied as a float.
import type { InvestmentsResult, ProviderHolding, ProviderInvestmentTransaction } from '../../api/plaid.js'
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { addDays } from '../../dates/index.js'
import { addMoney, decimalsOf, money, negate, shareOf, type Money } from '../../money/index.js'
import { accountGroups, payloadOf } from './accounts.js'
import { chunked, ownKeys, same, type Skipped } from './sync.js'
import {
	ALLOCATION_CLASSES,
	FINANCE,
	WHOLE,
	type Account,
	type AllocationClass,
	type Holding,
	type HoldingPayload,
	type ProviderLink,
	type Security,
	type SecurityPayload,
	type SecurityType,
	type TransactionPayload,
} from './types.js'

/** The source of an investment transaction's row: its provider id is Plaid's `investment_transaction_id`. */
export const PLAID_INVESTMENTS_SOURCE = 'plaid-investments'
/** The source of a holding's and a security's row. */
export const HOLDINGS_SOURCE = 'plaid'
/** A typed value or an asset's value older than this many days is out of date. */
export const AGED_DAYS = 90
/** How far back the first investments read asks (D-187's 24 months). */
export const FIRST_READ_DAYS = 730
/** How far back a later read asks from the last good one, so late corrections land. */
export const OVERLAP_DAYS = 30
/** The most closing prices a security keeps: five years of days. */
export const PRICE_DAYS = 1830

// ---- Exact decimals ----------------------------------------------------------------------------------------------

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/

/** A decimal string as digits and a scale: "-12.30" is -1230 at 2. */
function parseDecimal(text: string | null | undefined): { digits: bigint; scale: number } | undefined {
	const match = DECIMAL.exec((text ?? '').trim())
	if (!match) return undefined
	const fraction = match[3] ?? ''
	const digits = BigInt(`${match[2]}${fraction}`)
	return { digits: match[1] ? -digits : digits, scale: fraction.length }
}

const TEN = 10n
const pow10 = (n: number) => TEN ** BigInt(n)

/** `numerator / denominator`, rounded half away from zero. The denominator is positive. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
	const size = numerator < 0n ? -numerator : numerator
	let quotient = size / denominator
	if ((size % denominator) * 2n >= denominator) quotient += 1n
	return numerator < 0n ? -quotient : quotient
}

function moneyFrom(minor: bigint, currency: string): Money | undefined {
	if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < -BigInt(Number.MAX_SAFE_INTEGER)) return undefined
	return money(Number(minor), currency)
}

function decimalsOrNothing(currency: string): number | undefined {
	try {
		return decimalsOf(currency)
	} catch {
		return undefined
	}
}

/** A decimal string as Money in the currency, rounded half away from zero to its decimals; nothing when malformed. */
export function roundedMoney(
	decimal: string | null | undefined,
	currency: string | null | undefined
): Money | undefined {
	const parsed = parseDecimal(decimal)
	const d = currency ? decimalsOrNothing(currency) : undefined
	if (!parsed || d === undefined || !currency) return undefined
	const minor =
		parsed.scale <= d ? parsed.digits * pow10(d - parsed.scale) : divideRounded(parsed.digits, pow10(parsed.scale - d))
	return moneyFrom(minor, currency)
}

/** A quantity times a price, as Money in the currency, rounded half away from zero; nothing when either is malformed. */
export function timesDecimal(quantity: string, price: string, currency: string): Money | undefined {
	const q = parseDecimal(quantity)
	const p = parseDecimal(price)
	const d = decimalsOrNothing(currency)
	if (!q || !p || d === undefined) return undefined
	const scale = q.scale + p.scale
	const product = q.digits * p.digits
	const minor = scale <= d ? product * pow10(d - scale) : divideRounded(product, pow10(scale - d))
	return moneyFrom(minor, currency)
}

/** A quantity as the owner reads it: the exact decimal, trimmed of trailing zeros ("21.40" → "21.4"). */
export function quantityText(quantity: string): string {
	if (!DECIMAL.test(quantity.trim())) return quantity
	const [whole, fraction] = quantity.trim().split('.')
	const trimmed = (fraction ?? '').replace(/0+$/, '')
	return trimmed ? `${whole}.${trimmed}` : whole!
}

// ---- Value and age -----------------------------------------------------------------------------------------------

export interface HoldingValue {
	value: Money
	/** `YYYY-MM-DD` the value is as of; empty when the provider named no day. */
	on: string
	/** The provider's value, quantity × a price, or the owner's typed value. */
	by: 'provider' | 'price' | 'owner'
}

const latestPrice = (security: Security | undefined) => security?.prices.at(-1)

/**
 * A holding's value, in order: the provider's, then quantity × the provider's price or the security's latest close,
 * then the owner's typed value; nothing when it has none, and it is unpriced.
 */
export function holdingValue(holding: HoldingPayload, security?: Security): HoldingValue | undefined {
	const close = latestPrice(security)
	if (holding.value) return { value: holding.value, on: holding.pricedOn ?? close?.day ?? '', by: 'provider' }
	const price = holding.price ?? close?.price
	if (price) {
		const value = timesDecimal(holding.quantity, price, holding.currency)
		const on = holding.price ? (holding.pricedOn ?? '') : (close?.day ?? '')
		if (value) return { value, on, by: 'price' }
	}
	if (holding.typedValue) return { value: holding.typedValue.value, on: holding.typedValue.on, by: 'owner' }
	return undefined
}

/** Whether a value set on the day is out of date by today: more than `AGED_DAYS` before it. */
export function aged(day: string, today: string): boolean {
	return Boolean(day) && addDays(day, AGED_DAYS) < today
}

const INVESTMENT_KINDS = new Set(['investment', 'retirement'])
/** An open brokerage or retirement account. */
export const holdsInvestments = (account: Account) => !account.closedOn && INVESTMENT_KINDS.has(account.kind)

/**
 * Whether a link's investments read is due: a Plaid link that can be read, with an open brokerage or retirement
 * account, not read yet today. A link that wants a sign-in waits for it, as its sync does.
 */
export function investmentsDue(link: ProviderLink, accounts: readonly Account[], today: string): boolean {
	return (
		link.provider === 'plaid' &&
		link.status !== 'needs-reauth' &&
		link.investmentsReadOn !== today &&
		accounts.some((account) => account.linkId === link.id && holdsInvestments(account))
	)
}

/** The days a read asks for: two years back the first time, else from a month before the last good read. */
export function investmentsWindow(link: ProviderLink, today: string): { start: string; end: string } {
	const start = link.investmentsReadOn
		? addDays(link.investmentsReadOn, -OVERLAP_DAYS)
		: addDays(today, -FIRST_READ_DAYS)
	return { start: start > today ? today : start, end: today }
}

// ---- Types and classes -------------------------------------------------------------------------------------------

const PLAID_TYPES: Record<string, SecurityType> = {
	equity: 'equity',
	etf: 'etf',
	'mutual fund': 'mutual-fund',
	'fixed income': 'fixed-income',
	cash: 'cash',
	cryptocurrency: 'cryptocurrency',
	derivative: 'derivative',
}

/** A security type from Plaid's: `fixed income` → `fixed-income`; `loan`, `other` and anything unknown → `other`. */
export function securityTypeOf(kind: string | null | undefined): SecurityType {
	return PLAID_TYPES[(kind ?? '').toLowerCase()] ?? 'other'
}

const CLASSES: Record<SecurityType, AllocationClass> = {
	equity: 'stocks',
	etf: 'funds',
	'mutual-fund': 'funds',
	'fixed-income': 'bonds',
	cash: 'cash',
	cryptocurrency: 'crypto',
	derivative: 'other',
	other: 'other',
}

/** The allocation class of a security type. */
export const classOf = (type: SecurityType | undefined): AllocationClass => CLASSES[type ?? 'other'] ?? 'other'

// ---- Cost basis carried over -------------------------------------------------------------------------------------

/**
 * A holding with no cost basis, in an account that replaced another, takes the replaced account's basis for the same
 * security (the same row, else the same ticker), scaled by the quantity it holds: A's basis × (B's quantity ÷ A's),
 * rounded half away from zero. Only when B holds no more than A did; otherwise the basis stays missing.
 */
export function carryBasis(
	holding: Holding,
	account: Account,
	previous: readonly Holding[],
	securities: ReadonlyMap<string, Security>
): Holding {
	if (holding.costBasis || !account.replaces) return holding
	const theirs = previous.filter((entry) => entry.accountId === account.replaces && entry.costBasis)
	const ticker = securities.get(holding.securityId)?.ticker?.toLowerCase()
	const from =
		theirs.find((entry) => entry.securityId === holding.securityId) ??
		(ticker ? theirs.find((entry) => securities.get(entry.securityId)?.ticker?.toLowerCase() === ticker) : undefined)
	const b = parseDecimal(holding.quantity)
	const a = parseDecimal(from?.quantity)
	if (!from?.costBasis || !a || !b || a.digits <= 0n || b.digits < 0n) return holding
	// compare and divide at one scale
	const scale = Math.max(a.scale, b.scale)
	const qa = a.digits * pow10(scale - a.scale)
	const qb = b.digits * pow10(scale - b.scale)
	if (qb > qa) return holding
	const minor = divideRounded(BigInt(from.costBasis.minor) * qb, qa)
	const costBasis = moneyFrom(minor, from.costBasis.currency)
	return costBasis ? { ...holding, costBasis, costBasisBy: 'carried' } : holding
}

// ---- One read's writes -------------------------------------------------------------------------------------------

export interface InvestmentInput {
	link: ProviderLink
	/** Every account the store holds. */
	accounts: readonly Account[]
	/** Every holding row, the tombstoned ones too: a replaced account's may carry its basis over. */
	holdings: readonly Entity<HoldingPayload>[]
	/** The live security rows. */
	securities: readonly Entity<SecurityPayload>[]
	/** The live investment transaction rows by provider id, kept up to date as the writes are made. */
	existingTransactions: Map<string, Entity<TransactionPayload>>
	result: InvestmentsResult
	/** The local day of the read. */
	day: string
	newId: () => string
}

export interface InvestmentWrites {
	chunks: BatchOp[][]
	link: ProviderLink
	/** The holdings made or changed. */
	holdings: Holding[]
	/** The ids of the holdings tombstoned. */
	removedHoldings: string[]
	/** The securities made or changed. */
	securities: Security[]
	skipped: Skipped[]
}

/** The keys an investment transaction's provider owns besides a bank transaction's. */
const INVESTMENT_KEYS = ['investment'] as const

const holdingKey = (providerAccountId: string, securityId: string) => `${providerAccountId}:${securityId}`
const withId = <T>(row: Entity<T>): T & { id: string } => ({ ...row.payload, id: row.id })

function priced(prices: SecurityPayload['prices'], day: string, price: string): SecurityPayload['prices'] {
	const kept = prices.filter((entry) => entry.day !== day)
	kept.push({ day, price })
	kept.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
	return kept.slice(-PRICE_DAYS)
}

/**
 * One investments read as writes (D-197). Securities are upserted by the provider's id and take the day's close once
 * per day. Holdings are upserted per account and security, and one the provider no longer lists on an account it
 * reported is tombstoned; closed accounts and accounts with no row are skipped. The provider's cost basis is written
 * unless the owner typed one; a missing one carries over from a replaced account. Investment transactions with an
 * amount are upserted like a sync's, with the amount negated. The link's `investmentsReadOn` goes in the last batch.
 * A replay of the same read writes nothing.
 */
export function investmentOps(input: InvestmentInput): InvestmentWrites {
	const { link, result, day, newId } = input
	const ops: BatchOp[] = []
	const skipped: Skipped[] = []
	const changedSecurities: Security[] = []
	const changedHoldings: Holding[] = []
	const removedHoldings: string[] = []

	const byProviderId = new Map<string, Account>()
	for (const account of input.accounts)
		if (account.linkId === link.id && account.providerAccountId) byProviderId.set(account.providerAccountId, account)
	const open = (providerAccountId: string) => {
		const account = byProviderId.get(providerAccountId)
		return account && !account.closedOn ? account : undefined
	}

	// securities
	const securityRows = new Map<string, Entity<SecurityPayload>>()
	for (const row of input.securities) if (!row.deletedAt && row.externalId) securityRows.set(row.externalId, row)
	const securities = new Map<string, Security>(input.securities.map((row) => [row.id, withId(row)]))
	const securityIdOf = new Map<string, string>()
	for (const [externalId, row] of securityRows) securityIdOf.set(externalId, row.id)
	if (result.status === 'ok') {
		for (const found of result.securities) {
			if (!found.securityId) continue
			const held = securityRows.get(found.securityId)
			const was = held?.payload
			const prices =
				found.closePrice && parseDecimal(found.closePrice)
					? priced(was?.prices ?? [], found.closePriceAsOf ?? day, found.closePrice)
					: (was?.prices ?? [])
			const payload: SecurityPayload = {
				...(was ?? {}),
				name: found.name || was?.name || '',
				type: securityTypeOf(found.kind),
				prices,
			}
			if (found.ticker) payload.ticker = found.ticker
			else delete payload.ticker
			if (found.currency) payload.currency = found.currency
			else delete payload.currency
			if (held && same(payload, was)) continue
			const id = held?.id ?? newId()
			ops.push(
				held
					? { op: 'updateEntity', id, payload }
					: {
							op: 'createEntity',
							input: { id, type: FINANCE.security, source: HOLDINGS_SOURCE, externalId: found.securityId, payload },
						}
			)
			securityIdOf.set(found.securityId, id)
			securities.set(id, { ...payload, id })
			changedSecurities.push({ ...payload, id })
		}
	}

	// holdings
	const every = input.holdings.map(withId)
	const live = new Map<string, Entity<HoldingPayload>>()
	for (const row of input.holdings) if (!row.deletedAt && row.externalId) live.set(row.externalId, row)
	const seen = new Set<string>()
	const reported = new Set<string>()
	if (result.status === 'ok') {
		for (const found of result.accounts) {
			const account = open(found.providerAccountId)
			if (account) reported.add(account.id)
		}
		for (const found of result.holdings) {
			const account = open(found.providerAccountId)
			if (!account) continue
			reported.add(account.id)
			if (!found.currency) {
				skipped.push('finance:unsupported-currency')
				continue
			}
			const securityId = securityIdOf.get(found.securityId)
			if (!securityId) continue
			const held = live.get(holdingKey(found.providerAccountId, found.securityId))
			const next = holdingOf(found, account, securityId, held, securities.get(securityId), day)
			if (!held) next.id = newId()
			const carried = carryBasis(next, account, every, securities)
			const payload = payloadOf(carried)
			if (held) seen.add(held.id)
			if (held && same(payload, held.payload)) continue
			ops.push(
				held
					? { op: 'updateEntity', id: carried.id, payload }
					: {
							op: 'createEntity',
							input: {
								id: carried.id,
								type: FINANCE.holding,
								source: HOLDINGS_SOURCE,
								externalId: holdingKey(found.providerAccountId, found.securityId),
								payload,
							},
						}
			)
			seen.add(carried.id)
			changedHoldings.push(carried)
		}
		for (const row of live.values()) {
			if (seen.has(row.id) || !reported.has(row.payload.accountId)) continue
			ops.push({ op: 'delete', uri: toUri(FINANCE.holding, row.id) })
			removedHoldings.push(row.id)
		}
	}

	// investment transactions
	if (result.status === 'ok')
		for (const found of result.transactions) {
			const written = transactionOf(found, open(found.providerAccountId), securityIdOf)
			if (!written) continue
			if ('skipped' in written) {
				skipped.push(written.skipped)
				continue
			}
			const theirs = written.payload
			const held = input.existingTransactions.get(found.id)
			if (held) {
				const payload = {
					...ownKeys(held.payload, INVESTMENT_KEYS),
					...theirs,
					accountId: held.payload.accountId,
				} as TransactionPayload
				if (same(payload, held.payload)) continue
				ops.push({ op: 'updateEntity', id: held.id, payload })
				input.existingTransactions.set(found.id, { ...held, payload })
				continue
			}
			const id = newId()
			ops.push({
				op: 'createEntity',
				input: {
					id,
					type: FINANCE.transaction,
					source: PLAID_INVESTMENTS_SOURCE,
					externalId: found.id,
					payload: theirs,
				},
			})
			input.existingTransactions.set(found.id, {
				id,
				uri: toUri(FINANCE.transaction, id),
				type: FINANCE.transaction,
				payload: theirs,
				createdAt: '',
				updatedAt: '',
				deletedAt: null,
				mirror: false,
				source: PLAID_INVESTMENTS_SOURCE,
				externalId: found.id,
				snapshot: null,
				links: [],
			})
		}

	const next: ProviderLink = { ...link, investmentsReadOn: day }
	const write: BatchOp | undefined = same(payloadOf(next), payloadOf(link))
		? undefined
		: { op: 'updateEntity', id: next.id, payload: payloadOf(next) }
	return {
		chunks: chunked(ops, write),
		link: next,
		holdings: changedHoldings,
		removedHoldings,
		securities: changedSecurities,
		skipped,
	}
}

/**
 * A provider's holding as the row's payload, keeping what the provider does not own: the owner's basis and value. A
 * new one's id is left empty for the caller to fill.
 */
function holdingOf(
	found: ProviderHolding,
	account: Account,
	securityId: string,
	held: Entity<HoldingPayload> | undefined,
	security: Security | undefined,
	day: string
): Holding {
	const currency = found.currency!
	const next: Holding = {
		...(held?.payload ?? {}),
		id: held?.id ?? '',
		accountId: account.id,
		securityId,
		quantity: found.quantity,
		currency,
	}
	const value = roundedMoney(found.institutionValue, currency)
	const price = found.institutionPrice && parseDecimal(found.institutionPrice) ? found.institutionPrice : undefined
	if (value) next.value = value
	else delete next.value
	if (price) next.price = price
	else delete next.price
	if (value || price) next.pricedOn = found.institutionPriceAsOf ?? latestPrice(security)?.day ?? day
	else delete next.pricedOn
	const basis = roundedMoney(found.costBasis, currency)
	if (held?.payload.costBasisBy !== 'owner' && basis) {
		next.costBasis = basis
		next.costBasisBy = 'provider'
	}
	return next
}

/** A provider's investment transaction as the row's payload, or why it was left out; nothing for a zero amount. */
function transactionOf(
	found: ProviderInvestmentTransaction,
	account: Account | undefined,
	securityIdOf: ReadonlyMap<string, string>
): { payload: TransactionPayload } | { skipped: Skipped } | undefined {
	if (!account) return undefined
	if (!found.currency) return { skipped: 'finance:unsupported-currency' }
	const amount = roundedMoney(found.amount, found.currency)
	if (!amount) return { skipped: 'finance:bad-amount' }
	// a split or a stock distribution moves no money: the holdings show the new quantity
	if (amount.minor === 0) return undefined
	const securityId = found.securityId ? securityIdOf.get(found.securityId) : undefined
	const investment: NonNullable<TransactionPayload['investment']> = { type: found.kind }
	if (found.subtype) investment.subtype = found.subtype
	if (securityId) investment.securityId = securityId
	if (found.quantity) investment.quantity = found.quantity
	if (found.price) investment.price = found.price
	return {
		payload: {
			accountId: account.id,
			amount: negate(amount),
			day: found.date,
			name: found.name,
			pending: false,
			investment,
		},
	}
}

// ---- Allocation --------------------------------------------------------------------------------------------------

export interface Allocation {
	/** One per class with a value, highest first; `share` in basis points, summing to exactly `WHOLE`. */
	classes: { id: AllocationClass; value: Money; share: number }[]
	total: Money
	/** Values in another currency, left out, at the owner's share. */
	left: Money[]
	/** Holdings with no value, left out. */
	unpriced: number
}

/**
 * The value per class in the home currency, each holding at its account's share; closed accounts left out, other
 * currencies in `left`, unpriced holdings counted. The shares are basis points by largest remainder, so they add up
 * to exactly 100%.
 */
export function allocationOf(input: {
	holdings: readonly Holding[]
	securities: readonly Security[]
	accounts: readonly Account[]
	home: string
}): Allocation {
	const { home } = input
	const accounts = new Map(input.accounts.map((account) => [account.id, account]))
	const securities = new Map(input.securities.map((security) => [security.id, security]))
	const sums = new Map<AllocationClass, Money>()
	const left: Money[] = []
	let unpriced = 0
	for (const holding of input.holdings) {
		const account = accounts.get(holding.accountId)
		if (!account || account.closedOn) continue
		const security = securities.get(holding.securityId)
		const found = holdingValue(holding, security)
		if (!found) {
			unpriced += 1
			continue
		}
		const part = shareOf(found.value, account.share)
		if (part.currency !== home) {
			left.push(part)
			continue
		}
		const id = classOf(security?.type)
		sums.set(id, addMoney(sums.get(id) ?? money(0, home), part))
	}
	let total = money(0, home)
	for (const value of sums.values()) total = addMoney(total, value)
	const positive = ALLOCATION_CLASSES.filter((id) => (sums.get(id)?.minor ?? 0) > 0)
	const shares = largestRemainder(positive.map((id) => BigInt(sums.get(id)!.minor)))
	const classes = positive
		.map((id, at) => ({ id, value: sums.get(id)!, share: shares[at]! }))
		.sort(
			(a, b) => b.value.minor - a.value.minor || ALLOCATION_CLASSES.indexOf(a.id) - ALLOCATION_CLASSES.indexOf(b.id)
		)
	return { classes, total, left, unpriced }
}

/** Positive sizes as basis points of their sum, floored, with the rest handed out to the largest remainders first. */
function largestRemainder(sizes: readonly bigint[]): number[] {
	const sum = sizes.reduce((a, b) => a + b, 0n)
	if (sum <= 0n) return sizes.map(() => 0)
	const whole = BigInt(WHOLE)
	const parts = sizes.map((size, at) => ({ at, floor: (size * whole) / sum, rest: (size * whole) % sum }))
	let short = whole - parts.reduce((a, part) => a + part.floor, 0n)
	const order = [...parts].sort((a, b) => (b.rest > a.rest ? 1 : b.rest < a.rest ? -1 : a.at - b.at))
	for (const part of order) {
		if (short <= 0n) break
		part.floor += 1n
		short -= 1n
	}
	return parts.map((part) => Number(part.floor))
}

// ---- The tab -----------------------------------------------------------------------------------------------------

export interface HoldingRow {
	holding: Holding
	security?: Security
	value?: HoldingValue
	/** The value minus the cost basis, both the holding's own, when both are there in one currency. */
	gain?: Money
	/** An owner's typed value set more than `AGED_DAYS` ago. */
	aged: boolean
	/** The provider gives no value or price for it, so the owner may type one. */
	ownerValued: boolean
	/** In another currency than the home one: in no total. */
	away: boolean
}

export interface InvestmentGroup {
	account: Account
	rows: HoldingRow[]
}

export interface InvestmentSummary {
	/** One per open brokerage or retirement account, in the Accounts page's order. */
	groups: InvestmentGroup[]
	/** The holdings' value in the home currency, at each account's share. */
	value: Money
	/** Over the holdings with a basis; absent when none has one. */
	costBasis?: Money
	gain?: Money
	withoutBasis: number
	unpriced: number
	/** Holdings in another currency, by currency in the order first met. */
	left: { currency: string; count: number }[]
	allocation: Allocation
}

/** The Investments tab: its groups of rows, its totals and its allocation. */
export function investmentSummary(input: {
	holdings: readonly Holding[]
	securities: readonly Security[]
	accounts: readonly Account[]
	links: readonly ProviderLink[]
	home: string
	today: string
	now: number
}): InvestmentSummary {
	const { home, today } = input
	const securities = new Map(input.securities.map((security) => [security.id, security]))
	const ordered = accountGroups(input.accounts, [], input.links, input.now).flatMap((group) =>
		'accounts' in group && group.kind !== 'closed' ? group.accounts.filter(holdsInvestments) : []
	)
	const byAccount = new Map<string, Holding[]>()
	for (const holding of input.holdings)
		byAccount.set(holding.accountId, [...(byAccount.get(holding.accountId) ?? []), holding])

	let value = money(0, home)
	let basis = money(0, home)
	let basisValue = money(0, home)
	let withBasis = 0
	let withoutBasis = 0
	let unpriced = 0
	const left = new Map<string, number>()
	const groups = ordered.map((account): InvestmentGroup => {
		const rows = (byAccount.get(account.id) ?? []).map((holding): HoldingRow => {
			const security = securities.get(holding.securityId)
			const found = holdingValue(holding, security)
			const gain =
				found && holding.costBasis && holding.costBasis.currency === found.value.currency
					? addMoney(found.value, negate(holding.costBasis))
					: undefined
			const away = Boolean(found && found.value.currency !== home)
			if (!holding.costBasis) withoutBasis += 1
			if (!found) unpriced += 1
			else if (away) left.set(found.value.currency, (left.get(found.value.currency) ?? 0) + 1)
			else {
				const part = shareOf(found.value, account.share)
				value = addMoney(value, part)
				if (holding.costBasis?.currency === home) {
					withBasis += 1
					basis = addMoney(basis, shareOf(holding.costBasis, account.share))
					basisValue = addMoney(basisValue, part)
				}
			}
			return {
				holding,
				...(security ? { security } : {}),
				...(found ? { value: found } : {}),
				...(gain ? { gain } : {}),
				aged: found?.by === 'owner' && aged(found.on, today),
				ownerValued: !found || found.by === 'owner',
				away,
			}
		})
		rows.sort(
			(a, b) =>
				Number(!a.value) - Number(!b.value) ||
				(b.value?.value.minor ?? 0) - (a.value?.value.minor ?? 0) ||
				(a.security?.name ?? '').localeCompare(b.security?.name ?? '')
		)
		return { account, rows }
	})
	const allocation = allocationOf({
		holdings: ordered.flatMap((account) => byAccount.get(account.id) ?? []),
		securities: input.securities,
		accounts: ordered,
		home,
	})
	return {
		groups,
		value,
		...(withBasis ? { costBasis: basis, gain: addMoney(basisValue, negate(basis)) } : {}),
		withoutBasis,
		unpriced,
		left: [...left].map(([currency, count]) => ({ currency, count })),
		allocation,
	}
}

// ---- The owner's writes ------------------------------------------------------------------------------------------

/** A holding's writes and the writes that take them back. */
export function holdingOps(was: Holding, next: Holding): { ops: BatchOp[]; inverse: BatchOp[] } {
	return {
		ops: [{ op: 'updateEntity', id: next.id, payload: payloadOf(next) }],
		inverse: [{ op: 'updateEntity', id: was.id, payload: payloadOf(was) }],
	}
}

/** The owner's cost basis, or none to clear it: a cleared one leaves the basis missing until a read brings one. */
export function withCostBasis(holding: Holding, amount: Money | undefined): Holding {
	const { costBasis: _basis, costBasisBy: _by, ...rest } = holding
	return amount ? { ...rest, costBasis: amount, costBasisBy: 'owner' } : rest
}

/** The owner's value with the day it was set, or none to clear it. */
export function withTypedValue(holding: Holding, typed: { value: Money; on: string } | undefined): Holding {
	const { typedValue: _typed, ...rest } = holding
	return typed ? { ...rest, typedValue: typed } : rest
}
