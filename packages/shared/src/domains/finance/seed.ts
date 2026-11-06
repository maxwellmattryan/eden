// The sample accounts, matching #70's mocked Accounts page so the mock and the build agree: Chase asking to be signed
// in again three days after its last good sync, Ally, M1 and Fidelity synced this morning, a Japan Post savings account
// in yen entered by hand, the car valued on the first of the month and a little Bitcoin. One snapshot per account for
// today. Times are relative to `now`, so the freshness reads the same whenever the seed runs.
import { dateIn, instantAt } from '../../dates/index.js'
import { money } from '../../money/index.js'
import { WHOLE, type Account, type AccountKind, type FinanceData, type ProviderLink, type Snapshot } from './types.js'

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

	return {
		links,
		accounts,
		snapshots,
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
