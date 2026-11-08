// Orchard's store (product/domains/finance.md): this device's bank links, the accounts and the assets. The rows live
// in the data layer, one per record; the store is what the page sees of them and never reads the balance snapshots,
// which are history for the charts to come. A write changes the store at once and is sent after, in order
// (`WriteQueue`), as one batch with the batch that takes it back; every write hands back an undo for the toast (D-12).
// No write lands in the Garden feed and no log carries more than an error's code, so no figure, name or number
// leaves the page.
//
// The categories, merchants and rules (#75) are small sets the store holds. The live transactions are held too (#77,
// D-194), read whole once, lazily, by the first query, classification pass or owner's fix, and kept current after:
// every batch the store sends re-reads exactly the transactions it names before its queue job ends. The ledger, the
// one index every money figure is read from, is derived from them. The pass and the fixes read from that map inside
// the queue, so a pass and an edit never interleave. No query is ever logged.
//
// The holdings and securities (#76, D-195) are held whole, like the accounts; a daily investments read writes them
// through `applySync`, and the owner's cost basis and typed value go through `#commit` with an undo.
import { get } from 'svelte/store'
import { logError } from '../../api/index.js'
import {
	applyBatch,
	dataErrorCode,
	newId,
	queryEntities,
	toUri,
	WriteQueue,
	type BatchOp,
	type Entity,
	type Write,
} from '../../data/index.js'
import { dateIn, nowIso, todayIso } from '../../dates/index.js'
import { t } from '../../i18n/index.js'
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
import { classifyPass } from './classify.js'
import {
	mergeMerchantOps,
	oneOffOps,
	recategoriseOps,
	reimbursableOps,
	renameMerchantOps,
	repaymentOps,
	saveCategoryOps,
	splitOps,
	unlinkRepaymentOps,
	unsplitOps,
	type CategoryDraft,
	type Edit,
	type Refused,
	type ReimbursableError,
	type RepaymentError,
	type SplitError,
} from './edits.js'
import { holdingOps, investmentSummary, withCostBasis, withTypedValue } from './investments.js'
import { buildLedger, queryLedger, touchedTransactions, type LedgerAnswer, type LedgerQuery } from './ledger.js'
import { provider } from './provider.svelte.js'
import { financeFromRows, financeRows, financeUris } from './rows.js'
import { seedData } from './seed.js'
import { CHUNK, chunked } from './sync.js'
import {
	FINANCE,
	type Account,
	type AccountPayload,
	type Asset,
	type AssetPayload,
	type Category,
	type CategoryPayload,
	type FinanceData,
	type Holding,
	type HoldingPayload,
	type Merchant,
	type MerchantPayload,
	type ProviderLink,
	type ProviderLinkPayload,
	type Rule,
	type RulePayload,
	type Security,
	type SecurityPayload,
	type TransactionPayload,
	type TxPart,
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
const withId = <T>(row: Entity<T>): T & { id: string } => ({ ...row.payload, id: row.id })
const ruleOf = (row: Entity<RulePayload>): Rule => ({ ...row.payload, id: row.id, updatedAt: row.updatedAt })

/** What an owner's fix answers: its undo, a refusal's code, or nothing when the row is gone or nothing changed. */
export type EditAnswer<C extends string = never> = Undo | Refused<C> | undefined

/** What a provider's write changes in the store once it lands. */
export interface SyncChange {
	links?: ProviderLink[]
	accounts?: Account[]
	/** The holdings and securities an investments read made or changed (#76), and the holdings it tombstoned. */
	holdings?: Holding[]
	removedHoldings?: string[]
	securities?: Security[]
}

/** A fix as the store makes it: the ops, and what the store's sets show of it and of its undo. */
type StoreEdit = Edit & { apply?: () => void; revert?: () => void }

export class FinanceStore {
	ready = $state(false)
	/** A write failed, or the rows could not be read; the page shows it and offers a retry. */
	saveFailed = $state(false)
	links = $state<ProviderLink[]>([])
	accounts = $state<Account[]>([])
	assets = $state<Asset[]>([])
	/** The live holdings and securities (#76, D-195). */
	holdings = $state<Holding[]>([])
	securities = $state<Security[]>([])
	/** The live budget categories, merchants and category rules (#75). */
	categories = $state<Category[]>([])
	merchants = $state<Merchant[]>([])
	rules = $state<Rule[]>([])
	/** The minute, while a page is watching: a link goes stale as it moves. */
	clock = $state(Date.now())

	/** The live transactions have been read, so `ledger` holds them all. */
	ledgerReady = $state(false)

	#loading: Promise<void> | undefined
	#classifying: Promise<void> | undefined
	/** The live transactions by id, once read; a plain map, so `#version` says when it changed. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain map: `#version` is what the ledger reads
	#rows = new Map<string, Entity<TransactionPayload>>()
	#rowsRead: Promise<void> | undefined
	/** A refresh failed: the next reader reads every transaction again. */
	#stale = false
	/** Counts the refreshes, so a whole read that overlapped one is known to be behind it. */
	#touches = 0
	#version = $state(0)
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
	/** The Investments tab: grouped holdings, totals and allocation (D-195). */
	readonly investments = $derived(
		investmentSummary({
			holdings: this.holdings,
			securities: this.securities,
			accounts: this.accounts,
			links: this.links,
			home: settings.homeCurrency,
			today: dateIn(undefined, this.clock),
			now: this.clock,
		})
	)
	/** Every money figure's index (D-194): empty until the transactions are read (`ledgerReady`). */
	readonly ledger = $derived.by(() => {
		void this.#version
		return buildLedger({
			transactions: [...this.#rows.values()],
			accounts: this.accounts,
			categories: this.categories,
			merchants: this.merchants,
			home: settings.homeCurrency,
		})
	})

	accountById(id?: string): Account | undefined {
		return id ? this.accounts.find((account) => account.id === id) : undefined
	}
	assetById(id?: string): Asset | undefined {
		return id ? this.assets.find((asset) => asset.id === id) : undefined
	}
	linkById(id?: string): ProviderLink | undefined {
		return id ? this.links.find((link) => link.id === id) : undefined
	}
	holdingById(id?: string): Holding | undefined {
		return id ? this.holdings.find((holding) => holding.id === id) : undefined
	}
	securityById(id?: string): Security | undefined {
		return id ? this.securities.find((security) => security.id === id) : undefined
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
			const [links, accounts, assets, categories, merchants, rules, holdings, securities] = await Promise.all([
				queryEntities<ProviderLinkPayload>({ type: FINANCE.link }),
				queryEntities<AccountPayload>({ type: FINANCE.account }),
				queryEntities<AssetPayload>({ type: FINANCE.asset }),
				queryEntities<CategoryPayload>({ type: FINANCE.category }),
				queryEntities<MerchantPayload>({ type: FINANCE.merchant }),
				queryEntities<RulePayload>({ type: FINANCE.rule }),
				queryEntities<HoldingPayload>({ type: FINANCE.holding }),
				queryEntities<SecurityPayload>({ type: FINANCE.security }),
			])
			this.#show(financeFromRows({ links, accounts, assets, holdings, securities }))
			this.categories = categories.map(withId)
			this.merchants = merchants.map(withId)
			this.rules = rules.map(ruleOf)
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
		const read = this.#rowsRead !== undefined
		this.#rowsRead = undefined
		await this.load()
		// the transactions too, when something reads them: a writer outside the store (#74) changed them under it
		if (read)
			await this.#ensureRows().catch(
				(error) => void logError('data', 'Could not read the Orchard transactions', code(error)).catch(() => null)
			)
	}

	/**
	 * The answer to a query over the ledger (D-194), once the transactions have been read. An invalid query throws a
	 * `LedgerQueryError`; a failed read rejects with the data layer's error.
	 */
	async query(query: LedgerQuery): Promise<LedgerAnswer> {
		await this.load()
		await this.#ensureRows()
		return queryLedger(this.ledger, query)
	}

	/** Reads every live transaction, once, or again after a refresh failed. */
	#ensureRows(): Promise<void> {
		if (this.#stale) {
			this.#stale = false
			this.#rowsRead = undefined
		}
		return (this.#rowsRead ??= this.#readRows())
	}

	async #readRows() {
		const touches = this.#touches
		try {
			const rows = await queryEntities<TransactionPayload>({ type: FINANCE.transaction })
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain map: `#version` is what the ledger reads
			this.#rows = new Map(rows.map((row) => [row.id, row]))
		} catch (error) {
			this.#rowsRead = undefined
			throw error
		}
		// a refresh that landed while this read ran may be older than what was read: read again next time
		if (this.#touches !== touches) this.#stale = true
		this.#version += 1
		this.ledgerReady = true
	}

	/** Sends a batch, then refreshes the transactions it names, before the queue job ends. */
	async #write(ops: BatchOp[]) {
		await applyBatch(ops)
		await this.#touch(ops)
	}

	/**
	 * Re-reads the transactions a batch named, tombstones included, so a deleted row leaves the map. Nothing to do
	 * before the first whole read. A failed read marks the map stale for the next reader, logged by its code only.
	 */
	async #touch(ops: BatchOp[]) {
		if (!this.#rowsRead) return
		const ids = touchedTransactions(ops, (id) => this.#rows.has(id))
		if (!ids.length) return
		this.#touches += 1
		try {
			for (let at = 0; at < ids.length; at += CHUNK) {
				const rows = await queryEntities<TransactionPayload>({
					type: FINANCE.transaction,
					ids: ids.slice(at, at + CHUNK),
					includeDeleted: true,
				})
				for (const row of rows) {
					if (row.deletedAt) this.#rows.delete(row.id)
					else this.#rows.set(row.id, row)
				}
			}
		} catch (error) {
			this.#stale = true
			await logError('data', 'The Orchard index could not be refreshed', code(error)).catch(() => null)
		}
		this.#version += 1
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
		return $state.snapshot({
			links: this.links,
			accounts: this.accounts,
			assets: this.assets,
			holdings: this.holdings,
			securities: this.securities,
		}) as FinanceData
	}

	#show(data: FinanceData) {
		this.links = data.links
		this.accounts = data.accounts
		this.assets = data.assets
		this.holdings = data.holdings ?? []
		this.securities = data.securities ?? []
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
	applySync(chunks: BatchOp[][], change: SyncChange): Promise<boolean>
	/**
	 * The same, with the reads and the ops made inside the queue's turn (#75), so no owner's fix lands between a sync's
	 * read and its write. A read that fails rejects and writes nothing; the queue goes on.
	 */
	applySync(build: () => Promise<SyncChange & { chunks: BatchOp[][] }>): Promise<boolean>
	applySync(
		given: BatchOp[][] | (() => Promise<SyncChange & { chunks: BatchOp[][] }>),
		known: SyncChange = {}
	): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.#queue.enqueue(async () => {
				let chunks: BatchOp[][]
				let change: SyncChange
				if (typeof given === 'function') {
					try {
						;({ chunks, ...change } = await given())
					} catch (error) {
						reject(error)
						return
					}
				} else {
					chunks = given
					change = known
				}
				try {
					for (const ops of chunks) if (ops.length) await this.#write(ops)
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
				this.#withInvestments(change)
				resolve(true)
			})
		})
	}

	/** The holdings and securities a provider's write made, changed or tombstoned. */
	#withInvestments(change: SyncChange) {
		const merge = <T extends { id: string }>(held: T[], changed: T[] = [], gone: string[] = []) => {
			const changedOf = (id: string) => changed.find((entry) => entry.id === id)
			return [
				...held.filter((entry) => !gone.includes(entry.id)).map((entry) => changedOf(entry.id) ?? entry),
				...changed.filter((entry) => !held.some((other) => other.id === entry.id)),
			]
		}
		if (change.securities?.length) this.securities = merge(this.securities, change.securities)
		if (change.holdings?.length || change.removedHoldings?.length)
			this.holdings = merge(this.holdings, change.holdings, change.removedHoldings)
	}

	// ---- Holdings (#76) ------------------------------------------------------------------------------------------

	/** The owner's cost basis for a holding, a total, never overwritten by a read; none clears it (D-195). */
	setCostBasis(id: string, amount: Money | undefined): Undo | undefined {
		const holding = $state.snapshot(this.holdingById(id)) as Holding | undefined
		if (!holding || (!amount && holding.costBasisBy !== 'owner')) return undefined
		return this.#holdingChange(holding, withCostBasis(holding, amount))
	}

	/** The owner's value for a holding the provider gives no price for, with the day it was set; none clears it. */
	setHoldingValue(id: string, typed: { value: Money; on: string } | undefined): Undo | undefined {
		const holding = $state.snapshot(this.holdingById(id)) as Holding | undefined
		if (!holding) return undefined
		return this.#holdingChange(holding, withTypedValue(holding, typed))
	}

	#holdingChange(was: Holding, next: Holding): Undo {
		const before = this.holdings
		return this.#commit({
			apply: () => (this.holdings = this.holdings.map((entry) => (entry.id === next.id ? next : entry))),
			revert: () => (this.holdings = before),
			...holdingOps(was, next),
		})
	}

	// ---- Classification (#75) ------------------------------------------------------------------------------------

	/**
	 * The classification pass over every live transaction, after a sync that wrote some (and after an import, #74):
	 * the default categories the first time, then each row's merchant, kind, category, transfer pair and refund. One
	 * job in the queue reads, works out and writes, so no fix lands in between. A failure is logged by its code and
	 * leaves the rows; the next sync runs the pass again. A second ask while one runs joins it.
	 */
	classify(): Promise<void> {
		return (this.#classifying ??= this.#classify().finally(() => (this.#classifying = undefined)))
	}

	async #classify() {
		await this.load()
		// a queue stopped on a failed write would hold the pass behind it: the next sync runs it instead
		if (this.#queue.failed) return
		await this.#exclusive(async () => {
			try {
				const translate = get(t)
				const [transactions, categories, rules, merchants] = await Promise.all([
					this.#transactions(),
					queryEntities<CategoryPayload>({ type: FINANCE.category, includeDeleted: true }),
					queryEntities<RulePayload>({ type: FINANCE.rule }),
					queryEntities<MerchantPayload>({ type: FINANCE.merchant }),
				])
				const out = classifyPass({
					transactions,
					categories,
					rules,
					merchants,
					accounts: this.data().accounts,
					name: (key) => translate(`domains.finance.categories.${key}`),
					newId,
				})
				for (const ops of chunked(out.ops)) await this.#write(ops)
				this.categories = out.categories
				this.rules = out.rules
				this.merchants = out.merchants
			} catch (error) {
				await logError('data', 'The Orchard classification pass failed', code(error)).catch(() => null)
			}
		})
	}

	/**
	 * Runs a job in the queue's turn, so it reads, works out and writes with nothing else between. A job that throws
	 * stops the queue as a failed write does (`saveFailed`), and the retry runs it again.
	 */
	#exclusive<T>(job: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.#queue.enqueue(async () => {
				try {
					resolve(await job())
				} catch (error) {
					reject(error)
					throw error
				}
			})
		})
	}

	/** Every live transaction, from the map. */
	async #transactions(): Promise<Entity<TransactionPayload>[]> {
		await this.#ensureRows()
		return [...this.#rows.values()]
	}

	async #transaction(id: string): Promise<Entity<TransactionPayload> | undefined> {
		await this.#ensureRows()
		return this.#rows.get(id)
	}

	async #merchants(ids?: string[]): Promise<Merchant[]> {
		return (await queryEntities<MerchantPayload>({ type: FINANCE.merchant, ...(ids ? { ids } : {}) })).map(withId)
	}

	async #rules(): Promise<Rule[]> {
		return (await queryEntities<RulePayload>({ type: FINANCE.rule })).map(ruleOf)
	}

	/**
	 * An owner's fix: read and written in one queue job, with one undo that sends the way back (D-12). A refusal or a
	 * row that is gone writes nothing; a failed write sets `saveFailed`, and the retry makes the fix again.
	 */
	async #edit<C extends string>(build: () => Promise<StoreEdit | Refused<C> | undefined>): Promise<EditAnswer<C>> {
		try {
			return await this.#exclusive(async (): Promise<EditAnswer<C>> => {
				const made = await build()
				if (!made || 'error' in made) return made
				await this.#write(made.ops)
				made.apply?.()
				return () => {
					made.revert?.()
					this.#queue.enqueue(() => this.#write(made.inverse))
				}
			})
		} catch {
			// the queue logged the code and holds the job for the retry
			return undefined
		}
	}

	/**
	 * The owner's category on a row; none clears it, for the next pass to derive. Remembered, it becomes a rule that
	 * recategorises the merchant's other rows at once (not the owner's); the undo takes all of it back.
	 */
	setCategory(
		id: string,
		categoryId: string | undefined,
		options: { remember?: boolean } = {}
	): Promise<Undo | undefined> {
		const remember = options.remember === true
		return this.#edit(async () => {
			const row = await this.#transaction(id)
			if (!row) return undefined
			const [rows, merchants, rules] = remember
				? await Promise.all([this.#transactions(), this.#merchants(), this.#rules()])
				: [[], [], []]
			const made = recategoriseOps(row, categoryId, remember, { rows, merchants, rules, newId, nowIso: nowIso() })
			const before = this.rules
			const rule = made.rule
			return {
				...made,
				apply: rule ? () => (this.rules = [...this.rules.filter((entry) => entry.id !== rule.id), rule]) : undefined,
				revert: () => (this.rules = before),
			}
		}) as Promise<Undo | undefined>
	}

	split(id: string, parts: TxPart[]): Promise<EditAnswer<SplitError>> {
		return this.#edit(async () => {
			const row = await this.#transaction(id)
			return row ? splitOps(row, parts) : undefined
		})
	}

	unsplit(id: string): Promise<Undo | undefined> {
		return this.#rowEdit(id, unsplitOps)
	}

	/** The part of a money-out row someone owes back; none clears it. */
	setReimbursable(id: string, amount: Money | undefined): Promise<EditAnswer<ReimbursableError>> {
		return this.#edit(async () => {
			const row = await this.#transaction(id)
			return row ? reimbursableOps(row, amount) : undefined
		})
	}

	/** Says a money-in row pays back a reimbursable one: it becomes a refund in the original's category. */
	linkRepayment(originalId: string, repaymentId: string): Promise<EditAnswer<RepaymentError>> {
		return this.#edit(async () => {
			const [original, repayment] = await Promise.all([this.#transaction(originalId), this.#transaction(repaymentId)])
			return original && repayment ? repaymentOps(original, repayment) : undefined
		})
	}

	unlinkRepayment(repaymentId: string): Promise<Undo | undefined> {
		return this.#rowEdit(repaymentId, unlinkRepaymentOps)
	}

	/** A one-off still counts in totals; `spendingOf` marks it so averages can leave it out. */
	setOneOff(id: string, oneOff: boolean): Promise<Undo | undefined> {
		return this.#rowEdit(id, (row) => oneOffOps(row, oneOff))
	}

	#rowEdit(id: string, make: (row: Entity<TransactionPayload>) => Edit | undefined): Promise<Undo | undefined> {
		return this.#edit(async () => {
			const row = await this.#transaction(id)
			return row ? make(row) : undefined
		}) as Promise<Undo | undefined>
	}

	renameMerchant(id: string, name: string): Promise<Undo | undefined> {
		return this.#edit(async () => {
			const [merchant] = await this.#merchants([id])
			const made = merchant ? renameMerchantOps(merchant, name) : undefined
			if (!made) return undefined
			const before = this.merchants
			return {
				...made,
				apply: () => (this.merchants = this.merchants.map((entry) => (entry.id === id ? made.merchant : entry))),
				revert: () => (this.merchants = before),
			}
		}) as Promise<Undo | undefined>
	}

	/** Moves the merchants' raw names, rows and rules to `intoId` and tombstones them; the undo brings them back. */
	mergeMerchants(intoId: string, fromIds: string[]): Promise<Undo | undefined> {
		return this.#edit(async () => {
			const [merchants, rows, rules] = await Promise.all([this.#merchants(), this.#transactions(), this.#rules()])
			const into = merchants.find((entry) => entry.id === intoId)
			const from = merchants.filter((entry) => fromIds.includes(entry.id))
			const made = into ? mergeMerchantOps(into, from, rows, rules) : undefined
			if (!made) return undefined
			const before = { merchants: this.merchants, rules: this.rules }
			const gone = fromIds.filter((id) => id !== intoId)
			const movedOf = (id: string) => made.rules.find((entry) => entry.id === id)
			return {
				...made,
				apply: () => {
					this.merchants = this.merchants
						.filter((entry) => !gone.includes(entry.id))
						.map((entry) => (entry.id === intoId ? made.merchant : entry))
					this.rules = this.rules.map((entry) => movedOf(entry.id) ?? entry)
				},
				revert: () => {
					this.merchants = before.merchants
					this.rules = before.rules
				},
			}
		}) as Promise<Undo | undefined>
	}

	/** Creates a category or renames one; a default keeps its key, so the provider mapping still finds it. */
	async saveCategory(draft: CategoryDraft): Promise<{ category: Category; undo: Undo } | undefined> {
		let category: Category | undefined
		const undo = (await this.#edit(async () => {
			const [was] = draft.id ? await queryEntities<CategoryPayload>({ type: FINANCE.category, ids: [draft.id] }) : []
			if (draft.id && !was) return undefined
			const made = saveCategoryOps(draft, was ? withId(was) : undefined, newId)
			if (!made) return undefined
			category = made.category
			const before = this.categories
			return {
				...made,
				apply: () =>
					(this.categories = was
						? this.categories.map((entry) => (entry.id === made.category.id ? made.category : entry))
						: [...this.categories, made.category]),
				revert: () => (this.categories = before),
			}
		})) as Undo | undefined
		return undo && category ? { category, undo } : undefined
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
			await this.#write(change.ops)
			await change.after?.()
		}
		this.#queue.enqueue(write)
		return () => {
			change.revert()
			this.#queue.enqueue(() => this.#write(change.inverse))
		}
	}
}

export const finance = new FinanceStore()
