<script lang="ts">
	// A saved place, read (D-94, D-129): its picture across the top, its name, what it is and how far, its hours with
	// where they were read and a note to check, its vibes, the owner's notes and visits, and the actions on it. It is
	// for reading and for acting; the forms are sheets (D-95). The map page lays it over the map's edge when it is
	// wide and shows it as a pushed view when it is narrow, so it knows nothing of where it stands.
	import { Button, Chip, IconButton, Menu, Rating, type MenuItem } from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import { formatAgo, formatDateOf } from '@eden/shared/dates'
	import {
		distanceLabel,
		formatSpans,
		mapsLink,
		meadow,
		openNow,
		priceLabel,
		spansOn,
		type SavedPlace,
	} from '@eden/shared/domains/places'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { undoToast } from '$lib/shell/undo'
	import { categoryNamer, vibeNamer } from '../words'

	type Props = {
		place: SavedPlace
		/** Shows the cross that closes it: over the map, where no back arrow stands. */
		closable?: boolean
		onclose?: () => void
		onedit?: (place: SavedPlace) => void
		onvisit?: (place: SavedPlace) => void
		/** The owner asks to put the place on the map by a click. */
		onplace?: (place: SavedPlace) => void
	}
	let { place, closable = false, onclose, onedit, onvisit, onplace }: Props = $props()

	const uid = $props.id()
	const vibeName = $derived(vibeNamer($t, meadow.vibes))
	const categoryName = $derived(categoryNamer($t))
	const lang = $derived($locale ?? 'en')
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
	const now = $derived(new Date(meadow.now))

	const picture = $derived(meadow.image(place))
	const visits = $derived(meadow.visitsOf(place.id))
	const held = $derived(meadow.collectionsOf(place.id))
	const km = $derived(meadow.distanceTo(place))
	const facts = $derived(
		[
			categoryName(place.category),
			priceLabel(place.price),
			km === undefined
				? ''
				: $t('domains.places.detail.distance', {
						values: { distance: distanceLabel(km, settings.measurement === 'imperial' ? 'mi' : 'km') },
					}),
		].filter(Boolean)
	)
	const open = $derived(place.hours?.spec ? openNow(place, now, timeZone) : undefined)
	const today = $derived(place.hours?.spec ? formatSpans(spansOn(place.hours.spec, now, timeZone)) : '')
	const hoursSource = $derived.by(() => {
		const source = place.hours?.source
		if (!source) return ''
		const key = `domains.places.sources.${source}`
		return $t(key) === key ? source : $t(key)
	})

	function favourite() {
		// read before the write: the place comes from the store and has changed by the time the toast is made
		const { name, favourite: was } = place
		const { undo } = meadow.setFavourite(place.id, !was)
		undoToast(
			$t(was ? 'domains.places.toast.unfavourited' : 'domains.places.toast.favourited', { values: { name } }),
			undo
		)
	}
	function remove() {
		const { undo } = meadow.removePlace(place.id)
		undoToast($t('domains.places.toast.removed', { values: { name: place.name } }), undo)
		onclose?.()
	}

	// Add to a collection: a menu of the collections, the ones it is in checked; a pick puts it in or takes it out
	let collectionAnchor = $state<HTMLElement>()
	let collectionOpen = $state(false)
	const collectionItems = $derived<MenuItem[]>(
		meadow.collections.map((collection) => ({
			id: collection.id,
			label: collection.name,
			checked: collection.placeIds.includes(place.id),
		}))
	)
	function file(id: string) {
		const collection = meadow.collections.find((entry) => entry.id === id)
		if (!collection) return
		const inside = collection.placeIds.includes(place.id)
		const { undo } = inside ? meadow.removeFromCollection(id, place.id) : meadow.addToCollection(id, [place.id])
		undoToast(
			$t(inside ? 'domains.places.toast.uncollected' : 'domains.places.toast.collected', {
				values: { name: place.name, collection: collection.name },
			}),
			undo
		)
	}

	let moreAnchor = $state<HTMLElement>()
	let moreOpen = $state(false)
	const moreItems = $derived<MenuItem[]>([
		...(place.url ? [{ id: 'website', label: $t('domains.places.detail.website'), icon: 'globe' as const }] : []),
		{ id: 'place', label: $t('domains.places.detail.placeOnMap'), icon: 'locate-fixed' },
		{ id: 'delete', label: $t('domains.places.detail.delete'), icon: 'trash', destructive: true },
	])
	function more(id: string | undefined) {
		if (id === 'website' && place.url) void openExternal(place.url)
		else if (id === 'place') onplace?.(place)
		else if (id === 'delete') remove()
	}
</script>

<article class="detail" aria-labelledby="{uid}-name">
	{#if picture}<img class="banner" src={picture} alt="" />{/if}
	<div class="body">
		<div class="head">
			<h2 class="title" id="{uid}-name">{place.name}</h2>
			<IconButton
				icon="heart"
				size="sm"
				label={$t(place.favourite ? 'domains.places.detail.unfavourite' : 'domains.places.detail.favourite')}
				pressed={place.favourite}
				tooltip
				onclick={favourite}
			/>
			{#if closable}
				<IconButton icon="x" size="sm" label={$t('common.close')} onclick={onclose} />
			{/if}
		</div>
		{#if facts.length}<p class="meta">{facts.join(' · ')}</p>{/if}
		{#if place.addressLine || place.locality}
			<p class="meta">{[place.addressLine, place.locality].filter(Boolean).join(', ')}</p>
		{/if}
		{#if !place.point}
			<p class="source">{$t('domains.places.detail.noPoint')}</p>
		{/if}

		{#if place.hours}
			<div class="hours">
				{#if open !== undefined}
					<Chip
						label={$t(open ? 'domains.places.detail.open' : 'domains.places.detail.closed')}
						tone={open ? 'accent' : 'grey'}
						icon="clock"
					/>
					<span>{today || $t('domains.places.detail.closedToday')}</span>
				{:else if place.hours.text}
					<span>{place.hours.text}</span>
				{/if}
			</div>
			<p class="source">
				{$t('domains.places.detail.hoursSource', {
					values: { source: hoursSource, when: formatAgo(place.hours.asOf, lang, meadow.now) },
				})}
			</p>
		{/if}

		{#if place.vibes.length || place.alcoholFree}
			<ul class="chips" aria-label={$t('domains.places.detail.vibes')}>
				{#each place.vibes as vibe (vibe)}
					<li><Chip label={vibeName(vibe)} tone={meadow.filter.vibes.includes(vibe) ? 'accent' : 'neutral'} /></li>
				{/each}
				{#if place.alcoholFree}
					<li><Chip label={$t('domains.places.filter.alcoholFree')} icon="wine-off" /></li>
				{/if}
			</ul>
		{/if}

		{#if place.notes}<p class="notes">{place.notes}</p>{/if}

		{#if place.savedFrom?.why}
			<div class="why">
				<Chip label={$t('domains.places.detail.why')} icon="sparkles" tone="ai" />
				<p class="meta">{place.savedFrom.why}</p>
			</div>
		{/if}

		{#if visits.length}
			<section class="visits" aria-labelledby="{uid}-visits">
				<h3 class="label" id="{uid}-visits">{$t('domains.places.detail.visits')}</h3>
				{#each visits as visit (visit.id)}
					<div class="visit">
						<span class="visit-day">{formatDateOf(visit.day, lang)}</span>
						{#if visit.rating}
							<Rating readonly value={visit.rating} label={$t('domains.places.visit.rating')} />
						{/if}
						{#if visit.note}<span class="visit-note">{visit.note}</span>{/if}
					</div>
				{/each}
			</section>
		{/if}

		{#if held.length}
			<p class="meta">
				{$t('domains.places.detail.inCollections', {
					values: { names: held.map((collection) => collection.name).join(', ') },
				})}
			</p>
		{/if}

		<div class="actions">
			<Button
				label={$t('domains.places.detail.logVisit')}
				icon="check"
				variant="primary"
				onclick={() => onvisit?.(place)}
			/>
			<Button label={$t('domains.places.detail.edit')} icon="pencil" onclick={() => onedit?.(place)} />
			<Button
				label={$t('domains.places.detail.openInMaps')}
				icon="external-link"
				onclick={() => void openExternal(mapsLink(place, settings.mapsApp))}
			/>
			{#if meadow.collections.length}
				<span class="anchor" bind:this={collectionAnchor}>
					<IconButton
						icon="bookmark"
						label={$t('domains.places.detail.collect')}
						tooltip
						aria-haspopup="menu"
						aria-expanded={collectionOpen}
						onclick={() => (collectionOpen = !collectionOpen)}
					/>
				</span>
				<Menu
					bind:open={collectionOpen}
					anchor={collectionAnchor}
					align="start"
					label={$t('domains.places.detail.collect')}
					items={collectionItems}
					onselect={(item) => item.id && file(item.id)}
				/>
			{/if}
			<span class="anchor" bind:this={moreAnchor}>
				<IconButton
					icon="ellipsis"
					label={$t('domains.places.detail.more', { values: { name: place.name } })}
					aria-haspopup="menu"
					aria-expanded={moreOpen}
					onclick={() => (moreOpen = !moreOpen)}
				/>
			</span>
			<Menu
				bind:open={moreOpen}
				anchor={moreAnchor}
				align="start"
				label={$t('domains.places.detail.more', { values: { name: place.name } })}
				items={moreItems}
				onselect={(item) => more(item.id)}
			/>
		</div>
	</div>
</article>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		min-width: 0;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-0);
		overflow: hidden;
	}
	/* the picture runs to the card's edges */
	.banner {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 7;
		object-fit: cover;
		border-bottom: 1px solid var(--stroke-subtle);
		background: var(--surface-2);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
	}
	.head {
		display: flex;
		align-items: start;
		gap: var(--space-1);
	}
	.title {
		flex: 1;
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
		user-select: text;
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
		user-select: text;
	}
	.hours {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.why {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-2);
	}
	.label {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		font-variation-settings: var(--ed-t-label-opsz);
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
		align-items: center;
		gap: var(--space-2);
	}
	.anchor {
		display: inline-flex;
	}
</style>
