// What the Gardener needs before it can answer (docs/engineering/gardener.md): whether this device has a key, the
// policy row with the owner's edits, overrides and caps, the provider as those edits leave it, the map the resolver
// runs on (clamped to the light model in development, D-76), this month's spend from the audit log, and the
// conversation's grade from the settings. One instance, read by the panel, the chip and the Gardener tab.
import { getAppInfo } from '@eden/shared/api'
import {
	ANTHROPIC_SEED,
	auditSpend,
	clampForDevelopment,
	deleteSecret,
	effectiveSetup,
	getPolicy,
	hasSecret,
	isDevEnvironment,
	POLICY_KEY,
	readPolicy,
	SECRET_NAME,
	setPolicy,
	setSecret,
	startOfMonthMs,
	type GardenerPolicy,
	type GradeMap,
	type ModelGrade,
	type ModelLookup,
	type ModelOverrides,
	type ProviderRow,
} from '@eden/shared/gardener'
import { settings } from '@eden/shared/settings'

export class GardenerSetup {
	ready = $state(false)
	failed = $state(false)
	hasKey = $state(false)
	environment = $state('development')
	policy = $state<GardenerPolicy>(readPolicy(null))
	/** This month's spend in USD, from the audit log. */
	spentThisMonth = $state(0)
	/** The provider's edits that would not hold, named. */
	refused = $state<string[]>([])

	readonly clamped = $derived(isDevEnvironment(this.environment))
	readonly provider = $derived<ProviderRow>(effectiveSetup(this.policy).provider)
	readonly models = $derived<ModelLookup>(effectiveSetup(this.policy).models)
	/** The map the resolver runs on: in development the seed's light model, and its standard one for deep. */
	readonly map = $derived<GradeMap>(
		this.clamped
			? clampForDevelopment(effectiveSetup(this.policy).map, ANTHROPIC_SEED)
			: effectiveSetup(this.policy).map
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
			this.hasKey = key
			this.policy = readPolicy(row)
			this.refused = effectiveSetup(this.policy).refused
			await this.refreshSpend()
			this.failed = false
		} catch {
			this.failed = true
		} finally {
			this.ready = true
		}
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

	/** Writes the policy row with a change laid over what it holds; the row answers with its stamps. */
	async savePolicy(patch: Partial<GardenerPolicy>): Promise<void> {
		const next: GardenerPolicy = { ...this.policy, ...patch }
		this.policy = next
		this.refused = effectiveSetup(next).refused
		await setPolicy(POLICY_KEY, next)
	}
}

export const gardenerSetup = new GardenerSetup()
