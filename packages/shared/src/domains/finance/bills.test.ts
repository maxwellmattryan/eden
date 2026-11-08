import { describe, expect, it } from 'vitest'
import type { Money } from '../../money/index.js'
import {
	addMonthsClamped,
	billDraftOf,
	billFromDraft,
	billGroups,
	billOps,
	billState,
	deleteBillOps,
	draftOfBill,
	draftOver,
	estimateOf,
	nextOccurrence,
	overpaidOf,
	remainingOf,
	sameBill,
	settled,
	type BillState,
	type SeriesBill,
} from './bills.js'
import { WHOLE, type Account, type Bill, type BillPayment } from './types.js'
import { billChip, billSecondary } from './words.js'

const usd = (minor: number): Money => ({ minor, currency: 'USD' })
const jpy = (minor: number): Money => ({ minor, currency: 'JPY' })
const TODAY = '2026-09-30'

const bill = (fields: Partial<Bill> & { id?: string } = {}): Bill => ({
	id: 'b1',
	payee: 'Texas Gas Service',
	period: '2026-09',
	due: '2026-10-08',
	amount: usd(10000),
	source: 'manual',
	...fields,
})
const paid = (...amounts: Money[]): BillPayment[] =>
	amounts.map((amount, at) => ({ amount, day: `2026-09-2${at}`, transactionId: `t${at}`, accountId: 'chk' }))

const account = (id: string, kind: Account['kind'], fields: Partial<Account> = {}): Account => ({
	id,
	name: id,
	kind,
	currency: 'USD',
	share: WHOLE,
	...fields,
})
const ACCOUNTS = [
	account('chk', 'checking', { institution: 'Chase', last4: '4417' }),
	account('card', 'credit-card', { name: 'Sapphire', last4: '8823' }),
	account('old-card', 'credit-card', { last4: '1111', closedOn: '2026-01-01' }),
]

describe('bill states', () => {
	const cases: [string, Bill, BillState, { left?: number; over?: number }?][] = [
		['no due day', bill({ due: undefined }), 'expected'],
		['due yesterday', bill({ due: '2026-09-29' }), 'overdue'],
		['due today', bill({ due: TODAY }), 'due-soon'],
		['due in 3 days', bill({ due: '2026-10-03' }), 'due-soon'],
		['due in 4 days', bill({ due: '2026-10-04' }), 'upcoming'],
		['98% paid', bill({ payments: paid(usd(9800)) }), 'paid', { left: 200 }],
		['just under 98%', bill({ payments: paid(usd(9799)) }), 'upcoming', { left: 201 }],
		['paid in part, overdue', bill({ due: '2026-09-20', payments: paid(usd(4000)) }), 'overdue', { left: 6000 }],
		['paid in two parts', bill({ payments: paid(usd(5000), usd(5000)) }), 'paid'],
		['102% is not overpaid', bill({ payments: paid(usd(10200)) }), 'paid'],
		['over 102% is overpaid', bill({ payments: paid(usd(10000), usd(9900)) }), 'paid', { over: 9900 }],
		['an expected bill paid', bill({ due: undefined, payments: paid(usd(10000)) }), 'paid'],
		[
			'a statement paid its minimum',
			bill({ accountId: 'card', amount: usd(120418), minimum: usd(3500), payments: paid(usd(3500)) }),
			'paid',
			{ left: 116918 },
		],
		[
			'a statement short of its minimum',
			bill({ accountId: 'card', amount: usd(120418), minimum: usd(3500), payments: paid(usd(3499)) }),
			'upcoming',
			{ left: 116919 },
		],
		[
			'a statement with no minimum needs its balance',
			bill({ accountId: 'card', amount: usd(120418), payments: paid(usd(120000)) }),
			'upcoming',
			{ left: 418 },
		],
		// ¥1,000: 98% is ¥980, in whole yen
		['JPY at 98%', bill({ amount: jpy(1000), payments: [{ amount: jpy(980), day: TODAY }] }), 'paid', { left: 20 }],
		[
			'JPY under 98%',
			bill({ amount: jpy(1000), payments: [{ amount: jpy(979), day: TODAY }] }),
			'upcoming',
			{ left: 21 },
		],
	]
	for (const [name, given, state, figures] of cases)
		it(name, () => {
			expect(billState(given, TODAY)).toBe(state)
			expect(settled(given)).toBe(state === 'paid')
			expect(remainingOf(given)?.minor).toBe(figures?.left ?? (given.payments ? undefined : given.amount.minor))
			expect(overpaidOf(given)?.minor).toBe(figures?.over)
		})

	it('groups in order, leaving out the empty ones and the bills paid over 60 days ago', () => {
		const groups = billGroups(
			[
				bill({ id: 'late', due: '2026-09-26' }),
				bill({ id: 'soon', due: '2026-10-01' }),
				bill({ id: 'eob', due: undefined }),
				bill({ id: 'paid-old', payments: [{ amount: usd(10000), day: '2026-07-01' }] }),
				bill({ id: 'paid-a', payments: [{ amount: usd(10000), day: '2026-09-10' }] }),
				bill({ id: 'paid-b', payments: [{ amount: usd(10000), day: '2026-09-22' }] }),
			],
			TODAY
		)
		expect(groups.map((group) => [group.state, group.bills.map((entry) => entry.id)])).toEqual([
			['overdue', ['late']],
			['due-soon', ['soon']],
			['expected', ['eob']],
			['paid', ['paid-b', 'paid-a']],
		])
	})

	it('writes the mock row text', () => {
		const tr = (key: string, options?: { values?: Record<string, string | number> }) =>
			`${key.split('.').at(-1)}${options?.values ? `(${Object.values(options.values).join(',')})` : ''}`
		const words = {
			tr,
			day: (iso: string) => iso.slice(5),
			money: (amount: Money) => `$${amount.minor}`,
			accounts: ACCOUNTS,
		}
		const rent = bill({ payee: 'Rent', repeat: { months: 1 }, source: 'repeating' })
		expect(billSecondary(rent, 'due-soon', words)).toBe('m1 · actual · repeating')
		const water = bill({ estimate: true, repeat: { months: 3 } })
		// a quarterly bill sets aside a third of itself a month (#85)
		expect(billSecondary(water, 'upcoming', words)).toBe('m3 · estimate · manual · setAside($3333)')
		expect(billChip(water, words)).toBe('about($10000)')
		expect(billChip(rent, words)).toBe('$10000')
		const card = bill({
			accountId: 'card',
			source: 'statement',
			amount: usd(120418),
			minimum: usd(3500),
			interest: usd(1240),
		})
		expect(billSecondary(card, 'upcoming', { ...words, asOf: 'Sun 27 Sep' })).toBe(
			'once · actual · statement · minimum($3500) · interest($1240) · asOf(Sun 27 Sep)'
		)
		expect(billSecondary(bill({ payments: paid(usd(4000)) }), 'upcoming', words)).toBe(
			'once · actual · manual · stillDue($6000)'
		)
		expect(billSecondary(bill({ payments: paid(usd(10000)) }), 'paid', words)).toBe('paidFrom(09-20,Chase,4417)')
		expect(billSecondary(bill({ payments: [{ amount: usd(10000), day: TODAY }] }), 'paid', words)).toBe(
			'markedPaid(09-30)'
		)
		expect(billSecondary(bill({ payments: paid(usd(10000), usd(9900)) }), 'paid', words)).toBe(
			'paidFrom(09-21,Chase,4417) · over($9900)'
		)
		expect(
			billSecondary(
				bill({ accountId: 'card', amount: usd(120418), minimum: usd(3500), payments: paid(usd(5000)) }),
				'paid',
				words
			)
		).toBe('minimumPaid($115418)')
		// an open EOB estimate is not a bill yet (#85)
		const eob = bill({
			payee: 'Seton Medical',
			due: undefined,
			amount: usd(24000),
			estimate: true,
			source: 'letter',
			insurance: 'medical',
			eob: true,
			insurer: 'Aetna',
		})
		expect(billSecondary(eob, 'expected', words)).toBe('once · medical · notYet · fromEob(Aetna)')
		expect(billSecondary({ ...eob, insurer: undefined }, 'expected', words)).toBe('once · medical · notYet · fromAnEob')
		expect(billChip(eob, words)).toBe('about($24000)')
		// a six-monthly premium sets aside its share each month
		const premium = bill({
			payee: 'GEICO',
			amount: usd(78000),
			estimate: true,
			source: 'letter',
			repeat: { months: 6 },
			insurance: 'premium',
		})
		expect(billSecondary(premium, 'upcoming', words)).toBe('m6 · premium · estimate · letter · setAside($13000)')
	})

	it('writes the insurance row text in English', () => {
		const en: Record<string, string> = {
			'domains.finance.bills.cadence.once': 'One-off',
			'domains.finance.bills.cadence.m6': 'Every 6 months',
			'domains.finance.bills.insurance.medical': 'Medical',
			'domains.finance.bills.insurance.premium': 'Premium',
			'domains.finance.bills.line.notYet': 'Not a bill yet',
			'domains.finance.bills.line.estimate': 'Estimate',
			'domains.finance.bills.line.fromEob': 'From the {insurer} EOB',
			'domains.finance.bills.line.fromAnEob': 'From an EOB',
			'domains.finance.bills.source.letter': 'From a letter',
			'domains.finance.bills.line.setAside': 'Set aside {amount} a month',
		}
		const tr = (key: string, options?: { values?: Record<string, string | number> }) =>
			(en[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(options?.values?.[name]))
		const words = {
			tr,
			day: (iso: string) => iso,
			money: (amount: Money) => `$${(amount.minor / 100).toFixed(2)}`,
			accounts: ACCOUNTS,
		}
		const eob = bill({
			due: undefined,
			amount: usd(24000),
			estimate: true,
			source: 'letter',
			insurance: 'medical',
			eob: true,
			insurer: 'Aetna',
		})
		expect(billSecondary(eob, 'expected', words)).toBe('One-off · Medical · Not a bill yet · From the Aetna EOB')
		expect(billSecondary({ ...eob, insurer: undefined }, 'expected', words)).toBe(
			'One-off · Medical · Not a bill yet · From an EOB'
		)
		const premium = bill({
			amount: usd(78000),
			estimate: true,
			source: 'letter',
			repeat: { months: 6 },
			insurance: 'premium',
		})
		expect(billSecondary(premium, 'upcoming', words)).toBe(
			'Every 6 months · Premium · Estimate · From a letter · Set aside $130.00 a month'
		)
	})
})

describe('next occurrence', () => {
	let n = 0
	const newId = () => `new-${(n += 1)}`

	it('adds months clamped to the month end', () => {
		expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
		expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
		expect(addMonthsClamped('2026-11-15', 2)).toBe('2027-01-15')
		expect(addMonthsClamped('2026-08-31', 6)).toBe('2027-02-28')
		expect(addMonthsClamped('2026-02-28', 1, 31)).toBe('2026-03-31')
		expect(addMonthsClamped('2026-12-01', 12)).toBe('2027-12-01')
	})

	it('a fixed bill carries its amount once the latest is settled', () => {
		const rent = bill({
			id: 'rent-1',
			payee: 'Rent',
			period: '2026-01',
			due: '2026-01-31',
			amount: usd(185000),
			repeat: { months: 1 },
			fixed: true,
			seriesId: 'rent-1',
			url: 'https://example.com/',
			payments: paid(usd(185000)),
		})
		const next = nextOccurrence([rent], '2026-01-20', newId)!
		expect(next).toMatchObject({
			payee: 'Rent',
			period: '2026-02',
			due: '2026-02-28',
			amount: usd(185000),
			fixed: true,
			source: 'repeating',
			repeat: { months: 1 },
			seriesId: 'rent-1',
			url: 'https://example.com/',
		})
		expect(next.estimate).toBeUndefined()
		expect(next.payments).toBeUndefined()
		// the series keeps to the day it started on
		const after = nextOccurrence([rent, { ...next, payments: paid(usd(185000)) }], '2026-02-20', newId)!
		expect(after.due).toBe('2026-03-31')
	})

	it('a bill that varies carries the mean of the last three actual amounts, as an estimate', () => {
		const series: SeriesBill[] = [
			bill({ id: 'g1', period: '2026-05', due: '2026-06-05', amount: usd(1000), repeat: { months: 1 } }),
			bill({ id: 'g2', period: '2026-06', due: '2026-07-05', amount: usd(3000), repeat: { months: 1 } }),
			bill({ id: 'g3', period: '2026-07', due: '2026-08-05', amount: usd(4000), repeat: { months: 1 } }),
			bill({ id: 'g4', period: '2026-08', due: '2026-09-05', amount: usd(4001), repeat: { months: 1 } }),
			// an estimate is not an actual
			bill({
				id: 'g5',
				period: '2026-09',
				due: '2026-10-05',
				amount: usd(9999),
				estimate: true,
				repeat: { months: 1 },
				seriesId: 'g1',
			}),
		]
		// (3000 + 4000 + 4001) / 3 = 3667, rounded half away from zero
		expect(estimateOf(series)).toEqual(usd(3667))
		// not yet: the latest is open and not past due
		expect(nextOccurrence(series, '2026-10-01', newId)).toBeUndefined()
		const next = nextOccurrence(series, '2026-10-06', newId)!
		expect(next).toMatchObject({
			period: '2026-10',
			due: '2026-11-05',
			amount: usd(3667),
			estimate: true,
			seriesId: 'g1',
		})
		expect(next.fixed).toBeUndefined()
		// no actual amounts: the previous amount
		expect(estimateOf([series[4]!])).toEqual(usd(9999))
	})

	it('a series ends once its latest occurrence is deleted or no longer repeats', () => {
		const first = bill({
			id: 's1',
			period: '2026-08',
			due: '2026-09-05',
			repeat: { months: 1 },
			payments: paid(usd(10000)),
		})
		const second = bill({ id: 's2', period: '2026-09', due: '2026-10-05', repeat: { months: 1 }, seriesId: 's1' })
		expect(nextOccurrence([first, { ...second, deleted: true }], '2026-10-10', newId)).toBeUndefined()
		// an occurrence an undo took back ends nothing: the series rolls on from the one before it
		expect(nextOccurrence([first, { ...second, deleted: true, undone: true }], '2026-10-10', newId)?.period).toBe(
			'2026-09'
		)
		expect(nextOccurrence([first, { ...second, repeat: undefined }], '2026-10-10', newId)).toBeUndefined()
		expect(nextOccurrence([first, second], '2026-10-10', newId)?.period).toBe('2026-10')
		expect(nextOccurrence([bill({ payments: paid(usd(10000)) })], TODAY, newId)).toBeUndefined()
	})

	it('a premium stays a premium, and an EOB, its insurer and day of service stay with their occurrence', () => {
		const premium = bill({
			id: 'p1',
			period: '2026-03',
			due: '2026-04-01',
			amount: usd(78000),
			repeat: { months: 6 },
			fixed: true,
			insurance: 'premium',
			payments: paid(usd(78000)),
		})
		expect(nextOccurrence([premium], TODAY, newId)).toMatchObject({ period: '2026-09', insurance: 'premium' })
		const medical = {
			...premium,
			insurance: 'medical' as const,
			eob: true as const,
			insurer: 'Aetna',
			serviceDay: '2026-03-02',
		}
		const next = nextOccurrence([medical], TODAY, newId)!
		expect(next.insurance).toBe('medical')
		expect(next).not.toHaveProperty('eob')
		expect(next).not.toHaveProperty('insurer')
		expect(next).not.toHaveProperty('serviceDay')
		expect(nextOccurrence([{ ...premium, insurance: undefined }], TODAY, newId)).not.toHaveProperty('insurance')
	})
})

describe("draft from the model's answer", () => {
	const answer = {
		isBill: true,
		payee: 'Austin Energy',
		amount: '$142.37',
		currency: '',
		due: '2026-10-05',
		period: '2026-09',
		estimate: false,
		minimum: '',
		last4: '',
		repeats: 'month',
		url: 'https://austinenergy.com',
	}

	it('reads a letter', () => {
		expect(billDraftOf(answer, ACCOUNTS, TODAY, 'USD')).toEqual({
			payee: 'Austin Energy',
			amount: usd(14237),
			period: '2026-09',
			source: 'letter',
			due: '2026-10-05',
			repeat: 1,
			url: 'https://austinenergy.com/',
		})
		// no period: the due day's month; no due day either: this month
		expect(billDraftOf({ ...answer, period: '' }, ACCOUNTS, TODAY, 'USD')?.period).toBe('2026-10')
		expect(billDraftOf({ ...answer, period: '', due: '' }, ACCOUNTS, TODAY, 'USD')).toMatchObject({ period: '2026-09' })
		expect(billDraftOf({ ...answer, currency: 'jpy', amount: '84,000' }, ACCOUNTS, TODAY, 'USD')?.amount).toEqual(
			jpy(84000)
		)
		// a guessed or unsafe address is dropped
		expect(billDraftOf({ ...answer, url: 'http://austinenergy.com' }, ACCOUNTS, TODAY, 'USD')?.url).toBeUndefined()
		expect(billDraftOf({ ...answer, url: 'javascript:alert(1)' }, ACCOUNTS, TODAY, 'USD')?.url).toBeUndefined()
		expect(billDraftOf({ ...answer, estimate: true }, ACCOUNTS, TODAY, 'USD')?.estimate).toBe(true)
	})

	it("a statement naming an open card's last four becomes that card's", () => {
		const draft = billDraftOf({ ...answer, last4: '8823', minimum: '35.00' }, ACCOUNTS, TODAY, 'USD')
		expect(draft).toMatchObject({ accountId: 'card', minimum: usd(3500) })
		// a closed card, or no card, makes no statement and keeps no minimum
		expect(billDraftOf({ ...answer, last4: '1111', minimum: '35' }, ACCOUNTS, TODAY, 'USD')).not.toHaveProperty(
			'accountId'
		)
		expect(billDraftOf({ ...answer, last4: '9999', minimum: '35' }, ACCOUNTS, TODAY, 'USD')).not.toHaveProperty(
			'minimum'
		)
	})

	it('yields no draft for what is not a bill or an amount that does not read', () => {
		for (const bad of [
			{ ...answer, isBill: false },
			{ ...answer, payee: '  ' },
			{ ...answer, amount: 'about forty' },
			{ ...answer, amount: '0' },
			{ ...answer, amount: '-12.00' },
			{ ...answer, amount: '12.345' },
			{ ...answer, currency: 'JPY', amount: '84000.50' },
			{ ...answer, currency: 'XYZ' },
			'not an object',
			null,
		])
			expect(billDraftOf(bad, ACCOUNTS, TODAY, 'USD'), JSON.stringify(bad)).toBeUndefined()
	})

	it('an EOB is the provider’s estimate, not a bill yet', () => {
		const eob = {
			...answer,
			isBill: false,
			payee: 'Seton Medical',
			amount: '240.00',
			due: '2026-10-20',
			period: '2026-09',
			estimate: false,
			last4: '8823',
			minimum: '35',
			repeats: 'month',
			url: '',
			insurance: 'none',
			eob: true,
			insurer: ' Aetna ',
			serviceDay: '2026-08-14',
		}
		expect(billDraftOf(eob, ACCOUNTS, TODAY, 'USD')).toEqual({
			payee: 'Seton Medical',
			amount: usd(24000),
			period: '2026-08',
			source: 'letter',
			estimate: true,
			insurance: 'medical',
			eob: true,
			insurer: 'Aetna',
			serviceDay: '2026-08-14',
		})
		// no day of service: the answer's period, else this month; no insurer: none kept
		expect(billDraftOf({ ...eob, serviceDay: '' }, ACCOUNTS, TODAY, 'USD')?.period).toBe('2026-09')
		const bare = billDraftOf({ ...eob, serviceDay: 'soon', period: '', insurer: '' }, ACCOUNTS, TODAY, 'USD')!
		expect(bare.period).toBe('2026-09')
		expect(bare).not.toHaveProperty('insurer')
		expect(bare).not.toHaveProperty('serviceDay')
	})

	it('a premium notice keeps its insurance and how often it comes', () => {
		const draft = billDraftOf(
			{ ...answer, repeats: 'half-year', insurance: 'premium', serviceDay: '2026-08-14' },
			ACCOUNTS,
			TODAY,
			'USD'
		)!
		expect(draft).toMatchObject({ repeat: 6, insurance: 'premium' })
		// a day of service is a medical bill's only
		expect(draft).not.toHaveProperty('serviceDay')
		expect(
			billDraftOf({ ...answer, insurance: 'medical', serviceDay: '2026-08-14' }, ACCOUNTS, TODAY, 'USD')
		).toMatchObject({
			insurance: 'medical',
			serviceDay: '2026-08-14',
		})
		expect(billDraftOf({ ...answer, insurance: 'car' }, ACCOUNTS, TODAY, 'USD')).not.toHaveProperty('insurance')
	})

	it('keeps the insurance keys', () => {
		const draft = {
			payee: 'Seton Medical',
			amount: usd(24000),
			period: '2026-08',
			source: 'letter' as const,
			estimate: true,
			insurance: 'medical' as const,
			eob: true,
			insurer: 'Aetna',
			serviceDay: '2026-08-14',
		}
		const made = billFromDraft(draft, undefined, TODAY, () => 'eob')
		expect(made).toMatchObject({ insurance: 'medical', eob: true, insurer: 'Aetna', serviceDay: '2026-08-14' })
		expect(draftOfBill(made)).toEqual({ ...draft, id: 'eob' })
		// a draft without them clears them
		const cleared = billFromDraft({ payee: 'Seton Medical', amount: usd(24000) }, made, TODAY, () => 'unused')
		for (const key of ['insurance', 'eob', 'insurer', 'serviceDay']) expect(cleared).not.toHaveProperty(key)
		// a premium keeps no EOB, insurer or day of service
		const premium = billFromDraft({ ...draft, insurance: 'premium' }, made, TODAY, () => 'unused')
		expect(premium.insurance).toBe('premium')
		for (const key of ['eob', 'insurer', 'serviceDay']) expect(premium).not.toHaveProperty(key)
		expect(billFromDraft({ ...draft, serviceDay: 'Aug 14' }, undefined, TODAY, () => 'x')).not.toHaveProperty(
			'serviceDay'
		)
	})

	it('the same payee and period updates the bill, keeping its payments', () => {
		const estimate = bill({
			id: 'ae',
			payee: 'AUSTIN ENERGY',
			period: '2026-09',
			due: '2026-10-04',
			amount: usd(13000),
			estimate: true,
			repeat: { months: 1 },
			seriesId: 'ae-0',
			source: 'repeating',
			accountId: 'card',
			minimum: usd(2500),
			payments: paid(usd(5000)),
		})
		const other = bill({ id: 'other', payee: 'Austin Energy', period: '2026-08' })
		const draft = billDraftOf({ ...answer, last4: '8823', minimum: '40' }, ACCOUNTS, TODAY, 'USD')!
		expect(sameBill(draft, [other, estimate])?.id).toBe('ae')
		expect(sameBill({ ...draft, period: '2026-07' }, [other, estimate])).toBeUndefined()
		const updated = billFromDraft(draftOver(estimate, draft), estimate, TODAY, () => 'unused')
		expect(updated).toMatchObject({
			id: 'ae',
			amount: usd(14237),
			due: '2026-10-05',
			minimum: usd(4000),
			payments: paid(usd(5000)),
			seriesId: 'ae-0',
			repeat: { months: 1 },
			source: 'letter',
		})
		expect(updated.estimate).toBeUndefined()
	})

	it('stores a bill with its file import, and deletes it with them', () => {
		const made = billFromDraft(
			{ payee: ' Rent ', amount: usd(185000), due: '2026-10-01', repeat: 1, fixed: true },
			undefined,
			TODAY,
			() => 'r1'
		)
		expect(made).toEqual({
			id: 'r1',
			payee: 'Rent',
			amount: usd(185000),
			period: '2026-10',
			source: 'manual',
			due: '2026-10-01',
			repeat: { months: 1 },
			fixed: true,
			seriesId: 'r1',
		})
		const { ops, inverse } = billOps(undefined, made, { id: 'fi', fingerprint: 'ab12', day: TODAY })
		expect(ops).toEqual(
			[
				{ op: 'createEntity', input: { id: 'r1', type: 'bill', payload: { ...made, id: undefined } } },
				{
					op: 'createEntity',
					input: {
						id: 'fi',
						type: 'file-import',
						source: 'document',
						externalId: 'ab12',
						payload: { kind: 'letter', day: TODAY, billId: 'r1', rows: 1 },
					},
				},
			].map((op) => JSON.parse(JSON.stringify(op)))
		)
		expect(inverse).toEqual([
			{ op: 'delete', uri: 'eden://bill/r1' },
			{ op: 'delete', uri: 'eden://file-import/fi' },
		])
		expect(deleteBillOps(made, ['fi'], ['task-1'])).toEqual({
			ops: [
				{ op: 'delete', uri: 'eden://bill/r1' },
				{ op: 'delete', uri: 'eden://file-import/fi' },
				{ op: 'delete', uri: 'eden://task/task-1' },
			],
			inverse: [
				{ op: 'restore', uri: 'eden://bill/r1' },
				{ op: 'restore', uri: 'eden://file-import/fi' },
				{ op: 'restore', uri: 'eden://task/task-1' },
			],
		})
	})
})
