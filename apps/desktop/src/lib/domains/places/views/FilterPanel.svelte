<script lang="ts">
	// The filter over the saved places (D-133): a line of free text, the practical filters as chips that open a menu,
	// three that are simply on or off, and the four facets of vibes, each a named group of chips. Within a facet any
	// of the vibes that are on will do; across facets a place needs one from each. Every change narrows the list and
	// the map at once: nothing here asks a network or a key.
	import { Button, Chip, Field, type MenuItem } from '@eden/ui-kit'
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
		type PriceLevel,
	} from '@eden/shared/domains/places'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import FilterChip from '$lib/shell/FilterChip.svelte'
	import { vibeNamer } from '../words'

	const uid = $props.id()
	const filter = $derived(meadow.filter)
	const set = (change: Partial<PlaceFilter>) => meadow.setFilter({ ...filter, ...change })
	const toggled = <T,>(list: readonly T[], value: T): T[] =>
		list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]

	const vibeName = $derived(vibeNamer($t, meadow.vibes))
	const facets = $derived(vibesByFacet(meadow.vibes))

	/** The distances on offer, in kilometres; shown in miles where the owner measures in them. */
	const DISTANCES = [2, 5, 10, 25]
	const imperial = $derived(settings.measurement === 'imperial')
	const far = (km: number) =>
		imperial
			? $t('domains.places.filter.withinMiles', { values: { count: Math.round(km * 0.621371) } })
			: $t('domains.places.filter.withinKm', { values: { count: km } })

	const categoryItems = $derived<MenuItem[]>(
		PLACE_CATEGORIES.map((id) => ({ id, label: $t(categoryKey(id)), checked: filter.categories.includes(id) }))
	)
	const priceItems = $derived<MenuItem[]>(
		PRICE_LEVELS.map((level) => ({
			id: String(level),
			label: priceLabel(level),
			checked: filter.prices.includes(level),
		}))
	)
	const distanceItems = $derived<MenuItem[]>([
		{ id: 'any', label: $t('domains.places.filter.anyDistance'), checked: filter.maxKm === undefined },
		...DISTANCES.map((km) => ({ id: String(km), label: far(km), checked: filter.maxKm === km })),
	])
	const collectionItems = $derived<MenuItem[]>([
		{ id: 'any', label: $t('domains.places.filter.anyCollection'), checked: filter.collection === undefined },
		...meadow.collections.map((collection) => ({
			id: collection.id,
			label: collection.name,
			checked: filter.collection === collection.id,
		})),
	])

	const categoryLabel = $derived(
		filter.categories.length === 1
			? $t(categoryKey(filter.categories[0]!))
			: filter.categories.length
				? $t('domains.places.filter.categories', { values: { count: filter.categories.length } })
				: $t('domains.places.filter.category')
	)
	const priceText = $derived(
		filter.prices.length
			? [...filter.prices]
					.sort()
					.map((level) => priceLabel(level))
					.join(' ')
			: $t('domains.places.filter.price')
	)
	const collectionLabel = $derived(
		meadow.collections.find((collection) => collection.id === filter.collection)?.name ??
			$t('domains.places.filter.collection')
	)
</script>

<section class="filters" aria-label={$t('domains.places.filter.label')}>
	<Field
		label={$t('domains.places.filter.text')}
		placeholder={$t('domains.places.filter.textPlaceholder')}
		icon="search"
		value={filter.text}
		oninput={(event) => set({ text: event.currentTarget.value })}
	/>
	<div class="chips">
		<FilterChip
			label={categoryLabel}
			menuLabel={$t('domains.places.filter.category')}
			active={filter.categories.length > 0}
			items={categoryItems}
			onpick={(id) => set({ categories: toggled(filter.categories, id) })}
		/>
		<FilterChip
			label={priceText}
			menuLabel={$t('domains.places.filter.price')}
			active={filter.prices.length > 0}
			items={priceItems}
			onpick={(id) => set({ prices: toggled(filter.prices, Number(id) as PriceLevel) })}
		/>
		<FilterChip
			label={filter.maxKm === undefined ? $t('domains.places.filter.distance') : far(filter.maxKm)}
			menuLabel={$t('domains.places.filter.distance')}
			active={filter.maxKm !== undefined}
			items={distanceItems}
			onpick={(id) => set({ maxKm: id === 'any' ? undefined : Number(id) })}
		/>
		{#if meadow.collections.length}
			<FilterChip
				label={collectionLabel}
				menuLabel={$t('domains.places.filter.collection')}
				active={filter.collection !== undefined}
				items={collectionItems}
				onpick={(id) => set({ collection: id === 'any' ? undefined : id })}
			/>
		{/if}
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
			<h2 class="label" id="{uid}-{facet}">{$t(facetKey(facet))}</h2>
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
	{#if isFiltering(filter)}
		<div class="clear">
			<Button label={$t('domains.places.filter.clear')} variant="quiet" icon="x" onclick={() => meadow.clearFilter()} />
		</div>
	{/if}
</section>

<style>
	.filters {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.facet {
		display: flex;
		flex-direction: column;
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
	.clear {
		display: flex;
	}
</style>
