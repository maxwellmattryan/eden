// What the Gardener needs before it can answer (docs/engineering/gardener.md): the provider this build runs on
// (D-178), and on it whether this device can ask: a key for the API, a Claude Code that is found and signed in on
// desktop. Then the policy row with the owner's edits, overrides and caps, the provider as those edits leave it, the
// map the resolver runs on (clamped to the light model in development, D-76), this month's spend from the audit log,
// and the conversation's grade from the settings. One instance, read by the panel, the chip and the Gardener tab.
import { getAppInfo } from '../../api/index.js'
import {
	auditSpend,
	clampForDevelopment,
	CLAUDE_CODE,
	deleteSecret,
	effectiveSetup,
	gardenerClaudeStatus,
	getPolicy,
	hasSecret,
	isDevEnvironment,
	POLICY_KEY,
	readPolicy,
	SECRET_NAME,
	seedOf,
	setPolicy,
	setSecret,
	startOfMonthMs,
	type ClaudeStatus,
	type GardenerPolicy,
	type GardenerProviderId,
	type GradeMap,
	type ModelGrade,
	type ModelLookup,
	type ModelOverrides,
	type ProviderRow,
} from '../../gardener/index.js'
import { settings } from '../../settings/index.js'

/** Where the owner pointed this device at its `claude`: on the device only, so no bundle carries a path elsewhere. */
export const CLAUDE_PATH_KEY = 'eden:gardener-claude-path'

function storedPath(): string {
	try {
		return localStorage.getItem(CLAUDE_PATH_KEY) ?? ''
	} catch {
		return ''
	}
}

export class GardenerSetup {
	ready = $state(false)
	failed = $state(false)
	hasKey = $state(false)
	environment = $state('development')
	/** The provider this build runs on: Claude Code on desktop, the API on the phone and in a browser (D-178). */
	providerId = $state<GardenerProviderId>('anthropic')
	/** This device's Claude Code, once read; undefined while it is being read. */
	claude = $state<ClaudeStatus | undefined>()
	/** The status could not be read at all. */
	claudeFailed = $state(false)
	/** The owner's override of the binary's path, or empty. */
	claudePath = $state(storedPath())
	policy = $state<GardenerPolicy>(readPolicy(null))
	/** This month's spend in USD, from the audit log. */
	spentThisMonth = $state(0)
	/** The provider's edits that would not hold, named. */
	refused = $state<string[]>([])

	readonly onClaude = $derived(this.providerId === CLAUDE_CODE)
	/** Whether this device can ask at all: Claude Code found and signed in, or a key for the API. */
	readonly canAsk = $derived(this.onClaude ? !!this.claude?.found && !!this.claude.signedIn : this.hasKey)
	readonly clamped = $derived(isDevEnvironment(this.environment))
	readonly #setup = $derived(effectiveSetup(this.policy, this.providerId))
	readonly provider = $derived<ProviderRow>(this.#setup.provider)
	readonly models = $derived<ModelLookup>(this.#setup.models)
	/** The map the resolver runs on: in development the seed's light model, and its standard one for deep. */
	readonly map = $derived<GradeMap>(
		this.clamped ? clampForDevelopment(this.#setup.map, seedOf(this.providerId)) : this.#setup.map
	)
	/** The overrides the resolver sees: none in development, since one could name a dearer model. */
	readonly overrides = $derived<ModelOverrides | undefined>(this.clamped ? undefined : this.policy.overrides)
	readonly grade = $derived<ModelGrade>(settings.gardenerGrade)
	/** The model the conversation runs on at its grade. */
	readonly model = $derived(this.map[this.grade].model)
	readonly capUsd = $derived(this.policy.monthlyCapUsd)
	readonly percent = $derived(
		this.capUsd > 0 ? Math.min(100, Math.round((this.spentThisMonth / this.capUsd) * 100)) : 0
	)

	#loading: Promise<void> | undefined

	load(): Promise<void> {
		return (this.#loading ??= this.#read())
	}

	async reload(): Promise<void> {
		this.#loading = this.#read()
		return this.#loading
	}

	async #read(): Promise<void> {
		try {
			const [info, key, row] = await Promise.all([getAppInfo(), hasSecret(SECRET_NAME), getPolicy(POLICY_KEY)])
			this.environment = info.environment
			this.providerId = info.gardenerProvider ?? 'anthropic'
			this.hasKey = key
			this.policy = readPolicy(row, this.providerId)
			this.refused = effectiveSetup(this.policy, this.providerId).refused
			if (this.onClaude) await this.refreshClaude()
			await this.refreshSpend()
			this.failed = false
		} catch {
			this.failed = true
		} finally {
			this.ready = true
		}
	}

	/** Reads this device's Claude Code again: after the owner installed it, signed in, or changed the override. */
	async refreshClaude(): Promise<void> {
		this.claude = undefined
		try {
			this.claude = await gardenerClaudeStatus(this.claudePath || null)
			this.claudeFailed = false
		} catch {
			this.claudeFailed = true
			this.claude = { found: false, path: null, version: null, signedIn: false, authMethod: null, subscription: null }
		}
	}

	/** Keeps the override on this device (empty clears it) and reads the status at it. */
	async setClaudePath(path: string): Promise<void> {
		const next = path.trim()
		this.claudePath = next
		try {
			if (next) localStorage.setItem(CLAUDE_PATH_KEY, next)
			else localStorage.removeItem(CLAUDE_PATH_KEY)
		} catch {
			// no storage: the override lasts until the app closes
		}
		await this.refreshClaude()
	}

	/** Reads this month's spend again, after a request was audited. */
	async refreshSpend(): Promise<void> {
		try {
			this.spentThisMonth = await auditSpend(
				startOfMonthMs(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone)
			)
		} catch {
			// the meter keeps what it had
		}
	}

	async setKey(value: string): Promise<void> {
		await setSecret(SECRET_NAME, value.trim())
		this.hasKey = true
	}

	async clearKey(): Promise<void> {
		await deleteSecret(SECRET_NAME)
		this.hasKey = false
	}

	/**
	 * Writes the policy row with a change laid over what it holds; the row answers with its stamps. The provider is
	 * the build's, so it is never written (D-178).
	 */
	async savePolicy(patch: Partial<GardenerPolicy>): Promise<void> {
		const next: GardenerPolicy = { ...this.policy, ...patch, provider: this.providerId }
		this.policy = next
		this.refused = effectiveSetup(next, this.providerId).refused
		// a plain copy: the edits are the state's proxies, which the browser's engine cannot clone
		const { provider: _provider, ...stored } = $state.snapshot(next)
		await setPolicy(POLICY_KEY, stored)
	}
}

export const gardenerSetup = new GardenerSetup()
