// The budget (docs/product/substrate/ai.md, "Budgets"): a monthly hard stop across providers, a warning at eighty
// per cent once a day, and a per-request token cap that is the model's context size until the owner sets one.
import type { GardenerPolicy } from './runtime-types.js'
import type { ModelRow } from './types.js'

export interface BudgetInput {
	spentThisMonth: number
	capUsd: number
	/** What the request about to be sent may cost. */
	estimateUsd: number
	/** The local day the warning was last shown, `YYYY-MM-DD`, or none. */
	warnedOn: string | null
	today: string
}

export interface BudgetState {
	/** Whether the request fits under the cap. */
	allowed: boolean
	/** How much of the cap is spent, 0 to 100 and beyond. */
	percent: number
	/** Whether to warn now: past eighty per cent, and not yet today. */
	warn: boolean
}

export const WARN_PERCENT = 80

export function budgetState({ spentThisMonth, capUsd, estimateUsd, warnedOn, today }: BudgetInput): BudgetState {
	const percent = capUsd > 0 ? (spentThisMonth / capUsd) * 100 : spentThisMonth > 0 ? Infinity : 0
	return {
		allowed: spentThisMonth + estimateUsd <= capUsd,
		percent,
		warn: percent >= WARN_PERCENT && warnedOn !== today,
	}
}

function wallOf(instant: number, zone: string) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(new Date(instant))
	const of = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
	return {
		year: of('year'),
		month: of('month'),
		/** The wall clock read as UTC; its distance from the instant is the zone's offset. */
		asUtc: Date.UTC(of('year'), of('month') - 1, of('day'), of('hour'), of('minute'), of('second')),
	}
}

/** The instant the month started, in the zone, as milliseconds since the epoch. */
export function startOfMonthMs(now: number, zone: string): number {
	const here = wallOf(now, zone)
	const firstWall = Date.UTC(here.year, here.month - 1, 1)
	// The offset at now, then the offset at the first itself, in case a clock change fell between them.
	const guess = firstWall - (here.asUtc - Math.floor(now / 1000) * 1000)
	const there = wallOf(guess, zone)
	return guess - (there.asUtc - firstWall)
}

/** The tokens one request may hold: the owner's cap, or the model's context. */
export function requestTokenCap(policy: Pick<GardenerPolicy, 'requestTokenCap'>, model: ModelRow): number {
	return policy.requestTokenCap ?? model.contextTokens
}
