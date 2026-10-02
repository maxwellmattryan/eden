<script module lang="ts">
	import type { IconName } from '$lib/index.js'
	import type { PlaceCategory } from '../../sample-data.js'

	export const MEADOW_TABS = ['Map', 'Listings', 'Collections', 'Visits'] as const
	export type MeadowTab = (typeof MEADOW_TABS)[number]

	/** A category's glyph, drawn on a tile where a place has no picture. */
	export const CATEGORY_GLYPHS: Record<PlaceCategory, IconName> = {
		cafe: 'coffee',
		bar: 'martini',
		restaurant: 'utensils',
		park: 'tree-deciduous',
		museum: 'palette',
		venue: 'map-pin',
	}
	export const CATEGORY_NAMES: Record<PlaceCategory, string> = {
		cafe: 'Cafe',
		bar: 'Bar',
		restaurant: 'Restaurant',
		park: 'Park',
		museum: 'Museum',
		venue: 'Venue',
	}
	export const price = (level?: number) => (level ? '$'.repeat(level) : undefined)
</script>

<script lang="ts">
	// What every Meadow page shares (product/domains/places.md): the shell, the page header with the domain's four
	// tabs, and the header's motif (D-123), seeds adrift whose number follows the places saved and whose share in the
	// accent is the share that are favourites. Story-only.
	import type { Snippet } from 'svelte'
	import {
		PageHeader,
		Segmented,
		Sketch,
		domainGlyph,
		meadowSeeds,
		type PageHeaderAction,
		type Platform,
	} from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import { meadowMotif, sidebar } from '../../sample-data.js'

	type Props = {
		tab: MeadowTab
		actions?: PageHeaderAction[]
		/** Nothing saved yet: the motif draws a bare meadow. */
		bare?: boolean
		/** The status bar's banner: offline. */
		banner?: string
		/** Chips beside the tabs. */
		filters?: Snippet
		onnavigate?: (id: string) => void
		children: Snippet<[Platform]>
	}
	let { tab, actions = [], bare = false, banner, filters: extra, onnavigate, children: body }: Props = $props()

	const meadow = sidebar.items.find((entry) => entry.id === 'places')!
	const motifParams = $derived(bare ? { places: 0, favourites: 0 } : meadowMotif)
</script>

<AppFrame current="places" banner={banner ? { message: banner } : undefined} {onnavigate}>
	{#snippet children(platform)}
		<div class="page">
			<PageHeader name={meadow.name} subtitle={meadow.subtitle} icon={domainGlyph('places')} {actions}>
				{#snippet motif()}
					<Sketch sketch={meadowSeeds} params={motifParams} />
				{/snippet}
				{#snippet legend()}
					{motifParams.places} places saved, {motifParams.favourites} favourites
				{/snippet}
				{#snippet filters()}
					<Segmented items={[...MEADOW_TABS]} selected={MEADOW_TABS.indexOf(tab)} label="Meadow sections" />
					{@render extra?.()}
				{/snippet}
			</PageHeader>
			{@render body(platform)}
		</div>
	{/snippet}
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
</style>
