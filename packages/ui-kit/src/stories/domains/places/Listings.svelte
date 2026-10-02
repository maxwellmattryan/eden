<script lang="ts">
	// Meadow's Listings view (product/domains/places.md): what is on this weekend that fits the owner's vibes, found
	// by the Gardener with a web search (D-132), each saying why it fits and where it was read. Interested makes a
	// tentative outing and Going confirms it; both are Events the calendar will draw. The weekly search runs on
	// Sunday on its own (D-134), and the page's foot says when it last looked.
	import { Button, Chip, EmptyState, Notice, type PageHeaderAction } from '$lib/index.js'
	import MeadowPage from './MeadowPage.svelte'
	import { meadowListings, meadowSearch } from '../../sample-data.js'

	type Mark = 'interested' | 'going'
	type Props = {
		/** What the owner has said of each listing. */
		marks?: Record<string, Mark>
		empty?: boolean
		noProvider?: boolean
		onmark?: (id: string, mark: Mark | undefined) => void
		onopen?: (id: string) => void
		onfind?: () => void
		onsettings?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		marks = {},
		empty = false,
		noProvider = false,
		onmark,
		onopen,
		onfind,
		onsettings,
		onnavigate,
	}: Props = $props()

	const listings = $derived(
		empty ? [] : [...meadowListings].sort((a, b) => a.when.slice(4).localeCompare(b.when.slice(4)))
	)
	const actions = $derived<PageHeaderAction[]>(
		noProvider
			? []
			: [{ label: 'Find listings', icon: 'sparkles', variant: empty ? 'ai' : 'secondary', onclick: onfind }]
	)
	const set = (id: string, mark: Mark) => onmark?.(id, marks[id] === mark ? undefined : mark)
</script>

<MeadowPage tab="Listings" {actions} {onnavigate}>
	{#snippet children(_platform)}
		<div class="body">
			{#if noProvider}
				<Notice
					title="No key on this device"
					detail="Listings are found by the Gardener, which needs a key. Outings you already marked stay here."
					action={{ label: 'Open settings', onclick: onsettings }}
				/>
			{/if}
			{#if !listings.length}
				<EmptyState
					title="Nothing for the weekend yet"
					text="Meadow looks on Sunday for what is on that fits your vibes. You can look now."
					action={noProvider ? undefined : { label: 'Find listings', icon: 'sparkles', onclick: onfind }}
				/>
			{:else}
				<h2 class="heading">This weekend <span class="range">Thu 10-01 to Sun 10-04</span></h2>
				<ul class="listings">
					{#each listings as listing (listing.id)}
						{@const mark = marks[listing.id]}
						<li class="listing">
							<div class="head">
								<h3 class="title">{listing.title}</h3>
								<span class="when">{listing.when}</span>
							</div>
							<p class="meta">{listing.venue} · {listing.category} · {listing.price}</p>
							<div class="why">
								<Chip label="Why it fits" icon="sparkles" tone="ai" />
								<span>{listing.why}</span>
							</div>
							<p class="source">From {listing.sources.map((source) => source.title).join(', ')}.</p>
							<div class="actions">
								<Chip
									label="Interested"
									icon="bookmark"
									tone="outline"
									selectable
									selected={mark === 'interested'}
									onselect={() => set(listing.id, 'interested')}
								/>
								<Chip
									label="Going"
									icon="calendar-plus"
									tone="outline"
									selectable
									selected={mark === 'going'}
									onselect={() => set(listing.id, 'going')}
								/>
								<Button label="Open page" icon="external-link" variant="quiet" onclick={() => onopen?.(listing.id)} />
							</div>
							{#if mark}
								<p class="source">
									{mark === 'going' ? 'On your calendar as an outing.' : 'On your calendar as a tentative outing.'}
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if !noProvider}
				<p class="foot">
					Looked on Sunday 09-27 near {meadowSearch.area}. Meadow looks again every Sunday; a search costs about
					{meadowSearch.estimate}. Turn this off in Settings.
				</p>
			{/if}
		</div>
	{/snippet}
</MeadowPage>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.heading {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.range,
	.when {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
	.range {
		margin-left: var(--space-2);
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
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
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
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
</style>
