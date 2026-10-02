<script lang="ts">
	// Meadow's two Garden tiles (product/domains/places.md, "Garden widgets"), both in the default Garden: the
	// favourites nearest home, and what is on this weekend. Each is rows, a name and a quiet reading.
	import { Widget, WidgetGrid, domainGlyph } from '$lib/index.js'
	import { meadowListings, meadowPlaces } from '../../sample-data.js'

	type Props = {
		/** Nothing saved and nothing found: each tile says its one line. */
		empty?: boolean
		onopen?: (widget: string) => void
	}
	let { empty = false, onopen }: Props = $props()

	const favourites = meadowPlaces.filter((place) => place.favourite).sort((a, b) => a.distanceKm - b.distanceKm)
</script>

{#snippet favouriteRows()}
	<ul class="rows">
		{#each favourites as place (place.id)}
			<li>
				<span class="text">{place.name}<span class="note">{place.locality}</span></span>
				<span class="meta">{place.distanceKm} km</span>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet listingRows()}
	<ul class="rows">
		{#each meadowListings as listing (listing.id)}
			<li>
				<span class="text">{listing.title}<span class="note">{listing.venue}</span></span>
				<span class="meta">{listing.when}</span>
			</li>
		{/each}
	</ul>
{/snippet}

<WidgetGrid>
	<Widget
		title="Favourites nearby"
		icon={domainGlyph('places')}
		domain="Meadow"
		size="m"
		empty="Save a place and mark it a favourite."
		action={empty ? undefined : { label: 'Open the map', onclick: () => onopen?.('nearby-favorites') }}
		children={empty ? undefined : favouriteRows}
	/>
	<Widget
		title="This weekend"
		icon={domainGlyph('places')}
		domain="Meadow"
		size="m"
		empty="Nothing found for the weekend yet."
		action={empty ? undefined : { label: 'Open listings', onclick: () => onopen?.('upcoming-listings') }}
		children={empty ? undefined : listingRows}
	/>
</WidgetGrid>

<style>
	.rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rows li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font: var(--ed-t-text);
	}
	.note {
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.meta {
		flex: none;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
</style>
