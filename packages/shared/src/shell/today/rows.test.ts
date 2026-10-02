import { describe, expect, it } from 'vitest'
import type { TodayItem } from '../../tasks/index.js'
import { primaryAction } from './rows.js'

const item = (section: TodayItem['section'], done = false) => ({ section, done }) as TodayItem

describe('primaryAction', () => {
	it('is Done for what is due, Log one for a habit, and Not done for a routine already done', () => {
		expect(primaryAction(item('overdue'))).toBe('done')
		expect(primaryAction(item('due'))).toBe('done')
		expect(primaryAction(item('routines'))).toBe('done')
		expect(primaryAction(item('routines', true))).toBe('reopen')
		expect(primaryAction(item('habits'))).toBe('log')
	})
})
