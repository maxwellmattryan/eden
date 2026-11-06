// Between Orchard's shapes and its rows: a whole `FinanceData` as the writes that store it (the sample data), and the
// rows read back as what the store holds. Each record is an `entities` row of its type; an account names its link and
// the account it replaced by id, a snapshot its account, and an account its latest snapshot, so the writes give every
// record a new id and the pointers follow.
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { payloadOf } from './accounts.js'
import {
	FINANCE,
	type Account,
	type AccountPayload,
	type Asset,
	type AssetPayload,
	type FinanceData,
	type ProviderLink,
	type ProviderLinkPayload,
} from './types.js'

export interface FinanceRows {
	/** The data with the ids its rows have. */
	data: FinanceData
	ops: BatchOp[]
}

const create = (type: string, record: { id: string }): BatchOp => ({
	op: 'createEntity',
	input: { id: record.id, type, payload: payloadOf(record) },
})

/**
 * The writes that store the data. Every record takes a new id and what points at another follows it: an account's
 * link, the account it replaced and its latest snapshot, a snapshot's account. A pointer at something that is not in
 * the data is dropped, and so is a snapshot of an account that is not.
 */
export function financeRows(source: Partial<FinanceData>, newId: () => string): FinanceRows {
	const links = (source.links ?? []).map((link) => ({ old: link.id, record: { ...link, id: newId() } }))
	const linkIds = new Map(links.map(({ old, record }) => [old, record.id]))
	const accountIds = new Map((source.accounts ?? []).map((account) => [account.id, newId()]))
	const snapshots = (source.snapshots ?? [])
		.filter((snapshot) => accountIds.has(snapshot.accountId))
		.map((snapshot) => ({
			old: snapshot.id,
			record: { ...snapshot, id: newId(), accountId: accountIds.get(snapshot.accountId)! },
		}))
	const snapshotIds = new Map(snapshots.map(({ old, record }) => [old, record.id]))

	const accounts: Account[] = (source.accounts ?? []).map((account) => {
		const { linkId, replaces, lastSnapshot, ...rest } = account
		const link = linkId ? linkIds.get(linkId) : undefined
		const replaced = replaces ? accountIds.get(replaces) : undefined
		const snapshot = lastSnapshot ? snapshotIds.get(lastSnapshot.id) : undefined
		return {
			...rest,
			id: accountIds.get(account.id)!,
			...(link ? { linkId: link } : {}),
			...(replaced ? { replaces: replaced } : {}),
			...(snapshot && lastSnapshot ? { lastSnapshot: { id: snapshot, day: lastSnapshot.day } } : {}),
		}
	})
	const assets: Asset[] = (source.assets ?? []).map((asset) => ({ ...asset, id: newId() }))

	const ops: BatchOp[] = [
		...links.map(({ record }) => create(FINANCE.link, record)),
		...accounts.map((account) => create(FINANCE.account, account)),
		...snapshots.map(({ record }) => create(FINANCE.snapshot, record)),
		...assets.map((asset) => create(FINANCE.asset, asset)),
	]
	return {
		data: {
			links: links.map(({ record }) => record),
			accounts,
			assets,
			snapshots: snapshots.map(({ record }) => record),
		},
		ops,
	}
}

/** The URIs of the rows the data is stored in. */
export function financeUris(data: FinanceData): string[] {
	return [
		...data.links.map((record) => toUri(FINANCE.link, record.id)),
		...data.accounts.map((record) => toUri(FINANCE.account, record.id)),
		...(data.snapshots ?? []).map((record) => toUri(FINANCE.snapshot, record.id)),
		...data.assets.map((record) => toUri(FINANCE.asset, record.id)),
	]
}

/** The rows a store reads, by type; never the snapshots, which are history for the charts to come. */
export interface FinanceRowSet {
	links: Entity<ProviderLinkPayload>[]
	accounts: Entity<AccountPayload>[]
	assets: Entity<AssetPayload>[]
}

const withId = <T>(row: Entity<T>): T & { id: string } => ({ ...row.payload, id: row.id })

/** The rows as the store holds them, in the order they were made. */
export function financeFromRows(rows: FinanceRowSet): FinanceData {
	return {
		links: rows.links.map(withId) as ProviderLink[],
		accounts: rows.accounts.map(withId) as Account[],
		assets: rows.assets.map(withId) as Asset[],
	}
}
