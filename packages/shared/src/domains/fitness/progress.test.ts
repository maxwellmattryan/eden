import { describe, expect, it } from 'vitest'
import {
	dailyWeights,
	nextSession,
	sessionFor,
	sevenDayAverage,
	streak,
	upcomingSessions,
	weekSessions,
} from './progress.js'
import type { BodyMetric, PlannedSession, WorkoutLog } from './types.js'

// Wednesday 2026-09-30, as the sample has it
const TODAY = '2026-09-30'
const log = (id: string, date: string, extra: Partial<WorkoutLog> = {}): WorkoutLog => ({
	id,
	title: 'Pull A',
	date,
	minutes: 50,
	exercises: [],
	...extra,
})
const weight = (at: string, value: number): BodyMetric => ({
	id: at,
	kind: 'weight',
	value,
	at,
	source: 'manual',
})
// the sample's run: two this week, two last, two the week before, then an empty week, then one more
const SAMPLE = ['2026-09-29', '2026-09-28', '2026-09-25', '2026-09-23', '2026-09-17', '2026-09-14', '2026-09-02'].map(
	(date, i) => log(`l-${i}`, date)
)

describe('streak', () => {
	it('counts the logs in the unbroken run of weeks ending this one: six in the sample', () => {
		expect(streak(SAMPLE, 'monday', TODAY)).toBe(6)
	})

	it('starts the weeks on the week-start setting', () => {
		expect(streak(SAMPLE, 'sunday', TODAY)).toBe(6)
		// Sunday 09-27 is last week from Monday, this week from Sunday; Saturday 09-19 is the week before last from
		// Monday, unbroken, and two weeks back from Sunday, after an empty week
		const logs = [log('a', '2026-09-27'), log('b', '2026-09-19')]
		expect(streak(logs, 'monday', TODAY)).toBe(2)
		expect(streak(logs, 'sunday', TODAY)).toBe(1)
	})

	it('does not break the run on an empty current week, and breaks it on an empty week before', () => {
		const lastWeek = SAMPLE.filter((entry) => entry.date < '2026-09-28')
		expect(streak(lastWeek, 'monday', TODAY)).toBe(4)
		// a gap two weeks back: only last week counts
		expect(streak([log('a', '2026-09-22'), log('b', '2026-09-08')], 'monday', TODAY)).toBe(1)
		// nothing last week or this one: no streak, whatever came before
		expect(streak([log('a', '2026-09-14')], 'monday', TODAY)).toBe(0)
	})

	it('is nothing without logs, and leaves out a log dated after today', () => {
		expect(streak([], 'monday', TODAY)).toBe(0)
		expect(streak([log('a', '2026-10-01'), log('b', '2026-09-29')], 'monday', TODAY)).toBe(1)
	})
})

describe('the daily weights and their average', () => {
	it('keeps the last weight logged each day, oldest first', () => {
		const days = dailyWeights(
			[
				weight('2026-09-29T19:00:00Z', 83.1),
				weight('2026-09-30T06:48:00Z', 82.4),
				weight('2026-09-29T06:50:00Z', 82.6),
				{ id: 'w', kind: 'waist', value: 84, at: '2026-09-30T07:00:00Z', source: 'manual' },
			],
			'UTC'
		)
		expect(days.map((day) => [day.day, day.value])).toEqual([
			['2026-09-29', 83.1],
			['2026-09-30', 82.4],
		])
	})

	it('reads the day in the zone it is given', () => {
		const late = [weight('2026-09-30T03:00:00Z', 82.4)]
		expect(dailyWeights(late, 'UTC')[0]?.day).toBe('2026-09-30')
		expect(dailyWeights(late, 'America/Chicago')[0]?.day).toBe('2026-09-29')
	})

	it('averages the seven days ending at the latest weight: 82.6 for the sample fortnight', () => {
		const series = [83.6, 83.4, 83.5, 83.1, 83.2, 82.9, 83.0, 82.8, 82.7, 82.9, 82.6, 82.5, 82.6, 82.4]
		const weights = series.map((value, i) => ({ day: `2026-09-${String(17 + i).padStart(2, '0')}`, value }))
		expect(sevenDayAverage(weights)).toBeCloseTo(578.5 / 7, 6)
		expect(Math.round(sevenDayAverage(weights)! * 10) / 10).toBe(82.6)
	})

	it('skips the days without a weight', () => {
		const weights = [
			{ day: '2026-09-20', value: 90 },
			{ day: '2026-09-24', value: 82 },
			{ day: '2026-09-27', value: 83 },
			{ day: '2026-09-30', value: 84 },
		]
		// 09-20 is outside 09-24..09-30; the three inside are averaged over three, not seven
		expect(sevenDayAverage(weights)).toBe(83)
		expect(sevenDayAverage([])).toBeUndefined()
	})
})

describe('the sessions', () => {
	const session = (id: string, startAt: string, templateId = 't-push'): PlannedSession => ({
		id,
		templateId,
		title: 'Push A',
		startAt,
	})
	const friday = session('s-fri', '2026-10-02T18:00:00')
	const nextWeek = session('s-next', '2026-10-06T07:00:00')
	const monday = session('s-mon', '2026-09-28T07:00:00', 't-pull')

	it("lists this week's logs as done and its planned sessions as planned, in day order", () => {
		const logs = [log('l-tue', '2026-09-29', { title: 'Legs' }), log('l-mon', '2026-09-28', { sessionId: 's-mon' })]
		const week = weekSessions(logs, [friday, nextWeek, monday], 'monday', TODAY)
		expect(week.sessions.map((entry) => [entry.id, entry.done])).toEqual([
			['l-mon', true],
			['l-tue', true],
			['s-fri', false],
		])
		expect([week.done, week.total]).toEqual([2, 3])
	})

	it('starts the week on the week-start setting', () => {
		const sunday = [log('l-sun', '2026-09-27')]
		expect(weekSessions(sunday, [], 'sunday', TODAY).total).toBe(1)
		expect(weekSessions(sunday, [], 'monday', TODAY).total).toBe(0)
	})

	it('finds the next session still to come that no log names', () => {
		const now = Date.parse('2026-09-30T07:40:00')
		expect(nextSession([nextWeek, friday, monday], now)?.id).toBe('s-fri')
		expect(nextSession([friday], now, [{ sessionId: 's-fri' }])).toBeUndefined()
		expect(nextSession([monday], now)).toBeUndefined()
		expect(upcomingSessions([nextWeek, friday, monday], now).map((entry) => entry.id)).toEqual(['s-fri', 's-next'])
	})

	it('finds the session a log of a template on a day is done for', () => {
		expect(sessionFor([friday, monday], 't-push', '2026-10-02', [])?.id).toBe('s-fri')
		expect(sessionFor([friday], 't-pull', '2026-10-02', [])).toBeUndefined()
		expect(sessionFor([friday], 't-push', '2026-10-01', [])).toBeUndefined()
		expect(sessionFor([friday], 't-push', '2026-10-02', [{ sessionId: 's-fri' }])).toBeUndefined()
		expect(sessionFor([friday], undefined, '2026-10-02', [])).toBeUndefined()
	})
})
