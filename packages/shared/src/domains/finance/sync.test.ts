import { describe, expect, it } from 'vitest'
import type { ProviderAccount, ProviderTransaction, SyncResult } from '../../api/plaid.js'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import type { Entity } from '../../data/index.js'
import { createIdGenerator } from '../../data/ulid.js'
import { payloadOf } from './accounts.js'
import { classifyPass } from './classify.js'
import { recategoriseOps, reimbursableOps, repaymentOps, splitOps } from './edits.js'
import {
	CHUNK,
	idsToRead,
	kindOf,
	linkAfterFailure,
	linkAfterSync,
	linkSignal,
	linksToRevoke,
	PLAID_SOURCE,
	REVOKE_AFTER,
	retryDelay,
	syncOps,
} from './sync.js'
import {
	FINANCE,
	WHOLE,
	type Account,
	type AccountPayload,
	type CategoryPayload,
	type MerchantPayload,
	type ProviderLink,
	type RulePayload,
	type SnapshotPayload,
	type TransactionPayload,
} from './types.js'

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

const NOW = '2026-11-06T15:00:00.000Z'
const DAY = '2026-11-06'
const HOUR = 60 * 60 * 1000

const account = (fields: Partial<ProviderAccount> & { providerAccountId: string }): ProviderAccount => ({
	name: fields.providerAccountId,
	kind: 'depository',
	subtype: 'checking',
	currency: 'USD',
	mask: null,
	current: null,
	available: null,
	...fields,
})

const tx = (fields: Partial<ProviderTransaction> & { id: string; amount: string }): ProviderTransaction => ({
	providerAccountId: 'acc-checking',
	currency: 'USD',
	date: '2026-11-04',
	name: fields.id,
	pending: false,
	...fields,
})

const result = (fields: Partial<SyncResult>): SyncResult => ({
	status: 'ok',
	consentExpiresAt: '2027-05-01T00:00:00Z',
	accounts: [],
	added: [],
	modified: [],
	removed: [],
	cursor: 'c1',
	...fields,
})

function setup() {
	const engine = createEngine(memory())
	const newId = createIdGenerator()
	const link: ProviderLink = { id: newId(), provider: 'plaid', institution: { name: 'Chase' }, status: 'ok' }
	const closed: Account = {
		id: newId(),
		name: 'Old savings',
		kind: 'savings',
		currency: 'USD',
		institution: 'Chase',
		linkId: link.id,
		providerAccountId: 'acc-closed',
		share: WHOLE,
		closedOn: '2026-10-01',
	}
	engine.applyBatch([
		{ op: 'createEntity', input: { id: link.id, type: FINANCE.link, payload: payloadOf(link) } },
		{ op: 'createEntity', input: { id: closed.id, type: FINANCE.account, payload: payloadOf(closed) } },
	])
	return { engine, newId, link, closed }
}

type Engine = ReturnType<typeof createEngine>

const withId = <T>(row: Entity<T>) => ({ ...row.payload, id: row.id })
const linkOf = (engine: Engine) => engine.queryEntities<ProviderLink>({ type: FINANCE.link }).map(withId)[0]!
const accountsOf = (engine: Engine) => engine.queryEntities<AccountPayload>({ type: FINANCE.account }).map(withId)
const transactionsOf = (engine: Engine) => engine.queryEntities<TransactionPayload>({ type: FINANCE.transaction })
const snapshotsOf = (engine: Engine) => engine.queryEntities<SnapshotPayload>({ type: FINANCE.snapshot })

/** One run over the engine, as the provider's `syncAll` does it: read what the result names, write the batches. */
function run(engine: Engine, newId: () => string, given: SyncResult, nowIso = NOW) {
	const existing = new Map(
		engine
			.queryEntities<TransactionPayload>({
				type: FINANCE.transaction,
				source: PLAID_SOURCE,
				externalIds: idsToRead(given),
			})
			.map((row) => [row.externalId!, row])
	)
	const out = syncOps({
		link: linkOf(engine),
		accounts: accountsOf(engine) as Account[],
		existing,
		result: given,
		nowIso,
		day: DAY,
		newId,
	})
	for (const chunk of out.chunks) engine.applyBatch(chunk)
	return out
}

describe('finance sync', () => {
	it('maps provider types to account kinds', () => {
		const cases: [string, string | null, string][] = [
			['depository', 'checking', 'checking'],
			['depository', 'cash management', 'checking'],
			['depository', 'prepaid', 'checking'],
			['depository', 'paypal', 'checking'],
			['depository', 'savings', 'savings'],
			['depository', 'money market', 'savings'],
			['depository', 'cd', 'savings'],
			['depository', 'hsa', 'savings'],
			['depository', 'ebt', 'checking'],
			['depository', null, 'checking'],
			['credit', 'credit card', 'credit-card'],
			['credit', 'paypal', 'credit-card'],
			['loan', 'mortgage', 'loan'],
			['loan', 'student', 'loan'],
			['investment', '401k', 'retirement'],
			['investment', 'roth 401k', 'retirement'],
			['investment', 'ira', 'retirement'],
			['investment', 'thrift savings plan', 'retirement'],
			['investment', 'hsa', 'retirement'],
			['investment', 'brokerage', 'investment'],
			['investment', null, 'investment'],
			['other', null, 'other'],
			['payroll', null, 'other'],
		]
		for (const [type, subtype, kind] of cases) expect(kindOf(type, subtype), `${type} ${subtype}`).toBe(kind)
	})

	it('applies a sync: accounts, balances, transactions, the cursor, and a replay that changes nothing', () => {
		const { engine, newId, closed } = setup()
		const first = run(
			engine,
			newId,
			result({
				accounts: [
					account({ providerAccountId: 'acc-checking', name: 'Checking', mask: '0000', current: '1204.5' }),
					account({
						providerAccountId: 'acc-credit',
						name: 'Card',
						kind: 'credit',
						subtype: 'credit card',
						mask: '4417',
						current: '410.12',
					}),
					account({
						providerAccountId: 'acc-yen',
						name: 'Yen',
						subtype: 'savings',
						mask: 'x12',
						currency: 'JPY',
						current: '84000',
					}),
					account({ providerAccountId: 'acc-closed', current: '5' }),
					account({ providerAccountId: 'acc-nocode', currency: null, current: '1' }),
				],
				added: [
					tx({
						id: 't1',
						amount: '4.5',
						pending: true,
						merchantName: 'Blue Bottle',
						category: 'FOOD_AND_DRINK_COFFEE',
					}),
					tx({ id: 't2', amount: '-2500', datetime: '2026-11-01T09:00:00Z' }),
					tx({ id: 't4', amount: '84000', currency: 'JPY', providerAccountId: 'acc-yen' }),
				],
			})
		)
		expect(first.skipped).toEqual(['finance:unsupported-currency'])

		// accounts: three new ones on the link, the closed one left closed and untouched
		const accounts = accountsOf(engine)
		const byProvider = (id: string) => accounts.find((entry) => entry.providerAccountId === id)!
		expect(accounts).toHaveLength(4)
		expect(byProvider('acc-closed')).toEqual(closed)
		expect(byProvider('acc-checking')).toMatchObject({
			name: 'Checking',
			kind: 'checking',
			currency: 'USD',
			institution: 'Chase',
			last4: '0000',
			share: WHOLE,
			balance: { minor: 120450, currency: 'USD' },
			balanceAt: NOW,
			lastSnapshot: { day: DAY },
		})
		expect(byProvider('acc-credit')).toMatchObject({ kind: 'credit-card', last4: '4417', balance: { minor: 41012 } })
		expect(byProvider('acc-yen')).toMatchObject({ kind: 'savings', balance: { minor: 84000, currency: 'JPY' } })
		expect(byProvider('acc-yen').last4).toBeUndefined()
		expect(snapshotsOf(engine).map((row) => row.payload.day)).toEqual([DAY, DAY, DAY])

		// transactions: the sign flipped, exact, in their own currency, keyed by the provider's id
		const rows = () => new Map(transactionsOf(engine).map((row) => [row.externalId, row]))
		const t = rows()
		expect([...t.keys()]).toEqual(['t1', 't2', 't4'])
		expect(t.get('t1')).toMatchObject({
			source: 'plaid',
			payload: {
				accountId: byProvider('acc-checking').id,
				amount: { minor: -450, currency: 'USD' },
				day: '2026-11-04',
				pending: true,
				merchantName: 'Blue Bottle',
				providerCategory: 'FOOD_AND_DRINK_COFFEE',
			},
		})
		expect(t.get('t2')!.payload).toMatchObject({ amount: { minor: 250000 }, datetime: '2026-11-01T09:00:00Z' })
		expect(t.get('t4')!.payload.amount).toEqual({ minor: -84000, currency: 'JPY' })

		// the link: fresh, with the cursor written in the last batch
		expect(first.chunks.at(-1)!.at(-1)).toMatchObject({ op: 'updateEntity', payload: { cursor: 'c1' } })
		expect(linkOf(engine)).toMatchObject({
			status: 'ok',
			lastSyncedAt: NOW,
			failures: 0,
			cursor: 'c1',
			consentExpiresAt: '2027-05-01T00:00:00Z',
		})

		// keys another feature owns: on the pending row and on a posted one
		engine.updateEntity(t.get('t1')!.id, { ...t.get('t1')!.payload, note: 'with Ana' })
		engine.updateEntity(t.get('t2')!.id, { ...t.get('t2')!.payload, note: 'November pay' })

		const second = result({
			accounts: [
				account({ providerAccountId: 'acc-checking', name: 'Checking', mask: '0000', current: '1100' }),
				account({ providerAccountId: 'acc-credit', name: 'Card', kind: 'credit', mask: '4417', current: '410.12' }),
				account({ providerAccountId: 'acc-yen', name: 'Yen', subtype: 'savings', currency: 'JPY', current: '84000' }),
			],
			added: [tx({ id: 't3', amount: '4.5', pendingTransactionId: 't1', date: '2026-11-05' })],
			modified: [tx({ id: 't2', amount: '-2500', name: 'ACME PAYROLL' })],
			removed: ['t1'],
			cursor: 'c2',
		})
		const later = '2026-11-06T16:00:00.000Z'
		run(engine, newId, second, later)

		const after = rows()
		expect([...after.keys()].sort()).toEqual(['t2', 't3', 't4'])
		expect(transactionsOf(engine).length).toBe(3)
		expect(engine.queryEntities({ type: FINANCE.transaction, includeDeleted: true })).toHaveLength(4)
		// modified: the provider's keys move, the owner's note stays, the account stays
		expect(after.get('t2')!.payload).toMatchObject({ name: 'ACME PAYROLL', note: 'November pay' })
		expect(after.get('t2')!.payload.datetime).toBeUndefined()
		// posted: the pending row's own keys carry over
		expect(after.get('t3')!.payload).toMatchObject({ note: 'with Ana', pending: false, day: '2026-11-05' })
		// a balance that moved today updates today's snapshot, not a second one
		expect(byProviderAfter(engine, 'acc-checking').balance).toEqual({ minor: 110000, currency: 'USD' })
		expect(snapshotsOf(engine)).toHaveLength(3)
		expect(linkOf(engine)).toMatchObject({ cursor: 'c2', lastSyncedAt: later })

		// the same result again changes nothing
		const before = JSON.stringify([
			linkOf(engine),
			accountsOf(engine),
			transactionsOf(engine).map((row) => row.payload),
			snapshotsOf(engine).map((row) => row.payload),
		])
		const replay = run(engine, newId, second, later)
		expect(replay.chunks).toEqual([])
		expect(
			JSON.stringify([
				linkOf(engine),
				accountsOf(engine),
				transactionsOf(engine).map((row) => row.payload),
				snapshotsOf(engine).map((row) => row.payload),
			])
		).toBe(before)
	})

	it('a posted row replaces its pending one with the owner keys and pointers', () => {
		const { engine, newId } = setup()
		const accounts = [
			account({ providerAccountId: 'acc-checking' }),
			account({ providerAccountId: 'acc-savings', subtype: 'savings' }),
		]
		run(
			engine,
			newId,
			result({
				accounts,
				added: [
					tx({ id: 'p1', amount: '100', pending: true, name: 'REI #12' }),
					tx({ id: 'p2', amount: '500', pending: true, category: 'TRANSFER_OUT_SAVINGS' }),
					tx({ id: 's1', amount: '-500', providerAccountId: 'acc-savings', category: 'TRANSFER_IN_SAVINGS' }),
					tx({ id: 'v1', amount: '-30', name: 'VENMO PAYMENT ANA LEE', date: '2026-11-05' }),
				],
			})
		)
		classify(engine, newId)
		const byExternal = (id: string) => transactionsOf(engine).find((row) => row.externalId === id)!
		const category = (key: string) =>
			engine.queryEntities<CategoryPayload>({ type: FINANCE.category }).find((row) => row.payload.key === key)!.id
		expect(byExternal('p2').payload.transferId).toBe(byExternal('s1').id)

		// the owner's keys on the pending row: a category, a split, a reimbursable part, and a repayment for it
		const usd = (minor: number) => ({ minor, currency: 'USD' })
		const ctx = { rows: [], merchants: [], rules: [], newId, nowIso: NOW }
		engine.applyBatch(recategoriseOps(byExternal('p1'), category('shopping'), false, ctx).ops)
		const parts = [
			{ amount: usd(-6000), categoryId: category('groceries') },
			{ amount: usd(-4000), categoryId: category('home') },
		]
		for (const edit of [
			() => splitOps(byExternal('p1'), parts),
			() => reimbursableOps(byExternal('p1'), usd(9500)),
			() => repaymentOps(byExternal('p1'), byExternal('v1')),
		]) {
			const made = edit()
			if ('error' in made) throw new Error(made.error)
			engine.applyBatch(made.ops)
		}
		const pending = { p1: byExternal('p1').id, p2: byExternal('p2').id }
		expect(byExternal('v1').payload.repays).toBe(pending.p1)

		// posted, the purchase for less, the transfer for the same
		run(
			engine,
			newId,
			result({
				accounts,
				added: [
					tx({ id: 'q1', amount: '90', pendingTransactionId: 'p1', name: 'REI #12', date: '2026-11-05' }),
					tx({ id: 'q2', amount: '500', pendingTransactionId: 'p2', category: 'TRANSFER_OUT_SAVINGS' }),
				],
				removed: ['p1', 'p2'],
				cursor: 'c2',
			})
		)
		classify(engine, newId)
		const q1 = byExternal('q1')
		expect(q1.payload).toMatchObject({
			replaced: pending.p1,
			categoryId: category('shopping'),
			categoryBy: 'owner',
			parts: [{ amount: usd(-5000) }, { amount: usd(-4000) }],
			reimbursable: usd(9000),
		})
		expect(byExternal('q2').payload).toMatchObject({ replaced: pending.p2, transferId: byExternal('s1').id })
		expect(byExternal('s1').payload.transferId).toBe(byExternal('q2').id)
		expect(byExternal('v1').payload).toMatchObject({ repays: q1.id, kind: 'refund' })
		expect(classify(engine, newId).ops).toEqual([])
	})

	it('applies a sync in batches of 500, the link last', () => {
		const { engine, newId } = setup()
		const added = Array.from({ length: CHUNK + 100 }, (_, index) => tx({ id: `t${index}`, amount: '1' }))
		const out = run(engine, newId, result({ accounts: [account({ providerAccountId: 'acc-checking' })], added }))
		expect(out.chunks.map((chunk) => chunk.length)).toEqual([CHUNK, 102])
		expect(out.chunks[1]!.at(-1)).toMatchObject({ op: 'updateEntity', payload: { cursor: 'c1' } })
		expect(transactionsOf(engine)).toHaveLength(CHUNK + 100)
	})

	it('link after a run', () => {
		const link: ProviderLink = {
			id: 'L',
			provider: 'plaid',
			institution: { name: 'Chase' },
			status: 'error',
			failures: 4,
			lastErrorCode: 'network',
			cursor: 'c0',
		}
		expect(linkAfterSync(link, { consentExpiresAt: '2027-01-01T00:00:00Z', cursor: 'c1' }, NOW)).toEqual({
			id: 'L',
			provider: 'plaid',
			institution: { name: 'Chase' },
			status: 'ok',
			failures: 0,
			lastSyncedAt: NOW,
			consentExpiresAt: '2027-01-01T00:00:00Z',
			cursor: 'c1',
		})

		const ok: ProviderLink = { ...link, status: 'ok', failures: 0, lastErrorCode: undefined }
		const cases: [ProviderLink, string, Partial<ProviderLink>][] = [
			[ok, 'needs-reauth', { status: 'needs-reauth', failures: 1, lastErrorCode: 'needs-reauth' }],
			[ok, 'network', { status: 'ok', failures: 1, lastErrorCode: 'network' }],
			[{ ...ok, failures: 1 }, 'rate-limited', { status: 'ok', failures: 2, lastErrorCode: 'rate-limited' }],
			[{ ...ok, failures: 2 }, 'provider-down', { status: 'error', failures: 3, lastErrorCode: 'provider-down' }],
			[{ ...ok, failures: 5, status: 'error' }, 'network', { status: 'error', failures: 6 }],
			[{ ...ok, status: 'needs-reauth', failures: 1 }, 'network', { status: 'needs-reauth', failures: 2 }],
		]
		for (const [given, code, expected] of cases)
			expect(linkAfterFailure(given, code), `${given.status} ${given.failures} ${code}`).toMatchObject(expected)
	})

	it('retry delays', () => {
		const MINUTE = 60 * 1000
		const cases: [number, number | undefined][] = [
			[0, undefined],
			[1, MINUTE],
			[2, 5 * MINUTE],
			[3, 15 * MINUTE],
			[4, 30 * MINUTE],
			[5, undefined],
			[12, undefined],
		]
		for (const [failures, delay] of cases) expect(retryDelay(failures), `${failures}`).toBe(delay)
	})

	it('link signals', () => {
		const now = Date.parse(NOW)
		const base: ProviderLink = {
			id: 'L',
			provider: 'plaid',
			institution: { name: 'Chase' },
			status: 'ok',
			lastSyncedAt: NOW,
		}
		const inDays = (days: number) => new Date(now + days * 24 * HOUR).toISOString()
		const cases: [ProviderLink, ReturnType<typeof linkSignal>][] = [
			[
				{ ...base, status: 'needs-reauth' },
				{ reason: 'needs-reauth', dedupeKey: `L:needs-reauth:${NOW}` },
			],
			[
				{ ...base, consentExpiresAt: inDays(3) },
				{ reason: 'expiring', by: '2026-11-09', dedupeKey: `L:expiring:${inDays(3)}` },
			],
			[
				{ ...base, consentExpiresAt: inDays(7) },
				{ reason: 'expiring', by: '2026-11-13', dedupeKey: `L:expiring:${inDays(7)}` },
			],
			[{ ...base, consentExpiresAt: inDays(8) }, undefined],
			[base, undefined],
			[{ ...base, status: 'error', failures: 3 }, undefined],
		]
		for (const [link, expected] of cases)
			expect(linkSignal(link, now), `${link.status} ${link.consentExpiresAt}`).toEqual(expected)
	})

	it('revokes a removed link only once its undo has passed', () => {
		const now = Date.parse(NOW)
		const ago = (ms: number) => new Date(now - ms).toISOString()
		const row = (id: string, deletedAt: string | null, provider = 'plaid') => ({
			id,
			deletedAt,
			payload: { provider },
		})
		const rows = [
			row('live', null),
			row('just-removed', ago(30 * 1000)),
			row('almost', ago(REVOKE_AFTER - 1)),
			row('due', ago(REVOKE_AFTER)),
			row('long-gone', ago(3 * HOUR)),
			row('manual', ago(3 * HOUR), 'manual'),
		]
		expect(linksToRevoke(rows, now)).toEqual(['due', 'long-gone'])
	})
})

/** The classification pass over the engine, as the store's `classify()` runs it after a sync. */
function classify(engine: Engine, newId: () => string) {
	const out = classifyPass({
		transactions: transactionsOf(engine),
		categories: engine.queryEntities<CategoryPayload>({ type: FINANCE.category, includeDeleted: true }),
		rules: engine.queryEntities<RulePayload>({ type: FINANCE.rule }),
		merchants: engine.queryEntities<MerchantPayload>({ type: FINANCE.merchant }),
		accounts: accountsOf(engine) as Account[],
		name: (key) => key,
		newId,
	})
	if (out.ops.length) engine.applyBatch(out.ops)
	return out
}

function byProviderAfter(engine: Engine, id: string) {
	return accountsOf(engine).find((entry) => entry.providerAccountId === id)!
}
