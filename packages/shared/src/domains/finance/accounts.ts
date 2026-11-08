// Orchard's rules over its accounts, pure so they are tested here: how fresh a bank's link is, what the totals come to
// in the home currency and what they leave out, how the page groups its rows, which accounts one may say it replaced,
// and the writes behind each change, every one with the writes that take it back. Days are local calendar days and
// `now` is passed in, so a page's ticking clock decides when a link goes stale.
import { toUri, type BatchOp } from '../../data/index.js'
import { dateIn } from '../../dates/index.js'
import { money, negate, addMoney, shareOf, type Money } from '../../money/index.js'
import {
	FINANCE,
	isDebt,
	type Account,
	type AccountPayload,
	type Asset,
	type LinkState,
	type ProviderLink,
	type SnapshotPayload,
} from './types.js'

const HOUR = 60 * 60 * 1000
/** A link's last good sync older than this is stale: syncs run hourly (D-183), so a day is a whole day of misses. */
export const STALE_AFTER = 24 * HOUR
/** A consent ending within this is expiring: the window Plaid warns in. */
export const EXPIRING_WITHIN = 7 * 24 * HOUR

/** A link's institution colour the page draws as a swatch: `#RRGGBB` only. */
export const INSTITUTION_COLOUR = /^#[0-9a-fA-F]{6}$/
/** A link's institution logo the page draws: a base64 PNG data URL only. */
export const INSTITUTION_LOGO = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/

/** The local calendar day of an instant. */
export const dayOfInstant = (iso: string) => dateIn(undefined, Date.parse(iso))

/** How the link is: stale outranks expiring. */
export function linkState(link: ProviderLink, now: number): LinkState {
	if (link.status !== 'ok') return 'stale'
	const synced = link.lastSyncedAt ? Date.parse(link.lastSyncedAt) : Number.NaN
	if (!Number.isFinite(synced) || now - synced > STALE_AFTER) return 'stale'
	const ends = link.consentExpiresAt ? Date.parse(link.consentExpiresAt) : Number.NaN
	if (Number.isFinite(ends) && ends - now <= EXPIRING_WITHIN) return 'expiring'
	return 'ok'
}

const isOpen = (account: Account) => !account.closedOn

/**
 * The day an account's balance is as of when it is not fresh: its link's last good sync while that link is stale, its
 * own `balanceAt` while its link is not on this device. Nothing for a fresh or a hand-entered account.
 */
export function staleDay(account: Account, links: readonly ProviderLink[], now: number): string | undefined {
	if (!account.linkId) return undefined
	const link = links.find((entry) => entry.id === account.linkId)
	if (link) {
		if (linkState(link, now) !== 'stale') return undefined
		const at = link.lastSyncedAt ?? account.balanceAt
		return at ? dayOfInstant(at) : undefined
	}
	return account.balanceAt ? dayOfInstant(account.balanceAt) : undefined
}

export interface Totals {
	assets: Money
	/** Owed, as a positive amount. */
	debts: Money
	netWorth: Money
	/** What is left out for being in another currency, by currency in the order first met; assets count as accounts. */
	left: { currency: string; count: number }[]
	/** The earliest day a counted balance is as of, when any is stale. */
	staleSince?: string
}

/**
 * Every open account and every asset in the home currency, each at the owner's share: what is owned, what is owed and
 * the difference. An account with no balance yet counts in nothing; a closed one in nothing at all.
 */
export function accountTotals(input: {
	accounts: readonly Account[]
	assets: readonly Asset[]
	links: readonly ProviderLink[]
	home: string
	now: number
}): Totals {
	const { home, links, now } = input
	let assets = money(0, home)
	let debts = money(0, home)
	const left = new Map<string, number>()
	let staleSince: string | undefined
	const leave = (currency: string) => left.set(currency, (left.get(currency) ?? 0) + 1)

	for (const account of input.accounts) {
		if (!isOpen(account) || !account.balance) continue
		if (account.balance.currency !== home) {
			leave(account.balance.currency)
			continue
		}
		const part = shareOf(account.balance, account.share)
		if (isDebt(account.kind)) debts = addMoney(debts, part)
		else assets = addMoney(assets, part)
		const stale = staleDay(account, links, now)
		if (stale && (!staleSince || stale < staleSince)) staleSince = stale
	}
	for (const asset of input.assets) {
		if (asset.value.currency !== home) {
			leave(asset.value.currency)
			continue
		}
		assets = addMoney(assets, shareOf(asset.value, asset.share))
	}
	return {
		assets,
		debts,
		netWorth: addMoney(assets, negate(debts)),
		left: [...left].map(([currency, count]) => ({ currency, count })),
		...(staleSince ? { staleSince } : {}),
	}
}

export type AccountGroup =
	| { kind: 'link'; id: string; link: ProviderLink; state: LinkState; accounts: Account[] }
	/** Accounts of a bank with no live link here: their link is another device's, or gone, or they were typed in. */
	| { kind: 'institution'; id: string; name: string; accounts: Account[] }
	| { kind: 'manual'; id: 'manual'; accounts: Account[] }
	| { kind: 'assets'; id: 'assets'; assets: Asset[] }
	| { kind: 'closed'; id: 'closed'; accounts: Account[] }

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

/**
 * The page's groups, in order: each link on this device by its institution's name (with its open accounts, even
 * none), then the open accounts of a bank with no live link here by that bank's name, then the ones entered by hand
 * with no bank named, the assets and the closed accounts, latest closed first. An empty group is left out.
 */
export function accountGroups(
	accounts: readonly Account[],
	assets: readonly Asset[],
	links: readonly ProviderLink[],
	now: number
): AccountGroup[] {
	const open = accounts.filter(isOpen)
	const linked = new Set(links.map((link) => link.id))
	const groups: AccountGroup[] = [...links]
		.sort((a, b) => byName(a.institution.name, b.institution.name))
		.map((link) => ({
			kind: 'link' as const,
			id: link.id,
			link,
			state: linkState(link, now),
			accounts: open.filter((account) => account.linkId === link.id),
		}))

	const banks = new Map<string, Account[]>()
	const manual: Account[] = []
	for (const account of open) {
		if (account.linkId && linked.has(account.linkId)) continue
		const name = account.institution?.trim()
		if (!name) manual.push(account)
		else banks.set(name, [...(banks.get(name) ?? []), account])
	}
	for (const [name, members] of [...banks].sort(([a], [b]) => byName(a, b)))
		groups.push({ kind: 'institution', id: `institution:${name}`, name, accounts: members })
	if (manual.length) groups.push({ kind: 'manual', id: 'manual', accounts: manual })
	if (assets.length) groups.push({ kind: 'assets', id: 'assets', assets: [...assets] })
	const closed = accounts.filter((account) => !isOpen(account))
	if (closed.length)
		groups.push({
			kind: 'closed',
			id: 'closed',
			accounts: closed.sort((a, b) => (b.closedOn ?? '').localeCompare(a.closedOn ?? '')),
		})
	return groups
}

/** The account and the ones it replaced, back to the first. */
export function lineage(accounts: readonly Account[], id: string): Account[] {
	const out: Account[] = []
	const seen = new Set<string>()
	let next: string | undefined = id
	while (next && !seen.has(next)) {
		seen.add(next)
		const account = accounts.find((entry) => entry.id === next)
		if (!account) break
		out.push(account)
		next = account.replaces
	}
	return out
}

/**
 * The accounts this one may say it replaced, open or closed: never itself, never one that has a replacement already,
 * and never one that comes after it, which would make a loop.
 */
export function replaceCandidates(accounts: readonly Account[], id: string): Account[] {
	const replaced = new Set(accounts.flatMap((account) => (account.replaces ? [account.replaces] : [])))
	return accounts.filter(
		(account) =>
			account.id !== id && !replaced.has(account.id) && !lineage(accounts, account.id).some((entry) => entry.id === id)
	)
}

// ---- The writes ------------------------------------------------------------------------------------------------

/** A record's payload: what is left without its id. */
export function payloadOf<T extends { id: string }>(record: T): Omit<T, 'id'> {
	const { id: _id, ...rest } = record
	return rest
}

/** A change as the writes that store it and the writes that take it back. */
export interface Ops {
	ops: BatchOp[]
	inverse: BatchOp[]
}

const update = (record: { id: string }): BatchOp => ({ op: 'updateEntity', id: record.id, payload: payloadOf(record) })

/**
 * A balance as of now: the account takes it, and its snapshot for the day is made, or updated when the account has
 * one for that day already. With `created`, the account is new and is made with the balance in the same write.
 */
export function balanceOps(
	account: Account,
	balance: Money,
	nowIso: string,
	day: string,
	newId: () => string,
	options: { created?: boolean } = {}
): Ops & { account: Account } {
	const same = account.lastSnapshot?.day === day ? account.lastSnapshot : undefined
	const snapshotId = same?.id ?? newId()
	const next: Account = { ...account, balance, balanceAt: nowIso, lastSnapshot: { id: snapshotId, day } }
	const snapshot: SnapshotPayload = { accountId: account.id, day, balance }
	const snapshotUri = toUri(FINANCE.snapshot, snapshotId)
	const ops: BatchOp[] = [
		options.created
			? { op: 'createEntity', input: { id: next.id, type: FINANCE.account, payload: payloadOf(next) } }
			: update(next),
		same
			? { op: 'updateEntity', id: snapshotId, payload: snapshot }
			: { op: 'createEntity', input: { id: snapshotId, type: FINANCE.snapshot, payload: snapshot } },
	]
	const inverse: BatchOp[] = options.created
		? [
				{ op: 'delete', uri: snapshotUri },
				{ op: 'delete', uri: toUri(FINANCE.account, account.id) },
			]
		: [
				update(account),
				same && account.balance
					? { op: 'updateEntity', id: snapshotId, payload: { ...snapshot, balance: account.balance } }
					: { op: 'delete', uri: snapshotUri },
			]
	return { account: next, ops, inverse }
}

/** Closes the account as of the day; it leaves every total. */
export function closeOps(account: Account, day: string): Ops & { account: Account } {
	const next: Account = { ...account, closedOn: day }
	return { account: next, ops: [update(next)], inverse: [update(account)] }
}

/** Opens a closed account again. */
export function reopenOps(account: Account): Ops & { account: Account } {
	const { closedOn: _closed, ...next } = account
	return { account: next, ops: [update(next)], inverse: [update(account)] }
}

/** The account replaced the old one: its history carries on, and the old one closes as of the day if it is open. */
export function replaceOps(account: Account, old: Account, day: string): Ops & { account: Account; old: Account } {
	const next: Account = { ...account, replaces: old.id }
	const closed: Account = old.closedOn ? old : { ...old, closedOn: day }
	return {
		account: next,
		old: closed,
		ops: [update(next), ...(closed === old ? [] : [update(closed)])],
		inverse: [update(account), ...(closed === old ? [] : [update(old)])],
	}
}

/**
 * Leaving a bank: every open account of the link closes as of the day, keeping its balance and snapshots, and the
 * link's row is tombstoned. The way back brings the link back and opens the accounts it closed.
 */
export function removeLinkOps(
	link: ProviderLink,
	accounts: readonly Account[],
	day: string
): Ops & { closed: Account[] } {
	const open = accounts.filter((account) => account.linkId === link.id && isOpen(account))
	const closed = open.map((account) => ({ ...account, closedOn: day }))
	const uri = toUri(FINANCE.link, link.id)
	return {
		closed,
		ops: [...closed.map(update), { op: 'delete', uri }],
		inverse: [{ op: 'restore', uri }, ...open.map(update)],
	}
}

/** What an account draft becomes once the store has its id: the payload a row holds. */
export type AccountDraft = Omit<AccountPayload, 'lastSnapshot' | 'balanceAt'> & { id?: string }
