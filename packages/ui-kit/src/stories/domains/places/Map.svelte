<script lang="ts">
	// Meadow's Map view (product/domains/places.md, "Surfaces"), a map page under D-129: the map is the main column,
	// the filters and the results the side column, and the detail of a picked place lies over the map's edge beside
	// them. The filter is four facets of vibes (D-133: any of within a facet, all of across them) and a few practical
	// chips; it narrows the saved places at once, with no key and no network. "Find more" sends the filter to the
	// Gardener with a web search (D-132) and what it finds stands on the map in the Gardener's green until it is
	// saved or dismissed. The ground here is a still drawing; the app's is a real map behind the same pins.
	import {
		BackButton,
		Button,
		Chip,
		EmptyState,
		Field,
		IconButton,
		InlineError,
		List,
		Notice,
		PinLayer,
		Rating,
		Skeleton,
		Spinner,
		type ListRowData,
		type MapPinData,
		type MenuItem,
		type PageHeaderAction,
	} from '$lib/index.js'
	import MeadowPage, { CATEGORY_GLYPHS, CATEGORY_NAMES, price } from './MeadowPage.svelte'
	import StaticGround from './StaticGround.svelte'
	import {
		meadowCollections,
		meadowFacets,
		meadowHome,
		meadowPlaces,
		meadowSearch,
		meadowSuggestions,
		meadowVisits,
		type SamplePlace,
	} from '../../sample-data.js'

	type Props = {
		/** The vibes that are on, across the four facets. */
		vibes?: string[]
		/** Only what is open now, by the hours that could be read. */
		openNow?: boolean
		alcoholFree?: boolean
		favourites?: boolean
		/** The place or the suggestion the page is showing. */
		selected?: string
		/** What the Gardener found is on the map. */
		suggestions?: boolean
		/** A search is on its way. */
		searching?: boolean
		/** No key on this device: saved places still filter, nothing new can be found. */
		noProvider?: boolean
		/** No places at all. */
		empty?: boolean
		/** No tiles could be loaded: the saved pins stand on plain ground. */
		offline?: boolean
		/** The last search brought nothing back. */
		failed?: boolean
		onpick?: (id: string | undefined) => void
		onfilter?: (vibes: string[]) => void
		onfind?: () => void
		onsave?: (id: string) => void
		ondismiss?: (id: string) => void
		onfavourite?: (id: string) => void
		onvisit?: (id: string) => void
		onedit?: (id: string) => void
		onmaps?: (id: string) => void
		onadd?: () => void
		onimport?: () => void
		onsample?: () => void
		onsettings?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		vibes = [],
		openNow = false,
		alcoholFree = false,
		favourites = false,
		selected,
		suggestions = false,
		searching = false,
		noProvider = false,
		empty = false,
		offline = false,
		failed = false,
		onpick,
		onfilter,
		onfind,
		onsave,
		ondismiss,
		onfavourite,
		onvisit,
		onedit,
		onmaps,
		onadd,
		onimport,
		onsample,
		onsettings,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const vibeLabels = Object.fromEntries(
		meadowFacets.flatMap((facet) => facet.vibes.map((vibe) => [vibe.id, vibe.label]))
	)

	/** A place passes when, in every facet that has a vibe on, it carries one of them; and every practical chip that is on. */
	const passes = (place: SamplePlace) =>
		meadowFacets.every((facet) => {
			const on = facet.vibes.filter((vibe) => vibes.includes(vibe.id))
			return !on.length || on.some((vibe) => place.vibes.includes(vibe.id))
		}) &&
		(!openNow || place.hours?.open === true) &&
		(!alcoholFree || place.alcoholFree === true) &&
		(!favourites || place.favourite)

	const shown = $derived(empty ? [] : meadowPlaces.filter(passes).sort((a, b) => a.distanceKm - b.distanceKm))
	const found = $derived(suggestions && !empty ? meadowSuggestions : [])
	const filtering = $derived(vibes.length > 0 || openNow || alcoholFree || favourites)

	const place = $derived(shown.find((item) => item.id === selected))
	const suggestion = $derived(found.find((item) => item.id === selected))
	const visits = $derived(place ? meadowVisits.filter((visit) => visit.placeId === place.id) : [])
	const inCollections = $derived(
		place ? meadowCollections.filter((collection) => collection.placeIds.includes(place.id)) : []
	)

	const pins = $derived<MapPinData[]>([
		{ id: 'home', point: meadowHome.point, kind: 'home', label: meadowHome.name },
		...shown.map((item): MapPinData => ({ id: item.id, point: item.point, kind: 'saved', label: item.name })),
		...found.map((item): MapPinData => ({ id: item.id, point: item.point, kind: 'suggested', label: item.name })),
	])

	const rowActions: MenuItem[] = [
		{ id: 'visit', label: 'Log a visit', icon: 'check' },
		{ id: 'edit', label: 'Edit', icon: 'pencil' },
		{ id: 'maps', label: 'Open in Maps', icon: 'external-link' },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
	]
	const foundActions: MenuItem[] = [
		{ id: 'save', label: 'Save', icon: 'bookmark' },
		{ id: 'dismiss', label: 'Dismiss', icon: 'x' },
	]
	const rows = $derived(
		shown.map((item): ListRowData => ({
			id: item.id,
			primary: item.name,
			secondary: [CATEGORY_NAMES[item.category], item.locality, price(item.price)].filter(Boolean).join(' · '),
			thumbnail: item.picture,
			icon: CATEGORY_GLYPHS[item.category],
			tile: true,
			chips: item.favourite ? [{ label: 'Favourite', icon: 'heart', tone: 'accent' }] : [],
			meta: `${item.distanceKm} km`,
			actions: rowActions,
		}))
	)
	const foundRows = $derived(
		found.map((item): ListRowData => ({
			id: item.id,
			primary: item.name,
			secondary: item.why,
			icon: CATEGORY_GLYPHS[item.category],
			tile: true,
			chips: [{ label: 'Found', icon: 'sparkles', tone: 'ai' }],
			actions: foundActions,
		}))
	)

	const headerActions = $derived<PageHeaderAction[]>([
		{
			label: 'Add',
			icon: 'plus',
			variant: empty ? 'secondary' : undefined,
			menu: [
				{ id: 'place', label: 'Add a place', icon: 'map-pin', onselect: () => onadd?.() },
				{ id: 'import', label: 'Import a list', icon: 'clipboard-paste', onselect: () => onimport?.() },
			],
		},
	])

	const toggle = (id: string, on: boolean) => onfilter?.(on ? [...vibes, id] : vibes.filter((vibe) => vibe !== id))
	const act = (item: MenuItem, row: ListRowData) => {
		if (item.id === 'visit') onvisit?.(row.id)
		else if (item.id === 'edit') onedit?.(row.id)
		else if (item.id === 'maps') onmaps?.(row.id)
		else if (item.id === 'save') onsave?.(row.id)
		else if (item.id === 'dismiss') ondismiss?.(row.id)
	}
</script>

{#snippet detail(mobile: boolean)}
	{#if place}
		<aside class={['detail', { 'detail-over': !mobile }]} aria-label={place.name}>
			{#if place.picture}<img class="banner" src={place.picture} alt="" />{/if}
			<div class="detail-body">
				<div class="detail-head">
					<h2 class="detail-title">{place.name}</h2>
					<IconButton
						icon="heart"
						size="sm"
						label={place.favourite ? 'Remove from favourites' : 'Add to favourites'}
						pressed={place.favourite}
						tooltip
						onclick={() => onfavourite?.(place.id)}
					/>
					{#if !mobile}
						<IconButton icon="x" size="sm" label="Close" onclick={() => onpick?.(undefined)} />
					{/if}
				</div>
				<p class="meta">
					{[CATEGORY_NAMES[place.category], price(place.price), `${place.distanceKm} km from home`]
						.filter(Boolean)
						.join(' · ')}
				</p>
				<p class="meta">{place.address}, {place.locality}</p>
				{#if place.hours}
					<div class="hours">
						<Chip
							label={place.hours.open ? 'Open now' : 'Closed now'}
							tone={place.hours.open ? 'accent' : 'grey'}
							icon="clock"
						/>
						<span>{place.hours.text}</span>
					</div>
					<p class="source">
						From {place.hours.source}, read {place.hours.asOf}. Check before you go.
					</p>
				{:else}
					<p class="source">No hours could be read for this place.</p>
				{/if}
				{#if place.rating}
					<p class="meta">Rated {place.rating.value} elsewhere, from {place.rating.source}.</p>
				{/if}
				<ul class="chips" aria-label="Vibes">
					{#each place.vibes as vibe (vibe)}
						<li><Chip label={vibeLabels[vibe] ?? vibe} tone={vibes.includes(vibe) ? 'accent' : 'neutral'} /></li>
					{/each}
					{#if place.alcoholFree}<li><Chip label="Alcohol-free" icon="wine-off" /></li>{/if}
				</ul>
				{#if place.notes}<p class="notes">{place.notes}</p>{/if}
				{#if visits.length}
					<section class="visits" aria-labelledby="{uid}-visits">
						<h3 class="label" id="{uid}-visits">Visits</h3>
						{#each visits as visit (visit.id)}
							<div class="visit">
								<span class="visit-day">{visit.day}</span>
								<Rating readonly value={visit.rating} label="Your rating" />
								{#if visit.note}<span class="visit-note">{visit.note}</span>{/if}
							</div>
						{/each}
					</section>
				{/if}
				{#if inCollections.length}
					<p class="meta">In {inCollections.map((collection) => collection.name).join(', ')}</p>
				{/if}
				<div class="actions">
					<Button label="Log a visit" icon="check" variant="primary" onclick={() => onvisit?.(place.id)} />
					<Button label="Edit" icon="pencil" onclick={() => onedit?.(place.id)} />
					<Button label="Open in Maps" icon="external-link" onclick={() => onmaps?.(place.id)} />
				</div>
			</div>
		</aside>
	{:else if suggestion}
		<aside class={['detail', { 'detail-over': !mobile }]} aria-label={suggestion.name}>
			<div class="detail-body">
				<div class="detail-head">
					<h2 class="detail-title">{suggestion.name}</h2>
					{#if !mobile}
						<IconButton icon="x" size="sm" label="Close" onclick={() => onpick?.(undefined)} />
					{/if}
				</div>
				<p class="meta">{CATEGORY_NAMES[suggestion.category]} · {suggestion.address}, {suggestion.locality}</p>
				<div class="why">
					<Chip label="Why it fits" icon="sparkles" tone="ai" />
					<p class="notes">{suggestion.why}</p>
				</div>
				<ul class="chips" aria-label="Vibes">
					{#each suggestion.vibes as vibe (vibe)}
						<li><Chip label={vibeLabels[vibe] ?? vibe} tone="ai" /></li>
					{/each}
				</ul>
				<p class="source">
					Found by a web search, from {suggestion.sources.map((source) => source.title).join(', ')}. Not saved yet; it
					goes from this device in seven days.
				</p>
				<div class="actions">
					<Button label="Save" icon="bookmark" variant="primary" onclick={() => onsave?.(suggestion.id)} />
					<Button label="Dismiss" icon="x" onclick={() => ondismiss?.(suggestion.id)} />
					<Button label="Open in Maps" icon="external-link" onclick={() => onmaps?.(suggestion.id)} />
				</div>
			</div>
		</aside>
	{/if}
{/snippet}

{#snippet find()}
	<section class="find" aria-labelledby="{uid}-find">
		<h2 class="label" id="{uid}-find">Find more</h2>
		{#if noProvider}
			<Notice
				title="No key on this device"
				detail="Your saved places filter without one. Finding new places asks the Gardener, which needs a key."
				action={{ label: 'Open settings', onclick: onsettings }}
			/>
		{:else}
			{#if failed}
				<InlineError message="The search came back with nothing. Nothing was saved." onretry={onfind} />
			{/if}
			<div class="find-row">
				<Button
					label={searching ? 'Searching' : 'Find more'}
					icon="sparkles"
					variant="ai"
					disabled={searching || offline}
					onclick={onfind}
				/>
				{#if searching}<Spinner size="sm" label="Searching the web" />{/if}
			</div>
			<p class="source">
				{#if offline}
					Offline. A search needs a connection.
				{:else}
					Sends your filter and “{meadowSearch.area}” to {meadowSearch.model} with a web search, never where you are. About
					{meadowSearch.estimate}.
				{/if}
			</p>
		{/if}
	</section>
{/snippet}

{#snippet filters(mobile: boolean)}
	<section class="filters" aria-label="Filters">
		{#if !mobile}
			<Field label="Looking for" placeholder="A quiet cafe to work in" icon="search" />
		{/if}
		<div class="chips">
			{#if mobile}
				<Chip
					label="Filters"
					icon="sliders-horizontal"
					tone="outline"
					count={vibes.length || undefined}
					onclick={() => {}}
				/>
			{:else}
				<Chip label="Category" tone="outline" icon="chevron-down" aria-haspopup="menu" onclick={() => {}} />
				<Chip label="Price" tone="outline" icon="chevron-down" aria-haspopup="menu" onclick={() => {}} />
				<Chip label="Within 10 km" tone="outline" icon="chevron-down" aria-haspopup="menu" onclick={() => {}} />
				<Chip label="Collection" tone="outline" icon="chevron-down" aria-haspopup="menu" onclick={() => {}} />
			{/if}
			<Chip label="Open now" tone="outline" icon="clock" selectable selected={openNow} />
			<Chip label="Alcohol-free" tone="outline" icon="wine-off" selectable selected={alcoholFree} />
			<Chip label="Favourites" tone="outline" icon="heart" selectable selected={favourites} />
		</div>
		{#if !mobile}
			{#each meadowFacets as facet (facet.id)}
				<div class="facet" role="group" aria-labelledby="{uid}-{facet.id}">
					<h2 class="label" id="{uid}-{facet.id}">{facet.label}</h2>
					<div class="chips">
						{#each facet.vibes as vibe (vibe.id)}
							<Chip
								label={vibe.label}
								selectable
								selected={vibes.includes(vibe.id)}
								onselect={(on) => toggle(vibe.id, on)}
							/>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</section>
{/snippet}

{#snippet results()}
	{#if empty}
		<EmptyState
			title="No places yet"
			text="Paste a list from your notes and Meadow finds each one, or ask the Gardener for somewhere new."
			action={{ label: 'Import a list', icon: 'clipboard-paste', onclick: onimport }}
			sample={{ onclick: onsample }}
		/>
	{:else}
		{#if rows.length}
			<List
				header="Saved"
				count={rows.length}
				{rows}
				current={selected}
				onpick={(row) => onpick?.(row.id)}
				onaction={act}
			/>
		{:else}
			<EmptyState inline title="No saved place fits" text="Loosen the filter, or find somewhere new below." />
		{/if}
		{#if searching}
			<Skeleton rows={3} icon />
		{:else if foundRows.length}
			<List
				header="Found by the Gardener"
				count={foundRows.length}
				rows={foundRows}
				current={selected}
				onpick={(row) => onpick?.(row.id)}
				onaction={act}
			/>
			<p class="source">One more could not be placed on the map: Try Hard Coffee.</p>
		{/if}
	{/if}
{/snippet}

<MeadowPage
	tab="Map"
	actions={headerActions}
	bare={empty}
	banner={offline ? 'Offline. Your saved places are shown on plain ground.' : undefined}
	{onnavigate}
>
	{#snippet children(platform)}
		{@const mobile = platform === 'mobile'}
		<div class={['body', mobile ? 'body-narrow' : 'body-wide']}>
			<section class="map" aria-label="Map">
				<StaticGround
					{offline}
					zoom={mobile ? 1 : 1.1}
					center={mobile ? undefined : (place ?? suggestion)?.point}
					inset={!mobile && (place || suggestion) ? 340 : 0}
				>
					{#snippet children({ project, revision })}
						<PinLayer
							{pins}
							{project}
							{revision}
							{selected}
							label={filtering ? 'Places that fit the filter' : 'Your places'}
							onselect={(id) => onpick?.(id === 'home' ? undefined : id)}
						/>
					{/snippet}
				</StaticGround>
				{#if !offline}<p class="attribution">© OpenStreetMap contributors · OpenFreeMap</p>{/if}
				{#if !mobile}{@render detail(false)}{/if}
			</section>
			<div class="side">
				{#if mobile && (place || suggestion)}
					<div class="back"><BackButton breadcrumb="Places" onback={() => onpick?.(undefined)} /></div>
					{@render detail(true)}
				{:else}
					{@render filters(mobile)}
					{@render results()}
					{#if !empty && !mobile}{@render find()}{/if}
				{/if}
			</div>
		</div>
	{/snippet}
</MeadowPage>

<style>
	/* Wide: the map is the main column and holds its height while the side column scrolls beside it */
	.body {
		display: grid;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.body-wide {
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
	}
	.map {
		position: relative;
		overflow: hidden;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
	}
	.body-wide .map {
		position: sticky;
		top: var(--space-4);
		height: calc(var(--sheet-max) * 0.78);
	}
	/* Narrow: the map stands on top at a fixed share of the height, the rest goes under it */
	.body-narrow .map {
		height: calc(var(--sheet-max) * 0.4);
	}
	.attribution {
		position: absolute;
		left: var(--space-2);
		bottom: var(--space-2);
		margin: 0;
		padding: 0 var(--space-2);
		border-radius: var(--radius-full);
		background: var(--surface-0);
		color: var(--text-secondary);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.back {
		display: flex;
	}

	.filters,
	.find {
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
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.label {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		font-variation-settings: var(--ed-t-label-opsz);
	}
	.find-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.meta,
	.source,
	.notes {
		margin: 0;
	}
	.meta {
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.source {
		color: var(--text-secondary);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
	}
	.notes {
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
	}

	/* The detail: a card over the map's edge beside the list when wide, the page's own block when narrow */
	.detail {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-0);
		overflow: hidden;
	}
	.detail-over {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		bottom: var(--space-3);
		width: min(calc(var(--sheet-sm) * 0.9), calc(100% - 2 * var(--space-3)));
		height: fit-content;
		max-height: calc(100% - 2 * var(--space-3));
		overflow-y: auto;
		box-shadow: var(--shadow-sheet);
	}
	.banner {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 7;
		object-fit: cover;
		border-bottom: 1px solid var(--stroke-subtle);
	}
	.detail-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
	}
	.detail-head {
		display: flex;
		align-items: start;
		gap: var(--space-1);
	}
	.detail-title {
		flex: 1;
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
	}
	.hours {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.why {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-2);
	}
	.visits {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.visit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.visit-day {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
	.visit-note {
		flex-basis: 100%;
		color: var(--text-secondary);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
