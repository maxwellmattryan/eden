import { describe, expect, it } from 'vitest'
import type { Money } from '../../money/index.js'
import type { BillDraft } from './bills.js'
import { captureTarget, draftFor, setAsideOf, type CaptureHow } from './insurance.js'
import type { Bill } from './types.js'

const usd = (minor: number): Money => ({ minor, currency: 'USD' })

const bill = (fields: Partial<Bill> & { id: string }): Bill => ({
	payee: 'Seton Medical',
	period: '2026-08',
	amount: usd(24000),
	source: 'letter',
	...fields,
})
/** An open EOB estimate from Seton, for a visit on 14 Aug. */
const eob = (fields: Partial<Bill> & { id: string }): Bill =>
	bill({ estimate: true, insurance: 'medical', eob: true, insurer: 'Aetna', serviceDay: '2026-08-14', ...fields })

const letter: BillDraft = {
	payee: 'Seton Medical Center',
	amount: usd(23512),
	due: '2026-10-25',
	period: '2026-10',
	source: 'letter',
	insurance: 'medical',
}
const eobDraft: BillDraft = {
	payee: 'Seton Medical',
	amount: usd(22000),
	period: '2026-08',
	source: 'letter',
	estimate: true,
	insurance: 'medical',
	eob: true,
	insurer: 'Aetna',
	serviceDay: '2026-08-14',
}

describe('capture target', () => {
	const cases: [string, BillDraft, Bill[], { id: string; how: CaptureHow } | undefined][] = [
		[
			'a provider letter replaces the EOB of the same visit',
			{ ...letter, serviceDay: '2026-08-14' },
			[eob({ id: 'e1' })],
			{ id: 'e1', how: 'replaces' },
		],
		[
			'a different day of service is another visit',
			{ ...letter, serviceDay: '2026-08-15' },
			[eob({ id: 'e1' })],
			undefined,
		],
		[
			'no day on the letter: the EOB within the 6 months up to it',
			letter,
			[eob({ id: 'e1' })],
			{ id: 'e1', how: 'replaces' },
		],
		[
			'the window counts the letter’s own month and five before it',
			letter,
			[
				eob({ id: 'old', period: '2026-04', serviceDay: undefined }),
				eob({ id: 'e5', period: '2026-05', serviceDay: undefined }),
			],
			{ id: 'e5', how: 'replaces' },
		],
		[
			'an EOB after the letter is not replaced',
			letter,
			[eob({ id: 'later', period: '2026-11', serviceDay: undefined })],
			undefined,
		],
		['outside the window', letter, [eob({ id: 'old', period: '2026-04', serviceDay: undefined })], undefined],
		[
			'the equal day of service first, then the latest period, then the lowest id',
			{ ...letter, serviceDay: '2026-08-14' },
			[
				eob({ id: 'e3', period: '2026-09', serviceDay: undefined }),
				eob({ id: 'e2', period: '2026-07', serviceDay: undefined }),
				eob({ id: 'e9' }),
				eob({ id: 'e1' }),
			],
			{ id: 'e1', how: 'replaces' },
		],
		[
			'with no equal day, the latest period, then the lowest id',
			letter,
			[
				eob({ id: 'e3', period: '2026-07' }),
				eob({ id: 'e2', period: '2026-09' }),
				eob({ id: 'e1', period: '2026-09' }),
			],
			{ id: 'e1', how: 'replaces' },
		],
		[
			'a settled EOB is not replaced',
			letter,
			[eob({ id: 'e1', payments: [{ amount: usd(24000), day: '2026-09-01' }] })],
			undefined,
		],
		['another provider', { ...letter, payee: 'Austin Radiology' }, [eob({ id: 'e1' })], undefined],
		[
			'a card statement never lands on an EOB',
			{ ...letter, payee: 'Seton', accountId: 'card' },
			[eob({ id: 'e1', payee: 'Seton', period: '2026-10' })],
			undefined,
		],
		['a corrected EOB updates its estimate', eobDraft, [eob({ id: 'e1' })], { id: 'e1', how: 'updates' }],
		[
			'a corrected EOB with no day of service matches by month',
			{ ...eobDraft, serviceDay: undefined },
			[eob({ id: 'e1' })],
			{ id: 'e1', how: 'updates' },
		],
		[
			'an EOB for a bill already here is billed',
			eobDraft,
			[bill({ id: 'b1', period: '2026-10', due: '2026-10-25', insurance: 'medical' })],
			{ id: 'b1', how: 'billed' },
		],
		[
			'billed by the equal day of service, whatever the month',
			eobDraft,
			[bill({ id: 'b1', period: '2027-03', due: '2027-03-25', serviceDay: '2026-08-14', insurance: 'medical' })],
			{ id: 'b1', how: 'billed' },
		],
		[
			'billed only within the 6 months from the EOB',
			eobDraft,
			[bill({ id: 'b1', period: '2027-02', due: '2027-02-25' })],
			undefined,
		],
		[
			'an EOB never lands on an estimate or a statement as billed',
			eobDraft,
			[
				bill({ id: 'est', period: '2026-09', estimate: true }),
				bill({ id: 'card', period: '2026-09', accountId: 'card' }),
			],
			undefined,
		],
		[
			'the same payee and period still updates',
			{ payee: 'Austin Energy', amount: usd(100), period: '2026-09' },
			[bill({ id: 'ae', payee: 'AUSTIN ENERGY', period: '2026-09' })],
			{ id: 'ae', how: 'updates' },
		],
	]
	for (const [name, draft, bills, want] of cases)
		it(name, () => {
			const target = captureTarget(draft, bills)
			expect(target ? { id: target.bill.id, how: target.how } : undefined).toEqual(want)
		})
})

describe('draft for a target', () => {
	it('the provider’s bill replaces the estimate, keeping the EOB', () => {
		const was = eob({ id: 'e1', payments: undefined })
		expect(draftFor({ bill: was, how: 'replaces' }, letter)).toEqual({
			id: 'e1',
			payee: 'Seton Medical',
			amount: usd(23512),
			due: '2026-10-25',
			period: '2026-10',
			source: 'letter',
			insurance: 'medical',
			eob: true,
			insurer: 'Aetna',
			serviceDay: '2026-08-14',
		})
	})

	it('a corrected EOB stays an estimate with no due day', () => {
		const was = eob({ id: 'e1', insurer: undefined, serviceDay: undefined, due: '2026-09-01' })
		expect(draftFor({ bill: was, how: 'updates' }, eobDraft)).toEqual({
			id: 'e1',
			payee: 'Seton Medical',
			amount: usd(22000),
			period: '2026-08',
			source: 'letter',
			estimate: true,
			insurance: 'medical',
			eob: true,
			insurer: 'Aetna',
			serviceDay: '2026-08-14',
		})
	})

	it('a corrected letter goes over its bill', () => {
		const was = bill({ id: 'b1', period: '2026-10', due: '2026-10-20', estimate: true })
		expect(draftFor({ bill: was, how: 'updates' }, letter)).toMatchObject({
			id: 'b1',
			amount: usd(23512),
			due: '2026-10-25',
		})
		expect(draftFor({ bill: was, how: 'updates' }, letter)).not.toHaveProperty('estimate')
	})

	it('an EOB for a bill already here leaves the bill as it is', () => {
		const was = bill({ id: 'b1', period: '2026-10', due: '2026-10-25', amount: usd(30000) })
		expect(draftFor({ bill: was, how: 'billed' }, eobDraft)).toEqual({
			id: 'b1',
			payee: 'Seton Medical',
			amount: usd(30000),
			period: '2026-10',
			due: '2026-10-25',
			source: 'letter',
		})
	})
})

describe('set aside', () => {
	const cases: [string, Partial<Bill>, number | undefined][] = [
		['six-monthly $780.00', { amount: usd(78000), repeat: { months: 6 } }, 13000],
		['quarterly $100.00', { amount: usd(10000), repeat: { months: 3 } }, 3333],
		['every 2 months $0.05, half away from zero', { amount: usd(5), repeat: { months: 2 } }, 3],
		['yearly $1,000.00', { amount: usd(100000), repeat: { months: 12 } }, 8333],
		['monthly', { repeat: { months: 1 } }, undefined],
		['one-off', {}, undefined],
		['a card statement', { repeat: { months: 6 }, accountId: 'card' }, undefined],
	]
	for (const [name, fields, want] of cases)
		it(name, () => {
			const aside = setAsideOf(bill({ id: 'b', ...fields }))
			expect(aside?.minor).toBe(want)
			if (aside) expect(aside.currency).toBe('USD')
		})
})
