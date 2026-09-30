import { describe, expect, it } from 'vitest'
import { lastDays, withVaultRow } from './ledger.js'
import type { EgressRow } from './types.js'

const row = (destination: string, day: string): EgressRow => ({ destination, day, requests: 1, bytesOut: 100 })

describe('ledger', () => {
	it('adds the Vault → AI row at zero and keeps seven days', () => {
		const rows = [row('nws', '2026-09-29'), row('open-meteo', '2026-09-23'), row('open-meteo', '2026-09-22')]
		const week = lastDays(rows, 7, '2026-09-29')
		expect(week.map((entry) => entry.day)).toEqual(['2026-09-29', '2026-09-23'])
		const shown = withVaultRow(week, '2026-09-29')
		expect(shown.at(-1)).toEqual({ destination: 'vault-ai', day: '2026-09-29', requests: 0, bytesOut: 0 })
		expect(shown).toHaveLength(3)
	})

	it('crosses a month boundary', () => {
		const rows = [row('nws', '2026-09-25'), row('nws', '2026-09-24')]
		expect(lastDays(rows, 7, '2026-10-01').map((entry) => entry.day)).toEqual(['2026-09-25'])
	})
})
