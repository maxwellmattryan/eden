<script lang="ts">
	// The filter on the phone, in a sheet from the foot: the three practical toggles and the four facets of vibes
	// (D-133). Every change narrows the map and the list at once; the filter is this device's, as on the desktop.
	import { Button, Chip, Sheet } from '@eden/ui-kit'
	import { FACETS, facetKey, isFiltering, meadow, vibesByFacet, type PlaceFilter } from '@eden/shared/domains/places'
	import { t } from '@eden/shared/i18n'
	import { vibeNamer } from '../words'

	let { open = $bindable(false) }: { open?: boolean } = $props()

	const uid = $props.id()
	const filter = $derived(meadow.filter)
	const set = (change: Partial<PlaceFilter>) => meadow.setFilter({ ...filter, ...change })
	const vibeName = $derived(vibeNamer($t, meadow.vibes))
	const facets = $derived(vibesByFacet(meadow.vibes))
	const toggle = (id: string) =>
		set({ vibes: filter.vibes.includes(id) ? filter.vibes.filter((vibe) => vibe !== id) : [...filter.vibes, id] })
</script>

<Sheet bind:open labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.places.filter.label')}</h2>
	{/snippet}
	<div class="body">
		<div class="chips">
			<Chip
				label={$t('domains.places.filter.openNow')}
				tone="outline"
				icon="clock"
				selectable
				selected={filter.openNow}
				onselect={(on) => set({ openNow: on })}
			/>
			<Chip
				label={$t('domains.places.filter.alcoholFree')}
				tone="outline"
				icon="wine-off"
				selectable
				selected={filter.alcoholFree}
				onselect={(on) => set({ alcoholFree: on })}
			/>
			<Chip
				label={$t('domains.places.filter.favourites')}
				tone="outline"
				icon="heart"
				selectable
				selected={filter.favourites}
				onselect={(on) => set({ favourites: on })}
			/>
		</div>
		{#each FACETS as facet (facet)}
			<div class="facet" role="group" aria-labelledby="{uid}-{facet}">
				<h3 class="label" id="{uid}-{facet}">{$t(facetKey(facet))}</h3>
				<div class="chips">
					{#each facets[facet] as vibe (vibe.id)}
						<Chip
							label={vibe.label ?? vibeName(vibe.id)}
							selectable
							selected={filter.vibes.includes(vibe.id)}
							onselect={() => toggle(vibe.id)}
						/>
					{/each}
				</div>
			</div>
		{/each}
	</div>
	{#snippet footer()}
		{#if isFiltering(filter)}
			<Button label={$t('domains.places.filter.clear')} variant="quiet" onclick={() => meadow.clearFilter()} />
		{/if}
		<Button label={$t('common.done')} variant="primary" onclick={() => (open = false)} />
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.body,
	.facet {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.facet {
		gap: var(--space-2);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.label {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		font-variation-settings: var(--ed-t-label-opsz);
	}
</style>
