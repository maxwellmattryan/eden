// The grant store as the shell holds it (product/substrate/grants.md; docs/engineering/data-layer.md, "Grants"): the
// live grants read once, and the questions a read or a confirm asks before it proceeds. It is the shell's, so a domain
// may import it. The Gardener and the onboarding wizard give grants; Settings → Privacy shows their count until the
// ledger with revoke and history arrives (Phase 2).
import {
	checkGrant,
	grant as give,
	queryGrants,
	revoke as end,
	type Grant,
	type GrantCheck,
	type GrantDecision,
	type GrantInput,
} from '../grants/index.js'

const byId = (a: Grant, b: Grant) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export class GrantStore {
	/** True once the store has been read, whether or not the read succeeded. */
	ready = $state(false)
	failed = $state(false)
	/** The live grants, by id. */
	grants = $state<Grant[]>([])
	standingCount = $derived(this.grants.filter((grant) => grant.lifetime === 'standing').length)

	#loading: Promise<void> | null = null

	/** Reads the live grants once; every later call returns the same promise. */
	load(): Promise<void> {
		this.#loading ??= this.#read()
		return this.#loading
	}

	/** Reads them again, after an import changed them under the store. */
	reload(): Promise<void> {
		this.#loading = this.#read()
		return this.#loading
	}

	async #read(): Promise<void> {
		try {
			this.grants = await queryGrants()
			this.failed = false
		} catch {
			this.failed = true
		} finally {
			this.ready = true
		}
	}

	/** Whether the subject may do this now, and by what right. Always asks the store, never the copy here. */
	allows(check: GrantCheck): Promise<GrantDecision> {
		return checkGrant(check)
	}

	async grant(input: GrantInput): Promise<Grant> {
		const granted = await give(input)
		await this.load()
		this.grants = [...this.grants.filter((grant) => grant.id !== granted.id), granted].sort(byId)
		return granted
	}

	async revoke(id: string): Promise<Grant> {
		const revoked = await end(id)
		this.grants = this.grants.filter((grant) => grant.id !== id)
		return revoked
	}
}

export const grants = new GrantStore()
