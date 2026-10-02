<script lang="ts">
	// Meadow on the phone (product/domains/places.md, "Mobile"; D-TBD(meadow-phone)): the desktop's four tabs in a
	// text Segmented, Map, Listings, Collections and Visits, with the tab in the URL as on the desktop. The Map tab is
	// the map at the top and the saved places under it by distance (what was the Nearby tab), then what the Gardener
	// found and the way to find more. What is picked opens in a sheet from the foot (`PlaceSheet`) holding the
	// desktop's own detail, and the forms are the desktop's sheets, so every write the desktop has is here. The map is
	// the same seam as the desktop's (D-129): ground from the map source, pins from the kit; where the library cannot
	// start, the pins stand on plain ground and the list still says how far each place is. Placing a place by hand is
	// a tap on the ground while the pill at the map's top waits. No header motif (D-123): the phone's header has no
	// room for one. Device location stays out (engineering/meadow.md, Handoffs).
	import { onMount, tick, untrack } from 'svelte'
	import {
		Button,
		Chip,
		EmptyState,
		IconButton,
		InlineError,
		List,
		PageHeader,
		PinLayer,
		Segmented,
		Skeleton,
		domainGlyph,
		type ListRowData,
		type MenuItem,
		type PageHeaderAction,
	} from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import {
		categoryGlyph,
		distanceLabel,
		drawnPins,
		filterCount,
		flatFit,
		flatInverse,
		flatProjection,
		isFiltering,
		mapsLink,
		meadow,
		placesImport,
		priceLabel,
		readHome,
		readMapPalette,
		seedData,
		type MapSurface,
		type Pin,
		type SavedPlace,
	} from '@eden/shared/domains/places'
	import type { LngLat } from '@eden/shared/geo'
	import { locale, t } from '@eden/shared/i18n'
	import { holdBack, navigation } from '@eden/shared/navigation'
	import { settings } from '@eden/shared/settings'
	import { undoToast } from '@eden/shared/shell'
	import { categoryNamer, vibeNamer } from '@eden/shared/domains/places'
	import Collections from '@eden/shared/domains/places/views/Collections.svelte'
	import FindMore from '@eden/shared/domains/places/views/FindMore.svelte'
	import Fold from '@eden/shared/domains/places/views/Fold.svelte'
	import Listings from '@eden/shared/domains/places/views/Listings.svelte'
	import PlaceEditSheet from '@eden/shared/domains/places/views/PlaceEditSheet.svelte'
	import VisitSheet from '@eden/shared/domains/places/views/VisitSheet.svelte'
	import Visits from '@eden/shared/domains/places/views/Visits.svelte'
	import { chrome } from '$lib/shell/chrome.svelte'
	import { PLACES_TABS, type PlacesTab } from '../manifest'
	import { createSurface, source } from '../map'
	import FilterSheet from './FilterSheet.svelte'
	import PlaceSheet from './PlaceSheet.svelte'

	let editSheet = $state<PlaceEditSheet>()
	let visitSheet = $state<VisitSheet>()
	let collections = $state<Collections>()

	// The tab lives in the URL, as the desktop's does, so a tile or the Gardener can open one directly; an address
	// that names none of the four shows the map.
	const tab = $derived.by<PlacesTab>(() => {
		const requested = navigation.tab ?? ''
		return (PLACES_TABS as readonly string[]).includes(requested) ? (requested as PlacesTab) : 'map'
	})
	function selectTab(index: number) {
		void navigation.open({ place: 'places', tab: PLACES_TABS[index] }, { replace: true, noScroll: true })
	}

	const lang = $derived($locale ?? 'en')
	const vibeName = $derived(vibeNamer($t, meadow.vibes))
	const categoryName = $derived(categoryNamer($t))
	const unit = $derived(settings.measurement === 'imperial' ? ('mi' as const) : ('km' as const))

	const shown = $derived(meadow.filtered(vibeName))
	const filtering = $derived(isFiltering(meadow.filter))
	const count = $derived(filterCount(meadow.filter))
	/** What the Gardener found and the owner has not saved: green pins, and a list of their own. */
	const found = $derived(meadow.suggestions)
	let picked = $state<string>()
	let filterOpen = $state(false)

	/** A saved place the owner is moving by a tap on the map. */
	let moving = $state<SavedPlace>()
	/** What the next tap on the map places: a saved place being moved, or a row of an import with no match. */
	const placing = $derived(moving ?? placesImport.placing)
	function cancelPlacing() {
		if (moving) moving = undefined
		else placesImport.placed(undefined)
	}
	// placing is a mode of the page's own: back cancels it, and the floating + stands down while it waits
	$effect(() => (placing ? holdBack(() => (cancelPlacing(), true)) : undefined))
	$effect(() => (placing ? chrome.suppressFab() : undefined))

	// ---- The header ---------------------------------------------------------------------------------------------

	function sample() {
		undoToast($t('common.sampleAdded'), meadow.seed(seedData(), $t('domains.places.name')))
	}
	/** A place picked on another tab, or just added, is shown on the map. */
	function show(place: SavedPlace) {
		meadow.reveal = place.id
		if (tab !== 'map') selectTab(0)
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

	// ---- The map ------------------------------------------------------------------------------------------------

	let container = $state<HTMLElement>()
	let surface = $state.raw<MapSurface>()
	/** The map could not start: the pins stand on plain ground. */
	let failed = $state(false)
	let online = $state(typeof navigator === 'undefined' ? true : navigator.onLine)
	/** Moves on whenever the ground does, so the pins are placed again. Counted apart, so that a move heard inside
	 * an effect writes the state without reading it. */
	let revision = $state(0)
	let moves = 0
	const moved = () => (revision = ++moves)
	let size = $state({ width: 0, height: 0 })

	const home = $derived(readHome())
	const allPins = $derived<Pin[]>([
		{
			id: 'home',
			point: meadow.originPin,
			kind: 'home',
			label: meadow.area.kind === 'home' ? home.label : meadow.area.label,
		},
		...shown.flatMap((place): Pin[] =>
			place.point
				? [{ id: place.id, point: place.point, kind: 'saved', label: place.name, icon: categoryGlyph(place.category) }]
				: []
		),
		...found.flatMap((entry): Pin[] =>
			entry.candidate.point
				? [{ id: entry.id, point: entry.candidate.point, kind: 'suggested', label: entry.candidate.name }]
				: []
		),
	])
	/** With no map, the ground is the box that holds every pin. */
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

	function fitAll(animate = true) {
		surface?.fit(
			allPins.map((pin) => pin.point),
			{ animate }
		)
	}

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
				fitAll(false)
			} catch {
				// the library could not start in this webview (S12): plain ground, and the list by distance
				failed = true
			}
		})()
		// "open now" is read against the minute, as on the desktop
		const tock = setInterval(() => (meadow.now = Date.now()), 60_000)
		return () => {
			gone = true
			clearInterval(tock)
			off?.()
			surface = undefined
			made?.destroy()
		}
	})

	// effect: imperative DOM (the map's colours are read from the tokens where it stands, after a theme or accent change)
	$effect(() => {
		void settings.resolvedTheme
		void settings.accent
		const live = surface
		const el = container
		if (!live || !el) return
		void tick().then(() => live.setPalette(readMapPalette(el)))
	})

	// effect: imperative DOM (the map goes to the home when the home moves, so its pin is not left out of sight)
	let stood = meadow.originPin
	$effect(() => {
		const at = meadow.originPin
		const live = surface
		if (!live || (at.lng === stood.lng && at.lat === stood.lat)) return
		stood = at
		untrack(() => live.setView({ center: at }))
	})

	/** A place a tile, a tool, another tab or the place's form asked for is picked on the map once the store holds it. */
	$effect(() => {
		const id = meadow.reveal
		if (!id || !meadow.ready) return
		meadow.reveal = undefined
		untrack(() => {
			if (tab !== 'map') selectTab(0)
			if (meadow.placeById(id)) pick(id)
		})
	})

	// ---- Picking ------------------------------------------------------------------------------------------------

	function pick(id: string | undefined) {
		// the pin of a searched area is only a mark; the home's own opens its card (D-143)
		if (id === undefined || (id === 'home' && meadow.area.kind !== 'home')) {
			picked = undefined
			return
		}
		if (id === 'home') {
			picked = id
			return
		}
		const group = pins.find((pin) => pin.id === id && pin.kind === 'group')
		if (group?.members) {
			const points = allPins.filter((pin) => group.members!.includes(pin.id)).map((pin) => pin.point)
			surface?.fit(points, { maxZoom: 16 })
			return
		}
		picked = id
		const target = meadow.placeById(id)
		const other = target ? undefined : meadow.suggestionById(id)
		const point = target?.point ?? other?.candidate.point
		if (point && surface) {
			// brought into sight only when it is not there already
			const at = surface.project(point)
			if (!at || at.x < 40 || at.x > size.width - 40 || at.y < 60 || at.y > size.height - 40) {
				surface.setView({ center: point, zoom: Math.max(surface.view().zoom, 13) })
			}
		}
		// opening a place is when its hours and its page's picture are read (D-135)
		const opened = target ?? other
		if (opened) void meadow.openDetails(opened, lang)
	}

	/** The place's sheet asks to put it on the map by a tap: the sheet steps aside while the place waits. */
	function place(target: SavedPlace) {
		picked = undefined
		moving = target
	}

	/**
	 * A tap on the map's ground while a place waits to be put: the point under it, from the map or, with no map,
	 * from the plain ground's own projection. A press that moved was a pan, not a tap.
	 */
	let pressed: { x: number; y: number } | undefined
	function ground(event: MouseEvent & { currentTarget: HTMLElement }) {
		if (!placing) return
		const travelled = pressed ? Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) : 0
		pressed = undefined
		if (travelled > 4) return
		const box = event.currentTarget.getBoundingClientRect()
		const at = { x: event.clientX - box.left, y: event.clientY - box.top }
		const point = surface ? surface.unproject(at) : flatInverse(flat, size)(at)
		if (point) clicked(point)
	}

	function clicked(point: LngLat) {
		if (placesImport.placing && !moving) return placesImport.placed(point)
		if (!moving) return
		const target = moving
		moving = undefined
		const { undo } = meadow.setPoint(target.id, point)
		undoToast($t('domains.places.toast.placed', { values: { name: target.name } }), undo)
		pick(target.id)
	}

	// ---- The lists under the map --------------------------------------------------------------------------------

	const rowActions = $derived<MenuItem[]>([
		{ id: 'visit', label: $t('domains.places.detail.logVisit'), icon: 'check' },
		{ id: 'edit', label: $t('domains.places.detail.edit'), icon: 'pencil' },
		{ id: 'maps', label: $t('domains.places.detail.openInMaps'), icon: 'external-link' },
		{ id: 'delete', label: $t('domains.places.detail.delete'), icon: 'trash', destructive: true },
	])
	const rows = $derived(
		shown.map((entry): ListRowData => ({
			id: entry.id,
			primary: entry.name,
			secondary: [categoryName(entry.category), entry.locality, priceLabel(entry.price)].filter(Boolean).join(' · '),
			thumbnail: entry.thumb,
			icon: categoryGlyph(entry.category),
			tile: true,
			chips: entry.favourite ? [{ label: $t('domains.places.list.favourite'), icon: 'heart', tone: 'accent' }] : [],
			meta: entry.point ? distanceLabel(meadow.distanceTo(entry), unit) : $t('domains.places.list.noPoint'),
			actions: rowActions,
		}))
	)
	function act(item: MenuItem, row: ListRowData) {
		const target = meadow.placeById(row.id)
		if (!target) return
		if (item.id === 'visit') visitSheet?.log(target)
		else if (item.id === 'edit') editSheet?.edit(target)
		else if (item.id === 'maps') void openExternal(mapsLink(target, settings.mapsApp))
		else if (item.id === 'delete') {
			const { undo } = meadow.removePlace(target.id)
			undoToast($t('domains.places.toast.removed', { values: { name: target.name } }), undo)
			if (picked === target.id) picked = undefined
		}
	}

	const foundActions = $derived<MenuItem[]>([
		{ id: 'save', label: $t('domains.places.suggestion.save'), icon: 'bookmark' },
		{ id: 'dismiss', label: $t('domains.places.suggestion.dismiss'), icon: 'x' },
	])
	const foundRows = $derived(
		found.map(({ id, candidate }): ListRowData => ({
			id,
			primary: candidate.name,
			secondary: candidate.why ?? [categoryName(candidate.category), candidate.locality].filter(Boolean).join(' · '),
			icon: categoryGlyph(candidate.category),
			tile: true,
			chips: [{ label: $t('domains.places.suggestion.found'), icon: 'sparkles', tone: 'ai' }],
			actions: foundActions,
		}))
	)
	function actFound(item: MenuItem, row: ListRowData) {
		const target = meadow.suggestionById(row.id)
		if (!target) return
		if (item.id === 'save') {
			const { place: made, undo } = meadow.saveSuggestion(row.id)
			if (!made) return
			undoToast($t('domains.places.toast.added', { values: { name: made.name } }), undo)
			if (picked === row.id) picked = made.id
		} else if (item.id === 'dismiss') {
			const { undo } = meadow.dismissSuggestion(row.id)
			undoToast($t('domains.places.toast.dismissed', { values: { name: target.candidate.name } }), undo)
			if (picked === row.id) picked = undefined
		}
	}
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

<div class="page">
	<PageHeader
		name={$t('domains.places.name')}
		subtitle={$t('domains.places.subtitle')}
		icon={domainGlyph('places')}
		{actions}
	>
		{#snippet filters()}
			<Segmented
				items={PLACES_TABS.map((id) => $t(`domains.places.tabs.${id}`))}
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

	<!-- the map stays mounted while another tab shows, so it is drawn once -->
	<section
		class={['map', tab !== 'map' && 'map-away']}
		aria-label={$t('domains.places.map.label')}
		bind:clientWidth={size.width}
		bind:clientHeight={size.height}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (the ground is a drawing: a tap on it places a pin while one waits, which Cancel and the place's form also answer) -->
		<div
			class="ground"
			bind:this={container}
			onpointerdown={(event) => (pressed = { x: event.clientX, y: event.clientY })}
			onclick={ground}
		></div>
		<PinLayer
			{pins}
			{project}
			{revision}
			selected={picked}
			label={$t(filtering ? 'domains.places.map.pinsFiltered' : 'domains.places.map.pins')}
			onselect={pick}
		/>
		{#if placing}
			<div class="placing">
				<span>{$t('domains.places.map.placing', { values: { name: placing.name } })}</span>
				<Button label={$t('common.cancel')} variant="quiet" onclick={cancelPlacing} />
			</div>
		{/if}
		<div class="foot">
			<p class="credit">
				{failed ? $t('domains.places.map.failed') : !online ? $t('domains.places.map.offline') : source.attribution}
			</p>
			{#if surface && allPins.length > 1}
				<IconButton icon="locate-fixed" size="sm" label={$t('domains.places.map.fit')} onclick={() => fitAll()} />
			{/if}
		</div>
	</section>

	{#if tab === 'map'}
		<div class="body">
			{#if none}
				<EmptyState
					title={$t('empty.places.title')}
					text={$t('empty.places.text')}
					action={{ label: $t('empty.places.action'), icon: 'clipboard-paste', onclick: () => placesImport.start() }}
					sample={{ onclick: sample }}
				/>
			{:else if meadow.ready}
				<div class="filter-row">
					<Chip
						label={$t('domains.places.filter.label')}
						icon="sliders-horizontal"
						tone={count ? 'accent' : 'outline'}
						count={count || undefined}
						onclick={() => (filterOpen = true)}
					/>
				</div>
				{#if rows.length}
					<List
						header={$t('domains.places.list.saved')}
						count={rows.length}
						{rows}
						current={picked}
						onpick={(row) => pick(row.id)}
						onaction={act}
					/>
				{:else}
					<EmptyState
						inline
						title={$t('domains.places.list.noneFit.title')}
						text={$t('domains.places.list.noneFit.text')}
					/>
				{/if}
			{/if}
			{#if meadow.search.status === 'searching'}
				<Skeleton rows={3} icon />
			{:else if foundRows.length}
				<Fold title={$t('domains.places.suggestion.list')} count={foundRows.length}>
					<List headless rows={foundRows} current={picked} onpick={(row) => pick(row.id)} onaction={actFound} />
				</Fold>
			{/if}
			{#if meadow.ready}<FindMore />{/if}
		</div>
	{:else if tab === 'collections'}
		<Collections bind:this={collections} onopen={show} />
	{:else if tab === 'visits'}
		<Visits onopen={show} />
	{:else}
		<Listings />
	{/if}
</div>

<FilterSheet bind:open={filterOpen} />
<PlaceSheet
	bind:picked
	onedit={(target) => editSheet?.edit(target)}
	onvisit={(target) => visitSheet?.log(target)}
	onplace={place}
/>
<PlaceEditSheet bind:this={editSheet} onadded={show} />
<VisitSheet bind:this={visitSheet} />

<style>
	.page {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.notice {
		padding: 0 var(--ed-gutter) var(--space-4);
	}
	.map {
		position: relative;
		flex: 0 0 auto;
		min-height: 52dvh;
		margin: 0 var(--ed-gutter);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		/* the plain ground the pins stand on while there are no tiles */
		background: var(--surface-1);
		overflow: hidden;
		/* the map is its own stacking context, so the library's canvas never rises over the page */
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
	.foot {
		position: absolute;
		left: var(--space-2);
		right: var(--space-2);
		bottom: var(--space-2);
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: var(--space-2);
		pointer-events: none;
	}
	.foot > :global(*) {
		pointer-events: auto;
	}
	.credit {
		min-width: 0;
		margin: 0;
		padding: 0 var(--space-2);
		border-radius: var(--radius-full);
		background: var(--surface-0);
		color: var(--text-secondary);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
	}
	.placing {
		position: absolute;
		top: var(--space-3);
		left: var(--space-3);
		right: var(--space-3);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--radius-full);
		background: var(--surface-0);
		box-shadow: var(--shadow-card);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4) var(--ed-gutter) 0;
	}
	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
