<script lang="ts">
	// A place the Gardener found and the owner has not saved (D-133): its name, why it fits, the vibes the search
	// supports, its hours as a source wrote them, and where each thing was read. It is a mirror of this device and
	// goes in seven days; Save makes it the owner's, Dismiss puts it out of sight. Everything it says came from web
	// pages, so it says where from.
	import { Button, Chip, IconButton, Spinner } from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import {
		formatSpans,
		isOpenAt,
		mapsLink,
		meadow,
		priceLabel,
		spansOn,
		type Suggestion,
	} from '@eden/shared/domains/places'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { undoToast } from '$lib/shell/undo'
	import { categoryNamer, vibeNamer } from '../words'

	type Props = {
		suggestion: Suggestion
		closable?: boolean
		onclose?: () => void
		/** The place it became, once saved. */
		onsaved?: (id: string) => void
	}
	let { suggestion, closable = false, onclose, onsaved }: Props = $props()

	const uid = $props.id()
	const candidate = $derived(suggestion.candidate)
	const vibeName = $derived(vibeNamer($t, meadow.vibes))
	const categoryName = $derived(categoryNamer($t))
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

	const picture = $derived(meadow.foundPicture(suggestion.id))
	const hours = $derived(meadow.detail(suggestion.id, 'hours'))
	const read = $derived(hours?.status === 'ok' ? hours.data : undefined)
	const now = $derived(new Date(meadow.now))
	const open = $derived(read?.spec ? isOpenAt(read.spec, now, timeZone) : undefined)
	const sourceName = (id: string | undefined) => {
		const key = `domains.places.sources.${id}`
		return id && $t(key) !== key ? $t(key) : (id ?? '')
	}

	function save() {
		const { place, undo } = meadow.saveSuggestion(suggestion.id)
		if (!place) return
		undoToast($t('domains.places.toast.added', { values: { name: place.name } }), undo)
		onsaved?.(place.id)
	}
	function dismiss() {
		const { undo } = meadow.dismissSuggestion(suggestion.id)
		undoToast($t('domains.places.toast.dismissed', { values: { name: candidate.name } }), undo)
		onclose?.()
	}
</script>

<article class="detail" aria-labelledby="{uid}-name">
	{#if picture}<img class="banner" src={picture} alt="" />{/if}
	<div class="body">
		<div class="head">
			<h2 class="title" id="{uid}-name">{candidate.name}</h2>
			{#if closable}
				<IconButton icon="x" size="sm" label={$t('common.close')} onclick={onclose} />
			{/if}
		</div>
		<p class="meta">
			{[categoryName(candidate.category), priceLabel(candidate.price), candidate.addressLine, candidate.locality]
				.filter(Boolean)
				.join(' · ')}
		</p>
		{#if candidate.why}
			<div class="why">
				<Chip label={$t('domains.places.detail.why')} icon="sparkles" tone="ai" />
				<p class="notes">{candidate.why}</p>
			</div>
		{/if}
		{#if candidate.vibes.length || candidate.alcoholFree}
			<ul class="chips" aria-label={$t('domains.places.detail.vibes')}>
				{#each candidate.vibes as vibe (vibe)}
					<li><Chip label={vibeName(vibe)} tone="ai" /></li>
				{/each}
				{#if candidate.alcoholFree}
					<li><Chip label={$t('domains.places.filter.alcoholFree')} icon="wine-off" /></li>
				{/if}
			</ul>
		{/if}

		{#if meadow.asking(suggestion.id, 'hours')}
			<p class="source"><Spinner size="sm" label={$t('domains.places.detail.readingHours')} /></p>
		{:else if read}
			<div class="hours">
				{#if open !== undefined && read.spec}
					<Chip
						label={$t(open ? 'domains.places.detail.open' : 'domains.places.detail.closed')}
						tone={open ? 'accent' : 'grey'}
						icon="clock"
					/>
					<span>{formatSpans(spansOn(read.spec, now, timeZone)) || $t('domains.places.detail.closedToday')}</span>
				{:else}
					<span>{read.text}</span>
				{/if}
			</div>
			<p class="source">
				{$t('domains.places.detail.hoursFrom', { values: { source: sourceName(hours?.source) } })}
			</p>
		{:else if hours}
			<p class="source">{$t('domains.places.detail.noHours')}</p>
		{/if}

		<p class="source">
			{$t('domains.places.suggestion.from')}
			{#each candidate.sources as source, i (source.url)}
				{i ? ', ' : ''}<button class="link" type="button" onclick={() => void openExternal(source.url)}
					>{source.title || source.url}</button
				>
			{/each}. {$t('domains.places.suggestion.notSaved')}
		</p>

		<div class="actions">
			<Button label={$t('domains.places.suggestion.save')} icon="bookmark" variant="primary" onclick={save} />
			<Button label={$t('domains.places.suggestion.dismiss')} icon="x" onclick={dismiss} />
			<Button
				label={$t('domains.places.detail.openInMaps')}
				icon="external-link"
				onclick={() => void openExternal(mapsLink(candidate, settings.mapsApp))}
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
	.why {
		display: flex;
		flex-direction: column;
		align-items: start;
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
	.hours {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.link {
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--ed-radius-control);
		background: none;
		color: var(--text-primary);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.link:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
