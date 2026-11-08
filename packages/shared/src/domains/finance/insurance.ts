// Insurance and medical bills (product/domains/finance.md §6, #85, D-201), pure so they are tested here: what a
// premium that comes every few months asks the owner to set aside each month, and which live bill a captured
// document lands on. An insurer's EOB is not a bill yet: it drafts the provider's estimate, the provider's own bill
// replaces that estimate, a corrected EOB updates it, and an EOB that arrives after its bill leaves the bill as it is.
// Kept apart from `bills.ts` so that `bills.ts` and `match.ts` never import each other.
import { money, type Money } from '../../money/index.js'
import { addMonthsToPeriod, draftOfBill, draftOver, isStatement, sameBill, settled, type BillDraft } from './bills.js'
import { payeeMatches } from './match.js'
import type { Bill } from './types.js'

/** An EOB's estimate is matched to bills up to 6 months on, the EOB's own month counted. */
export const EOB_WINDOW_MONTHS = 6

/**
 * What a bill that repeats every 2 months or more comes to a month: its amount ÷ its months, in minor units, rounded
 * half away from zero. Nothing for a monthly or one-off bill, or a card statement.
 */
export function setAsideOf(bill: Pick<Bill, 'amount' | 'repeat' | 'accountId'>): Money | undefined {
	const months = bill.repeat?.months
	if (!months || months < 2 || isStatement(bill)) return undefined
	const minor = BigInt(bill.amount.minor)
	const count = BigInt(months)
	const sign = minor < 0n ? -1n : 1n
	const whole = minor * sign
	let share = whole / count
	if ((whole % count) * 2n >= count) share += 1n
	return money(Number(share * sign), bill.amount.currency)
}

/** How a captured draft lands on a live bill: a corrected copy, the provider's bill over an EOB, or an EOB for a bill already here. */
export type CaptureHow = 'updates' | 'replaces' | 'billed'

export interface CaptureTarget {
	bill: Bill
	how: CaptureHow
}

/** An EOB's estimate that nothing has paid: the provider's bill is still to come. */
export const isOpenEob = (bill: Bill) => Boolean(bill.eob && bill.estimate && !settled(bill))

/** `period` in the months from `from` to `to`, both included. */
const within = (period: string, from: string, to: string) => period >= from && period <= to

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** The best of several matches: the equal day of service first, then the latest period, then the lowest id. */
function bestOf(bills: readonly Bill[], serviceDay: string | undefined): Bill | undefined {
	const equal = (bill: Bill) => (serviceDay && bill.serviceDay === serviceDay ? 0 : 1)
	return [...bills].sort((a, b) => equal(a) - equal(b) || byText(b.period, a.period) || byText(a.id, b.id))[0]
}

/** Equal days of service when both are known; otherwise `fallback`. */
const sameService = (bill: Bill, draft: BillDraft, fallback: () => boolean) =>
	bill.serviceDay && draft.serviceDay ? bill.serviceDay === draft.serviceDay : fallback()

/**
 * The live bill a captured draft lands on, and how:
 * - an EOB updates the open EOB estimate from the same provider for the same service (or month, when either has no
 *   day of service), else is `billed` when the provider's actual bill is here: the equal day of service, or the bill's
 *   month in the 6 months from the EOB's;
 * - a provider's letter that is not a card statement `replaces` the open EOB estimate from the same provider: the
 *   equal day of service when both are known, else the EOB's month in the 6 months up to the letter's;
 * - otherwise the bill of the same payee and month (`sameBill`) is `updates`. A card statement never lands on an EOB.
 */
export function captureTarget(draft: BillDraft, bills: readonly Bill[]): CaptureTarget | undefined {
	const provider = (bill: Bill) => payeeMatches(bill.payee, draft.payee)
	const period = draft.period
	if (draft.eob) {
		const corrected = bills.filter(
			(bill) => isOpenEob(bill) && provider(bill) && sameService(bill, draft, () => bill.period === period)
		)
		const open = bestOf(corrected, draft.serviceDay)
		if (open) return { bill: open, how: 'updates' }
		const billed = bills.filter(
			(bill) =>
				!bill.estimate &&
				!isStatement(bill) &&
				provider(bill) &&
				sameService(
					bill,
					draft,
					() => !!period && within(bill.period, period, addMonthsToPeriod(period, EOB_WINDOW_MONTHS - 1))
				)
		)
		const actual = bestOf(billed, draft.serviceDay)
		if (actual) return { bill: actual, how: 'billed' }
	} else if (!isStatement(draft)) {
		const estimates = bills.filter(
			(bill) =>
				isOpenEob(bill) &&
				provider(bill) &&
				sameService(
					bill,
					draft,
					() => !!period && within(bill.period, addMonthsToPeriod(period, 1 - EOB_WINDOW_MONTHS), period)
				)
		)
		const estimate = bestOf(estimates, draft.serviceDay)
		if (estimate) return { bill: estimate, how: 'replaces' }
	}
	const same = sameBill(draft, isStatement(draft) ? bills.filter((bill) => !isOpenEob(bill)) : bills)
	if (!same) return undefined
	return { bill: same, how: !draft.eob && isOpenEob(same) ? 'replaces' : 'updates' }
}

/**
 * The form's draft for a target:
 * - `replaces`: the letter's amount, due day and month over the EOB's bill, no longer an estimate, its EOB, insurer
 *   and day of service kept, so a later corrected letter finds it by payee and month;
 * - `updates` by an EOB: the EOB's amount, insurer and day of service, still an estimate with no due day;
 * - any other `updates`: the draft over the bill (`draftOver`);
 * - `billed`: the bill as it is.
 */
export function draftFor(target: CaptureTarget, draft: BillDraft): BillDraft {
	const { bill, how } = target
	if (how === 'billed') return draftOfBill(bill)
	if (how === 'replaces') {
		const over = draftOver(bill, draft)
		return {
			...over,
			...(draft.period ? { period: draft.period } : {}),
			...(!over.serviceDay && draft.serviceDay ? { serviceDay: draft.serviceDay } : {}),
		}
	}
	if (!draft.eob) return draftOver(bill, draft)
	const base = draftOfBill(bill)
	delete base.due
	return {
		...base,
		amount: draft.amount,
		estimate: true,
		insurance: 'medical',
		eob: true,
		...(draft.insurer || base.insurer ? { insurer: draft.insurer || base.insurer } : {}),
		...(draft.serviceDay || base.serviceDay ? { serviceDay: draft.serviceDay || base.serviceDay } : {}),
		...(draft.source ? { source: draft.source } : {}),
	}
}
