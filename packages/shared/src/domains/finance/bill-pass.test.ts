import { describe, expect, it } from 'vitest'
import type { BatchOp, Entity, TaskRow } from '../../data/index.js'
import type { Money } from '../../money/index.js'
import { billPassOps, type BillPassInput } from './bill-pass.js'
import type { BillPayload, TransactionPayload } from './types.js'

const usd = (minor: number): Money => ({ minor, currency: 'USD' })
const TODAY = '2026-09-30'
const NOW = '2026-09-30T08:00:00.000Z'

const entity = <T>(type: string, id: string, payload: T, deletedAt: string | null = null): Entity<T> => ({
	id,
	uri: `eden://${type}/${id}`,
	type,
	payload,
	createdAt: '',
	updatedAt: '',
	deletedAt,
	mirror: false,
	source: null,
	externalId: null,
	snapshot: null,
	links: [],
})
const bill = (id: string, fields: Partial<BillPayload> = {}, deletedAt: string | null = null) =>
	entity<BillPayload>(
		'bill',
		id,
		{
			payee: 'Texas Gas Service',
			period: '2026-09',
			due: '2026-10-01',
			amount: usd(3810),
			source: 'manual',
			...fields,
		},
		deletedAt
	)
const tx = (id: string, minor: number, fields: Partial<TransactionPayload> = {}) =>
	entity<TransactionPayload>('transaction', id, {
		accountId: 'chk',
		amount: usd(minor),
		day: '2026-09-29',
		name: 'TXGAS SVC',
		pending: false,
		...fields,
	})
const task = (id: string, fields: Partial<TaskRow> = {}) =>
	({ id, uri: `eden://task/${id}`, kind: 'todo', due: '2026-10-01', done: false, ...fields }) as TaskRow
const about = (taskId: string, billId: string) => ({
	owner: `eden://task/${taskId}`,
	uri: `eden://bill/${billId}`,
	relation: 'about' as const,
})

function run(given: Partial<BillPassInput>) {
	let n = 0
	return billPassOps({
		bills: [],
		rows: [],
		aboutLinks: [],
		tasks: [],
		today: TODAY,
		nowIso: NOW,
		newId: () => `new-${(n += 1)}`,
		title: (payee) => `Pay ${payee}`,
		dayLabel: (day) => `day ${day}`,
		...given,
	})
}
const ofType = (ops: BatchOp[], op: BatchOp['op']) => ops.filter((entry) => entry.op === op)

describe('bill pass', () => {
	it('creates one task for a bill that enters Due soon, and its signal', () => {
		const out = run({ bills: [bill('b1')] })
		expect(ofType(out.ops, 'createPrimitive')).toEqual([
			{
				op: 'createPrimitive',
				type: 'task',
				input: {
					id: 'new-1',
					kind: 'todo',
					title: 'Pay Texas Gas Service',
					due: '2026-10-01',
					priority: 'none',
					links: [{ uri: 'eden://bill/b1', relation: 'about', label: 'Texas Gas Service' }],
				},
			},
		])
		expect(out.bills[0]!.task).toEqual({ id: 'new-1', due: '2026-10-01' })
		expect(out.created).toEqual(['new-1'])
		expect(out.signals).toEqual([
			{
				name: 'finance.bill-due',
				payload: { uris: ['eden://bill/b1'], payee: 'Texas Gas Service', dueDay: 'day 2026-10-01' },
				dedupeKey: 'b1:due:2026-10-01',
			},
		])
		// the task is undone before the bill it links to
		expect(out.inverse[0]).toEqual({ op: 'delete', uri: 'eden://task/new-1' })
	})

	it('an overdue bill gets a task and the overdue signal; an upcoming or expected one neither', () => {
		const out = run({
			bills: [
				bill('late', { due: '2026-09-26' }),
				bill('later', { due: '2026-10-10', payee: 'Water' }),
				bill('eob', { due: undefined, payee: 'Seton' }),
			],
		})
		expect(out.created).toEqual(['new-1'])
		expect(out.signals).toEqual([
			{
				name: 'finance.bill-overdue',
				payload: { uris: ['eden://bill/late'], payee: 'Texas Gas Service', dueDay: 'day 2026-09-26' },
				dedupeKey: 'late:overdue:2026-09-26',
			},
		])
	})

	it('never remakes a task the owner deleted or finished for the same due day', () => {
		const recorded = bill('b1', { task: { id: 'gone', due: '2026-10-01' } })
		const out = run({ bills: [recorded], tasks: [task('done', { done: true })], aboutLinks: [about('done', 'b1')] })
		expect(ofType(out.ops, 'createPrimitive')).toEqual([])
		expect(out.ops).toEqual([])
		// nor when another open todo is already about the bill
		const gardener = run({ bills: [bill('b2')], tasks: [task('g')], aboutLinks: [about('g', 'b2')] })
		expect(gardener.created).toEqual([])
	})

	it("moves an open task with its bill's due day", () => {
		const out = run({
			bills: [bill('b1', { due: '2026-10-03', task: { id: 't1', due: '2026-10-01' } })],
			tasks: [task('t1')],
			aboutLinks: [about('t1', 'b1')],
		})
		expect(ofType(out.ops, 'updatePrimitive')).toEqual([
			{ op: 'updatePrimitive', type: 'task', id: 't1', patch: { due: '2026-10-03' } },
		])
		expect(out.bills[0]!.task).toEqual({ id: 't1', due: '2026-10-03' })
		expect(out.created).toEqual([])
		// a task that is gone gives way to a new one for the new day
		const remade = run({ bills: [bill('b1', { due: '2026-10-03', task: { id: 't1', due: '2026-10-01' } })] })
		expect(remade.created).toEqual(['new-1'])
	})

	it('completes every open todo about a settled bill, whoever made it', () => {
		const out = run({
			bills: [bill('b1', { task: { id: 't1', due: '2026-10-01' } })],
			rows: [tx('p1', -3810)],
			tasks: [task('t1'), task('g1'), task('old', { done: true }), task('r1', { kind: 'routine' })],
			aboutLinks: [about('t1', 'b1'), about('g1', 'b1'), about('old', 'b1'), about('r1', 'b1')],
		})
		expect(out.completed).toEqual(['t1', 'g1'])
		expect(ofType(out.ops, 'updatePrimitive')).toEqual([
			{ op: 'updatePrimitive', type: 'task', id: 't1', patch: { done: true, completedAt: NOW } },
			{ op: 'updatePrimitive', type: 'task', id: 'g1', patch: { done: true, completedAt: NOW } },
		])
		expect(out.inverse).toContainEqual({
			op: 'updatePrimitive',
			type: 'task',
			id: 't1',
			patch: { done: false, completedAt: null },
		})
		expect(out.rowsChanged).toBe(true)
		expect(ofType(out.ops, 'updateEntity')).toContainEqual({
			op: 'updateEntity',
			id: 'p1',
			payload: expect.objectContaining({ billId: 'b1' }),
		})
		expect(out.signals).toEqual([])
	})

	it('creates the next occurrence of a settled repeating bill, once', () => {
		const rent = bill('r1', {
			payee: 'Rent',
			amount: usd(185000),
			repeat: { months: 1 },
			fixed: true,
			seriesId: 'r1',
			payments: [{ amount: usd(185000), day: TODAY }],
		})
		const out = run({ bills: [rent] })
		expect(ofType(out.ops, 'createEntity')).toEqual([
			{
				op: 'createEntity',
				input: {
					id: 'new-1',
					type: 'bill',
					payload: {
						payee: 'Rent',
						period: '2026-10',
						due: '2026-11-01',
						amount: usd(185000),
						fixed: true,
						source: 'repeating',
						repeat: { months: 1 },
						seriesId: 'r1',
					},
				},
			},
		])
		// a second pass over the result makes nothing more
		const { id: _id, ...next } = out.bills.find((entry) => entry.id === 'new-1')!
		const again = run({ bills: [rent, bill('oct', next)] })
		expect(ofType(again.ops, 'createEntity')).toEqual([])
		// a deleted latest occurrence ends the series, even once it is past due
		const ended = run({ bills: [rent, bill('oct', next, NOW)], today: '2026-11-20' })
		expect(ofType(ended.ops, 'createEntity')).toEqual([])
		// an occurrence left past due rolls the series on
		expect(ofType(run({ bills: [rent, bill('oct', next)], today: '2026-11-02' }).ops, 'createEntity')).toHaveLength(1)
	})

	it("records a statement's interest since the previous statement", () => {
		const card = { accountId: 'card', source: 'statement' as const, amount: usd(120418), due: '2026-10-12' }
		const out = run({
			bills: [
				bill('aug', {
					...card,
					statementDay: '2026-08-14',
					period: '2026-08',
					payments: [{ amount: usd(120418), day: '2026-09-01' }],
				}),
				bill('sep', { ...card, statementDay: '2026-09-14' }),
			],
			rows: [
				tx('i1', -1240, { accountId: 'card', kind: 'interest-charged', day: '2026-09-14' }),
				tx('i0', -999, { accountId: 'card', kind: 'interest-charged', day: '2026-08-14' }),
				tx('x', -500, { accountId: 'chk', kind: 'interest-charged', day: '2026-09-01' }),
			],
		})
		expect(out.bills.find((entry) => entry.id === 'sep')!.interest).toEqual(usd(1240))
		expect(out.bills.find((entry) => entry.id === 'aug')!.interest).toEqual(usd(999))
	})

	it('never puts an amount in a task title or a signal payload', () => {
		const out = run({
			bills: [bill('b1', { amount: usd(424242) }), bill('b2', { due: '2026-09-20', amount: usd(515151) })],
		})
		const text = JSON.stringify([out.signals, ofType(out.ops, 'createPrimitive')])
		expect(text).not.toMatch(/4242|5151|\$/)
	})
})
