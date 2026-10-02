<script lang="ts">
	// The filter on the phone, in a sheet from the foot: the same filter as the desktop's panel (D-133), a line of
	// free text, the three practical toggles, then category, price, distance and collection as groups of chips under
	// a label each (category and price any of, distance and collection one of), and the four facets of vibes. The
	// desktop's chips open menus; here every choice is on the sheet, so nothing opens over it. Every change narrows
	// the map and the list at once; the filter is this device's, as on the desktop.
	import { Button, Chip, Field, Sheet } from '@eden/ui-kit'
	import {
		FACETS,
		PLACE_CATEGORIES,
		PRICE_LEVELS,
		categoryKey,
		facetKey,
		isFiltering,
		meadow,
		priceLabel,
		vibesByFacet,
		type PlaceFilter,
	} from '@eden/shared/domains/places'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { vibeNamer } from '@eden/shared/domains/places'

	let { open = $bindable(false) }: { open?: boolean } = $props()

	const uid = $props.id()
	const filter = $derived(meadow.filter)
	const set = (change: Partial<PlaceFilter>) => meadow.setFilter({ ...filter, ...change })
	const toggled = <T,>(list: readonly T[], value: T): T[] =>
		list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
	const vibeName = $derived(vibeNamer($t, meadow.vibes))
	const facets = $derived(vibesByFacet(meadow.vibes))

	/** The distances on offer, in kilometres, as the desktop's panel offers them; in miles where the owner uses them. */
	const DISTANCES = [2, 5, 10, 25]
	const imperial = $derived(settings.measurement === 'imperial')
	const far = (km: number) =>
		imperial
			? $t('domains.places.filter.withinMiles', { values: { count: Math.round(km * 0.621371) } })
			: $t('domains.places.filter.withinKm', { values: { count: km } })
</script>

<!-- the sheet takes focus itself, so the keyboard does not rise over the chips until the text field is touched -->
<Sheet bind:open labelledby="{uid}-title" initialFocus="container">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.places.filter.label')}</h2>
	{/snippet}
	<div class="body">
		<Field
			label={$t('domains.places.filter.text')}
			placeholder={$t('domains.places.filter.textPlaceholder')}
			icon="search"
			value={filter.text}
			oninput={(event) => set({ text: event.currentTarget.value })}
		/>
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
		<div class="facet" role="group" aria-labelledby="{uid}-category">
			<h3 class="label" id="{uid}-category">{$t('domains.places.filter.category')}</h3>
			<div class="chips">
				{#each PLACE_CATEGORIES as id (id)}
					<Chip
						label={$t(categoryKey(id))}
						selectable
						selected={filter.categories.includes(id)}
						onselect={() => set({ categories: toggled(filter.categories, id) })}
					/>
				{/each}
			</div>
		</div>
		<div class="facet" role="group" aria-labelledby="{uid}-price">
			<h3 class="label" id="{uid}-price">{$t('domains.places.filter.price')}</h3>
			<div class="chips">
				{#each PRICE_LEVELS as level (level)}
					<Chip
						label={priceLabel(level)}
						selectable
						selected={filter.prices.includes(level)}
						onselect={() => set({ prices: toggled(filter.prices, level) })}
					/>
				{/each}
			</div>
		</div>
		<div class="facet" role="group" aria-labelledby="{uid}-distance">
			<h3 class="label" id="{uid}-distance">{$t('domains.places.filter.distance')}</h3>
			<div class="chips">
				<Chip
					label={$t('domains.places.filter.anyDistance')}
					selectable
					selected={filter.maxKm === undefined}
					onselect={() => set({ maxKm: undefined })}
				/>
				{#each DISTANCES as km (km)}
					<Chip
						label={far(km)}
						selectable
						selected={filter.maxKm === km}
						onselect={(on) => set({ maxKm: on ? km : undefined })}
					/>
				{/each}
			</div>
		</div>
		{#if meadow.collections.length}
			<div class="facet" role="group" aria-labelledby="{uid}-collection">
				<h3 class="label" id="{uid}-collection">{$t('domains.places.filter.collection')}</h3>
				<div class="chips">
					<Chip
						label={$t('domains.places.filter.anyCollection')}
						selectable
						selected={filter.collection === undefined}
						onselect={() => set({ collection: undefined })}
					/>
					{#each meadow.collections as collection (collection.id)}
						<Chip
							label={collection.name}
							selectable
							selected={filter.collection === collection.id}
							onselect={(on) => set({ collection: on ? collection.id : undefined })}
						/>
					{/each}
				</div>
			</div>
		{/if}
		{#each FACETS as facet (facet)}
			<div class="facet" role="group" aria-labelledby="{uid}-{facet}">
				<h3 class="label" id="{uid}-{facet}">{$t(facetKey(facet))}</h3>
				<div class="chips">
					{#each facets[facet] as vibe (vibe.id)}
						<Chip
							label={vibe.label ?? vibeName(vibe.id)}
							selectable
							selected={filter.vibes.includes(vibe.id)}
							onselect={() => set({ vibes: toggled(filter.vibes, vibe.id) })}
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
