// The sample accounts, matching #70's mocked Accounts page so the mock and the build agree: Chase asking to be signed
// in again three days after its last good sync, Ally, M1 and Fidelity synced this morning, a Japan Post savings account
// in yen entered by hand, the car valued on the first of the month and a little Bitcoin. One snapshot per account for
// today. M1 holds VTI (three days of closes), SCHD with no cost basis and cash; the Fidelity 401(k) holds FXAIX and a
// stable value fund Plaid gives no price for, its value typed 120 days ago so it reads out of date (D-197). Each
// account's holdings add up to its balance. The Sapphire card has a 24.99 % purchase APR and a 10,000.00 limit, and the
// auto loan 5.90 % at 412.00 a month on the 5th (#86). Times are relative to `now`, so the freshness reads the same whenever the
// seed runs.
import { dateIn, instantAt } from '../../dates/index.js'
import { money } from '../../money/index.js'
import {
	WHOLE,
	type Account,
	type AccountKind,
	type FinanceData,
	type Holding,
	type Liability,
	type ProviderLink,
	type Security,
	type Snapshot,
} from './types.js'

const DAY = 24 * 60 * 60 * 1000

export function seedData(now: number = Date.now()): FinanceData {
	const today = dateIn(undefined, now)
	/** Today at a time on the device's clock, or a little before now while that time is still ahead. */
	const thisMorning = (time: string) => {
		const at = instantAt(today, time, undefined)
		return new Date(at <= now ? at : now - 5 * 60 * 1000).toISOString()
	}
	const usd = (minor: number) => money(minor, 'USD')

	const link = (id: string, name: string, colour: string, lastSyncedAt: string, status: ProviderLink['status']) =>
		({ id, provider: 'plaid', institution: { name, colour }, status, lastSyncedAt }) satisfies ProviderLink
	const links: ProviderLink[] = [
		link('l-chase', 'Chase', '#117ACA', new Date(now - 3 * DAY).toISOString(), 'needs-reauth'),
		link('l-ally', 'Ally', '#650360', thisMorning('07:12'), 'ok'),
		link('l-m1', 'M1', '#1F2A44', thisMorning('07:05'), 'ok'),
		link('l-fidelity', 'Fidelity', '#368727', thisMorning('06:58'), 'ok'),
	]
	const linkOf = (id: string) => links.find((entry) => entry.id === id)!

	const linked = (id: string, linkId: string, name: string, kind: AccountKind, last4: string, minor: number) => {
		const source = linkOf(linkId)
		return {
			id,
			name,
			kind,
			currency: 'USD',
			institution: source.institution.name,
			linkId,
			last4,
			balance: usd(minor),
			balanceAt: source.lastSyncedAt,
			share: WHOLE,
			lastSnapshot: { id: `s-${id}`, day: today },
		} satisfies Account
	}
	const accounts: Account[] = [
		linked('a-checking', 'l-chase', 'Chase Total Checking', 'checking', '4417', 341218),
		linked('a-sapphire', 'l-chase', 'Chase Sapphire Preferred', 'credit-card', '8823', 120418),
		linked('a-auto', 'l-chase', 'Chase Auto Loan', 'loan', '6610', 981200),
		linked('a-ally', 'l-ally', 'Ally Online Savings', 'savings', '2290', 1280000),
		linked('a-m1', 'l-m1', 'M1 Brokerage', 'investment', '5501', 964055),
		linked('a-401k', 'l-fidelity', 'Fidelity 401(k)', 'retirement', '0912', 2138840),
		{
			id: 'a-yucho',
			name: 'Japan Post Bank Yucho savings',
			kind: 'savings',
			currency: 'JPY',
			last4: '7731',
			balance: money(84000, 'JPY'),
			balanceAt: new Date(now).toISOString(),
			share: WHOLE,
			lastSnapshot: { id: 's-a-yucho', day: today },
		},
	]
	const snapshots: Snapshot[] = accounts.map((account) => ({
		id: account.lastSnapshot!.id,
		accountId: account.id,
		day: today,
		balance: account.balance!,
	}))

	const daysAgo = (days: number) => dateIn(undefined, now - days * DAY)
	const securities: Security[] = [
		{
			id: 'sec-vti',
			name: 'Vanguard Total Stock Market ETF',
			ticker: 'VTI',
			type: 'etf',
			currency: 'USD',
			prices: [
				{ day: daysAgo(2), price: '284.10' },
				{ day: daysAgo(1), price: '285.42' },
				{ day: today, price: '286.00' },
			],
		},
		{
			id: 'sec-schd',
			name: 'Schwab U.S. Dividend Equity ETF',
			ticker: 'SCHD',
			type: 'etf',
			currency: 'USD',
			prices: [{ day: today, price: '27.31' }],
		},
		{ id: 'sec-usd', name: 'U.S. Dollar', type: 'cash', currency: 'USD', prices: [{ day: today, price: '1' }] },
		{
			id: 'sec-fxaix',
			name: 'Fidelity 500 Index Fund',
			ticker: 'FXAIX',
			type: 'mutual-fund',
			currency: 'USD',
			prices: [{ day: today, price: '189.155' }],
		},
		{ id: 'sec-stable', name: 'Fidelity Stable Value', type: 'other', currency: 'USD', prices: [] },
	]
	const held = (
		id: string,
		accountId: string,
		securityId: string,
		quantity: string,
		value: number | undefined,
		basis: number | undefined
	): Holding => ({
		id,
		accountId,
		securityId,
		quantity,
		currency: 'USD',
		...(value === undefined ? {} : { value: usd(value), pricedOn: today }),
		...(basis === undefined ? {} : { costBasis: usd(basis), costBasisBy: 'provider' as const }),
	})
	const holdings: Holding[] = [
		held('h-vti', 'a-m1', 'sec-vti', '21.4', 612035, 521000),
		held('h-schd', 'a-m1', 'sec-schd', '88.25', 241011, undefined),
		held('h-usd', 'a-m1', 'sec-usd', '1110.09', 111009, 111009),
		held('h-fxaix', 'a-401k', 'sec-fxaix', '102.5', 1938840, 1490218),
		{
			...held('h-stable', 'a-401k', 'sec-stable', '1850.0412', undefined, 185000),
			typedValue: { value: usd(200000), on: daysAgo(120) },
		},
	]

	// what the debts cost (#86): the Sapphire's purchase APR and limit as Chase states them, and the auto loan's terms as
	// the owner typed them
	const liabilities: Liability[] = [
		{
			id: 'li-sapphire',
			accountId: 'a-sapphire',
			aprs: [{ kind: 'purchase', rate: 2499 }],
			limit: usd(1000000),
		},
		{ id: 'li-auto', accountId: 'a-auto', rate: 590, payment: usd(41200), dueDay: 5 },
	]

	return {
		links,
		accounts,
		snapshots,
		securities,
		holdings,
		liabilities,
		assets: [
			{
				id: 'as-subaru',
				name: '2019 Subaru Outback',
				kind: 'vehicle',
				value: usd(1420000),
				valuedOn: `${today.slice(0, 8)}01`,
				share: WHOLE,
			},
			{
				id: 'as-bitcoin',
				name: 'Bitcoin in cold storage',
				kind: 'crypto',
				value: usd(259560),
				valuedOn: today,
				quantity: '0.0412',
				unit: 'BTC',
				share: WHOLE,
			},
		],
	}
}
