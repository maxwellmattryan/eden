<script lang="ts">
	// What Eden knows about me (product/substrate/profile.md, "Surfaces"; design/screens.md, `profile`): every fact the
	// owner may assert, grouped by the owner the registry names, with its value, who wrote it, the lock on T2, the
	// Gardener's confidence, and how many Gardener requests read it. A proposal from the Gardener sits above the groups
	// until it is accepted or dismissed; a fact past its window is greyed and offers Renew; add and edit open a small
	// sheet with the fields the type's value asks for. Desktop only in Phase 1. The page is built in apps/desktop
	// (`shell/profile/`); this is its reference.
	import {
		Button,
		EmptyState,
		Field,
		List,
		PageHeader,
		ProposalCard,
		Segmented,
		Sheet,
		type ListRowData,
		type MenuItem,
	} from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import { canSee, facts, type SampleFact } from '../../sample-data.js'

	type Props = {
		/** Nothing known yet: the EmptyState in place of the groups. */
		empty?: boolean
		/** The Gardener noticed the cilantro and has not been answered: its proposal card, and no cilantro row yet. */
		proposal?: boolean
		/** The low-sodium preference is past its window: greyed, with Renew in its menu. */
		expired?: boolean
		/** The editor open on the tree-nut allergy. */
		editing?: boolean
		onadd?: () => void
		onopen?: (row: ListRowData) => void
		onaction?: (item: MenuItem, row: ListRowData) => void
		onaccept?: () => void
		ondismiss?: () => void
		onsave?: () => void
		onsample?: () => void
		onnavigate?: (id: string) => void
		onback?: () => void
	}
	let {
		empty = false,
		proposal = false,
		expired = false,
		editing = false,
		onadd,
		onopen,
		onaction,
		onaccept,
		ondismiss,
		onsave,
		onsample,
		onnavigate,
		onback,
	}: Props = $props()

	/** The owners in the page's order, each with the Phase 1 fact types the registry gives it. */
	const OWNERS = [
		{ id: 'substrate', label: 'Eden', types: ['home-area', 'preferred-name'] },
		{
			id: 'kitchen',
			label: 'Hearth',
			types: ['allergy', 'cuisine-preference', 'dietary-preference', 'disliked-ingredient', 'household-size'],
		},
		{ id: 'toolbench', label: 'Toolbench', types: ['owned-hardware', 'preferred-tool', 'skill'] },
		{ id: 'health', label: 'Wellspring', types: ['medical-dietary-restriction'] },
	]
	const NAMES: Record<string, string> = {
		'preferred-name': 'Preferred name',
		'home-area': 'Home area',
		allergy: 'Allergy',
		'dietary-preference': 'Dietary preference',
		'disliked-ingredient': 'Disliked ingredient',
		'cuisine-preference': 'Cuisine preference',
		'household-size': 'Household size',
		skill: 'Skill',
		'owned-hardware': 'Owned hardware',
		'preferred-tool': 'Preferred tool',
		'medical-dietary-restriction': 'Medical dietary restriction',
	}
	/** The sensitive types: the Gardener reads one only under a grant, and the row says so with the lock. */
	const T2 = new Set(['allergy', 'medical-dietary-restriction'])
	const PROVENANCE: Record<string, string> = {
		'user-asserted': 'You said so',
		'ai-inferred': 'The Gardener noticed',
		'system-derived': 'Derived from your home place',
	}
	const KINDS = ['food', 'drug', 'environmental']
	const SEVERITIES = ['mild', 'moderate', 'severe']
	/** The sample day, as every row's date. */
	const DAY = '30 Sept'
	/** The types the morning's Hearth request read (design/sample-data.md, "Audit and grants"). */
	const READ = new Set<string>(canSee.map((entry) => entry.id))

	/** Home is a Place; its area is derived, never typed (D-38). */
	const home = {
		type: 'home-area',
		value: { city: 'Austin', region: 'Texas', country: 'United States' },
		provenance: 'system-derived',
	}
	type Row = Omit<SampleFact, 'provenance'> & { provenance: string }
	const known = $derived<Row[]>(
		empty
			? []
			: [home, ...facts].filter(
					(fact) => NAMES[fact.type] && !(proposal && fact.type === 'disliked-ingredient' && fact.value === 'cilantro')
				)
	)

	const record = (value: unknown) =>
		typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
	/** The value as one line: a word as itself, an allergy as its substance, kind and severity, a place as its parts. */
	function format(fact: Row): string {
		const value = record(fact.value)
		if (fact.type === 'allergy') return [value.substance, value.kind, value.severity].join(' · ')
		if (fact.type === 'skill') return [value.name, value.level].join(' · ')
		if (fact.type === 'home-area') return [value.city, value.region, value.country].join(', ')
		if (fact.type === 'cuisine-preference') return String(value.name)
		if (fact.type === 'dietary-preference') return String(fact.value).replace('-', ' ')
		return String(fact.value)
	}

	const isExpired = (fact: Row) => expired && fact.type === 'dietary-preference'

	function toRow(fact: Row, index: number): ListRowData {
		const gone = isExpired(fact)
		const weight = record(fact.value).weight
		return {
			id: `${fact.type}-${index}`,
			primary: format(fact),
			secondary: [NAMES[fact.type], PROVENANCE[fact.provenance], DAY, ...(gone ? ['expired 31 Aug'] : [])].join(' · '),
			chips:
				typeof weight === 'number' ? [{ id: 'weight', label: `${Math.round(weight * 100)}%`, mono: true }] : undefined,
			badges: [
				...(T2.has(fact.type) ? [{ id: 'tier', kind: 'tier' as const, label: 'T2' }] : []),
				...(fact.confidence === undefined
					? []
					: [{ id: 'ai', kind: 'ai' as const, label: `${Math.round(fact.confidence * 100)}% sure` }]),
			],
			meta: READ.has(fact.type) ? 'used by 1 request' : 'not used by the Gardener yet',
			done: gone,
			actions:
				fact.provenance === 'system-derived'
					? undefined
					: [
							{ id: 'edit', label: 'Edit', icon: 'pencil' },
							{ id: 'window', label: 'Set a window', icon: 'calendar' },
							...(gone ? [{ id: 'renew', label: 'Renew', icon: 'refresh-cw' } as MenuItem] : []),
							{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
						],
		}
	}

	const groups = $derived(
		OWNERS.map((owner) => ({
			...owner,
			rows: owner.types.flatMap((type) => known.filter((fact) => fact.type === type)).map(toRow),
		})).filter((group) => group.rows.length > 0)
	)

	// The editor's draft, on the first allergy of the dataset.
	const nuts = record(facts.find((fact) => fact.type === 'allergy')?.value)
	let substance = $state(String(nuts.substance ?? ''))
	let kind = $state(Math.max(0, KINDS.indexOf(String(nuts.kind))))
	let severity = $state(Math.max(0, SEVERITIES.indexOf(String(nuts.severity))))
	let note = $state('')
	let from = $state('')
	let until = $state('')
</script>

<AppFrame current="garden" back="Garden" {onback} {onnavigate}>
	<div class="page">
		<PageHeader
			name="What Eden knows about me"
			subtitle="Facts, where they came from, and who uses them"
			icon="id-card"
			actions={[{ label: 'Add a fact', icon: 'plus', onclick: onadd }]}
		/>

		{#if proposal}
			<section class="proposals" aria-label="The Gardener noticed">
				<ProposalCard
					fact="disliked-ingredient"
					value="cilantro"
					text="I noticed you avoid cilantro. Save as a dislike?"
					{onaccept}
					{ondismiss}
				/>
			</section>
		{/if}

		{#if empty}
			<EmptyState
				title="Eden knows nothing about you yet"
				text="What you tell it, and what its domains learn, gathers here with where each fact came from."
				action={{ label: 'Add a fact', icon: 'plus', onclick: onadd }}
				sample={{ onclick: onsample }}
			/>
		{:else}
			<div class="groups">
				{#each groups as group (group.id)}
					<List header={group.label} count={group.rows.length} rows={group.rows} {onopen} {onaction} />
				{/each}
			</div>
		{/if}

		<footer class="foot">
			Every edit keeps the old value for thirty days, on this device. What you delete leaves the Gardener at once.
		</footer>
	</div>
</AppFrame>

<Sheet open={editing} placement="center" size="sm" label="Edit Allergy">
	{#snippet header()}
		<h2 class="sheet-title">Edit Allergy</h2>
	{/snippet}
	<div class="form">
		<Field label="Substance" bind:value={substance} />
		<div class="labelled">
			<span class="label">Kind</span>
			<Segmented items={KINDS} bind:selected={kind} label="Kind" />
		</div>
		<div class="labelled">
			<span class="label">Severity</span>
			<Segmented items={SEVERITIES} bind:selected={severity} label="Severity" />
		</div>
		<Field label="Note" bind:value={note} helper="For you; the Gardener never reads it." />
		<div class="window">
			<Field type="date" label="From" bind:value={from} />
			<Field type="date" label="Until" bind:value={until} />
		</div>
		<p class="quiet">Leave both empty for a fact that always holds.</p>
	</div>
	{#snippet footer()}
		<div class="actions">
			<Button variant="quiet" label="Cancel" />
			<Button variant="primary" label="Save" disabled={!substance.trim()} onclick={onsave} />
		</div>
	{/snippet}
</Sheet>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100%;
		padding-bottom: var(--space-8);
	}
	.proposals {
		display: grid;
		gap: var(--space-3);
		max-width: 640px;
		padding: 0 var(--ed-gutter) var(--space-4);
	}
	.groups {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.foot {
		margin-top: auto;
		max-width: 640px;
		padding: var(--space-8) var(--ed-gutter) 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.sheet-title {
		margin: 0;
		font: var(--ed-t-title);
		color: var(--text-primary);
	}
	.form {
		display: grid;
		gap: var(--space-4);
	}
	.labelled {
		display: grid;
		gap: var(--space-2);
	}
	.label {
		font: var(--ed-t-label);
		color: var(--text-primary);
	}
	.window {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}
	.quiet {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
