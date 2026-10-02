import { describe, expect, it } from 'vitest'
import { formatSpans, isOpenAt, localClock, parseOpeningHours, parseSchemaHours, spansOn } from './hours.js'

const AUSTIN = 'America/Chicago'
/** An instant from a wall-clock time in Austin while summer time holds (UTC-5). */
const cdt = (iso: string) => new Date(`${iso}-05:00`)

describe('parseOpeningHours', () => {
	it('reads days and times, rule by rule, a later rule replacing an earlier one', () => {
		const week = parseOpeningHours('Mo-Fr 07:00-17:00; Sa,Su 08:00-17:00')!
		expect(week.days[0]).toEqual([[420, 1020]])
		expect(week.days[4]).toEqual([[420, 1020]])
		expect(week.days[5]).toEqual([[480, 1020]])
		expect(week.days[6]).toEqual([[480, 1020]])
		const sunday = parseOpeningHours('Mo-Su 07:00-22:00; Su off')!
		expect(sunday.days[5]).toEqual([[420, 1320]])
		expect(sunday.days[6]).toEqual([])
	})

	it('reads round the clock, times with no days, and a break in the day', () => {
		expect(parseOpeningHours('24/7')!.days.every((day) => day[0]![0] === 0 && day[0]![1] === 1440)).toBe(true)
		expect(parseOpeningHours('05:00-22:00')!.days[3]).toEqual([[300, 1320]])
		expect(parseOpeningHours('Mo,We-Fr 10:00-14:00,17:00-22:00')!.days[2]).toEqual([
			[600, 840],
			[1020, 1320],
		])
		expect(parseOpeningHours('Mo,We-Fr 10:00-14:00,17:00-22:00')!.days[1]).toEqual([])
	})

	it('runs past midnight into the next day, and wraps a range of days round the week', () => {
		const bar = parseOpeningHours('Fr-Mo 12:00-02:00')!
		expect(bar.days[4]).toEqual([[720, 1560]])
		expect(bar.days[0]).toEqual([[720, 1560]])
		expect(bar.days[1]).toEqual([])
		expect(parseOpeningHours('Mo-Su 07:00-24:00')!.days[0]).toEqual([[420, 1440]])
	})

	it('answers nothing for what it does not read, and never guesses', () => {
		for (const text of [
			'',
			'sunrise-sunset',
			'Mo-Fr 09:00-17:00; PH off',
			'Jun-Aug Mo-Su 10:00-20:00',
			'Mo-Fr',
			'by appointment',
			'Mo-Fr 09:00-17:00 "call ahead"',
			'Xx 09:00-17:00',
			'Mo 9-5',
		])
			expect(parseOpeningHours(text), text).toBeUndefined()
	})

	it('reads schema.org rules, one to an entry', () => {
		expect(parseSchemaHours(['Mo-Fr 07:00-17:00', 'Sa-Su 08:00-17:00'])!.days[6]).toEqual([[480, 1020]])
		expect(parseSchemaHours([])).toBeUndefined()
	})
})

describe('isOpenAt', () => {
	const cafe = parseOpeningHours('Mo-Fr 07:00-17:00; Sa,Su 08:00-17:00')!
	const bar = parseOpeningHours('Mo-Su 12:00-02:00')!

	it("reads the place's own clock", () => {
		// Wednesday 2026-09-30
		expect(localClock(cdt('2026-09-30T07:40:00'), AUSTIN)).toEqual({ day: 2, minutes: 460 })
		expect(isOpenAt(cafe, cdt('2026-09-30T07:40:00'), AUSTIN)).toBe(true)
		expect(isOpenAt(cafe, cdt('2026-09-30T06:59:00'), AUSTIN)).toBe(false)
		expect(isOpenAt(cafe, cdt('2026-09-30T17:00:00'), AUSTIN)).toBe(false)
		// the same instant is the evening before in Honolulu
		expect(isOpenAt(cafe, cdt('2026-09-30T07:40:00'), 'Pacific/Honolulu')).toBe(false)
	})

	it('stays open past midnight on the night before', () => {
		expect(isOpenAt(bar, cdt('2026-09-30T01:30:00'), AUSTIN)).toBe(true)
		expect(isOpenAt(bar, cdt('2026-09-30T02:00:00'), AUSTIN)).toBe(false)
		expect(isOpenAt(bar, cdt('2026-09-30T11:59:00'), AUSTIN)).toBe(false)
		expect(isOpenAt(bar, cdt('2026-09-30T23:59:00'), AUSTIN)).toBe(true)
		// closing at midnight is closed at midnight
		const early = parseOpeningHours('Mo-Su 07:00-24:00')!
		expect(isOpenAt(early, cdt('2026-09-30T23:59:00'), AUSTIN)).toBe(true)
		expect(isOpenAt(early, cdt('2026-10-01T00:00:00'), AUSTIN)).toBe(false)
	})

	it('opens at the same wall time on either side of a change of clocks', () => {
		// summer time ends in Austin on Sunday 2026-11-01 at 02:00; 08:30 that morning is 14:30 UTC, not 13:30
		expect(isOpenAt(cafe, new Date('2026-11-01T14:30:00Z'), AUSTIN)).toBe(true)
		expect(isOpenAt(cafe, new Date('2026-11-01T13:30:00Z'), AUSTIN)).toBe(false)
		// the Saturday before, 08:30 was 13:30 UTC
		expect(isOpenAt(cafe, new Date('2026-10-31T13:30:00Z'), AUSTIN)).toBe(true)
	})
})

describe('formatSpans', () => {
	it('writes a day as its spans', () => {
		const week = parseOpeningHours('Mo 10:00-14:00,17:00-22:00; Tu 12:00-02:00; We 07:00-24:00; Th off')!
		expect(formatSpans(week.days[0])).toBe('10:00–14:00, 17:00–22:00')
		expect(formatSpans(week.days[1])).toBe('12:00–02:00')
		expect(formatSpans(week.days[2])).toBe('07:00–24:00')
		expect(formatSpans(week.days[3])).toBe('')
		expect(spansOn(week, cdt('2026-09-30T09:00:00'), AUSTIN)).toEqual([[420, 1440]])
	})
})
