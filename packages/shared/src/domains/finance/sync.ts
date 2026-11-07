// What a bank provider's sync run writes (product/domains/finance.md §8), pure so it is tested here: the account kind
// a provider's type means, the accounts a run creates and updates with their balances through `balanceOps`, the
// transactions it creates, updates and tombstones, and the link after a run, good or failed, with the retry and the
// signal that follow. A transaction is upserted by its provider id, so replaying a run changes nothing; the link's new
// cursor goes in the last batch, so a run cut short replays from the old one.
import type { ProviderAccount, ProviderTransaction, SyncResult } from '../../api/plaid.js'
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { negate, parseMoney, type Money } from '../../money/index.js'
import { balanceOps, dayOfInstant, EXPIRING_WITHIN, payloadOf } from './accounts.js'
import { FINANCE, WHOLE, type Account, type AccountKind, type ProviderLink, type TransactionPayload } from './types.js'

/** The source every provider row carries. */
export const PLAID_SOURCE = 'plaid'
/** The most ops in one batch, and the most ids in one lookup. */
export const CHUNK = 500

const SAVINGS = new Set(['savings', 'money market', 'cd', 'hsa'])
const RETIREMENT = new Set([
	'401a',
	'401k',
	'403b',
	'457b',
	'529',
	'ira',
	'roth',
	'roth 401k',
	'sep ira',
	'simple ira',
	'keogh',
	'pension',
	'retirement',
	'thrift savings plan',
	'hsa',
])

/** The account kind of a provider's type and subtype. */
export function kindOf(type: string, subtype?: string | null): AccountKind {
	const sub = (subtype ?? '').toLowerCase()
	switch (type.toLowerCase()) {
		case 'depository':
			return SAVINGS.has(sub) ? 'savings' : 'checking'
		case 'credit':
			return 'credit-card'
		case 'loan':
			return 'loan'
		case 'investment':
			return RETIREMENT.has(sub) ? 'retirement' : 'investment'
		default:
			return 'other'
	}
}

/** A decimal string in its currency, exactly, or nothing when it has more decimals than the currency or none. */
export function moneyOf(decimal: string | null | undefined, currency: string | null | undefined): Money | undefined {
	if (!decimal || !currency) return undefined
	try {
		const parsed = parseMoney(decimal, currency, 'en')
		return 'error' in parsed ? undefined : parsed
	} catch {
		return undefined
	}
}

/** What a run left out, by code, for the log: never a name or an amount. */
export type Skipped = 'finance:unsupported-currency' | 'finance:bad-amount'

const sameMoney = (a?: Money, b?: Money) => a?.minor === b?.minor && a?.currency === b?.currency
/** A value with its keys in order at every level, so two payloads compare by what they hold. */
const canonical = (value: unknown): unknown =>
	Array.isArray(value)
		? value.map(canonical)
		: value && typeof value === 'object'
			? Object.fromEntries(
					Object.entries(value)
						.filter(([, entry]) => entry !== undefined)
						.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
						.map(([key, entry]) => [key, canonical(entry)])
				)
			: value
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

/**
 * The provider's accounts on the link: one it has no row for is created (with its balance, when it has one), one
 * that has a row takes the name and last four, and a balance that moved, or the first of the local day, goes through
 * `balanceOps`. A closed account is never reopened or touched, and one the provider stops reporting is left as it is.
 * An account with no ISO currency is skipped.
 */
export function accountOps(
	link: ProviderLink,
	accounts: readonly Account[],
	reported: readonly ProviderAccount[],
	nowIso: string,
	day: string,
	newId: () => string
): { ops: BatchOp[]; accounts: Account[]; byProviderId: Map<string, Account>; skipped: Skipped[] } {
	const ops: BatchOp[] = []
	const changed: Account[] = []
	const skipped: Skipped[] = []
	const byProviderId = new Map<string, Account>()
	for (const account of accounts) {
		if (account.linkId === link.id && account.providerAccountId) byProviderId.set(account.providerAccountId, account)
	}
	for (const found of reported) {
		if (!found.currency) {
			skipped.push('finance:unsupported-currency')
			continue
		}
		const held = byProviderId.get(found.providerAccountId)
		if (held?.closedOn) continue
		const last4 = found.mask && /^[0-9]{4}$/.test(found.mask) ? found.mask : undefined
		const balance = moneyOf(found.current ?? found.available, found.currency)
		if ((found.current ?? found.available) && !balance) skipped.push('finance:bad-amount')
		const base: Account = held
			? { ...held, name: found.name || held.name }
			: {
					id: newId(),
					name: found.name,
					kind: kindOf(found.kind, found.subtype),
					currency: found.currency,
					institution: link.institution.name,
					linkId: link.id,
					providerAccountId: found.providerAccountId,
					share: WHOLE,
				}
		if (last4) base.last4 = last4
		else delete base.last4

		let next = base
		const moved = balance && (!sameMoney(balance, held?.balance) || held?.lastSnapshot?.day !== day)
		if (balance && moved) {
			const set = balanceOps(base, balance, nowIso, day, newId, { created: !held })
			next = set.account
			ops.push(...set.ops)
		} else if (!held) {
			ops.push({ op: 'createEntity', input: { id: base.id, type: FINANCE.account, payload: payloadOf(base) } })
		} else if (!same(payloadOf(held), payloadOf(base))) {
			ops.push({ op: 'updateEntity', id: base.id, payload: payloadOf(base) })
		} else continue
		changed.push(next)
		byProviderId.set(found.providerAccountId, next)
	}
	return { ops, accounts: changed, byProviderId, skipped }
}

/** The keys a transaction's provider owns, `accountId` aside: a sync overwrites them and keeps every other. */
const PROVIDER_KEYS = [
	'amount',
	'day',
	'authorizedDay',
	'datetime',
	'name',
	'merchantName',
	'pending',
	'providerCategory',
] as const

/** The keys a provider does not own, which a posted transaction takes from the pending one it replaces. */
function ownKeys(payload: TransactionPayload): Record<string, unknown> {
	const rest: Record<string, unknown> = { ...payload }
	for (const key of [...PROVIDER_KEYS, 'accountId']) delete rest[key]
	return rest
}

/**
 * The run's transactions as writes: an added or modified one is created, or updated when a live row has its
 * provider id (only the provider's keys change); a removed one is tombstoned. A posted transaction that replaces a
 * pending one takes the pending row's other keys. The amount is the provider's, negated: money out is negative.
 * `existing` is the live rows by provider id, and is kept up to date as the writes are made.
 */
export function transactionOps(
	accountsByProviderId: ReadonlyMap<string, Account>,
	existing: Map<string, Entity<TransactionPayload>>,
	result: Pick<SyncResult, 'added' | 'modified' | 'removed'>,
	newId: () => string
): { ops: BatchOp[]; skipped: Skipped[] } {
	const ops: BatchOp[] = []
	const skipped: Skipped[] = []
	const upsert = (found: ProviderTransaction) => {
		const account = accountsByProviderId.get(found.providerAccountId)
		if (!account) return
		const currency = found.currency
		if (!currency) return void skipped.push('finance:unsupported-currency')
		const amount = moneyOf(found.amount, currency)
		if (!amount) return void skipped.push('finance:bad-amount')
		const theirs: TransactionPayload = {
			accountId: account.id,
			amount: negate(amount),
			day: found.date,
			...(found.authorizedDate ? { authorizedDay: found.authorizedDate } : {}),
			...(found.datetime ? { datetime: found.datetime } : {}),
			name: found.name,
			...(found.merchantName ? { merchantName: found.merchantName } : {}),
			pending: found.pending,
			...(found.category ? { providerCategory: found.category } : {}),
		}
		const held = existing.get(found.id)
		if (held) {
			const payload = { ...ownKeys(held.payload), ...theirs, accountId: held.payload.accountId }
			if (same(payload, held.payload)) return
			ops.push({ op: 'updateEntity', id: held.id, payload })
			existing.set(found.id, { ...held, payload })
			return
		}
		const pending = found.pendingTransactionId ? existing.get(found.pendingTransactionId) : undefined
		const payload = { ...(pending ? ownKeys(pending.payload) : {}), ...theirs } as TransactionPayload
		const id = newId()
		ops.push({
			op: 'createEntity',
			input: { id, type: FINANCE.transaction, source: PLAID_SOURCE, externalId: found.id, payload },
		})
		existing.set(found.id, {
			id,
			uri: toUri(FINANCE.transaction, id),
			type: FINANCE.transaction,
			payload,
			createdAt: '',
			updatedAt: '',
			deletedAt: null,
			mirror: false,
			source: PLAID_SOURCE,
			externalId: found.id,
			snapshot: null,
			links: [],
		})
	}
	for (const found of result.added) upsert(found)
	for (const found of result.modified) upsert(found)
	for (const id of result.removed) {
		const held = existing.get(id)
		if (!held) continue
		ops.push({ op: 'delete', uri: toUri(FINANCE.transaction, held.id) })
		existing.delete(id)
	}
	return { ops, skipped }
}

/** The ops in batches of `CHUNK`, with the link's write in the last, so the cursor lands with the last rows. */
export function chunked(ops: readonly BatchOp[], last?: BatchOp): BatchOp[][] {
	const chunks: BatchOp[][] = []
	for (let at = 0; at < ops.length; at += CHUNK) chunks.push(ops.slice(at, at + CHUNK))
	if (!last) return chunks
	const tail = chunks.at(-1)
	if (tail && tail.length < CHUNK) tail.push(last)
	else chunks.push([last])
	return chunks
}

/** A good run's link: fresh, no failures, the consent's end and the new cursor. */
export function linkAfterSync(
	link: ProviderLink,
	result: Pick<SyncResult, 'consentExpiresAt' | 'cursor'>,
	nowIso: string
): ProviderLink {
	const { lastErrorCode: _code, consentExpiresAt: _consent, ...rest } = link
	return {
		...rest,
		status: 'ok',
		lastSyncedAt: nowIso,
		failures: 0,
		...(result.consentExpiresAt ? { consentExpiresAt: result.consentExpiresAt } : {}),
		cursor: result.cursor,
	}
}

/** How many failures in a row make a link `error`. */
export const ERROR_AFTER = 3

/**
 * A failed run's link: `needs-reauth` at once (and kept by any later failure), `error` from the third failure in a
 * row, and the code of the failure, never a message. The data stays as it was.
 */
export function linkAfterFailure(link: ProviderLink, code: string): ProviderLink {
	const failures = (link.failures ?? 0) + 1
	const status =
		code === 'needs-reauth' || link.status === 'needs-reauth'
			? 'needs-reauth'
			: failures >= ERROR_AFTER
				? 'error'
				: link.status
	return { ...link, status, failures, lastErrorCode: code }
}

const MINUTE = 60 * 1000
const RETRIES = [1, 5, 15, 30].map((minutes) => minutes * MINUTE)

/** How long after the nth failure in a row the retry runs; none after the fourth, when the hourly run carries on. */
export function retryDelay(failures: number): number | undefined {
	return failures >= 1 ? RETRIES[failures - 1] : undefined
}

/** How long after a removal its Item is revoked: past the page's undo toast. */
export const REVOKE_AFTER = 2 * MINUTE

/**
 * The removed Plaid links whose undo has passed, to revoke. A link removed less than `REVOKE_AFTER` ago is left for a
 * later run, so its Undo still brings back a link with a token; a link Undo brought back is live and never named.
 */
export function linksToRevoke(
	rows: readonly Pick<Entity<{ provider: string }>, 'id' | 'deletedAt' | 'payload'>[],
	now: number
): string[] {
	return rows
		.filter(
			(row) => row.deletedAt && row.payload.provider === 'plaid' && now - Date.parse(row.deletedAt) >= REVOKE_AFTER
		)
		.map((row) => row.id)
}

export interface LinkSignal {
	reason: 'needs-reauth' | 'expiring'
	dedupeKey: string
	/** The day the consent ends, for `expiring`. */
	by?: string
}

/** What a link has to tell the owner after a run: it wants a sign-in, or its consent ends within seven days. */
export function linkSignal(link: ProviderLink, now: number): LinkSignal | undefined {
	if (link.status === 'needs-reauth')
		return { reason: 'needs-reauth', dedupeKey: `${link.id}:needs-reauth:${link.lastSyncedAt ?? ''}` }
	const ends = link.consentExpiresAt ? Date.parse(link.consentExpiresAt) : Number.NaN
	if (link.consentExpiresAt && Number.isFinite(ends) && ends - now <= EXPIRING_WITHIN)
		return {
			reason: 'expiring',
			by: dayOfInstant(link.consentExpiresAt),
			dedupeKey: `${link.id}:expiring:${link.consentExpiresAt}`,
		}
	return undefined
}

export interface SyncInput {
	link: ProviderLink
	/** Every account the store holds. */
	accounts: readonly Account[]
	/** The live provider rows by provider id: every one the result names, and the pending ones they replace. */
	existing: Map<string, Entity<TransactionPayload>>
	result: SyncResult
	nowIso: string
	/** The local day, for the balance snapshots. */
	day: string
	newId: () => string
}

/** The provider ids a result needs looked up: what it adds, modifies and removes, and what pending ones it replaces. */
export function idsToRead(result: Pick<SyncResult, 'added' | 'modified' | 'removed'>): string[] {
	const ids = new Set<string>()
	for (const found of [...result.added, ...result.modified]) {
		ids.add(found.id)
		if (found.pendingTransactionId) ids.add(found.pendingTransactionId)
	}
	for (const id of result.removed) ids.add(id)
	return [...ids]
}

/** A whole good run as batches: the accounts, the transactions, and the link with its cursor in the last. */
export function syncOps(input: SyncInput): {
	chunks: BatchOp[][]
	link: ProviderLink
	accounts: Account[]
	skipped: Skipped[]
} {
	const { link, result, nowIso, day, newId } = input
	const accounts = accountOps(link, input.accounts, result.accounts, nowIso, day, newId)
	const transactions = transactionOps(accounts.byProviderId, input.existing, result, newId)
	const next = linkAfterSync(link, result, nowIso)
	// the link is written whenever it moved; `lastSyncedAt` moves on every live run (freshness is stored), so only a
	// replay at the same instant writes nothing
	const write: BatchOp | undefined = same(payloadOf(next), payloadOf(link))
		? undefined
		: { op: 'updateEntity', id: next.id, payload: payloadOf(next) }
	return {
		chunks: chunked([...accounts.ops, ...transactions.ops], write),
		link: next,
		accounts: accounts.accounts,
		skipped: [...accounts.skipped, ...transactions.skipped],
	}
}
