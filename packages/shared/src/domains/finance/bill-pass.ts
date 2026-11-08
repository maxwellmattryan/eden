// The bill pass (product/domains/finance.md §6, D-195, D-186), pure so it is tested here: over every bill and the live
// transactions, in order, a card statement's interest since the previous statement, the matching of payments, the
// roll-forward of each series, the bill's Today task (created when it is due soon or overdue, moved with its due day,
// closed once it is settled) and the signals. The store runs it in one queue job; the ops come with their inverse, so
// an owner's Mark paid takes back what the pass made of it in the same undo. No amount is in a task's title or a
// signal's payload.
import { toUri, type BatchOp, type Entity, type Link, type TaskRow } from '../../data/index.js'
import { money } from '../../money/index.js'
import {
	addMonthsClamped,
	billCreateOp,
	billState,
	billUpdateOp,
	nextOccurrence,
	seriesOf,
	settled,
	type SeriesBill,
} from './bills.js'
import { matchOps } from './match.js'
import { same } from './sync.js'
import { FINANCE, type Bill, type BillPayload, type TransactionPayload } from './types.js'

export const BILL_SIGNALS = { due: 'finance.bill-due', overdue: 'finance.bill-overdue' } as const

export interface BillSignal {
	name: (typeof BILL_SIGNALS)[keyof typeof BILL_SIGNALS]
	/** The bill, its payee and its due day as written; never an amount. */
	payload: { uris: [string]; payee: string; dueDay: string }
	dedupeKey: string
}

export interface BillPassInput {
	/** Every bill row, the tombstoned ones too: a deleted latest occurrence ends its series. */
	bills: readonly Entity<BillPayload>[]
	/** The live transactions. */
	rows: readonly Entity<TransactionPayload>[]
	/** The live `about` links. */
	aboutLinks: readonly Pick<Link, 'owner' | 'uri' | 'relation'>[]
	/** The live tasks. */
	tasks: readonly Pick<TaskRow, 'id' | 'uri' | 'kind' | 'due' | 'done'>[]
	today: string
	nowIso: string
	newId: () => string
	/** A bill's task title: "Pay Texas Gas Service". */
	title: (payee: string) => string
	/** A due day as a signal carries it: "Thu 1 Oct". */
	dayLabel: (day: string) => string
}

export interface BillPassOut {
	ops: BatchOp[]
	/** What takes the ops back, in order. */
	inverse: BatchOp[]
	/** The live bills after the pass. */
	bills: Bill[]
	/** The tasks the pass created and completed, by id. */
	created: string[]
	completed: string[]
	signals: BillSignal[]
	/** A transaction took a bill's id: the classification pass follows. */
	rowsChanged: boolean
}

/** How many occurrences one pass makes for a series that is behind. */
const MAX_ROLL = 12

const withId = (row: Entity<BillPayload>): Bill => ({ ...row.payload, id: row.id })
const billUri = (id: string) => toUri(FINANCE.bill, id)

/** A card statement's interest: the `interest-charged` rows on the card since the previous statement. */
function interestOf(bill: Bill, bills: readonly Bill[], rows: readonly Entity<TransactionPayload>[]) {
	if (!bill.accountId || !bill.statementDay) return undefined
	const day = bill.statementDay
	const previous = bills
		.filter((other) => other.accountId === bill.accountId && other.statementDay && other.statementDay < day)
		.map((other) => other.statementDay!)
		.sort()
		.at(-1)
	const since = previous ?? addMonthsClamped(day, -1)
	let minor = 0
	for (const row of rows) {
		const tx = row.payload
		if (tx.accountId !== bill.accountId || tx.kind !== 'interest-charged' || tx.pending) continue
		if (tx.amount.currency !== bill.amount.currency || tx.day <= since || tx.day > day) continue
		minor += -tx.amount.minor
	}
	return minor > 0 ? money(minor, bill.amount.currency) : undefined
}

export function billPassOps(input: BillPassInput): BillPassOut {
	const { today, nowIso, newId } = input
	const original = new Map(input.bills.filter((row) => !row.deletedAt).map((row) => [row.id, withId(row)]))
	const deleted = input.bills
		.filter((row) => row.deletedAt)
		.map((row): SeriesBill => ({ ...withId(row), deleted: true }))

	// statement interest
	let live = [...original.values()].map((bill) => {
		const interest = interestOf(bill, [...original.values()], input.rows)
		if (same(interest, bill.interest)) return bill
		const next = { ...bill }
		if (interest) next.interest = interest
		else delete next.interest
		return next
	})

	// matching
	const matched = matchOps(live, input.rows)
	live = matched.bills
	const rowOps: BatchOp[] = []
	const rowInverse: BatchOp[] = []
	const rowsBefore = new Map(input.rows.map((row) => [row.id, row]))
	for (const row of matched.rows) {
		rowOps.push({ op: 'updateEntity', id: row.id, payload: row.payload })
		rowInverse.push({ op: 'updateEntity', id: row.id, payload: rowsBefore.get(row.id)!.payload })
	}

	// series roll-forward
	const made: Bill[] = []
	const seriesIds = new Set(live.filter((bill) => bill.repeat || bill.seriesId).map(seriesOf))
	for (const id of seriesIds) {
		for (let turn = 0; turn < MAX_ROLL; turn += 1) {
			const series: SeriesBill[] = [
				...live.filter((bill) => seriesOf(bill) === id),
				...deleted.filter((bill) => seriesOf(bill) === id),
			]
			const next = nextOccurrence(series, today, newId)
			if (!next) break
			live.push(next)
			made.push(next)
		}
	}

	// tasks
	const taskOps: BatchOp[] = []
	const taskInverse: BatchOp[] = []
	const created: string[] = []
	const completed: string[] = []
	const tasks = new Map(input.tasks.map((task) => [task.id, task]))
	const tasksByUri = new Map(input.tasks.map((task) => [task.uri, task]))
	const linked = new Map<string, Pick<TaskRow, 'id' | 'uri' | 'kind' | 'due' | 'done'>[]>()
	for (const link of input.aboutLinks) {
		if (link.relation !== 'about') continue
		const task = tasksByUri.get(link.owner)
		if (!task) continue
		const list = linked.get(link.uri) ?? []
		if (!list.some((entry) => entry.id === task.id)) list.push(task)
		linked.set(link.uri, list)
	}
	const openTodo = (task?: Pick<TaskRow, 'kind' | 'done'>) => Boolean(task && task.kind === 'todo' && !task.done)
	const signals: BillSignal[] = []
	live = live.map((bill) => {
		const uri = billUri(bill.id)
		const state = billState(bill, today)
		if (settled(bill)) {
			for (const task of linked.get(uri) ?? []) {
				if (!openTodo(task) || completed.includes(task.id)) continue
				completed.push(task.id)
				taskOps.push({ op: 'updatePrimitive', type: 'task', id: task.id, patch: { done: true, completedAt: nowIso } })
				taskInverse.push({
					op: 'updatePrimitive',
					type: 'task',
					id: task.id,
					patch: { done: false, completedAt: null },
				})
			}
			return bill
		}
		const due = bill.due
		if (!due) return bill
		const own = bill.task ? tasks.get(bill.task.id) : undefined
		if (bill.task && bill.task.due !== due && own && openTodo(own)) {
			// the due day moved: so does the open task
			taskOps.push({ op: 'updatePrimitive', type: 'task', id: own.id, patch: { due } })
			taskInverse.push({ op: 'updatePrimitive', type: 'task', id: own.id, patch: { due: own.due } })
			bill = { ...bill, task: { id: own.id, due } }
		}
		if (state === 'due-soon' || state === 'overdue') {
			const recorded = bill.task?.due === due
			const another = (linked.get(uri) ?? []).some((task) => openTodo(task))
			if (!recorded && !another) {
				const id = newId()
				created.push(id)
				taskOps.push({
					op: 'createPrimitive',
					type: 'task',
					input: {
						id,
						kind: 'todo',
						title: input.title(bill.payee),
						due,
						priority: 'none',
						links: [{ uri, relation: 'about', label: bill.payee }],
					},
				})
				taskInverse.push({ op: 'delete', uri: toUri('task', id) })
				bill = { ...bill, task: { id, due } }
			}
			const name = state === 'due-soon' ? BILL_SIGNALS.due : BILL_SIGNALS.overdue
			signals.push({
				name,
				payload: { uris: [uri], payee: bill.payee, dueDay: input.dayLabel(due) },
				dedupeKey: `${bill.id}:${state === 'due-soon' ? 'due' : 'overdue'}:${due}`,
			})
		}
		return bill
	})

	// the bills' writes: the new occurrences, then each bill that changed
	const billOps: BatchOp[] = []
	const billInverse: BatchOp[] = []
	const isNew = new Set(made.map((bill) => bill.id))
	for (const bill of live) {
		if (isNew.has(bill.id)) {
			billOps.push(billCreateOp(bill))
			// marked before it goes, so the tombstone an undo leaves ends no series
			billInverse.push(billUpdateOp({ ...bill, undone: true }), { op: 'delete', uri: billUri(bill.id) })
			continue
		}
		const was = original.get(bill.id)!
		if (same(bill, was)) continue
		billOps.push(billUpdateOp(bill))
		billInverse.push(billUpdateOp(was))
	}
	// a task is linked to its bill: the bill is made first, the task's undo goes before the bill's
	return {
		ops: [...billOps, ...rowOps, ...taskOps],
		inverse: [...taskInverse, ...rowInverse, ...billInverse],
		bills: live,
		created,
		completed,
		signals,
		rowsChanged: rowOps.length > 0,
	}
}
