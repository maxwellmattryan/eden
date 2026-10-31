<script lang="ts">
	// Vigor's Gyms view (product/domains/fitness.md, "Surfaces"): the gyms the owner trains at, each with how much
	// equipment it has; the open one shows its equipment as chips, its hours and notes, and the venue Place it is
	// linked to with its address. The form is a sheet: the name, the equipment added a chip at a time from a field,
	// the hours, the notes and a venue to link. Story-only.
	import {
		BackButton,
		Button,
		Chip,
		EmptyState,
		Field,
		IconButton,
		List,
		Select,
		Sheet,
		type ListRowData,
		type MenuItem,
		type PageHeaderAction,
	} from '$lib/index.js'
	import VigorPage from './VigorPage.svelte'
	import { gyms, meadowPlaces, type SampleGym } from '../../sample-data.js'

	type Props = {
		empty?: boolean
		selected?: string
		/** The phone with the open gym pushed over the list. */
		pushed?: boolean
		/** The form open on the selected gym. */
		editing?: boolean
		onadd?: () => void
		onaction?: (item: MenuItem, id: string) => void
		onsave?: () => void
		onsample?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		empty = false,
		selected = 'g-01',
		pushed = false,
		editing = false,
		onadd,
		onaction,
		onsave,
		onsample,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const list = $derived(empty ? [] : gyms)
	// svelte-ignore state_referenced_locally
	let current = $state(selected)
	const detail = $derived(list.find((gym) => gym.id === current))
	const ACTIONS: MenuItem[] = [
		{ id: 'edit', label: 'Edit', icon: 'pencil' },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
	]
	const toRow = (gym: SampleGym): ListRowData => ({
		id: gym.id,
		primary: gym.name,
		icon: 'dumbbell',
		meta: `${gym.equipment.length} pieces of equipment`,
		actions: ACTIONS,
	})
	/** The workspace's venue Places, as the form offers them: Meadow's, and the gym's own. */
	const VENUES = [
		{ value: 'castle-hill', label: 'Castle Hill Fitness' },
		...meadowPlaces.map((place) => ({ value: place.id, label: place.name })),
	]

	const formOf = (gym?: SampleGym) => ({
		name: gym?.name ?? '',
		equipment: [...(gym?.equipment ?? [])],
		adding: '',
		hours: gym?.hours ?? '',
		notes: gym?.notes ?? '',
		place: gym?.place ? 'castle-hill' : '',
	})
	// svelte-ignore state_referenced_locally
	let formOpen = $state(editing)
	let form = $state(formOf(gyms.find((gym) => gym.id === selected)))
	function open(gym?: SampleGym) {
		form = formOf(gym)
		formOpen = true
		if (!gym) onadd?.()
	}
	function addEquipment() {
		const piece = form.adding.trim()
		if (piece && !form.equipment.includes(piece)) form.equipment.push(piece)
		form.adding = ''
	}

	const actions = $derived<PageHeaderAction[]>([
		{ label: 'Add gym', icon: 'plus', variant: empty ? 'secondary' : undefined, onclick: () => open() },
	])
</script>

{#snippet pane(gym: SampleGym)}
	<h2 class="detail-title" id="{uid}-detail">{gym.name}</h2>
	<ul class="chips" aria-label="Equipment">
		{#each gym.equipment as piece (piece)}
			<li><Chip label={piece} /></li>
		{/each}
	</ul>
	<dl class="fields">
		{#if gym.hours}
			<dt>Hours</dt>
			<dd>{gym.hours}</dd>
		{/if}
		{#if gym.notes}
			<dt>Notes</dt>
			<dd>{gym.notes}</dd>
		{/if}
		{#if gym.place}
			<dt>Place</dt>
			<dd class="place">
				<span>{gym.place.name}</span>
				<span class="address">{gym.place.address}</span>
			</dd>
		{/if}
	</dl>
	<div class="detail-actions">
		<Button label="Edit" icon="pencil" onclick={() => open(gym)} />
		<Button label="Delete" variant="danger" icon="trash" onclick={() => onaction?.(ACTIONS[1]!, gym.id)} />
	</div>
{/snippet}

<VigorPage tab="Gyms" {actions} {onnavigate}>
	{#snippet children(platform)}
		{#if empty}
			<EmptyState
				title="No gyms yet"
				text="Add the places you train, with the equipment they have, so a workout can fit what is there."
				action={{ label: 'Add gym', icon: 'plus', onclick: () => open() }}
				sample={{ onclick: onsample }}
			/>
		{:else if platform === 'mobile' && pushed && detail}
			<div class="body">
				<BackButton breadcrumb="Gyms" onback={() => (pushed = false)} />
				<section class="detail" aria-labelledby="{uid}-detail">{@render pane(detail)}</section>
			</div>
		{:else}
			<div class={['body', { 'body-wide': platform === 'desktop' && detail }]}>
				<List
					header="Gyms"
					count={list.length}
					rows={list.map(toRow)}
					current={platform === 'desktop' ? current : undefined}
					onpick={(row) => {
						current = row.id
						if (platform === 'mobile') pushed = true
					}}
					onaction={(item, row) => {
						if (item.id === 'edit') open(gyms.find((gym) => gym.id === row.id))
						onaction?.(item, row.id)
					}}
				/>
				{#if platform === 'desktop' && detail}
					<aside class="detail" aria-labelledby="{uid}-detail">{@render pane(detail)}</aside>
				{/if}
			</div>
		{/if}

		<Sheet bind:open={formOpen} size="md" labelledby="{uid}-form-title">
			{#snippet header()}
				<h2 class="form-title" id="{uid}-form-title">{form.name ? 'Edit gym' : 'Add gym'}</h2>
			{/snippet}
			<form
				class="form"
				id="{uid}-form"
				onsubmit={(event) => {
					event.preventDefault()
					onsave?.()
					formOpen = false
				}}
			>
				<Field label="Name" bind:value={form.name} />
				<Field
					label="Equipment"
					helper="Type a piece and press Enter."
					bind:value={form.adding}
					onkeydown={(event) => {
						if (event.key !== 'Enter') return
						event.preventDefault()
						addEquipment()
					}}
				/>
				{#if form.equipment.length}
					<ul class="chips" aria-label="Equipment to save">
						{#each form.equipment as piece, i (piece)}
							<li class="removable">
								<Chip label={piece} />
								<IconButton
									icon="x"
									size="xs"
									label="Remove {piece}"
									tooltip
									onclick={() => form.equipment.splice(i, 1)}
								/>
							</li>
						{/each}
					</ul>
				{/if}
				<Field label="Hours" bind:value={form.hours} />
				<Field label="Notes" bind:value={form.notes} multiline rows={2} />
				<Select label="Place" placeholder="Not linked" options={VENUES} bind:value={form.place} />
			</form>
			{#snippet footer()}
				<Button label="Cancel" variant="quiet" onclick={() => (formOpen = false)} />
				<Button label="Save" variant="primary" type="submit" form="{uid}-form" disabled={!form.name.trim()} />
			{/snippet}
		</Sheet>
	{/snippet}
</VigorPage>

<style>
	.body {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.body-wide {
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		box-sizing: border-box;
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.detail-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.removable {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.fields {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-2) var(--space-4);
		margin: 0;
	}
	.fields dt {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.fields dd {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.place {
		display: flex;
		flex-direction: column;
	}
	.address {
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.detail-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.form-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
