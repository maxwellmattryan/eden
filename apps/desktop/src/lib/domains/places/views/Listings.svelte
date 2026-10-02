<script lang="ts">
	// Meadow's Listings tab (product/domains/places.md): what is on in the days ahead that fits the owner's vibes,
	// found by the Gardener with a web search (D-132), each with why it fits and where it was read. Interested makes
	// a tentative `outing` Event and Going confirms it (D-133). The weekly search runs on Sunday on its own, with a
	// setting to turn it off (D-134); the foot of the page says so, and when the listings were last found.
	import { Button, Chip, EmptyState, InlineError, Notice, Spinner } from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import { formatAgo, formatEventTime, formatWeekdayOf, formatDateOf } from '@eden/shared/dates'
	import {
		areaWords,
		markOf,
		meadow,
		type Availability,
		type Listing,
		type OutingMark,
	} from '@eden/shared/domains/places'
	import { formatCost } from '@eden/shared/gardener'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { settingsUi } from '@eden/shared/shell/settings'
	import { undoToast } from '@eden/shared/shell'

	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })
	const listings = $derived(meadow.upcoming)
	const searching = $derived(meadow.listingSearch.status === 'searching')

	let availability = $state<Availability>()
	$effect(() => {
		void meadow.listings.length
		void meadow.listingsAvailability(lang).then((answer) => (availability = answer))
	})
	const blocked = $derived(availability && !availability.available ? availability.reason : undefined)
	const provider = $derived.by(() => {
		if (!availability?.available || !availability.provider) return ''
		const key = `settings.privacy.destinations.${availability.provider}`
		return $t(key) === key ? availability.provider : $t(key)
	})
	const failure = $derived.by(() => {
		if (meadow.listingSearch.status !== 'failed') return undefined
		const key = `domains.places.failure.${meadow.listingSearch.failure ?? 'network'}`
		const words = $t(key) === key ? $t('domains.places.failure.network') : $t(key)
		return meadow.listingSearch.detail ? `${words} ${meadow.listingSearch.detail}` : words
	})
	const found = $derived(
		meadow.listings.reduce<string | undefined>(
			(latest, listing) => (!latest || listing.foundAt > latest ? listing.foundAt : latest),
			undefined
		)
	)

	const when = (listing: Listing) =>
		listing.allDay
			? `${formatWeekdayOf(listing.startAt.slice(0, 10), lang, 'short')} ${formatDateOf(listing.startAt.slice(0, 10), lang)}`
			: formatEventTime(listing.startAt, format)

	function mark(listing: Listing, wanted: OutingMark) {
		const now = markOf(listing, meadow.outings)
		const next = now === wanted ? undefined : wanted
		const { undo } = meadow.markListing(listing.id, next)
		undoToast($t(`domains.places.listings.toast.${next ?? 'cleared'}`, { values: { title: listing.title } }), undo)
	}
</script>

<div class="body">
	{#if blocked === 'no-key'}
		<Notice
			title={$t('domains.places.find.noKey.title')}
			detail={$t('domains.places.listings.noKey')}
			action={{ label: $t('domains.places.find.openSettings'), onclick: () => settingsUi.show('gardener') }}
		/>
	{/if}
	{#if failure}
		<InlineError message={failure} onretry={() => meadow.findListings(lang)} live />
	{/if}

	{#if !listings.length && meadow.ready}
		<EmptyState
			title={$t('domains.places.listings.empty.title')}
			text={$t('domains.places.listings.empty.text')}
			action={blocked
				? undefined
				: {
						label: $t('domains.places.listings.find'),
						icon: 'sparkles',
						onclick: () => void meadow.findListings(lang),
					}}
		/>
	{:else}
		<ul class="listings" aria-label={$t('domains.places.tabs.listings')}>
			{#each listings as listing (listing.id)}
				{@const marked = markOf(listing, meadow.outings)}
				<li class="listing">
					<div class="head">
						<h2 class="title">{listing.title}</h2>
						<span class="when">{when(listing)}</span>
					</div>
					<p class="meta">{[listing.venueName, listing.category, listing.price].filter(Boolean).join(' · ')}</p>
					{#if listing.why}
						<div class="why">
							<Chip label={$t('domains.places.detail.why')} icon="sparkles" tone="ai" />
							<span>{listing.why}</span>
						</div>
					{/if}
					<p class="source">
						{$t('domains.places.listings.from', {
							values: { sources: listing.sources.map((source) => source.title || source.url).join(', ') },
						})}
					</p>
					<div class="actions">
						<Chip
							label={$t('domains.places.listings.interested')}
							icon="bookmark"
							tone="outline"
							selectable
							selected={marked === 'interested'}
							onselect={() => mark(listing, 'interested')}
						/>
						<Chip
							label={$t('domains.places.listings.going')}
							icon="calendar-plus"
							tone="outline"
							selectable
							selected={marked === 'going'}
							onselect={() => mark(listing, 'going')}
						/>
						<Button
							label={$t('domains.places.listings.open')}
							icon="external-link"
							variant="quiet"
							onclick={() => void openExternal(listing.url)}
						/>
					</div>
					{#if marked}
						<p class="source">{$t(`domains.places.listings.marked.${marked}`)}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if blocked !== 'no-key' && meadow.canFindListings}
		<div class="find">
			<div class="find-row">
				<!-- with nothing found yet the empty state carries the button, and this says what pressing it sends -->
				{#if listings.length || searching}
					<Button
						label={$t(searching ? 'domains.places.find.searching' : 'domains.places.listings.find')}
						icon="sparkles"
						variant="ai"
						disabled={searching || blocked !== undefined || !availability}
						onclick={() => void meadow.findListings(lang)}
					/>
				{/if}
				{#if searching}<Spinner size="sm" label={$t('domains.places.find.searchingWeb')} />{/if}
			</div>
			<p class="source">
				{#if blocked}
					{$t(`domains.places.failure.${blocked}`)}
				{:else if availability?.available}
					{$t('domains.places.listings.sends', {
						values: { area: areaWords(meadow.area), provider, cost: formatCost(availability.estimateUsd ?? 0) },
					})}
				{/if}
			</p>
		</div>
	{/if}

	<!-- when the listings are from, at the page's foot in secondary ink -->
	<p class="foot">
		{#if found}
			{$t('domains.places.listings.foundAt', { values: { when: formatAgo(found, lang, meadow.now) } })}
		{/if}
		{$t(settings.placesWeekly ? 'domains.places.listings.weeklyOn' : 'domains.places.listings.weeklyOff')}
	</p>
</div>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.listings {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
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
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
	}
	.title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		user-select: text;
	}
	.when {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
	.meta,
	.source,
	.foot {
		margin: 0;
		color: var(--text-secondary);
	}
	.meta {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.source,
	.foot {
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
	}
	.why {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
	}
	.actions,
	.find-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.find {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
</style>
