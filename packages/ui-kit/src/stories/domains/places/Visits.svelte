<script lang="ts">
	// Meadow's Visits view (product/domains/places.md): where the owner has been and what they thought, newest first.
	// A visit is a day, a rating out of five and a note, logged from a place's detail in a sheet (D-95).
	import { EmptyState, Rating, Thumbnail, type PageHeaderAction } from '$lib/index.js'
	import MeadowPage, { CATEGORY_GLYPHS } from './MeadowPage.svelte'
	import { meadowPlaces, meadowVisits } from '../../sample-data.js'

	type Props = {
		empty?: boolean
		onlog?: () => void
		onopen?: (place: string) => void
		onnavigate?: (id: string) => void
	}
	let { empty = false, onlog, onopen, onnavigate }: Props = $props()

	const visits = $derived(
		empty
			? []
			: meadowVisits.map((visit) => ({ ...visit, place: meadowPlaces.find((place) => place.id === visit.placeId)! }))
	)
	const actions = $derived<PageHeaderAction[]>([
		{ label: 'Log a visit', icon: 'check', variant: empty ? 'secondary' : undefined, onclick: onlog },
	])
</script>

<MeadowPage tab="Visits" {actions} {onnavigate}>
	{#snippet children(_platform)}
		{#if empty}
			<EmptyState
				title="No visits yet"
				text="After you have been somewhere, log it with a note and a rating. It is how Meadow learns what you like."
				action={{ label: 'Log a visit', icon: 'check', onclick: onlog }}
			/>
		{:else}
			<div class="body">
				<ul class="visits" aria-label="Visits">
					{#each visits as visit (visit.id)}
						<li class="visit">
							<Thumbnail src={visit.place.picture} icon={CATEGORY_GLYPHS[visit.place.category]} size="md" />
							<div class="text">
								<button class="place" type="button" onclick={() => onopen?.(visit.place.id)}>{visit.place.name}</button>
								{#if visit.note}<p class="note">{visit.note}</p>{/if}
							</div>
							<Rating readonly value={visit.rating} label={visit.place.name} />
							<span class="day">{visit.day}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/snippet}
</MeadowPage>

<style>
	.body {
		padding: 0 var(--ed-gutter);
	}
	.visits {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		overflow: hidden;
	}
	.visit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
	}
	.visit + .visit {
		border-top: 1px solid var(--stroke-subtle);
	}
	.text {
		flex: 1;
		min-width: calc(var(--space-8) * 4);
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-1);
	}
	.place {
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--ed-radius-control);
		background: none;
		color: var(--text-primary);
		font: var(--ed-t-text);
		font-weight: 500;
		text-align: start;
		cursor: pointer;
	}
	.place:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.note {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.day {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
</style>
