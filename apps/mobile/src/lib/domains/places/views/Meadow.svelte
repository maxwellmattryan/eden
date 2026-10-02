<script lang="ts">
	// Meadow on the phone (product/domains/places.md, "Mobile"): the map, what is nearby and the listings, as read
	// surfaces over the store the desktop shares, with a filter sheet and a place's sheet from the foot. The map is
	// the same seam as the desktop's (D-129): ground from the map source, pins from the kit; where the library cannot
	// start, the pins stand on plain ground and the Nearby list still says how far each place is. Finding new places,
	// importing a list and searching for listings wait for the Gardener on the phone (#19).
	import { onMount } from 'svelte'
	import { Chip, EmptyState, List, PageHeader, PinLayer, Segmented, domainGlyph, type ListRowData } from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import { formatDateOf, formatEventTime } from '@eden/shared/dates'
	import {
		categoryGlyph,
		distanceLabel,
		drawnPins,
		filterCount,
		flatFit,
		flatProjection,
		markOf,
		meadow,
		priceLabel,
		readHome,
		readMapPalette,
		type MapSurface,
		type Pin,
	} from '@eden/shared/domains/places'
	import type { LngLat } from '@eden/shared/geo'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { createSurface, source } from '../map'
	import { categoryNamer, vibeNamer } from '../words'
	import FilterSheet from './FilterSheet.svelte'
	import PlaceSheet from './PlaceSheet.svelte'

	const TABS = ['map', 'nearby', 'listings'] as const
	let tab = $state(0)
	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })
	const vibeName = $derived(vibeNamer($t, meadow.vibes))
	const categoryName = $derived(categoryNamer($t))
	const unit = $derived(settings.measurement === 'imperial' ? ('mi' as const) : ('km' as const))

	const shown = $derived(meadow.filtered(vibeName))
	let picked = $state<string>()
	let filtering = $state(false)

	// ---- The map ------------------------------------------------------------------------------------------------
	let container = $state<HTMLElement>()
	let surface = $state.raw<MapSurface>()
	let failed = $state(false)
	let revision = $state(0)
	let moves = 0
	const moved = () => (revision = ++moves)
	let size = $state({ width: 0, height: 0 })

	const home = $derived(readHome())
	const allPins = $derived<Pin[]>([
		{ id: 'home', point: meadow.origin, kind: 'home', label: home.label },
		...shown.flatMap((place): Pin[] =>
			place.point ? [{ id: place.id, point: place.point, kind: 'saved', label: place.name }] : []
		),
	])
	const flat = $derived(
		flatFit(
			allPins.map((pin) => pin.point),
			size
		) ?? { center: meadow.origin, zoom: 12 }
	)
	const project = $derived.by(() => {
		const live = surface
		if (live) return (point: LngLat) => live.project(point)
		return flatProjection(flat, size)
	})
	const pins = $derived.by(() => {
		void revision
		return drawnPins(allPins, project, {
			selected: picked,
			size,
			groupLabel: (count) => $t('domains.places.map.group', { values: { count } }),
		})
	})

	onMount(() => {
		const loaded = meadow.load()
		let gone = false
		let off: (() => void) | undefined
		let made: MapSurface | undefined
		void (async () => {
			if (!container) return
			try {
				made = await createSurface({
					container,
					view: { center: meadow.origin, zoom: 11 },
					palette: readMapPalette(container),
					lang,
					still: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
				})
				if (gone) return made.destroy()
				await made.ready
				if (gone) return
				off = made.on('move', moved)
				surface = made
				moved()
				// the saved places are fitted once they are read, not only the home the map opened on
				await loaded.catch(() => undefined)
				if (gone) return
				made.fit(
					allPins.map((pin) => pin.point),
					{ animate: false }
				)
			} catch {
				// the library could not start in this webview (S12): plain ground, and the list by distance
				failed = true
			}
		})()
		return () => {
			gone = true
			off?.()
			surface = undefined
			made?.destroy()
		}
	})

	function pick(id: string) {
		if (id === 'home') return
		const group = pins.find((pin) => pin.id === id && pin.kind === 'group')
		if (group?.members) {
			surface?.fit(allPins.filter((pin) => group.members!.includes(pin.id)).map((pin) => pin.point))
			return
		}
		picked = id
	}

	// ---- Nearby and listings ---------------------------------------------------------------------------------------
	const rows = $derived(
		shown.map((place): ListRowData => ({
			id: place.id,
			primary: place.name,
			secondary: [categoryName(place.category), place.locality, priceLabel(place.price)].filter(Boolean).join(' · '),
			thumbnail: place.thumb,
			icon: categoryGlyph(place.category),
			tile: true,
			chips: place.favourite ? [{ label: $t('domains.places.list.favourite'), icon: 'heart', tone: 'accent' }] : [],
			meta: place.point ? distanceLabel(meadow.distanceTo(place), unit) : '',
		}))
	)
	const listings = $derived(meadow.upcoming)
	const count = $derived(filterCount(meadow.filter))
</script>

<PageHeader name={$t('domains.places.name')} subtitle={$t('domains.places.subtitle')} icon={domainGlyph('places')}>
	{#snippet filters()}
		<Segmented
			items={TABS.map((id) => $t(`domains.places.mobile.${id}`))}
			bind:selected={tab}
			label={$t('domains.places.tabsLabel')}
		/>
		{#if TABS[tab] !== 'listings'}
			<Chip
				label={$t('domains.places.filter.label')}
				icon="sliders-horizontal"
				tone={count ? 'accent' : 'outline'}
				count={count || undefined}
				onclick={() => (filtering = true)}
			/>
		{/if}
	{/snippet}
</PageHeader>

<!-- the map stays mounted while another tab shows, so it is drawn once -->
<section
	class={['map', TABS[tab] !== 'map' && 'map-away']}
	aria-label={$t('domains.places.map.label')}
	bind:clientWidth={size.width}
	bind:clientHeight={size.height}
>
	<div class="ground" bind:this={container}></div>
	<PinLayer {pins} {project} {revision} selected={picked} label={$t('domains.places.map.pins')} onselect={pick} />
	<p class="credit">{failed ? $t('domains.places.map.failed') : source.attribution}</p>
</section>

{#if TABS[tab] === 'nearby'}
	{#if rows.length}
		<List header={$t('domains.places.mobile.nearby')} count={rows.length} {rows} onpick={(row) => (picked = row.id)} />
	{:else if meadow.ready}
		<EmptyState
			title={$t(meadow.places.length ? 'domains.places.list.noneFit.title' : 'empty.places.title')}
			text={$t(meadow.places.length ? 'domains.places.list.noneFit.text' : 'domains.places.mobile.emptyText')}
		/>
	{/if}
{:else if TABS[tab] === 'listings'}
	{#if listings.length}
		<ul class="listings" aria-label={$t('domains.places.tabs.listings')}>
			{#each listings as listing (listing.id)}
				{@const marked = markOf(listing, meadow.outings)}
				<li class="listing">
					<h2 class="title">{listing.title}</h2>
					<p class="meta">
						{listing.allDay
							? formatDateOf(listing.startAt.slice(0, 10), lang)
							: formatEventTime(listing.startAt, format)}
						{#if listing.venueName}· {listing.venueName}{/if}
					</p>
					{#if listing.why}<p class="why">{listing.why}</p>{/if}
					<div class="row">
						{#if marked}
							<Chip
								label={$t(`domains.places.listings.${marked}`)}
								tone="accent"
								icon={marked === 'going' ? 'calendar-plus' : 'bookmark'}
							/>
						{/if}
						<Chip
							label={$t('domains.places.listings.open')}
							tone="outline"
							icon="external-link"
							onclick={() => void openExternal(listing.url)}
						/>
					</div>
				</li>
			{/each}
		</ul>
	{:else if meadow.ready}
		<EmptyState title={$t('domains.places.listings.empty.title')} text={$t('domains.places.mobile.listingsText')} />
	{/if}
{/if}

<FilterSheet bind:open={filtering} />
<PlaceSheet bind:placeId={picked} />

<style>
	.map {
		position: relative;
		flex: 1 1 auto;
		min-height: 52dvh;
		margin-top: var(--space-3);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		overflow: hidden;
		isolation: isolate;
	}
	/* kept in the layout at no size, so the library keeps its canvas and its place */
	.map-away {
		position: absolute;
		width: 1px;
		height: 1px;
		min-height: 0;
		margin: 0;
		border: 0;
		opacity: 0;
		pointer-events: none;
	}
	.ground {
		position: absolute;
		inset: 0;
	}
	.credit {
		position: absolute;
		left: var(--space-2);
		bottom: var(--space-2);
		max-width: calc(100% - 2 * var(--space-2));
		margin: 0;
		padding: 0 var(--space-2);
		border-radius: var(--radius-full);
		background: var(--surface-0);
		color: var(--text-secondary);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
	}
	.listings {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: var(--space-3) 0 0;
		padding: 0;
		list-style: none;
	}
	.listing {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
	}
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.meta,
	.why {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.why {
		color: var(--text-primary);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
