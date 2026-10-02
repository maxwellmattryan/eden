<script lang="ts">
	// A saved place on the phone, in a sheet from the foot (D-95): what it is and how far, its hours with where they
	// were read, its vibes and the owner's notes, and the two things the phone writes: favourite, and a visit with a
	// rating and a note. The sheet reads; the visit's small form unfolds in it.
	import { Button, Chip, Field, IconButton, Rating, Sheet, toast } from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import { formatDateOf, todayIso } from '@eden/shared/dates'
	import {
		distanceLabel,
		formatSpans,
		mapsLink,
		meadow,
		openNow,
		priceLabel,
		spansOn,
		type Visit,
	} from '@eden/shared/domains/places'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { categoryNamer, vibeNamer } from '../words'

	type Props = {
		/** The id of the place shown; none closes the sheet. */
		placeId?: string
		onclose?: () => void
	}
	let { placeId = $bindable(), onclose }: Props = $props()

	const uid = $props.id()
	const place = $derived(meadow.placeById(placeId))
	// the sheet opens when a place is picked and closes when there is none
	let open = $derived(place !== undefined)

	const lang = $derived($locale ?? 'en')
	const vibeName = $derived(vibeNamer($t, meadow.vibes))
	const categoryName = $derived(categoryNamer($t))
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
	const now = $derived(new Date(meadow.now))
	const km = $derived(place ? meadow.distanceTo(place) : undefined)
	const isOpen = $derived(place?.hours?.spec ? openNow(place, now, timeZone) : undefined)
	const visits = $derived(place ? meadow.visitsOf(place.id) : [])

	const undoable = (message: string, undo: () => void) =>
		toast({ message, action: { label: $t('common.undo'), icon: 'undo-2', onclick: undo } })

	function favourite() {
		if (!place) return
		// read before the write: the place is derived from the store and has changed by the time the toast is made
		const { name, favourite: was } = place
		const { undo } = meadow.setFavourite(place.id, !was)
		undoable(
			$t(was ? 'domains.places.toast.unfavourited' : 'domains.places.toast.favourited', { values: { name } }),
			undo
		)
	}

	let logging = $state(false)
	let rating = $state<number>()
	let note = $state('')
	function log() {
		if (!place) return
		const { undo } = meadow.logVisit(place.id, { day: todayIso(), rating: rating as Visit['rating'], note })
		undoable($t('domains.places.toast.visited', { values: { name: place.name } }), undo)
		logging = false
		rating = undefined
		note = ''
	}
</script>

<Sheet
	bind:open
	labelledby="{uid}-name"
	onclose={() => {
		placeId = undefined
		logging = false
		onclose?.()
	}}
>
	{#snippet header()}
		<div class="head">
			<h2 class="title" id="{uid}-name">{place?.name ?? ''}</h2>
			{#if place}
				<IconButton
					icon="heart"
					label={$t(place.favourite ? 'domains.places.detail.unfavourite' : 'domains.places.detail.favourite')}
					pressed={place.favourite}
					onclick={favourite}
				/>
			{/if}
		</div>
	{/snippet}
	{#if place}
		<div class="body">
			{#if meadow.image(place)}<img class="banner" src={meadow.image(place)} alt="" />{/if}
			<p class="meta">
				{[
					categoryName(place.category),
					priceLabel(place.price),
					km === undefined
						? ''
						: $t('domains.places.detail.distance', {
								values: { distance: distanceLabel(km, settings.measurement === 'imperial' ? 'mi' : 'km') },
							}),
				]
					.filter(Boolean)
					.join(' · ')}
			</p>
			{#if place.addressLine || place.locality}
				<p class="meta">{[place.addressLine, place.locality].filter(Boolean).join(', ')}</p>
			{/if}
			{#if place.hours}
				<div class="hours">
					{#if isOpen !== undefined && place.hours.spec}
						<Chip
							label={$t(isOpen ? 'domains.places.detail.open' : 'domains.places.detail.closed')}
							tone={isOpen ? 'accent' : 'grey'}
							icon="clock"
						/>
						<span>
							{formatSpans(spansOn(place.hours.spec, now, timeZone)) || $t('domains.places.detail.closedToday')}
						</span>
					{:else if place.hours.text}
						<span>{place.hours.text}</span>
					{/if}
				</div>
				<p class="source">{$t('domains.places.detail.checkFirst')}</p>
			{/if}
			{#if place.vibes.length}
				<ul class="chips" aria-label={$t('domains.places.detail.vibes')}>
					{#each place.vibes as vibe (vibe)}
						<li><Chip label={vibeName(vibe)} /></li>
					{/each}
				</ul>
			{/if}
			{#if place.notes}<p class="notes">{place.notes}</p>{/if}
			{#if visits.length}
				<section class="visits" aria-labelledby="{uid}-visits">
					<h3 class="label" id="{uid}-visits">{$t('domains.places.detail.visits')}</h3>
					{#each visits as visit (visit.id)}
						<div class="visit">
							<span class="day">{formatDateOf(visit.day, lang)}</span>
							{#if visit.rating}
								<Rating readonly value={visit.rating} label={$t('domains.places.visit.rating')} />
							{/if}
							{#if visit.note}<span class="visit-note">{visit.note}</span>{/if}
						</div>
					{/each}
				</section>
			{/if}
			{#if logging}
				<form
					class="visit-form"
					onsubmit={(event) => {
						event.preventDefault()
						log()
					}}
				>
					<span class="label">{$t('domains.places.visit.rating')}</span>
					<Rating bind:value={rating} label={$t('domains.places.visit.rating')} />
					<Field
						label={$t('domains.places.visit.note')}
						placeholder={$t('domains.places.visit.notePlaceholder')}
						multiline
						rows={2}
						bind:value={note}
					/>
					<div class="actions">
						<Button label={$t('domains.places.visit.save')} variant="primary" type="submit" />
						<Button label={$t('common.cancel')} variant="quiet" onclick={() => (logging = false)} />
					</div>
				</form>
			{:else}
				<div class="actions">
					<Button
						label={$t('domains.places.detail.logVisit')}
						icon="check"
						variant="primary"
						onclick={() => (logging = true)}
					/>
					<Button
						label={$t('domains.places.detail.openInMaps')}
						icon="external-link"
						onclick={() => place && void openExternal(mapsLink(place, settings.mapsApp))}
					/>
				</div>
			{/if}
		</div>
	{/if}
</Sheet>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.title {
		flex: 1;
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.banner {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 7;
		object-fit: cover;
		border-radius: var(--ed-radius-control);
		background: var(--surface-2);
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
	.hours,
	.visit,
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.hours,
	.visit {
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
	.label {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		font-variation-settings: var(--ed-t-label-opsz);
	}
	.visits,
	.visit-form {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-2);
	}
	.visit-form :global(.ed-field) {
		align-self: stretch;
	}
	.day {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
	.visit-note {
		flex-basis: 100%;
		color: var(--text-secondary);
	}
</style>
