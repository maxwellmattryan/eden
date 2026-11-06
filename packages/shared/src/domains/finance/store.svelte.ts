// Orchard's store (product/domains/finance.md): this device's bank links, the accounts and the assets. The rows live
// in the data layer, one per record; the store is what the page sees of them and never reads the balance snapshots,
// which are history for the charts to come. A write changes the store at once and is sent after, in order
// (`WriteQueue`), as one batch with the batch that takes it back; every write hands back an undo for the toast (D-12).
// No write lands in the Garden feed and no log carries more than an error's code, so no figure, name or number
// leaves the page.
import { logError } from '../../api/index.js'
import {
	applyBatch,
	dataErrorCode,
	newId,
	queryEntities,
	toUri,
	WriteQueue,
	type BatchOp,
	type Write,
} from '../../data/index.js'
import { nowIso, todayIso } from '../../dates/index.js'
import type { Money } from '../../money/index.js'
import { settings } from '../../settings/index.js'
import {
	accountGroups,
	accountTotals,
	balanceOps,
	closeOps,
	payloadOf,
	removeLinkOps,
	reopenOps,
	replaceCandidates,
	replaceOps,
	type AccountDraft,
} from './accounts.js'
import { provider } from './provider.svelte.js'
import { financeFromRows, financeRows, financeUris } from './rows.js'
import { seedData } from './seed.js'
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

export type Undo = () => void

const MINUTE_MS = 60 * 1000

/** One change: what the page sees of it and the way back, and the batches that store each. */
interface Change {
	apply: () => void
	revert: () => void
	ops: BatchOp[]
	inverse: BatchOp[]
	/** Runs once the write has landed. */
	after?: () => Promise<void>
}

/** An asset as the form hands it over. */
export type AssetDraft = AssetPayload & { id?: string }

const code = (error: unknown) => dataErrorCode(error) ?? 'unknown'

export class FinanceStore {
	ready = $state(false)
	/** A write failed, or the rows could not be read; the page shows it and offers a retry. */
	saveFailed = $state(false)
	links = $state<ProviderLink[]>([])
	accounts = $state<Account[]>([])
	assets = $state<Asset[]>([])
	/** The minute, while a page is watching: a link goes stale as it moves. */
	clock = $state(Date.now())

	#loading: Promise<void> | undefined
	#watchers = 0
	#ticker: ReturnType<typeof setInterval> | undefined
	readonly #queue = new WriteQueue(
		(failed) => (this.saveFailed = failed),
		(error) => void logError('data', 'An Orchard write failed', code(error)).catch(() => null)
	)

	readonly totals = $derived(
		accountTotals({
			accounts: this.accounts,
			assets: this.assets,
			links: this.links,
			home: settings.homeCurrency,
			now: this.clock,
		})
	)
	readonly groups = $derived(accountGroups(this.accounts, this.assets, this.links, this.clock))
	readonly empty = $derived(!this.accounts.length && !this.assets.length && !this.links.length)

	accountById(id?: string): Account | undefined {
		return id ? this.accounts.find((account) => account.id === id) : undefined
	}
	assetById(id?: string): Asset | undefined {
		return id ? this.assets.find((asset) => asset.id === id) : undefined
	}
	linkById(id?: string): ProviderLink | undefined {
		return id ? this.links.find((link) => link.id === id) : undefined
	}
	/** The accounts this one may say it replaced. */
	candidatesFor(id: string): Account[] {
		return replaceCandidates(this.accounts, id)
	}

	/** Reads the rows, once. */
	load(): Promise<void> {
		return (this.#loading ??= this.#read())
	}

	async #read() {
		try {
			const [links, accounts, assets] = await Promise.all([
				queryEntities<ProviderLinkPayload>({ type: FINANCE.link }),
				queryEntities<AccountPayload>({ type: FINANCE.account }),
				queryEntities<AssetPayload>({ type: FINANCE.asset }),
			])
			this.#show(financeFromRows({ links, accounts, assets }))
			this.saveFailed = this.#queue.failed
		} catch (error) {
			// nothing was read: say so, and let the retry read again
			this.#loading = undefined
			this.saveFailed = true
			await logError('data', 'Could not read the Orchard rows', code(error)).catch(() => null)
		}
		this.ready = true
	}

	/** Reads the rows again, after an import changed them under the store. What is waiting to be sent is sent first. */
	async reload() {
		await this.#queue.settled()
		this.#loading = undefined
		await this.load()
	}

	/** The retry after a failure: reads again if the rows were never read, and sends what is waiting. */
	async flush() {
		if (!this.#loading) await this.load()
		await this.#queue.retry()
	}

	/** Keeps the minute moving while a page is mounted; the answer stops it when the last page goes. */
	watch(): () => void {
		this.clock = Date.now()
		this.#watchers += 1
		this.#ticker ??= setInterval(() => (this.clock = Date.now()), MINUTE_MS)
		return () => {
			this.#watchers -= 1
			if (this.#watchers > 0 || !this.#ticker) return
			clearInterval(this.#ticker)
			this.#ticker = undefined
		}
	}

	/** What the store holds, as plain data. */
	data(): FinanceData {
		return $state.snapshot({ links: this.links, accounts: this.accounts, assets: this.assets }) as FinanceData
	}

	#show(data: FinanceData) {
		this.links = data.links
		this.accounts = data.accounts
		this.assets = data.assets
	}

	#snapshot(): FinanceData {
		return this.data()
	}

	/** The accounts with some replaced by id. */
	#withAccounts(...changed: Account[]) {
		const changedOf = (id: string) => changed.find((account) => account.id === id)
		this.accounts = [
			...this.accounts.map((account) => changedOf(account.id) ?? account),
			...changed.filter((account) => !this.accounts.some((entry) => entry.id === account.id)),
		]
	}

	// ---- Accounts ------------------------------------------------------------------------------------------------

	/**
	 * Saves an account entered by hand, new or changed. A balance that differs from the one it has is set as of now,
	 * with today's snapshot, in the same write; no balance clears it.
	 */
	saveAccount(draft: AccountDraft): { account: Account; created: boolean; undo: Undo } {
		const was = this.accountById(draft.id)
		const plain = $state.snapshot(was) as Account | undefined
		const { id: _id, balance, ...fields } = draft
		// the fields as edited, with the balance the account had until the write sets the new one
		const base: Account = { ...(plain ?? {}), ...fields, id: plain?.id ?? newId(), name: draft.name.trim() }
		for (const key of ['institution', 'last4'] as const) {
			if (!base[key]?.trim()) delete base[key]
		}
		const sameBalance =
			balance && plain?.balance && balance.minor === plain.balance.minor && balance.currency === plain.balance.currency
		let next: Account
		let ops: BatchOp[]
		let inverse: BatchOp[]
		if (balance && !sameBalance) {
			const set = balanceOps(base, balance, nowIso(), todayIso(), newId, { created: !plain })
			;({ account: next, ops, inverse } = set)
			// the way back is the account as it was, not as edited
			if (plain) inverse = [{ op: 'updateEntity', id: plain.id, payload: payloadOf(plain) }, ...inverse.slice(1)]
		} else {
			next = { ...base }
			if (!balance) {
				delete next.balance
				delete next.balanceAt
			}
			ops = [
				plain
					? { op: 'updateEntity', id: next.id, payload: payloadOf(next) }
					: { op: 'createEntity', input: { id: next.id, type: FINANCE.account, payload: payloadOf(next) } },
			]
			inverse = [
				plain
					? { op: 'updateEntity', id: plain.id, payload: payloadOf(plain) }
					: { op: 'delete', uri: toUri(FINANCE.account, next.id) },
			]
		}
		const before = this.accounts
		const undo = this.#commit({
			apply: () => this.#withAccounts(next),
			revert: () => (this.accounts = before),
			ops,
			inverse,
		})
		return { account: next, created: !plain, undo }
	}

	/** The balance as of now, with today's snapshot. */
	setBalance(id: string, balance: Money): Undo | undefined {
		const account = $state.snapshot(this.accountById(id)) as Account | undefined
		if (!account) return undefined
		const set = balanceOps(account, balance, nowIso(), todayIso(), newId)
		const before = this.accounts
		return this.#commit({
			apply: () => this.#withAccounts(set.account),
			revert: () => (this.accounts = before),
			...set,
		})
	}

	closeAccount(id: string): Undo | undefined {
		const account = $state.snapshot(this.accountById(id)) as Account | undefined
		if (!account || account.closedOn) return undefined
		return this.#accountChange(closeOps(account, todayIso()))
	}

	reopenAccount(id: string): Undo | undefined {
		const account = $state.snapshot(this.accountById(id)) as Account | undefined
		if (!account?.closedOn) return undefined
		return this.#accountChange(reopenOps(account))
	}

	/** Says the account replaced the old one, which closes as of today if it is open: one write, one undo. */
	replaceAccount(id: string, oldId: string): Undo | undefined {
		const account = $state.snapshot(this.accountById(id)) as Account | undefined
		const old = $state.snapshot(this.accountById(oldId)) as Account | undefined
		if (!account || !old || !this.candidatesFor(id).some((entry) => entry.id === oldId)) return undefined
		const set = replaceOps(account, old, todayIso())
		const before = this.accounts
		return this.#commit({
			apply: () => this.#withAccounts(set.account, set.old),
			revert: () => (this.accounts = before),
			ops: set.ops,
			inverse: set.inverse,
		})
	}

	/** Deletes an account entered by hand; a linked one is closed, never deleted. Its snapshots stay as history. */
	deleteAccount(id: string): Undo | undefined {
		const account = this.accountById(id)
		if (!account || account.linkId) return undefined
		const uri = toUri(FINANCE.account, id)
		const before = this.accounts
		return this.#commit({
			apply: () => (this.accounts = this.accounts.filter((entry) => entry.id !== id)),
			revert: () => (this.accounts = before),
			ops: [{ op: 'delete', uri }],
			inverse: [{ op: 'restore', uri }],
		})
	}

	#accountChange(set: { account: Account; ops: BatchOp[]; inverse: BatchOp[] }): Undo {
		const before = this.accounts
		return this.#commit({
			apply: () => this.#withAccounts(set.account),
			revert: () => (this.accounts = before),
			ops: set.ops,
			inverse: set.inverse,
		})
	}

	// ---- Assets --------------------------------------------------------------------------------------------------

	saveAsset(draft: AssetDraft): { asset: Asset; created: boolean; undo: Undo } {
		const was = $state.snapshot(this.assetById(draft.id)) as Asset | undefined
		const asset: Asset = { ...draft, id: was?.id ?? newId(), name: draft.name.trim() }
		if (!asset.quantity) {
			delete asset.quantity
			delete asset.unit
		}
		const before = this.assets
		const undo = this.#commit({
			apply: () =>
				(this.assets = was
					? this.assets.map((entry) => (entry.id === asset.id ? asset : entry))
					: [...this.assets, asset]),
			revert: () => (this.assets = before),
			ops: [
				was
					? { op: 'updateEntity', id: asset.id, payload: payloadOf(asset) }
					: { op: 'createEntity', input: { id: asset.id, type: FINANCE.asset, payload: payloadOf(asset) } },
			],
			inverse: [
				was
					? { op: 'updateEntity', id: was.id, payload: payloadOf(was) }
					: { op: 'delete', uri: toUri(FINANCE.asset, asset.id) },
			],
		})
		return { asset, created: !was, undo }
	}

	deleteAsset(id: string): Undo | undefined {
		if (!this.assetById(id)) return undefined
		const uri = toUri(FINANCE.asset, id)
		const before = this.assets
		return this.#commit({
			apply: () => (this.assets = this.assets.filter((entry) => entry.id !== id)),
			revert: () => (this.assets = before),
			ops: [{ op: 'delete', uri }],
			inverse: [{ op: 'restore', uri }],
		})
	}

	// ---- Links ---------------------------------------------------------------------------------------------------

	/**
	 * Leaves a bank on this device: its open accounts close as of today, keeping their balances and snapshots, and the
	 * link is tombstoned, in one write. A bound provider is then told; a failed revoke is logged by its code and
	 * undoes nothing. The undo brings the link back and opens the accounts it closed.
	 */
	removeLink(id: string): Undo | undefined {
		const link = $state.snapshot(this.linkById(id)) as ProviderLink | undefined
		if (!link) return undefined
		const set = removeLinkOps(link, $state.snapshot(this.accounts) as Account[], todayIso())
		const before = { links: this.links, accounts: this.accounts }
		const revoke = provider.bound
		return this.#commit({
			apply: () => {
				this.links = this.links.filter((entry) => entry.id !== id)
				this.#withAccounts(...set.closed)
			},
			revert: () => {
				this.links = before.links
				this.accounts = before.accounts
			},
			ops: set.ops,
			inverse: set.inverse,
			after: revoke
				? async () => {
						try {
							await revoke.revoke(id)
						} catch (error) {
							await logError('data', 'A bank link could not be revoked', code(error)).catch(() => null)
						}
					}
				: undefined,
		})
	}

	/**
	 * Writes what a provider read (a sync run, a new link) in its batches and in order, through the same queue as
	 * every other write, with no undo and no toast: the bank said it, so there is nothing to take back. The page
	 * shows the links and accounts once the batches have landed. Answers whether they did; a batch that failed waits
	 * in the queue for the page's Retry, like any other write, and shows its rows when it lands.
	 */
	applySync(chunks: BatchOp[][], change: { links?: ProviderLink[]; accounts?: Account[] }): Promise<boolean> {
		return new Promise((resolve) => {
			this.#queue.enqueue(async () => {
				try {
					for (const ops of chunks) if (ops.length) await applyBatch(ops)
				} catch (error) {
					resolve(false)
					throw error
				}
				const links = change.links ?? []
				const linkOf = (id: string) => links.find((link) => link.id === id)
				this.links = [
					...this.links.map((link) => linkOf(link.id) ?? link),
					...links.filter((link) => !this.links.some((entry) => entry.id === link.id)),
				]
				this.#withAccounts(...(change.accounts ?? []))
				resolve(true)
			})
		})
	}

	// ---- Sample data ---------------------------------------------------------------------------------------------

	/** Fills the store with the sample accounts; the undo puts back whatever was there. */
	seed(): Undo {
		const before = this.#snapshot()
		const after = financeRows(seedData(Date.now()), newId)
		const remove = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'delete', uri }))
		const restore = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'restore', uri }))
		const old = financeUris(before)
		const sample = financeUris(after.data)
		return this.#commit({
			apply: () => this.#show(after.data),
			revert: () => this.#show(before),
			ops: [...remove(old), ...after.ops],
			inverse: [...remove(sample), ...restore(old)],
		})
	}

	/** Shows the change and queues its write; the undo shows the way back and queues that. */
	#commit(change: Change): Undo {
		change.apply()
		const write: Write = async () => {
			await applyBatch(change.ops)
			await change.after?.()
		}
		this.#queue.enqueue(write)
		return () => {
			change.revert()
			this.#queue.enqueue(() => applyBatch(change.inverse))
		}
	}
}

export const finance = new FinanceStore()
