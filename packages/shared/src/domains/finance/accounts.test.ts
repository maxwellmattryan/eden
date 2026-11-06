import { describe, expect, it } from 'vitest'
import { dateIn } from '../../dates/index.js'
import { money } from '../../money/index.js'
import { accountGroups, accountTotals, lineage, linkState, replaceCandidates } from './accounts.js'
import { seedData } from './seed.js'
import type { Account, ProviderLink } from './types.js'
import { leftOutLine, parseShare, shareText } from './words.js'

const NOW = Date.parse('2026-09-30T15:00:00Z')
const HOUR = 60 * 60 * 1000
const seed = seedData(NOW)
const totals = (home: string, accounts: Account[] = seed.accounts) =>
	accountTotals({ accounts, assets: seed.assets, links: seed.links, home, now: NOW })

describe('totals', () => {
	it('counts the seed in USD and leaves out the yen account', () => {
		const sum = totals('USD')
		expect(sum.assets).toEqual(money(6403673, 'USD'))
		expect(sum.debts).toEqual(money(1101618, 'USD'))
		expect(sum.netWorth).toEqual(money(5302055, 'USD'))
		expect(sum.left).toEqual([{ currency: 'JPY', count: 1 }])
	})

	it('counts the yen account alone in JPY, and leaves out every USD account and asset', () => {
		const sum = totals('JPY')
		expect(sum.netWorth).toEqual(money(84000, 'JPY'))
		expect(sum.debts).toEqual(money(0, 'JPY'))
		// six USD accounts and two USD assets
		expect(sum.left).toEqual([{ currency: 'USD', count: 8 }])
		expect(sum.staleSince).toBeUndefined()
	})

	it('counts a closed account nowhere', () => {
		const closed = seed.accounts.map((account) =>
			account.id === 'a-sapphire' || account.id === 'a-yucho' ? { ...account, closedOn: '2026-09-29' } : account
		)
		const sum = totals('USD', closed)
		expect(sum.debts).toEqual(money(981200, 'USD'))
		expect(sum.netWorth).toEqual(money(5302055 + 120418, 'USD'))
		expect(sum.left).toEqual([])
	})

	it('halves the contribution of an account held at a 50% share', () => {
		const shared = seed.accounts.map((account) => (account.id === 'a-ally' ? { ...account, share: 5000 } : account))
		expect(totals('USD', shared).netWorth).toEqual(money(5302055 - 640000, 'USD'))
		const owed = seed.accounts.map((account) => (account.id === 'a-sapphire' ? { ...account, share: 5000 } : account))
		expect(totals('USD', owed).debts).toEqual(money(1101618 - 60209, 'USD'))
	})

	it("sets staleSince to the last good day of a stale link's counted account", () => {
		const chase = seed.links.find((link) => link.institution.name === 'Chase')!
		expect(totals('USD').staleSince).toBe(dateIn(undefined, Date.parse(chase.lastSyncedAt!)))
		// an account whose link is not on this device is as of its own balance
		const orphan = totals('USD', [
			{ ...seed.accounts[3]!, linkId: 'gone', balanceAt: '2026-09-20T12:00:00Z' },
			seed.accounts[4]!,
		])
		expect(orphan.staleSince).toBe('2026-09-20')
	})
})

describe('words', () => {
	const tr = (key: string, options?: { values?: Record<string, string | number> }) =>
		`${key}${JSON.stringify(options?.values ?? {})}`

	it('names the currencies the totals leave out, with the count of what is in them', () => {
		expect(leftOutLine(totals('USD').left, tr, 'en')).toBe(
			'domains.finance.totals.leftOut{"count":1,"currencies":"JPY"}'
		)
		expect(
			leftOutLine(
				[
					{ currency: 'JPY', count: 1 },
					{ currency: 'EUR', count: 1 },
				],
				tr,
				'en'
			)
		).toBe('domains.finance.totals.leftOut{"count":2,"currencies":"JPY and EUR"}')
		expect(leftOutLine([], tr, 'en')).toBeUndefined()
	})

	it('reads a share from 0.01 to 100 with at most two decimals, and writes it back', () => {
		expect([parseShare('100'), parseShare('50'), parseShare('0.01'), parseShare('33.33')]).toEqual([
			10000, 5000, 1, 3333,
		])
		for (const bad of ['0', '100.01', '1.234', '-5', 'half', '']) expect(parseShare(bad), bad).toBeUndefined()
		expect([shareText(5000), shareText(3333), shareText(1), shareText(10000), shareText(5050)]).toEqual([
			'50',
			'33.33',
			'0.01',
			'100',
			'50.5',
		])
	})
})

describe('link state', () => {
	const link: ProviderLink = {
		id: 'l',
		provider: 'plaid',
		institution: { name: 'Ally' },
		status: 'ok',
		lastSyncedAt: new Date(NOW - HOUR).toISOString(),
	}

	it('is ok while the last sync is within a day and the consent is not ending', () => {
		expect(linkState(link, NOW)).toBe('ok')
		expect(linkState({ ...link, lastSyncedAt: new Date(NOW - 24 * HOUR).toISOString() }, NOW)).toBe('ok')
	})

	it('is stale when its status is not ok, or its last sync is more than 24 hours old', () => {
		expect(linkState({ ...link, status: 'needs-reauth' }, NOW)).toBe('stale')
		expect(linkState({ ...link, status: 'error' }, NOW)).toBe('stale')
		expect(linkState({ ...link, lastSyncedAt: new Date(NOW - 24 * HOUR - 1).toISOString() }, NOW)).toBe('stale')
		expect(linkState({ ...link, lastSyncedAt: undefined }, NOW)).toBe('stale')
	})

	it('is expiring when the consent ends within 7 days, and stale outranks it', () => {
		const ending = { ...link, consentExpiresAt: new Date(NOW + 7 * 24 * HOUR).toISOString() }
		expect(linkState(ending, NOW)).toBe('expiring')
		expect(linkState({ ...ending, consentExpiresAt: new Date(NOW + 8 * 24 * HOUR).toISOString() }, NOW)).toBe('ok')
		expect(linkState({ ...ending, status: 'needs-reauth' }, NOW)).toBe('stale')
	})
})

describe('groups', () => {
	it('orders the links by name, then the hand-entered accounts, the assets and the closed ones', () => {
		const accounts = seed.accounts.map((account) =>
			account.id === 'a-auto' ? { ...account, closedOn: '2026-09-29' } : account
		)
		const groups = accountGroups(
			[...accounts, { ...seed.accounts[3]!, id: 'a-orphan', linkId: 'gone', institution: 'Schwab' }],
			seed.assets,
			seed.links,
			NOW
		)
		expect(groups.map((group) => [group.kind, group.id])).toEqual([
			['link', 'l-ally'],
			['link', 'l-chase'],
			['link', 'l-fidelity'],
			['link', 'l-m1'],
			['institution', 'institution:Schwab'],
			['manual', 'manual'],
			['assets', 'assets'],
			['closed', 'closed'],
		])
		const chase = groups[1]!
		expect(chase.kind === 'link' && [chase.state, chase.accounts.map((account) => account.id)]).toEqual([
			'stale',
			['a-checking', 'a-sapphire'],
		])
	})
})

describe('replacement', () => {
	const account = (id: string, replaces?: string): Account => ({
		id,
		name: id,
		kind: 'checking',
		currency: 'USD',
		share: 10000,
		...(replaces ? { replaces } : {}),
	})
	// c replaced b, which replaced a; d stands alone
	const chain = [account('a'), account('b', 'a'), account('c', 'b'), account('d')]

	it('follows replaces back to the first account', () => {
		expect(lineage(chain, 'c').map((entry) => entry.id)).toEqual(['c', 'b', 'a'])
		expect(lineage(chain, 'd').map((entry) => entry.id)).toEqual(['d'])
		// a loop in the rows ends where it meets itself
		expect(lineage([account('x', 'y'), account('y', 'x')], 'x').map((entry) => entry.id)).toEqual(['x', 'y'])
	})

	it('leaves out the account itself, accounts already replaced, and cycles', () => {
		// a and b have their replacement already, so d may name c alone
		expect(replaceCandidates(chain, 'd').map((entry) => entry.id)).toEqual(['c'])
		// a may not name b (replaced already) nor c (which comes after a: a loop), only d
		expect(replaceCandidates(chain, 'a').map((entry) => entry.id)).toEqual(['d'])
		expect(replaceCandidates([account('only')], 'only')).toEqual([])
	})
})
