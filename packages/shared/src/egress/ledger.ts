// What the Privacy tab shows of the ledger: the last days, and the Vault → AI row at zero, which the store never holds
// and the page always draws (D-71).
import { daysFromToday } from '../dates/index.js'
import { VAULT_AI, type EgressRow } from './types.js'

/** The rows of the last `days` days, today included, in the store's order: the latest day first. */
export function lastDays(rows: readonly EgressRow[], days: number, today: string): EgressRow[] {
	const first = shift(today, 1 - days)
	return rows.filter((row) => row.day >= first && row.day <= today)
}

/** The rows with the Vault → AI row for today at the end, at zero. */
export function withVaultRow(rows: readonly EgressRow[], today: string): EgressRow[] {
	return [...rows, { destination: VAULT_AI, day: today, requests: 0, bytesOut: 0 }]
}

/** The ISO date `days` from an ISO date, in local time, by the same arithmetic as `daysFromToday`. */
function shift(isoDate: string, days: number): string {
	const [y, m, d] = isoDate.split('-').map(Number)
	const date = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The first day a query for the last `days` days asks for. */
export function firstOfLast(days: number): string {
	return daysFromToday(1 - days)
}
