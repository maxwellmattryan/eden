// Plaid behind Orchard's provider seam (product/domains/finance.md §8), desktop only. The crate holds the keys and
// every token and makes every call (`api/plaid.ts`); this module is the session the Link sheet shows, the keys sheet's
// saves, and the sync: on launch, every hour (`finance.sync`), and on the retries after a failure (`finance.retry`),
// one link after another and one run at a time. A removed link is revoked at Plaid two minutes after its tombstone
// (`finance.revoke`), so the page's Undo stays true, and again at the start of every run until it is done. At the end
// of a run, each link holding investments gets its one investments read of the day (D-195); there is no schedule of
// its own and never a paid refresh.
//
// Nothing here logs more than a code: no name, no amount, no token.
import { toast } from '@eden/ui-kit'
import { get } from 'svelte/store'
import { logError } from '../../api/diagnostics.js'
import { openExternal } from '../../api/external.js'
import {
	plaidClearKeys,
	plaidErrorCode,
	plaidInvestments,
	plaidLinkPoll,
	plaidLinkStart,
	plaidRevoke,
	plaidSandboxResetLogin,
	plaidSetKeys,
	plaidStatus,
	plaidSync,
	type NewLink,
	type PlaidErrorCode,
	type PlaidStatus,
} from '../../api/plaid.js'
import { newId, queryEntities, toUri, type BatchOp, type Entity } from '../../data/index.js'
import { nowIso, todayIso } from '../../dates/index.js'
import { t } from '../../i18n/index.js'
import { setSchedule } from '../../scheduler/client.js'
import { settings } from '../../settings/index.js'
import { emit, onSchedule } from '../../signals/runtime.js'
import { payloadOf } from './accounts.js'
import { investmentOps, investmentsDue, investmentsWindow, PLAID_INVESTMENTS_SOURCE } from './investments.js'
import { bindProvider, type FinanceProvider } from './provider.svelte.js'
import { finance } from './store.svelte.js'
import {
	accountOps,
	chunked,
	CHUNK,
	idsToRead,
	linkAfterFailure,
	linkSignal,
	linksToRevoke,
	PLAID_SOURCE,
	REVOKE_AFTER,
	retryDelay,
	syncOps,
	type Skipped,
} from './sync.js'
import {
	FINANCE,
	type Account,
	type HoldingPayload,
	type ProviderLink,
	type ProviderLinkPayload,
	type SecurityPayload,
	type TransactionPayload,
} from './types.js'
import { dayLine } from './words.js'

/** The repeating run the manifest declares. */
export const SYNC_SCHEDULE = 'finance.sync'
/** The one-shot after a failed run. */
export const RETRY_SCHEDULE = 'finance.retry'
/** The one-shot that revokes what was removed, once the undo has passed. */
export const REVOKE_SCHEDULE = 'finance.revoke'

const SECOND = 1000
const MINUTE = 60 * SECOND
/** How often a waiting session asks the crate. */
const POLL_MS = 3 * SECOND
/** How long a session waits for the owner before its page has expired. */
const SESSION_MS = 30 * MINUTE

export type SessionState = 'starting' | 'waiting' | 'reading' | 'linked' | 'cancelled' | 'expired' | 'error'

export interface LinkSession {
	mode: 'link' | 'reconnect'
	/** A new link that asks for investments first (D-195). */
	brokerage?: boolean
	/** The link a reconnect signs in again. */
	linkId?: string
	/** The bank's name, once it is known: the link's for a reconnect, the institution's once linked. */
	name?: string
	linkToken?: string
	url?: string
	startedAt: number
	state: SessionState
	/** The failure's code, in `error`. */
	code?: PlaidErrorCode
	/** The accounts a new link brought, in `linked`. */
	accounts?: Account[]
}

const LIVE: readonly SessionState[] = ['starting', 'waiting', 'reading']

class PlaidState {
	/** The crate's answer: the environment and whether this device has keys. */
	status = $state<PlaidStatus>()
	/** The Link session, live or ended; one at a time. */
	session = $state<LinkSession>()
	/** The sheet showing. */
	sheet = $state<'none' | 'keys' | 'link'>('none')
	/** The Link sheet opens once the keys are saved: "Link a bank" asked for them first. */
	thenLink = false
	/** The Link sheet waiting on the keys is a brokerage's. */
	thenBrokerage = false
}

export const plaid = new PlaidState()

const tr = (key: string, values?: Record<string, string | number>) => get(t)(key, values ? { values } : undefined)
const report = (what: string, code: string) => void logError('finance', what, code).catch(() => null)

// ---- The keys ------------------------------------------------------------------------------------------------------

/** Tries the keys and stores them once Plaid accepts them. Answers the refusal's code, or nothing when saved. */
export async function saveKeys(clientId: string, secret: string): Promise<PlaidErrorCode | undefined> {
	try {
		await plaidSetKeys(clientId, secret)
	} catch (error) {
		return plaidErrorCode(error)
	}
	plaid.status = (await plaidStatus().catch(() => undefined)) ?? plaid.status
	toast({ message: tr('domains.finance.plaid.keys.saved') })
	if (plaid.thenLink) {
		plaid.thenLink = false
		void startSession('link', undefined, plaid.thenBrokerage)
	} else plaid.sheet = 'none'
	void syncAll()
	return undefined
}

export async function clearKeys(): Promise<void> {
	try {
		await plaidClearKeys()
	} catch (error) {
		report('Plaid keys could not be removed', plaidErrorCode(error))
	}
	plaid.status = (await plaidStatus().catch(() => undefined)) ?? plaid.status
}

// ---- The Link session ----------------------------------------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | undefined

function stopPolling() {
	if (timer) clearTimeout(timer)
	timer = undefined
}

/** Whether the session is still the one showing: one that was stopped or replaced changes nothing. */
const current = (session: LinkSession) => plaid.session?.startedAt === session.startedAt

/** The session, changed only while it is still the current one. */
function update(session: LinkSession, change: Partial<LinkSession>) {
	if (current(session)) plaid.session = { ...plaid.session!, ...change }
}

/**
 * Opens the Link sheet on a session: the live one when there is one (closing the sheet never ends it), else a new
 * one, which makes a link token and opens Plaid's hosted page in the system browser. A brokerage's asks for
 * investments first (D-195).
 */
export async function startSession(mode: 'link' | 'reconnect', linkId?: string, brokerage = false): Promise<void> {
	plaid.sheet = 'link'
	if (plaid.session && LIVE.includes(plaid.session.state)) return
	stopPolling()
	const name = linkId ? finance.linkById(linkId)?.institution.name : undefined
	const session: LinkSession = {
		mode,
		linkId,
		name,
		startedAt: Date.now(),
		state: 'starting',
		...(brokerage && mode === 'link' ? { brokerage: true } : {}),
	}
	plaid.session = session
	try {
		const started = await plaidLinkStart(linkId, session.brokerage)
		if (!current(session)) return
		const next = { ...session, linkToken: started.linkToken, url: started.url, state: 'waiting' as const }
		plaid.session = next
		await openExternal(started.url)
		poll(next)
	} catch (error) {
		const code = plaidErrorCode(error)
		report('A Plaid Link session did not start', code)
		update(session, { state: 'error', code })
	}
}

/** Opens the hosted page again, for an owner who closed the tab. */
export function openPageAgain(): void {
	if (plaid.session?.url) void openExternal(plaid.session.url)
}

/** Ends the session: the sheet closes and nothing is linked. */
export function stopWaiting(): void {
	stopPolling()
	plaid.session = undefined
	plaid.sheet = 'none'
}

/** The sheet closed: a live session keeps waiting, an ended one is let go so the next "Link a bank" starts anew. */
export function sheetClosed(): void {
	if (plaid.sheet === 'link') plaid.sheet = 'none'
	if (plaid.session && !LIVE.includes(plaid.session.state)) plaid.session = undefined
}

/** A failed or ended session's way on: a new session of the same kind. */
export function startAgain(): void {
	const was = plaid.session
	plaid.session = undefined
	void startSession(was?.mode ?? 'link', was?.linkId, was?.brokerage)
}

/** The keys sheet, from the Link sheet's "Change keys"; the Link sheet comes back once they are saved. */
export function changeKeys(): void {
	stopPolling()
	plaid.thenBrokerage = plaid.session?.brokerage === true
	plaid.session = undefined
	plaid.thenLink = true
	plaid.sheet = 'keys'
}

function poll(session: LinkSession) {
	stopPolling()
	timer = setTimeout(() => void tick(session), POLL_MS)
}

async function tick(session: LinkSession) {
	if (!current(session) || !session.linkToken) return
	if (Date.now() - session.startedAt > SESSION_MS) return update(session, { state: 'expired' })
	let answer
	try {
		answer = await plaidLinkPoll(session.linkToken, session.linkId)
	} catch (error) {
		const code = plaidErrorCode(error)
		// a moment off the network does not end a session the owner is still in
		if (code === 'network') return poll(session)
		report('A Plaid Link session failed', code)
		return update(session, { state: 'error', code })
	}
	if (!current(session)) return
	switch (answer.state) {
		case 'waiting':
			return poll(session)
		case 'exited':
			return update(session, { state: 'cancelled' })
		case 'expired':
			return update(session, { state: 'expired' })
		case 'reconnected':
			return reconnected(session)
		case 'linked':
			return linked(session, answer)
	}
}

/** A new link: the link and its accounts are written, the sheet says so, and the first sync brings the rest. */
async function linked(session: LinkSession, found: NewLink) {
	update(session, { state: 'reading', name: found.institution.name })
	await finance.load()
	const now = nowIso()
	const institution: ProviderLinkPayload['institution'] = {
		...(found.institution.id ? { id: found.institution.id } : {}),
		name: found.institution.name,
		...(found.institution.colour ? { colour: found.institution.colour } : {}),
		...(found.institution.logo ? { logo: found.institution.logo } : {}),
	}
	const link: ProviderLink = {
		id: found.linkId,
		provider: 'plaid',
		institution,
		itemId: found.itemId,
		status: 'ok',
		// the accounts and their balances were read just now
		lastSyncedAt: now,
		failures: 0,
		...(found.consentExpiresAt ? { consentExpiresAt: found.consentExpiresAt } : {}),
	}
	const accounts = accountOps(link, finance.data().accounts, found.accounts, now, todayIso(), newId)
	logSkipped(accounts.skipped)
	const create: BatchOp = { op: 'createEntity', input: { id: link.id, type: FINANCE.link, payload: payloadOf(link) } }
	const written = await finance.applySync(chunked([create, ...accounts.ops]), {
		links: [link],
		accounts: accounts.accounts,
	})
	if (!written) return update(session, { state: 'error', code: 'other' })
	stopPolling()
	update(session, { state: 'linked', name: link.institution.name, accounts: accounts.accounts })
	void syncAll()
}

/** A stale link signed in again: it is fresh, and syncs at once. */
async function reconnected(session: LinkSession) {
	update(session, { state: 'reading' })
	const link = session.linkId ? finance.linkById(session.linkId) : undefined
	if (link) {
		const next: ProviderLink = { ...($state.snapshot(link) as ProviderLink), status: 'ok', failures: 0 }
		delete next.lastErrorCode
		await finance.applySync([[{ op: 'updateEntity', id: next.id, payload: payloadOf(next) }]], { links: [next] })
	}
	stopPolling()
	update(session, { state: 'linked' })
	void syncAll()
}

// ---- The sync ------------------------------------------------------------------------------------------------------

let running: Promise<void> | undefined

/** One run over every live Plaid link, one after another. A second ask while one runs joins it. */
export function syncAll(): Promise<void> {
	return (running ??= run().finally(() => (running = undefined)))
}

async function run() {
	const status = await plaidStatus().catch(() => undefined)
	if (status) plaid.status = status
	// with no keys on the device, a run does nothing and writes nothing
	if (!status?.hasKeys) return
	await revokeRemoved()
	await finance.load()
	// one at a time, and a link made while the run is going is synced in it too; the run's own note, never shown
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const done = new Set<string>()
	let wrote = false
	for (;;) {
		const next = finance.links.find((link) => link.provider === 'plaid' && !done.has(link.id))
		if (!next) break
		done.add(next.id)
		// a link whose failure could not be written is logged, and the run goes on to the next
		const changed = await syncLink($state.snapshot(next) as ProviderLink).catch((error: unknown) => {
			report('A bank sync could not be recorded', plaidErrorCode(error))
			return false
		})
		wrote ||= changed
	}
	// then the day's investments read, once a day for each link that holds investments (D-195)
	const valued = await valueLinks()
	// once every link is done, the rows that came get their kind, merchant and category (#75)
	if (wrote || valued) await finance.classify()
}

/**
 * The day's investments read for every link it is due on, one at a time, each read and written in one queue job as a
 * sync is. Answers whether it wrote investment transactions. A failed read is logged by its code, writes nothing and
 * leaves the link as it was, so the next hourly run tries again.
 */
async function valueLinks(): Promise<boolean> {
	let wrote = false
	const today = todayIso()
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- the run's own note, never shown
	const done = new Set<string>()
	for (;;) {
		const next = finance.links.find(
			(link) => !done.has(link.id) && investmentsDue(link, finance.data().accounts, today)
		)
		if (!next) break
		done.add(next.id)
		const link = $state.snapshot(next) as ProviderLink
		try {
			const window = investmentsWindow(link, today)
			const result = await plaidInvestments(link.id, window.start, window.end)
			const made: { out?: ReturnType<typeof investmentOps> } = {}
			const written = await finance.applySync(async () => {
				const [holdings, securities, existing] = await Promise.all([
					queryEntities<HoldingPayload>({ type: FINANCE.holding, includeDeleted: true }),
					queryEntities<SecurityPayload>({ type: FINANCE.security }),
					existingRows(
						result.transactions.map((found) => found.id),
						PLAID_INVESTMENTS_SOURCE
					),
				])
				// the link as the sync just left it, so its cursor and freshness are kept
				const latest = finance.linkById(link.id)
				const out = (made.out = investmentOps({
					link: latest ? ($state.snapshot(latest) as ProviderLink) : link,
					accounts: finance.data().accounts,
					holdings,
					securities,
					existingTransactions: existing,
					result,
					day: today,
					newId,
				}))
				return {
					chunks: out.chunks,
					links: [out.link],
					holdings: out.holdings,
					removedHoldings: out.removedHoldings,
					securities: out.securities,
				}
			})
			if (made.out) logSkipped(made.out.skipped)
			wrote ||= written && result.transactions.length > 0
		} catch (error) {
			report('An investments read failed', plaidErrorCode(error))
		}
	}
	return wrote
}

/** The live provider rows the result names, by provider id, read in lookups of `CHUNK`. */
async function existingRows(ids: string[], source = PLAID_SOURCE): Promise<Map<string, Entity<TransactionPayload>>> {
	// a lookup handed to the pure rules, never shown
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const found = new Map<string, Entity<TransactionPayload>>()
	for (let at = 0; at < ids.length; at += CHUNK) {
		const rows = await queryEntities<TransactionPayload>({
			type: FINANCE.transaction,
			source,
			externalIds: ids.slice(at, at + CHUNK),
		})
		for (const row of rows) if (row.externalId) found.set(row.externalId, row)
	}
	return found
}

function logSkipped(skipped: readonly Skipped[]) {
	for (const code of new Set(skipped)) report('A row Plaid sent was skipped', code)
}

/** One link's run. Answers whether it wrote transactions, so the run classifies them once every link is done. */
async function syncLink(link: ProviderLink): Promise<boolean> {
	try {
		const result = await plaidSync(link.id, link.cursor)
		if (result.status === 'needs-reauth') {
			await failed(link, 'needs-reauth')
			return false
		}
		const made: { out?: ReturnType<typeof syncOps> } = {}
		// the read and the write in one queue job, so an owner's fix cannot land between them and be overwritten
		const written = await finance.applySync(async () => {
			const existing = await existingRows(idsToRead(result))
			const out = (made.out = syncOps({
				link,
				accounts: finance.data().accounts,
				existing,
				result,
				nowIso: nowIso(),
				day: todayIso(),
				newId,
			}))
			return { chunks: out.chunks, links: [out.link], accounts: out.accounts }
		})
		if (made.out) {
			logSkipped(made.out.skipped)
			await signal(made.out.link)
		}
		return written && result.added.length + result.modified.length + result.removed.length > 0
	} catch (error) {
		const code = plaidErrorCode(error)
		// the keys went while the run was going: nothing to write
		if (code === 'no-keys') return false
		await failed(link, code)
		return false
	}
}

/** A failed run keeps the data, counts the failure and sets the retry; a sign-in is not retried, it is asked for. */
async function failed(link: ProviderLink, code: string) {
	report('A bank sync failed', code)
	const next = linkAfterFailure(link, code)
	await finance.applySync([[{ op: 'updateEntity', id: next.id, payload: payloadOf(next) }]], { links: [next] })
	const delay = next.status === 'needs-reauth' ? undefined : retryDelay(next.failures ?? 0)
	if (delay !== undefined) await setSchedule(RETRY_SCHEDULE, Date.now() + delay).catch(() => null)
	await signal(next)
}

/** Tells the owner a link wants a sign-in, or will soon; once for each state, by its key. */
async function signal(link: ProviderLink) {
	const said = linkSignal(link, Date.now())
	if (!said) return
	const payload = {
		uris: [toUri(FINANCE.link, link.id)],
		institution: link.institution.name,
		reason: said.reason,
		...(said.by ? { by: said.by, byDay: dayLine(said.by, settings.language) } : {}),
	}
	await emit('finance.link-broken', payload, { dedupeKey: said.dedupeKey }).catch((error: unknown) =>
		report('The broken-link signal was not emitted', String(error))
	)
}

/** Revokes every Plaid link removed longer ago than its undo; a younger one waits, so its Undo stays true. */
async function revokeRemoved() {
	const rows = await queryEntities<ProviderLinkPayload>({ type: FINANCE.link, includeDeleted: true }).catch(() => [])
	for (const id of linksToRevoke(rows, Date.now())) {
		try {
			await plaidRevoke(id)
		} catch (error) {
			report('A bank link could not be revoked', plaidErrorCode(error))
		}
	}
}

// ---- The provider --------------------------------------------------------------------------------------------------

export const plaidProvider: FinanceProvider = {
	name: 'Plaid',
	get sandbox() {
		return plaid.status?.environment === 'sandbox'
	},
	link(kind?: 'bank' | 'brokerage') {
		const brokerage = kind === 'brokerage'
		if (!plaid.status?.hasKeys) {
			plaid.thenLink = true
			plaid.thenBrokerage = brokerage
			plaid.sheet = 'keys'
			return
		}
		void startSession('link', undefined, brokerage)
	},
	reconnect(linkId: string) {
		if (!plaid.status?.hasKeys) {
			plaid.sheet = 'keys'
			return
		}
		void startSession('reconnect', linkId)
	},
	async revoke() {
		await setSchedule(REVOKE_SCHEDULE, Date.now() + REVOKE_AFTER)
	},
	credentials() {
		plaid.thenLink = false
		plaid.sheet = 'keys'
	},
	async resetLogin(linkId: string) {
		try {
			await plaidSandboxResetLogin(linkId)
		} catch (error) {
			report('The Sandbox reset failed', plaidErrorCode(error))
			return
		}
		await syncAll()
	},
}

/**
 * Binds Plaid where the crate is (the desktop under Tauri): the provider, its three schedules, and one run now. The
 * phone never calls it, and in a plain browser the status is `undefined` and nothing binds. The answer unbinds.
 */
export function bindPlaid(): () => void {
	const stops: (() => void)[] = []
	let stopped = false
	void (async () => {
		const status = await plaidStatus()
		if (!status || stopped) return
		plaid.status = status
		stops.push(
			bindProvider(plaidProvider),
			onSchedule(SYNC_SCHEDULE, () => syncAll()),
			onSchedule(RETRY_SCHEDULE, () => syncAll()),
			onSchedule(REVOKE_SCHEDULE, () => revokeRemoved())
		)
		await finance.load()
		await syncAll()
	})().catch((error: unknown) => report('Plaid did not bind', plaidErrorCode(error)))
	return () => {
		stopped = true
		stopPolling()
		for (const stop of stops.splice(0)) stop()
	}
}
