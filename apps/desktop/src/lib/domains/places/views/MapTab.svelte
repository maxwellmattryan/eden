<script lang="ts">
	// Meadow's Map tab (product/domains/places.md), a map page under D-129: the map is the main column and holds its
	// height, the filters and the results are the side column and scroll beside it, and the place that is picked is
	// read in a card over the map's edge when the page is wide and as a pushed view when it is narrow (D-112). The map
	// draws ground only (`createSurface`); every pin is a kit `MapPin` in a `PinLayer`, placed by the map's projection.
	// When the map cannot start, or there is no connection, the pins stand on plain ground by the same projection
	// worked out here, so the saved places are still found. A click picks (D-94); the selection is view state.
	import { onMount, tick, untrack } from 'svelte'
	import {
		BackButton,
		Button,
		EmptyState,
		List,
		PinLayer,
		Skeleton,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import {
		categoryGlyph,
		distanceLabel,
		drawnPins,
		flatFit,
		flatInverse,
		flatProjection,
		isFiltering,
		mapsLink,
		meadow,
		priceLabel,
		readHome,
		readMapPalette,
		type MapSurface,
		type Pin,
		type SavedPlace,
	} from '@eden/shared/domains/places'
	import type { LngLat } from '@eden/shared/geo'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { showPushed } from '$lib/shell/pushed'
	import { undoToast } from '$lib/shell/undo'
	import { placesImport } from '../import.svelte'
	import { createSurface, source } from '../map'
	import { categoryNamer, vibeNamer } from '../words'
	import FilterPanel from './FilterPanel.svelte'
	import FindMore from './FindMore.svelte'
	import HomeCard from './HomeCard.svelte'
	import PlaceDetail from './PlaceDetail.svelte'
	import SuggestionDetail from './SuggestionDetail.svelte'

	type Props = {
		onedit?: (place: SavedPlace) => void
		onvisit?: (place: SavedPlace) => void
		onimport?: () => void
		onsample?: () => void
	}
	let { onedit, onvisit, onimport, onsample }: Props = $props()

	const vibeName = $derived(vibeNamer($t, meadow.vibes))
	const categoryName = $derived(categoryNamer($t))
	const unit = $derived(settings.measurement === 'imperial' ? ('mi' as const) : ('km' as const))

	// ---- What is shown ----------------------------------------------------------------------------------------

	const shown = $derived(meadow.filtered(vibeName))
	const filtering = $derived(isFiltering(meadow.filter))
	let picked = $state<string>()
	const place = $derived(shown.find((entry) => entry.id === picked) ?? meadow.placeById(picked))
	/** What the Gardener found and the owner has not saved: green pins, and a list of their own. */
	const found = $derived(meadow.suggestions)
	const suggestion = $derived(place ? undefined : found.find((entry) => entry.id === picked))
	/** The home's own pin is picked: its card says where home is and opens the sheet that changes it (D-143). */
	const homeOpen = $derived(picked === 'home' && meadow.area.kind === 'home')
	/** Something is picked: a saved place, a found one or the home. */
	const open = $derived(place !== undefined || suggestion !== undefined || homeOpen)
	const lang = $derived($locale ?? 'en')

	/** A saved place the owner is moving by a click on the map. */
	let moving = $state<SavedPlace>()
	/** What the next click on the map places: a saved place being moved, or a row of an import with no match. */
	const placing = $derived(moving ?? placesImport.placing)

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
	let bodyWidth = $state(0)
	/** The page's column is narrow (D-112): 48rem, as the container query below asks. */
	const narrow = $derived(bodyWidth > 0 && bodyWidth <= 768)
	/** The room the detail takes at the map's edge while the page is wide, which the view centres clear of. */
	let detailWidth = $state(0)
	/** The detail lies over the map's edge only while the map has room to show the place beside it; in a narrower
	 * map, as in a narrow page, it is a pushed view in the side column's place. */
	const overlay = $derived(!narrow && size.width >= 640)
	const inset = $derived(open && overlay ? detailWidth + 24 : 0)

	const home = $derived(readHome())
	const allPins = $derived<Pin[]>([
		{
			id: 'home',
			point: meadow.originPin,
			kind: 'home',
			label: meadow.area.kind === 'home' ? home.label : meadow.area.label,
		},
		...shown.flatMap((entry): Pin[] =>
			entry.point
				? [
						{
							id: entry.id,
							point: entry.point,
							kind: 'saved',
							label: entry.name,
							icon: categoryGlyph(entry.category),
						},
					]
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
			{ width: Math.max(1, size.width - inset), height: size.height }
		) ?? { center: meadow.origin, zoom: 12 }
	)
	const project = $derived.by(() => {
		const live = surface
		if (live) return (point: LngLat) => live.project(point)
		return flatProjection(flat, size, { right: inset })
	})
	const pins = $derived.by(() => {
		void revision
		return drawnPins(allPins, project, {
			selected: picked,
			size,
			groupLabel: (count) => $t('domains.places.map.group', { values: { count } }),
		})
	})

	const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

	onMount(() => {
		let gone = false
		const offs: (() => void)[] = []
		let made: MapSurface | undefined
		void (async () => {
			if (!container) return
			try {
				made = await createSurface({
					container,
					view: { center: meadow.origin, zoom: 12 },
					palette: readMapPalette(container),
					lang: $locale ?? 'en',
					still: still(),
				})
				if (gone) return made.destroy()
				await made.ready
				if (gone) return
				offs.push(made.on('move', moved))
				surface = made
				moved()
				fitAll(false)
			} catch {
				failed = true
			}
		})()
		const tock = setInterval(() => (meadow.now = Date.now()), 60_000)
		return () => {
			gone = true
			clearInterval(tock)
			for (const off of offs) off()
			surface = undefined
			made?.destroy()
		}
	})

	function fitAll(animate = true) {
		surface?.fit(
			allPins.map((pin) => pin.point),
			{ animate }
		)
	}

	// effect: imperative DOM (the map's colours are read from the tokens where it stands, after a theme or accent change)
	$effect(() => {
		void settings.resolvedTheme
		void settings.accent
		const live = surface
		const el = container
		if (!live || !el) return
		void tick().then(() => live.setPalette(readMapPalette(el)))
	})

	// effect: imperative DOM (the map keeps its centre clear of the detail that lies over its edge)
	$effect(() => {
		const live = surface
		const right = inset
		untrack(() => {
			live?.setPadding({ top: 0, left: 0, bottom: 0, right })
			moved()
		})
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

	/** A place a tile, a tool or another tab asked for is picked once the store holds it. */
	$effect(() => {
		const id = meadow.reveal
		if (!id || !meadow.ready) return
		meadow.reveal = undefined
		if (meadow.placeById(id)) pick(id)
	})

	// ---- Picking ------------------------------------------------------------------------------------------------

	let back = $state<HTMLElement>()

	function pick(id: string | undefined) {
		// the pin of a searched area is only a mark; the home's own opens its card
		if (id === undefined || (id === 'home' && meadow.area.kind !== 'home')) {
			picked = undefined
			return
		}
		if (id === 'home') {
			picked = id
			void showPushed(() => back)
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
			// brought into the clear part of the map only when it is not there already
			const at = surface.project(point)
			const clear = size.width - inset
			if (!at || at.x < 40 || at.x > clear - 40 || at.y < 60 || at.y > size.height - 40) {
				surface.setView({ center: point, zoom: Math.max(surface.view().zoom, 13) })
			}
		}
		// opening a place is when its hours and its page's picture are read (D-135)
		const opened = target ?? other
		if (opened) void meadow.openDetails(opened, lang)
		void showPushed(() => back)
	}

	/**
	 * A click on the map's ground while a place waits to be put: the point under it, from the map or, with no map,
	 * from the plain ground's own projection. A press that moved was a pan, not a click.
	 */
	let pressed: { x: number; y: number } | undefined
	function ground(event: MouseEvent & { currentTarget: HTMLElement }) {
		if (!placing) return
		const moved = pressed ? Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) : 0
		pressed = undefined
		if (moved > 4) return
		const box = event.currentTarget.getBoundingClientRect()
		const at = { x: event.clientX - box.left, y: event.clientY - box.top }
		const point = surface ? surface.unproject(at) : flatInverse(flat, size, { right: inset })(at)
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

	// ---- The list -------------------------------------------------------------------------------------------------

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

	function act(item: MenuItem, row: ListRowData) {
		const target = meadow.placeById(row.id)
		if (!target) return
		if (item.id === 'visit') onvisit?.(target)
		else if (item.id === 'edit') onedit?.(target)
		else if (item.id === 'maps') void openExternal(mapsLink(target, settings.mapsApp))
		else if (item.id === 'delete') {
			const { undo } = meadow.removePlace(target.id)
			undoToast($t('domains.places.toast.removed', { values: { name: target.name } }), undo)
			if (picked === target.id) picked = undefined
		}
	}
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

{#snippet detail(closable: boolean)}
	{#if place}
		<PlaceDetail
			{place}
			{closable}
			onclose={() => pick(undefined)}
			{onedit}
			{onvisit}
			onplace={(target) => (moving = target)}
		/>
	{:else if suggestion}
		<SuggestionDetail {suggestion} {closable} onclose={() => pick(undefined)} onsaved={(id) => (picked = id)} />
	{:else if homeOpen}
		<HomeCard {closable} onclose={() => pick(undefined)} />
	{/if}
{/snippet}

<div class={['body', open && !overlay && 'body-open']} bind:clientWidth={bodyWidth}>
	<section
		class={['map', placing && 'map-placing']}
		aria-label={$t('domains.places.map.label')}
		bind:clientWidth={size.width}
		bind:clientHeight={size.height}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (the ground is a drawing: a click on it places a pin while one waits, which Cancel and the place's form also answer) -->
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
				<Button
					label={$t('common.cancel')}
					variant="quiet"
					onclick={() => {
						if (moving) moving = undefined
						else placesImport.placed(undefined)
					}}
				/>
			</div>
		{/if}
		<div class="foot">
			{#if failed || !online}
				<p class="credit">{$t(failed ? 'domains.places.map.failed' : 'domains.places.map.offline')}</p>
			{:else}
				<p class="credit">{source.attribution}</p>
			{/if}
			{#if surface && allPins.length > 1}
				<Button label={$t('domains.places.map.fit')} variant="quiet" icon="locate-fixed" onclick={() => fitAll()} />
			{/if}
		</div>
		{#if open && overlay}
			<aside
				class="over"
				aria-label={place?.name ?? suggestion?.candidate.name ?? home.label}
				bind:clientWidth={detailWidth}
			>
				{@render detail(true)}
			</aside>
		{/if}
	</section>

	<div class="side">
		<FilterPanel />
		{#if meadow.ready && !meadow.places.length}
			<EmptyState
				title={$t('empty.places.title')}
				text={$t('empty.places.text')}
				action={{ label: $t('empty.places.action'), icon: 'clipboard-paste', onclick: onimport }}
				sample={{ onclick: onsample }}
			/>
		{:else if rows.length}
			<List
				header={$t('domains.places.list.saved')}
				count={rows.length}
				{rows}
				current={picked}
				onpick={(row) => pick(row.id)}
				onaction={act}
			/>
		{:else if meadow.ready}
			<EmptyState
				inline
				title={$t('domains.places.list.noneFit.title')}
				text={$t('domains.places.list.noneFit.text')}
			/>
		{/if}
		{#if meadow.search.status === 'searching'}
			<Skeleton rows={3} icon />
		{:else if foundRows.length}
			<List
				header={$t('domains.places.suggestion.list')}
				count={foundRows.length}
				rows={foundRows}
				current={picked}
				onpick={(row) => pick(row.id)}
				onaction={actFound}
			/>
		{/if}
		{#if meadow.ready}<FindMore />{/if}
	</div>

	{#if open && !overlay}
		<div class="pushed">
			<div class="back" bind:this={back}><BackButton onback={() => pick(undefined)} /></div>
			{@render detail(false)}
		</div>
	{/if}
</div>

<style>
	/* Wide: the map is the main column and as tall as the page lets it be; the side column scrolls beside it */
	.body {
		flex: 1 1 0;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) clamp(18rem, 36%, var(--sheet-sm));
		grid-template-rows: minmax(0, 1fr);
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.map {
		position: relative;
		min-height: calc(var(--space-8) * 10);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		/* the plain ground the pins stand on while there are no tiles */
		background: var(--surface-1);
		overflow: hidden;
		/* the map is its own stacking context, so the library's canvas never rises over the page */
		isolation: isolate;
	}
	.ground {
		position: absolute;
		inset: 0;
	}
	.map-placing .ground {
		cursor: crosshair;
	}
	.foot {
		position: absolute;
		left: var(--space-2);
		bottom: var(--space-2);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		pointer-events: none;
	}
	.foot > :global(*) {
		pointer-events: auto;
	}
	.credit {
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
		left: 50%;
		translate: -50% 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--radius-full);
		background: var(--surface-0);
		box-shadow: var(--shadow-card);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	/* The detail of the picked place, over the map's edge beside the list. It is app markup inside the map's box, not
	   a popover, which would close when the map is dragged */
	.over {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		width: min(calc(var(--sheet-sm) * 0.95), calc(100% - 2 * var(--space-3)));
		max-height: calc(100% - 2 * var(--space-3));
		overflow-y: auto;
		border-radius: var(--ed-radius-card);
		box-shadow: var(--shadow-sheet);
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
		min-height: 0;
		/* a scroller clips what it holds: the room around it keeps a focus ring whole, and is taken back outside */
		margin: calc(var(--space-1) * -1);
		padding: var(--space-1);
		overflow-y: auto;
	}
	/* The pushed detail and its way back: the picked place in the side column's place, where the map has no room to
	   carry it */
	.body-open .side {
		display: none;
	}
	.pushed {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
	}
	.back {
		display: flex;
	}

	/* narrow page */
	@container page (max-width: 48rem) {
		/* one column: the map on top at a share of the height, then the filters and the list, or the picked place */
		.body {
			flex: 1 0 auto;
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto;
		}
		.map {
			height: 42vh;
			min-height: calc(var(--space-8) * 7);
		}
		.side,
		.pushed {
			overflow-y: visible;
		}
	}
</style>
