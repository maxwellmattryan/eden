<script lang="ts">
	// Meadow's page (product/domains/places.md, "Surfaces"): the header with the domain's four tabs and its motif,
	// then the tab's view: Map, Listings, Collections, Visits. The tab lives in the URL so a widget can open one
	// directly. The Map tab is a map page (D-129) and takes the height the header leaves; the others read down the
	// page as any list does. The place's form and the visit's are sheets over the page (D-95), opened from any tab.
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import {
		InlineError,
		PageHeader,
		Segmented,
		Sketch,
		domainGlyph,
		meadowSeeds,
		type IconName,
		type MeadowSeedsParams,
		type PageHeaderAction,
		type SegmentedItem,
	} from '@eden/ui-kit'
	import { meadow, type SavedPlace } from '@eden/shared/domains/places'
	import { t } from '@eden/shared/i18n'
	import { undoToast } from '@eden/shared/shell'
	import { placesImport } from '../import.svelte'
	import { PLACES_TABS, type PlacesTab } from '../manifest'
	import { seedData } from '../seed'
	import Collections from './Collections.svelte'
	import Listings from './Listings.svelte'
	import MapTab from './MapTab.svelte'
	import PlaceEditSheet from './PlaceEditSheet.svelte'
	import VisitSheet from './VisitSheet.svelte'
	import Visits from './Visits.svelte'

	let editSheet = $state<PlaceEditSheet>()
	let visitSheet = $state<VisitSheet>()
	let collections = $state<Collections>()

	const tab = $derived.by<PlacesTab>(() => {
		const requested = page.params.tab ?? ''
		return (PLACES_TABS as readonly string[]).includes(requested) ? (requested as PlacesTab) : 'map'
	})
	const TAB_ICONS: Record<PlacesTab, IconName> = {
		map: 'map',
		listings: 'ticket',
		collections: 'bookmark',
		visits: 'circle-check',
	}
	const tabItems = $derived<SegmentedItem[]>(
		PLACES_TABS.map((id) => ({ label: $t(`domains.places.tabs.${id}`), icon: TAB_ICONS[id] }))
	)
	function selectTab(index: number) {
		void goto(resolve('/places/[[tab]]', { tab: PLACES_TABS[index] }), { replaceState: true, noScroll: true })
	}

	// The header's motif (D-123): how many places are saved, and how many of them are favourites.
	const seeds = $derived<MeadowSeedsParams | undefined>(
		meadow.ready ? { places: meadow.places.length, favourites: meadow.favourites.length } : undefined
	)

	/** A place picked on another tab is shown on the map. */
	function show(place: SavedPlace) {
		meadow.reveal = place.id
		if (tab !== 'map') selectTab(0)
	}

	function sample() {
		undoToast($t('common.sampleAdded'), meadow.seed(seedData(), $t('domains.places.name')))
	}

	const none = $derived(meadow.ready && !meadow.places.length)
	const actions = $derived.by<PageHeaderAction[]>(() => {
		if (tab === 'map') {
			return [
				{
					label: $t('domains.places.add.label'),
					icon: 'plus',
					variant: none ? 'secondary' : undefined,
					menu: [
						{
							id: 'place',
							label: $t('domains.places.add.place'),
							icon: 'map-pin',
							onselect: () => editSheet?.add(),
						},
						{
							id: 'import',
							label: $t('domains.places.add.import'),
							icon: 'clipboard-paste',
							onselect: () => placesImport.start(),
						},
					],
				},
			]
		}
		if (tab === 'collections') {
			return [
				{
					label: $t('domains.places.collections.new'),
					icon: 'plus',
					variant: meadow.collections.length ? undefined : 'secondary',
					onclick: () => collections?.create(),
				},
			]
		}
		return []
	})
</script>

<div class={['page', tab === 'map' && 'page-map']}>
	<PageHeader
		name={$t('domains.places.name')}
		subtitle={$t('domains.places.subtitle')}
		icon={domainGlyph('places')}
		{actions}
	>
		<!-- the page's one live thing (D-123): the saved places as seeds adrift, the same on every tab -->
		{#snippet motif()}
			{#if seeds}<Sketch sketch={meadowSeeds} params={seeds} />{/if}
		{/snippet}
		{#snippet legend()}
			{#if seeds}{$t('domains.places.motif', { values: { places: seeds.places, favourites: seeds.favourites } })}{/if}
		{/snippet}
		{#snippet filters()}
			<Segmented
				items={tabItems}
				selected={PLACES_TABS.indexOf(tab)}
				label={$t('domains.places.tabsLabel')}
				onchange={selectTab}
			/>
		{/snippet}
	</PageHeader>

	{#if meadow.saveFailed}
		<div class="notice">
			<InlineError message={$t('domains.places.saveFailed')} onretry={() => meadow.flush()} live />
		</div>
	{/if}

	{#if tab === 'map'}
		<MapTab
			onedit={(place) => editSheet?.edit(place)}
			onvisit={(place) => visitSheet?.log(place)}
			onimport={() => placesImport.start()}
			onsample={sample}
		/>
	{:else if tab === 'collections'}
		<Collections bind:this={collections} onopen={show} />
	{:else if tab === 'visits'}
		<Visits onopen={show} />
	{:else}
		<Listings />
	{/if}
</div>

<PlaceEditSheet bind:this={editSheet} onadded={show} />
<VisitSheet bind:this={visitSheet} />

<style>
	.page {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	/* A map page (D-129) is as tall as the room it has and no taller: the map holds that height and the column
	   beside it scrolls on its own. It reaches down through the region's bottom padding, as Sky's page does. */
	.page-map {
		flex: 1 1 0;
		min-height: 0;
		box-sizing: border-box;
		padding-bottom: 0;
		margin-bottom: calc(var(--space-3) - var(--ed-gutter));
	}
	.notice {
		padding: 0 var(--ed-gutter) var(--space-4);
	}
	/* narrow page: the map stands on top and the rest reads down the page, which scrolls as a whole */
	@container page (max-width: 48rem) {
		.page-map {
			flex: 1 0 auto;
			margin-bottom: 0;
			padding-bottom: var(--space-8);
		}
	}
</style>
