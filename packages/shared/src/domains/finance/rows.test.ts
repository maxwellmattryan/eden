import { describe, expect, it } from 'vitest'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import type { BatchOp } from '../../data/index.js'
import { createIdGenerator, isUlid } from '../../data/ulid.js'
import { addMoney, money, negate } from '../../money/index.js'
import { accountTotals, balanceOps, closeOps, payloadOf, removeLinkOps, reopenOps, replaceOps } from './accounts.js'
import { financeFromRows, financeRows, financeUris } from './rows.js'
import { seedData } from './seed.js'
import { FINANCE, type Account, type SnapshotPayload } from './types.js'

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

const NOW = Date.parse('2026-09-30T15:00:00Z')

function seeded() {
	const engine = createEngine(memory())
	const newId = createIdGenerator()
	const written = financeRows(seedData(NOW), newId)
	engine.applyBatch(written.ops)
	return { engine, newId, written }
}

function readBack(engine: ReturnType<typeof createEngine>) {
	return financeFromRows({
		links: engine.queryEntities({ type: FINANCE.link }),
		accounts: engine.queryEntities({ type: FINANCE.account }),
		assets: engine.queryEntities({ type: FINANCE.asset }),
	} as Parameters<typeof financeFromRows>[0])
}

const snapshotsOf = (engine: ReturnType<typeof createEngine>, accountId: string) =>
	(engine.queryEntities({ type: FINANCE.snapshot }) as { payload: SnapshotPayload }[])
		.map((row) => row.payload)
		.filter((snapshot) => snapshot.accountId === accountId)

describe('finance rows', () => {
	it('reads the seed back as written, with new ids that the pointers follow', () => {
		const { engine, written } = seeded()
		const { snapshots, ...held } = written.data
		expect(readBack(engine)).toEqual(held)

		const ids = [...held.links, ...held.accounts, ...held.assets, ...snapshots!].map((record) => record.id)
		expect(ids.every(isUlid)).toBe(true)
		expect(new Set(ids).size).toBe(ids.length)
		const chase = held.links.find((link) => link.institution.name === 'Chase')!
		expect(held.accounts.filter((account) => account.linkId === chase.id)).toHaveLength(3)
		for (const account of held.accounts) {
			expect(snapshots!.find((snapshot) => snapshot.id === account.lastSnapshot?.id)?.accountId).toBe(account.id)
		}
		expect(financeUris(written.data)).toHaveLength(written.ops.length)
		expect(financeRows({}, createIdGenerator()).ops).toEqual([])
	})

	it('keeps one snapshot a day: a second balance that day updates it, the next day adds one', () => {
		const { engine, newId } = seeded()
		let account = readBack(engine).accounts.find((entry) => entry.currency === 'JPY')!
		const day = account.lastSnapshot!.day

		const first = balanceOps(account, money(90000, 'JPY'), '2026-09-30T16:00:00Z', day, newId)
		engine.applyBatch(first.ops)
		account = first.account
		const second = balanceOps(account, money(91000, 'JPY'), '2026-09-30T17:00:00Z', day, newId)
		engine.applyBatch(second.ops)
		expect(snapshotsOf(engine, account.id)).toEqual([{ accountId: account.id, day, balance: money(91000, 'JPY') }])

		const next = balanceOps(second.account, money(92000, 'JPY'), '2026-10-01T09:00:00Z', '2026-10-01', newId)
		engine.applyBatch(next.ops)
		expect(snapshotsOf(engine, account.id).map((snapshot) => [snapshot.day, snapshot.balance.minor])).toEqual([
			[day, 91000],
			['2026-10-01', 92000],
		])
		expect(readBack(engine).accounts.find((entry) => entry.id === account.id)?.balance).toEqual(money(92000, 'JPY'))

		// the way back from the next day's balance takes its snapshot away and puts the balance back
		engine.applyBatch(next.inverse)
		expect(snapshotsOf(engine, account.id)).toHaveLength(1)
		expect(readBack(engine).accounts.find((entry) => entry.id === account.id)?.balance).toEqual(money(91000, 'JPY'))
	})

	it('makes a new account and its first snapshot in one write, and takes both back', () => {
		const { engine, newId } = seeded()
		const draft: Account = { id: newId(), name: 'Wallet', kind: 'cash', currency: 'USD', share: 10000 }
		const made = balanceOps(draft, money(4200, 'USD'), '2026-09-30T16:00:00Z', '2026-09-30', newId, {
			created: true,
		})
		engine.applyBatch(made.ops)
		expect(readBack(engine).accounts.find((entry) => entry.id === draft.id)?.balance).toEqual(money(4200, 'USD'))
		expect(snapshotsOf(engine, draft.id)).toHaveLength(1)
		engine.applyBatch(made.inverse)
		expect(readBack(engine).accounts.some((entry) => entry.id === draft.id)).toBe(false)
		expect(snapshotsOf(engine, draft.id)).toHaveLength(0)
	})

	it('removes a link: closes only its open accounts and tombstones it, and the way back restores both', () => {
		const { engine } = seeded()
		const before = readBack(engine)
		const chase = before.links.find((link) => link.institution.name === 'Chase')!
		// one of Chase's accounts was closed already, and stays as it was
		const auto = before.accounts.find((account) => account.kind === 'loan')!
		engine.applyBatch([{ op: 'updateEntity', id: auto.id, payload: { ...payloadOf(auto), closedOn: '2026-09-01' } }])
		const held = readBack(engine)

		const removal = removeLinkOps(chase, held.accounts, '2026-09-30')
		expect(removal.closed).toHaveLength(2)
		engine.applyBatch(removal.ops)
		const after = readBack(engine)
		expect(after.links.some((link) => link.id === chase.id)).toBe(false)
		const closedOn = (accounts: Account[]) =>
			accounts.filter((account) => account.linkId === chase.id).map((account) => [account.kind, account.closedOn])
		expect(closedOn(after.accounts)).toEqual([
			['checking', '2026-09-30'],
			['credit-card', '2026-09-30'],
			['loan', '2026-09-01'],
		])
		// the other links' accounts are untouched, and Chase's keep their balances
		expect(after.accounts.filter((account) => account.linkId !== chase.id)).toEqual(
			held.accounts.filter((account) => account.linkId !== chase.id)
		)
		expect(after.accounts.map((account) => account.balance)).toEqual(held.accounts.map((account) => account.balance))

		engine.applyBatch(removal.inverse)
		expect(readBack(engine)).toEqual(held)
	})

	it('closes an account out of every total, and reopening it counts it again', () => {
		const { engine } = seeded()
		const held = readBack(engine)
		const totals = (data: ReturnType<typeof readBack>) => accountTotals({ ...data, home: 'USD', now: NOW })
		const checking = held.accounts.find((account) => account.kind === 'checking')!

		const closed = closeOps(checking, '2026-09-30')
		engine.applyBatch(closed.ops)
		const after = readBack(engine)
		expect(after.accounts.find((account) => account.id === checking.id)?.closedOn).toBe('2026-09-30')
		expect(totals(after).assets).toEqual(addMoney(totals(held).assets, negate(checking.balance!)))
		expect(totals(after).debts).toEqual(totals(held).debts)

		const reopened = reopenOps(closed.account)
		engine.applyBatch(reopened.ops)
		const back = readBack(engine)
		expect(back.accounts.find((account) => account.id === checking.id)?.closedOn).toBeUndefined()
		expect(back).toEqual(held)
		expect(totals(back)).toEqual(totals(held))

		// each way back undoes its own step
		engine.applyBatch(reopened.inverse)
		expect(readBack(engine).accounts.find((account) => account.id === checking.id)?.closedOn).toBe('2026-09-30')
		engine.applyBatch(closed.inverse)
		expect(readBack(engine)).toEqual(held)
	})

	it('replaces an account: sets replaces, closes the old one, and the way back undoes both', () => {
		const { engine, newId } = seeded()
		const held = readBack(engine)
		const old = held.accounts.find((account) => account.kind === 'checking')!
		const fresh: Account = { id: newId(), name: 'New checking', kind: 'checking', currency: 'USD', share: 10000 }
		const create: BatchOp = {
			op: 'createEntity',
			input: { id: fresh.id, type: FINANCE.account, payload: payloadOf(fresh) },
		}
		engine.applyBatch([create])
		const withFresh = readBack(engine)
		const replaced = replaceOps(
			withFresh.accounts.find((account) => account.id === fresh.id)!,
			old,
			'2026-09-30'
		)
		engine.applyBatch(replaced.ops)
		const after = readBack(engine)
		expect(after.accounts.find((account) => account.id === fresh.id)?.replaces).toBe(old.id)
		expect(after.accounts.find((account) => account.id === old.id)?.closedOn).toBe('2026-09-30')

		engine.applyBatch(replaced.inverse)
		expect(readBack(engine)).toEqual(withFresh)
	})
})
