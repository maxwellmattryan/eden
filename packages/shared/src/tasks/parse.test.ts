import { describe, expect, it } from 'vitest'
import { parseTask, type ParseContext } from './parse.js'

// Wednesday 2026-09-30 at 11:50 in Chicago (16:50Z), the sample dataset's morning.
const NOW = Date.parse('2026-09-30T16:50:00Z')
const en: ParseContext = { now: NOW, zone: 'America/Chicago', weekStart: 'monday', lang: 'en' }
const ja: ParseContext = { ...en, zone: 'Asia/Tokyo', lang: 'ja', now: Date.parse('2026-09-30T02:50:00Z') }
const at = (day: string, time: string, zone = 'America/Chicago') => {
	const offset = zone === 'Asia/Tokyo' ? '+09:00' : '-05:00'
	return new Date(`${day}T${time}:00${offset}`).toISOString()
}

describe('a todo', () => {
	it('is the line alone, with no due, when nothing in it is a date or a time', () => {
		expect(parseTask('Book the dentist', en)).toEqual({ kind: 'todo', title: 'Book the dentist' })
	})

	it('reads today and tomorrow', () => {
		expect(parseTask('Renew library card today', en)).toEqual({
			kind: 'todo',
			title: 'Renew library card',
			due: '2026-09-30',
		})
		expect(parseTask('Call the vet tomorrow', en).due).toBe('2026-10-01')
		expect(parseTask('Call the vet on tomorrow', en).title).toBe('Call the vet')
	})

	it('reads a weekday as the next one strictly after today, whole or short', () => {
		expect(parseTask('Pick up parcel thursday', en)).toEqual({
			kind: 'todo',
			title: 'Pick up parcel',
			due: '2026-10-01',
		})
		expect(parseTask('Pick up parcel Thu', en).due).toBe('2026-10-01')
		expect(parseTask('Pick up parcel on wed', en).due).toBe('2026-10-07')
		expect(parseTask('Pick up parcel Wednesday', en).due).toBe('2026-10-07')
		expect(parseTask('Pick up parcel tues', en).due).toBe('2026-10-06')
	})

	it('reads next week as the first day of the owner week', () => {
		expect(parseTask('Plan the trip next week', en).due).toBe('2026-10-05')
		expect(parseTask('Plan the trip next week', { ...en, weekStart: 'sunday' }).due).toBe('2026-10-04')
	})

	it('reads in N days', () => {
		expect(parseTask('Water the fern in 3 days', en)).toEqual({
			kind: 'todo',
			title: 'Water the fern',
			due: '2026-10-03',
		})
		expect(parseTask('Water the fern in 1 day', en).due).toBe('2026-10-01')
	})

	it('reads MM-DD as the next such day, and YYYY-MM-DD as it is', () => {
		expect(parseTask('File the claim 10-03', en).due).toBe('2026-10-03')
		expect(parseTask('File the claim 09-29', en).due).toBe('2027-09-29')
		expect(parseTask('File the claim 2027-02-01', en)).toEqual({
			kind: 'todo',
			title: 'File the claim',
			due: '2027-02-01',
		})
		expect(parseTask('Leap day 02-29', en).due).toBe('2028-02-29')
	})

	it('reads 3pm, 3:30pm and 15:00 as a time, and a time with a date as an instant in the owner zone', () => {
		expect(parseTask('Call dentist tomorrow 3pm', en)).toEqual({
			kind: 'todo',
			title: 'Call dentist',
			due: at('2026-10-01', '15:00'),
		})
		expect(parseTask('Call dentist tomorrow at 3:30pm', en).due).toBe(at('2026-10-01', '15:30'))
		expect(parseTask('Call dentist tomorrow 15:00', en).due).toBe(at('2026-10-01', '15:00'))
		expect(parseTask('Call dentist tomorrow 12am', en).due).toBe(at('2026-10-01', '00:00'))
		expect(parseTask('Call dentist tomorrow 12pm', en).due).toBe(at('2026-10-01', '12:00'))
		// the same morning in Tokyo: the same wall time on the same day there, a different instant
		expect(parseTask('Call dentist tomorrow 3pm', { ...ja, lang: 'en' }).due).toBe(
			at('2026-10-01', '15:00', 'Asia/Tokyo')
		)
	})

	it('reads a time alone as today while it is still ahead, and else as tomorrow', () => {
		expect(parseTask('Stand-up 3pm', en).due).toBe(at('2026-09-30', '15:00'))
		expect(parseTask('Stand-up 9am', en).due).toBe(at('2026-10-01', '09:00'))
	})

	it('does not read a bare number as a time, nor an hour past the clock', () => {
		expect(parseTask('Order 3 lemons', en)).toEqual({ kind: 'todo', title: 'Order 3 lemons' })
		expect(parseTask('Room 25:00 booking', en)).toEqual({ kind: 'todo', title: 'Room 25:00 booking' })
		expect(parseTask('Bus 13pm', en)).toEqual({ kind: 'todo', title: 'Bus 13pm' })
	})

	it('keeps the whole line as the title when nothing else is left of it', () => {
		expect(parseTask('tomorrow', en)).toEqual({ kind: 'todo', title: 'tomorrow', due: '2026-10-01' })
		expect(parseTask('  3pm  ', en).title).toBe('3pm')
	})
})

describe('a routine', () => {
	const daily = { freq: 'daily', start: '2026-09-30' }

	it('repeats every day, or daily', () => {
		expect(parseTask('Morning LMNT every day', en)).toEqual({
			kind: 'routine',
			title: 'Morning LMNT',
			recurrence: daily,
		})
		expect(parseTask('Morning LMNT daily', en).recurrence).toEqual(daily)
	})

	it('takes its time of day, and its due stays unset', () => {
		expect(parseTask('Morning LMNT every day 6:50am', en)).toEqual({
			kind: 'routine',
			title: 'Morning LMNT',
			recurrence: daily,
			timeOfDay: '06:50',
		})
	})

	it('repeats every weekday', () => {
		expect(parseTask('Stand-up every weekday 9am', en).recurrence).toEqual({
			freq: 'weekly',
			start: '2026-09-30',
			weekdays: ['mo', 'tu', 'we', 'th', 'fr'],
		})
	})

	it('repeats on the weekdays it names', () => {
		expect(parseTask('Gym every mon thu', en)).toEqual({
			kind: 'routine',
			title: 'Gym',
			recurrence: { freq: 'weekly', start: '2026-09-30', weekdays: ['mo', 'th'] },
		})
		expect(parseTask('Gym every monday, thursday and saturday', en).recurrence).toEqual({
			freq: 'weekly',
			start: '2026-09-30',
			weekdays: ['mo', 'th', 'sa'],
		})
	})

	it('repeats every week, or weekly, from the day it names or from today', () => {
		expect(parseTask('Review the week every week', en).recurrence).toEqual({ freq: 'weekly', start: '2026-09-30' })
		expect(parseTask('Review the week weekly friday', en).recurrence).toEqual({
			freq: 'weekly',
			start: '2026-10-02',
		})
	})

	it('repeats every N days', () => {
		expect(parseTask('Water the fern every 3 days', en).recurrence).toEqual({
			freq: 'daily',
			start: '2026-09-30',
			interval: 3,
		})
	})

	it('repeats every month and every year, from the day it names', () => {
		expect(parseTask('Pay rent every month', en).recurrence).toEqual({ freq: 'monthly', start: '2026-09-30' })
		expect(parseTask('Pay rent every month 10-01', en).recurrence).toEqual({ freq: 'monthly', start: '2026-10-01' })
		expect(parseTask('Renew the domain every year 2027-03-01', en).recurrence).toEqual({
			freq: 'yearly',
			start: '2027-03-01',
		})
	})
})

describe('a habit', () => {
	it('is N x a day or a week, and N times a week', () => {
		expect(parseTask('Stretch 3x a week', en)).toEqual({
			kind: 'habit',
			title: 'Stretch',
			target: { count: 3, per: 'week' },
		})
		expect(parseTask('Drink water 8 x a day', en).target).toEqual({ count: 8, per: 'day' })
		expect(parseTask('Stretch 3 times a week', en).target).toEqual({ count: 3, per: 'week' })
		expect(parseTask('Stretch 2 times per day', en).target).toEqual({ count: 2, per: 'day' })
	})

	it('takes its target and nothing else', () => {
		expect(parseTask('Stretch 3x a week tomorrow', en)).toEqual({
			kind: 'habit',
			title: 'Stretch tomorrow',
			target: { count: 3, per: 'week' },
		})
	})
})

describe('in Japanese', () => {
	it('reads 今日 and 明日', () => {
		expect(parseTask('図書館カードの更新 今日', ja)).toEqual({
			kind: 'todo',
			title: '図書館カードの更新',
			due: '2026-09-30',
		})
		expect(parseTask('明日 獣医に電話', ja)).toEqual({ kind: 'todo', title: '獣医に電話', due: '2026-10-01' })
	})

	it('reads a weekday with or without 日', () => {
		expect(parseTask('荷物を受け取る 木曜', ja).due).toBe('2026-10-01')
		expect(parseTask('荷物を受け取る 木曜日', ja).due).toBe('2026-10-01')
		expect(parseTask('荷物を受け取る 水曜日', ja).due).toBe('2026-10-07')
	})

	it('reads N時 and N時M分, in half-width or full-width digits', () => {
		expect(parseTask('歯医者に電話 明日 15時', ja)).toEqual({
			kind: 'todo',
			title: '歯医者に電話',
			due: at('2026-10-01', '15:00', 'Asia/Tokyo'),
		})
		expect(parseTask('歯医者に電話 明日15時30分', ja).due).toBe(at('2026-10-01', '15:30', 'Asia/Tokyo'))
		expect(parseTask('歯医者に電話 明日１５時', ja).due).toBe(at('2026-10-01', '15:00', 'Asia/Tokyo'))
	})

	it('reads 毎日 and 毎週, with the weekdays 毎週 names', () => {
		expect(parseTask('朝のLMNT 毎日 6時50分', ja)).toEqual({
			kind: 'routine',
			title: '朝のLMNT',
			recurrence: { freq: 'daily', start: '2026-09-30' },
			timeOfDay: '06:50',
		})
		expect(parseTask('週の振り返り 毎週', ja).recurrence).toEqual({ freq: 'weekly', start: '2026-09-30' })
		expect(parseTask('ジム 毎週月曜・木曜', ja)).toEqual({
			kind: 'routine',
			title: 'ジム',
			recurrence: { freq: 'weekly', start: '2026-09-30', weekdays: ['mo', 'th'] },
		})
	})

	it('reads the English forms too', () => {
		expect(parseTask('歯医者に電話 tomorrow 3pm', ja).due).toBe(at('2026-10-01', '15:00', 'Asia/Tokyo'))
		expect(parseTask('ストレッチ 3x a week', ja).target).toEqual({ count: 3, per: 'week' })
	})
})
