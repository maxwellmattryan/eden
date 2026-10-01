// The profile as the shell holds it (product/substrate/profile.md; docs/engineering/data-layer.md, "The profile"):
// the facts read once, expired ones included so the page can grey them, and every write the page makes. A write
// changes the store at once and is sent after, in order (`WriteQueue`), hands back an undo (D-12) and lands in the
// Garden's feed. It is the shell's, so a domain may import it: Sky hands it the home the owner chose, and the
// Gardener hands it what it noticed. "Used by N requests" is read from the audit log (`refreshUsage`).
import { logError } from '@eden/shared/api'
import { newId, WriteQueue } from '@eden/shared/data'
import { todayIso } from '@eden/shared/dates'
import {
	assertFact,
	deleteFact,
	effectiveOrder,
	isExpired,
	isLiveFact,
	queryFacts,
	restoreFact,
	shapeOf,
	updateFact,
	type Fact,
	type FactInput,
	type FactPatch,
	type FactProposal,
} from '@eden/shared/profile'
import { auditUsage } from '@eden/shared/gardener'
import { ownerOf, type OwnerId } from '@eden/shared/registry'
import type { HomePlace } from '@eden/shared/types'
import { facts as sampleFacts } from '@eden/ui-kit/sample-data'
import { feed } from '../feed.svelte.js'

export type Undo = () => void

export interface FactGroup {
	owner: OwnerId
	facts: Fact[]
}

/** The owners in the order the page lists them: Eden first, then the domains; any other owner follows by name. */
const OWNER_ORDER: readonly string[] = ['substrate', 'kitchen', 'toolbench', 'health']
const HOME_SOURCE = 'setting:home'

const ownerRank = (owner: string) => {
	const index = OWNER_ORDER.indexOf(owner)
	return index === -1 ? OWNER_ORDER.length : index
}

export class ProfileStore {
	/** True once the store has been read, whether or not the read succeeded. */
	ready = $state(false)
	failed = $state(false)
	saveFailed = $state(false)
	/** The live facts, expired ones included, in the reader's order. */
	facts = $state<Fact[]>([])
	/** What the Gardener noticed and has not been answered: shell state, never a row. */
	proposals = $state<FactProposal[]>([])
	/** How many Gardener requests read each fact, by id, from the audit log. */
	usage = $state<Record<string, number>>({})

	readonly groups = $derived.by<FactGroup[]>(() => {
		const groups: FactGroup[] = []
		for (const fact of this.facts) {
			const owner = ownerOf(fact.type)
			const group = groups.find((entry) => entry.owner === owner)
			if (group) group.facts.push(fact)
			else groups.push({ owner, facts: [fact] })
		}
		return groups.sort((a, b) => ownerRank(a.owner) - ownerRank(b.owner) || (a.owner < b.owner ? -1 : 1))
	})

	#loading: Promise<void> | undefined
	readonly #queue = new WriteQueue(
		(failed) => (this.saveFailed = failed),
		(error) => void logError('data', 'A profile write failed', String(error)).catch(() => null)
	)

	/** Reads the facts once; every later call returns the same promise. */
	load(): Promise<void> {
		this.#loading ??= this.#read()
		return this.#loading
	}

	/** Reads them again, after an import changed them under the store. Waits for the queue first. */
	async reload(): Promise<void> {
		await this.#queue.settled()
		this.#loading = this.#read()
		return this.#loading
	}

	/** Sends the write that failed again, and then the ones behind it. */
	async flush(): Promise<void> {
		if (!this.#loading) await this.load()
		await this.#queue.retry()
	}

	async #read(): Promise<void> {
		try {
			this.facts = await queryFacts({ includeExpired: true })
			this.failed = false
		} catch {
			this.failed = true
		} finally {
			this.ready = true
		}
		await this.refreshUsage()
	}

	/** Reads the counts again, after a request was audited. */
	async refreshUsage(): Promise<void> {
		try {
			this.usage = await auditUsage()
		} catch {
			// the counts keep what they had
		}
	}

	/** Whether a live fact of the type is there: the page offers Edit instead of Add for a single-valued type. */
	liveOf(type: string): Fact | undefined {
		return this.facts.find((fact) => fact.type === type && !fact.deletedAt)
	}

	isExpired(fact: Fact): boolean {
		return isExpired(fact, todayIso())
	}

	/** Asserts a fact and shows it at once; the row takes the store's stamps when the write answers. */
	assert(input: FactInput, feedName?: string): { fact: Fact; undo: Undo } {
		const id = input.id ?? newId()
		const fact: Fact = {
			uri: `eden://fact/${id}`,
			id,
			type: input.type,
			value: input.value,
			provenance: input.provenance,
			confidence: input.confidence ?? null,
			validFrom: input.validFrom ?? null,
			validUntil: input.validUntil ?? null,
			source: input.source ?? null,
			note: input.note ?? null,
			createdAt: '',
			updatedAt: '',
			deletedAt: null,
		}
		this.#show([...this.facts, fact])
		this.#queue.enqueue(() => assertFact({ ...input, id }).then((stored) => this.#replace(stored)))
		const entry = feedName ? feed.record('profile', 'garden.feed.factAdded', { name: feedName }) : undefined
		return {
			fact,
			undo: () => {
				this.#show(this.facts.filter((entry) => entry.id !== id))
				this.#queue.enqueue(() => deleteFact(id))
				if (entry) feed.forget(entry.id)
			},
		}
	}

	/** Edits a fact in place. The undo writes back what it said; a fact made the owner's own stays theirs. */
	update(id: string, patch: FactPatch, feedName?: string): Undo {
		const before = this.facts.find((fact) => fact.id === id)
		if (!before) return () => {}
		const after: Fact = { ...before }
		if (patch.provenance === 'user-asserted') {
			after.provenance = 'user-asserted'
			after.confidence = null
		}
		if ('value' in patch) after.value = patch.value
		if ('confidence' in patch) after.confidence = patch.confidence ?? null
		if ('validFrom' in patch) after.validFrom = patch.validFrom ?? null
		if ('validUntil' in patch) after.validUntil = patch.validUntil ?? null
		if ('source' in patch) after.source = patch.source ?? null
		if ('note' in patch) after.note = patch.note ?? null
		this.#put(after)
		this.#queue.enqueue(() => updateFact(id, patch).then((stored) => this.#replace(stored)))
		const entry = feedName ? feed.record('profile', 'garden.feed.factChanged', { name: feedName }) : undefined
		const back: FactPatch = {
			value: before.value,
			validFrom: before.validFrom,
			validUntil: before.validUntil,
			source: before.source,
			note: before.note,
		}
		return () => {
			this.#put({ ...before, provenance: after.provenance, confidence: after.confidence })
			this.#queue.enqueue(() => updateFact(id, back).then((stored) => this.#replace(stored)))
			if (entry) feed.forget(entry.id)
		}
	}

	/** Clears or extends the window's end: what an expired fact offers. */
	renew(id: string, until: string | null, feedName?: string): Undo {
		return this.update(id, { validUntil: until }, feedName)
	}

	/** Deletes a fact; the undo brings it back. */
	remove(id: string, feedName?: string): Undo {
		const fact = this.facts.find((entry) => entry.id === id)
		if (!fact) return () => {}
		this.#show(this.facts.filter((entry) => entry.id !== id))
		this.#queue.enqueue(() => deleteFact(id))
		const entry = feedName ? feed.record('profile', 'garden.feed.factRemoved', { name: feedName }) : undefined
		return () => {
			this.#show([...this.facts, fact])
			this.#queue.enqueue(() => restoreFact(id).then((stored) => this.#replace(stored)))
			if (entry) feed.forget(entry.id)
		}
	}

	/** What the Gardener noticed; the page shows it as a proposal card until the owner answers. */
	propose(proposal: FactProposal): void {
		if (this.proposals.some((entry) => entry.id === proposal.id)) return
		this.proposals = [...this.proposals, proposal]
	}

	/**
	 * The owner accepts: the fact is stored as the Gardener inferred it, with its confidence and the day it holds
	 * until, and the fact it takes the place of goes in the same step, so one undo brings both back as they were.
	 * The proposal is the caller's own (the card's block in the thread, or one listed here), so a card accepted after
	 * a relaunch still stores its fact. Read the facts first (`load`): a fact that is not here cannot be replaced.
	 */
	accept(proposal: FactProposal, feedName?: string): { fact: Fact; undo: Undo } {
		this.proposals = this.proposals.filter((entry) => entry.id !== proposal.id)
		const restore = proposal.replaces ? this.remove(proposal.replaces) : undefined
		const { fact, undo } = this.assert(
			{
				type: proposal.type,
				value: proposal.value,
				provenance: 'ai-inferred',
				confidence: proposal.confidence,
				source: proposal.source ?? null,
				...(proposal.until ? { validUntil: proposal.until } : {}),
			},
			feedName
		)
		return {
			fact,
			undo: () => {
				undo()
				restore?.()
			},
		}
	}

	/** The owner dismisses: nothing is stored, and the proposal is gone. */
	dismiss(id: string): void {
		this.proposals = this.proposals.filter((entry) => entry.id !== id)
	}

	/**
	 * Derives `home-area` from the home the owner chose (D-38, D-72): one `system-derived` row, renewed when the
	 * home moves. A home that was never chosen has no area, and derives nothing.
	 */
	async syncHomeArea(home: HomePlace): Promise<void> {
		const area = home.area
		if (!area) return
		await this.load()
		const value = { city: area.city, region: area.region, country: area.country }
		const current = this.facts.find((fact) => fact.type === 'home-area' && fact.provenance === 'system-derived')
		if (current && JSON.stringify(current.value) === JSON.stringify(value)) return
		this.#queue.enqueue(() =>
			assertFact({ type: 'home-area', value, provenance: 'system-derived', source: HOME_SOURCE }).then((stored) =>
				this.#replace(stored)
			)
		)
	}

	/** Fills the profile from the kit's sample dataset, the types the owner may assert; the undo takes them out. */
	seed(name: string): Undo {
		const undos = sampleFacts
			.filter((sample) => isLiveFact(sample.type) && (shapeOf(sample.type)?.multi || !this.liveOf(sample.type)))
			.map(
				(sample) =>
					this.assert({
						type: sample.type as FactInput['type'],
						value: sample.value,
						provenance: sample.provenance,
						confidence: sample.confidence ?? null,
					}).undo
			)
		const entry = feed.record('profile', 'garden.feed.sampleAdded', { domain: name })
		return () => {
			undos.forEach((undo) => undo())
			feed.forget(entry.id)
		}
	}

	#show(facts: Fact[]) {
		this.facts = facts.sort(effectiveOrder)
	}

	#put(fact: Fact) {
		this.#show(this.facts.map((entry) => (entry.id === fact.id ? fact : entry)))
	}

	/** The row as the store answered it, in place of the one the page showed; a tombstone leaves the list. */
	#replace(stored: Fact) {
		const without = this.facts.filter((entry) => entry.id !== stored.id)
		this.#show(stored.deletedAt ? without : [...without, stored])
	}
}

export const profile = new ProfileStore()
