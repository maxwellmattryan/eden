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
import { assertFact, deleteFact, queryFacts, updateFact } from '../../profile/client.js'
import { settings } from '../../settings/index.js'
import { emit, withdraw } from '../../signals/runtime.js'
import {
	accountGroups,
	accountTotals,
	balanceOps,
	closeOps,
	dayOfInstant,
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
import {
	bandOf,
	detectIncome,
	HANDLED_MAX,
	incomeAverage,
	incomeOps,
	incomeQuestions,
	incomeSignals,
	leanSinceOf,
	missedDay,
	monthlyIncome,
	monthlyOf,
	taxRowIds,
	thirdCheckMonths,
	type IncomeSignal,
	type IncomeSignalName,
} from './income.js'
import { essentialLines, pauseCandidates, runwayOf } from './lean.js'
import { buildLedger, queryLedger, touchedTransactions, type LedgerAnswer, type LedgerQuery } from './ledger.js'
import { provider } from './provider.svelte.js'
import { financeFromRows, financeRows, financeUris } from './rows.js'
import { seedData } from './seed.js'
import { FILE_SOURCE, importOps, matchRows, type ParsedStatement, type StatementRow } from './statement.js'
import { CHUNK, chunked } from './sync.js'
import { dayLine, importDetail } from './words.js'
import {
	FINANCE,
	type FileImportPayload,
	type Account,
	type AccountPayload,
	type Asset,
	type AssetPayload,
	type Category,
	type CategoryPayload,
	type FinanceData,
	type IncomeSource,
	type IncomeSourcePayload,
	type Merchant,
	type MerchantPayload,
	type ProviderLink,
	type ProviderLinkPayload,
	type Rule,
	type RulePayload,
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

/** The fact the income pass keeps (finance.md §4). */
const BAND = 'monthly-income-band'

/** A question the owner answered on the page: the signal and key whose card leaves the inbox once the write lands. */
type Answered = { name: IncomeSignalName; key: string }

/** A source without some of its keys. */
function without(source: IncomeSource, ...keys: (keyof IncomeSource)[]): IncomeSource {
	const next = { ...source }
	for (const key of keys) delete next[key]
	return next
}

/** What an owner's fix answers: its undo, a refusal's code, or nothing when the row is gone or nothing changed. */
export type EditAnswer<C extends string = never> = Undo | Refused<C> | undefined

/** What a provider's write changes in the store once it lands. */
export interface SyncChange {
	links?: ProviderLink[]
	accounts?: Account[]
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
	/** The live budget categories, merchants and category rules (#75). */
	categories = $state<Category[]>([])
	merchants = $state<Merchant[]>([])
	rules = $state<Rule[]>([])
	/** The income sources the income pass keeps (#80), the hidden ones too. */
	incomeSources = $state<IncomeSource[]>([])
	/** The minute, while a page is watching: a link goes stale as it moves. */
	clock = $state(Date.now())

	/** The live transactions have been read, so `ledger` holds them all. */
	ledgerReady = $state(false)

	#loading: Promise<void> | undefined
	#classifying: Promise<void> | undefined
	#detecting: Promise<void> | undefined
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
	/** The owner's calendar day, which moves with the minute only when the day turns. */
	readonly #today = $derived(dateIn(undefined, this.clock))
	/**
	 * What the page shows of income (#80, D-196), once the ledger is ready: each source with its merchant's current
	 * name, the rows the Income section draws, the questions most urgent first, the monthly income and the trailing
	 * average (#84 reads it), and lean mode's runway, essentials and what to pause while it is on.
	 */
	readonly income = $derived.by(() => {
		if (!this.ledgerReady) return undefined
		void this.#version
		const today = this.#today
		const home = settings.homeCurrency
		const ledger = this.ledger
		const detected = detectIncome({
			transactions: [...this.#rows.values()],
			merchants: this.merchants,
			categories: this.categories,
			today,
		})
		// a lookup made and read inside this derivation, never kept
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const names = new Map(this.merchants.map((merchant) => [merchant.id, merchant.name]))
		const sources = this.incomeSources.map((source) => {
			const name = source.merchantId ? names.get(source.merchantId) : undefined
			return name ? { ...source, name } : source
		})
		const exclude = taxRowIds(detected)
		const since = leanSinceOf(sources)
		const lean = { ledger, categories: this.categories, today, exclude }
		return {
			today,
			sources,
			rows: sources
				.filter((source) => !source.ignored)
				.map((source) => ({
					source,
					monthly: monthlyOf(source, ledger, today),
					missed: missedDay(source, today),
					thirdChecks: thirdCheckMonths(source, today),
				})),
			questions: incomeQuestions(sources, detected, today),
			monthly: monthlyIncome(sources, ledger, home, today),
			average: incomeAverage(ledger, { month: today.slice(0, 7), exclude }),
			lean: since
				? {
						since,
						runway: runwayOf({ ...lean, accounts: this.accounts, sources, home }),
						essentials: essentialLines(lean),
						pause: pauseCandidates(lean),
					}
				: undefined,
		}
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
			const [links, accounts, assets, categories, merchants, rules, sources] = await Promise.all([
				queryEntities<ProviderLinkPayload>({ type: FINANCE.link }),
				queryEntities<AccountPayload>({ type: FINANCE.account }),
				queryEntities<AssetPayload>({ type: FINANCE.asset }),
				queryEntities<CategoryPayload>({ type: FINANCE.category }),
				queryEntities<MerchantPayload>({ type: FINANCE.merchant }),
				queryEntities<RulePayload>({ type: FINANCE.rule }),
				queryEntities<IncomeSourcePayload>({ type: FINANCE.income }),
			])
			this.#show(financeFromRows({ links, accounts, assets }))
			this.categories = categories.map(withId)
			this.merchants = merchants.map(withId)
			this.rules = rules.map(ruleOf)
			this.incomeSources = sources.map(withId)
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
				resolve(true)
			})
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
		// the rows have their kinds now: the income pass reads them
		await this.detectIncome()
	}

	// ---- Income (#80, D-196) ---------------------------------------------------------------------------------------

	/**
	 * The income pass over every live transaction: after each classification pass, after a sync that wrote nothing
	 * and when the page mounts, so a late paycheck shows even when no rows arrive. One queue job reads, works out and
	 * writes the `income-source` rows; then the questions' signals are emitted, each once per key, and the
	 * `monthly-income-band` fact is brought in line. A failure is logged by its code and leaves the rows; the next pass
	 * tries again. A second ask while one runs joins it.
	 */
	detectIncome(): Promise<void> {
		return (this.#detecting ??= this.#detectIncome().finally(() => (this.#detecting = undefined)))
	}

	async #detectIncome() {
		await this.load()
		if (this.#queue.failed) return
		let made: { signals: IncomeSignal[]; sources: IncomeSource[]; today: string } | undefined
		try {
			made = await this.#exclusive(async () => {
				try {
					const today = todayIso()
					const [transactions, rows] = await Promise.all([
						this.#transactions(),
						queryEntities<IncomeSourcePayload>({ type: FINANCE.income }),
					])
					const detected = detectIncome({ transactions, merchants: this.merchants, categories: this.categories, today })
					const out = incomeOps(detected, rows, newId)
					for (const ops of chunked(out.ops)) await this.#write(ops)
					this.incomeSources = out.sources
					const lang = settings.language
					const questions = incomeQuestions(out.sources, detected, today)
					const signals = incomeSignals(questions, out.created, out.sources, today, (day) => dayLine(day, lang))
					return { signals, sources: out.sources, today }
				} catch (error) {
					await logError('data', 'The Orchard income pass failed', code(error)).catch(() => null)
					return undefined
				}
			})
		} catch {
			return
		}
		if (!made) return
		for (const signal of made.signals) {
			await emit(signal.name, signal.payload, { dedupeKey: signal.dedupeKey }).catch(
				(error: unknown) =>
					void logError('data', 'An Orchard income signal was not emitted', code(error)).catch(() => null)
			)
		}
		await this.#syncBand(made.sources, made.today)
	}

	/**
	 * `monthly-income-band` (finance.md §4): the fact Orchard derived is made to say what the sources now say,
	 * asserted, updated or deleted. The owner's own facts of the type are never read or changed here.
	 */
	async #syncBand(sources: IncomeSource[], today: string) {
		try {
			const want = bandOf(sources, this.ledger, settings.homeCurrency, today)
			const have = (await queryFacts({ types: [BAND] })).filter((fact) => fact.provenance === 'domain-derived')
			const [first, ...rest] = have
			for (const fact of want ? rest : have) await deleteFact(fact.id)
			if (!want) return
			if (!first)
				await assertFact({ type: BAND, value: want.value, provenance: 'domain-derived', confidence: want.confidence })
			else if (first.value !== want.value || first.confidence !== want.confidence)
				await updateFact(first.id, { value: want.value, confidence: want.confidence })
		} catch (error) {
			await logError('data', 'The monthly income band could not be written', code(error)).catch(() => null)
		}
	}

	incomeById(id: string): IncomeSource | undefined {
		return this.income?.sources.find((source) => source.id === id)
	}

	/**
	 * The owner's answer on one or more sources: shown at once, written in one batch with one undo (D-12), and the
	 * questions it answers withdrawn from the inbox once it lands. Nothing when no source changes.
	 */
	#incomeChange(change: (source: IncomeSource) => IncomeSource | undefined, answered: Answered[] = []) {
		const plain = $state.snapshot(this.incomeSources) as IncomeSource[]
		const was: IncomeSource[] = []
		const next: IncomeSource[] = []
		for (const source of plain) {
			const changed = change(source)
			if (!changed) continue
			was.push(source)
			next.push(changed)
		}
		if (!next.length) return undefined
		const before = this.incomeSources
		const changedOf = (id: string) => next.find((source) => source.id === id)
		return this.#commit({
			apply: () => (this.incomeSources = this.incomeSources.map((source) => changedOf(source.id) ?? source)),
			revert: () => (this.incomeSources = before),
			ops: next.map((source) => ({ op: 'updateEntity', id: source.id, payload: payloadOf(source) })),
			inverse: was.map((source) => ({ op: 'updateEntity', id: source.id, payload: payloadOf(source) })),
			after: answered.length
				? async () => {
						for (const { name, key } of answered) await withdraw(name, key).catch(() => null)
					}
				: undefined,
		})
	}

	/** The late question a source would ask today, as what an answer withdraws. */
	#lateOf(source: IncomeSource | undefined): Answered[] {
		const day = source ? missedDay(source, todayIso()) : undefined
		return source && day ? [{ name: 'finance.paycheck-late', key: `${source.id}:${day}` }] : []
	}

	/** "No, it's just late": the paycheck due that day is late, and nothing is asked about it again. */
	paycheckLate(id: string, day: string): Undo | undefined {
		const answered: Answered[] = [{ name: 'finance.paycheck-late', key: `${id}:${day}` }]
		return this.#incomeChange((source) => (source.id === id ? { ...source, lateOk: day } : undefined), answered)
	}

	/** The job ended today; with `lean`, lean mode starts too ("Yes, it ended"). */
	endIncome(id: string, options: { lean?: boolean } = {}): Undo | undefined {
		const today = todayIso()
		const answered = this.#lateOf(this.incomeSources.find((source) => source.id === id))
		return this.#incomeChange(
			(source) =>
				source.id === id && !source.endedOn
					? { ...source, endedOn: today, ...(options.lean ? { leanSince: today } : {}) }
					: undefined,
			answered
		)
	}

	/** "Still paid here": the source is active again, and lean mode and the late answer go with its end. */
	restoreIncome(id: string): Undo | undefined {
		return this.#incomeChange((source) =>
			source.id === id && source.endedOn ? without(source, 'endedOn', 'leanSince', 'lateOk') : undefined
		)
	}

	startLean(id: string): Undo | undefined {
		const today = todayIso()
		return this.#incomeChange((source) =>
			source.id === id && !source.leanSince ? { ...source, leanSince: today } : undefined
		)
	}

	/** Lean mode off: no source keeps `leanSince`. */
	endLean(): Undo | undefined {
		return this.#incomeChange((source) => (source.leanSince ? without(source, 'leanSince') : undefined))
	}

	/** "Not income" or "Not a tax payment": the row hides, and the pass asks nothing more about it. */
	ignoreIncome(id: string): Undo | undefined {
		const answered = this.#lateOf(this.incomeSources.find((source) => source.id === id))
		return this.#incomeChange((source) => (source.id === id ? { ...source, ignored: true } : undefined), answered)
	}

	/** The bonus row is answered (Save or Not a bonus); the source remembers the latest 20. */
	handleBonus(sourceId: string, rowId: string): Undo | undefined {
		const answered: Answered[] = [{ name: 'finance.bonus', key: rowId }]
		return this.#incomeChange((source) => {
			if (source.id !== sourceId) return undefined
			const handled = [...(source.handled ?? []).filter((id) => id !== rowId), rowId].slice(-HANDLED_MAX)
			return { ...source, handled }
		}, answered)
	}

	/** The owner has seen the new paycheck during lean mode. */
	seenNewIncome(id: string): Undo | undefined {
		const answered: Answered[] = [{ name: 'finance.income-new', key: `${id}:new` }]
		return this.#incomeChange(
			(source) => (source.id === id && !source.seenNew ? { ...source, seenNew: true } : undefined),
			answered
		)
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

	// ---- Statement import (#74, D-195) --------------------------------------------------------------------------

	/**
	 * Whether a file was imported before, by its fingerprint: the day it was and what it made, both in the owner's
	 * words; nothing for a file never imported, or one whose import was undone. An arrow, so it is passed as it is.
	 */
	knownImport = async (fingerprint: string): Promise<{ day: string; detail: string } | undefined> => {
		await this.load()
		const [row] = await queryEntities<FileImportPayload>({
			type: FINANCE.fileImport,
			source: FILE_SOURCE,
			externalIds: [fingerprint],
		})
		if (!row) return undefined
		return {
			day: dayLine(dayOfInstant(row.payload.at), settings.language),
			detail: importDetail(row.payload, this.accounts, get(t)),
		}
	}

	/** The statement against the account's live rows: what would be new and how many are already here. */
	async previewImport(
		accountId: string,
		parsed: ParsedStatement,
		flip: boolean
	): Promise<{ fresh: StatementRow[]; matched: number }> {
		await this.load()
		return matchRows(parsed.rows, await this.#transactions(), accountId, { flip })
	}

	/**
	 * Imports a statement in one queue job: the rows are read and matched again, so nothing landed since the review
	 * is written twice, then the new rows and the file's record go in their batches, the record last, and the pass
	 * runs. The undo deletes every row it made and the record, then runs the pass again. A write that fails stops the
	 * queue (`saveFailed`) and answers nothing; the retry runs the whole job again.
	 */
	async importStatement(input: {
		accountId: string
		parsed: ParsedStatement
		flip: boolean
		fingerprint: string
	}): Promise<{ created: number; matched: number; undo: Undo } | undefined> {
		await this.load()
		let made: { created: number; matched: number; inverse: BatchOp[][] }
		try {
			made = await this.#exclusive(async () => {
				const { parsed } = input
				const { fresh, matched } = matchRows(parsed.rows, await this.#transactions(), input.accountId, {
					flip: input.flip,
				})
				const { chunks, inverse } = importOps(
					{
						accountId: input.accountId,
						kind: parsed.kind,
						fingerprint: input.fingerprint,
						fresh,
						matched,
						skipped: parsed.skipped,
						from: parsed.from,
						to: parsed.to,
					},
					newId,
					nowIso()
				)
				for (const ops of chunks) if (ops.length) await this.#write(ops)
				return { created: fresh.length, matched, inverse }
			})
		} catch {
			// the queue logged the code and holds the job for the retry
			return undefined
		}
		void this.classify()
		return {
			created: made.created,
			matched: made.matched,
			undo: () => {
				this.#queue.enqueue(async () => {
					for (const ops of made.inverse) if (ops.length) await this.#write(ops)
				})
				void this.classify()
			},
		}
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
