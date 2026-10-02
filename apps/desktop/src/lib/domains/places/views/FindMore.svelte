<script lang="ts">
	// "Find more" (D-128, D-132): the filter, as it stands, asked of the Gardener with a web search. A request a page
	// runs has no "can see" chip, so this says under its button what is sent, to whom and about what it costs, before
	// anything leaves; pressing the button is the consent, as Read is in a capture (D-86). With no key the saved
	// places still filter, and this says what finding new ones needs.
	import { Button, InlineError, Notice, Spinner } from '@eden/ui-kit'
	import { areaWords, meadow, type Availability } from '@eden/shared/domains/places'
	import { formatCost } from '@eden/shared/gardener'
	import { locale, t } from '@eden/shared/i18n'
	import { settingsUi } from '$lib/settings/settings-ui.svelte'

	const uid = $props.id()
	const lang = $derived($locale ?? 'en')
	let online = $state(typeof navigator === 'undefined' ? true : navigator.onLine)

	/** Who would answer and what it would cost, worked out again when the filter changes; the latest call wins. */
	let availability = $state<Availability>()
	let turn = 0
	$effect(() => {
		// what the estimate depends on: the filter, the area and what is saved
		void JSON.stringify(meadow.filter)
		void meadow.area
		void meadow.places.length
		const mine = ++turn
		const timer = setTimeout(() => {
			void meadow.availability(lang).then((answer) => {
				if (mine === turn) availability = answer
			})
		}, 400)
		return () => clearTimeout(timer)
	})

	const searching = $derived(meadow.search.status === 'searching')
	const blocked = $derived(availability && !availability.available ? availability.reason : undefined)
	const provider = $derived.by(() => {
		if (!availability?.available || !availability.provider) return ''
		const key = `settings.privacy.destinations.${availability.provider}`
		return $t(key) === key ? availability.provider : $t(key)
	})
	const failure = $derived.by(() => {
		if (meadow.search.status !== 'failed') return undefined
		const key = `domains.places.failure.${meadow.search.failure ?? 'network'}`
		const words = $t(key) === key ? $t('domains.places.failure.network') : $t(key)
		// the provider's own words, when it refused the search: they say what to change
		return meadow.search.detail ? `${words} ${meadow.search.detail}` : words
	})
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

<section class="find" aria-labelledby="{uid}-title">
	<h2 class="label" id="{uid}-title">{$t('domains.places.find.title')}</h2>
	{#if blocked === 'no-key'}
		<Notice
			title={$t('domains.places.find.noKey.title')}
			detail={$t('domains.places.find.noKey.detail')}
			action={{ label: $t('domains.places.find.openSettings'), onclick: () => settingsUi.show('gardener') }}
		/>
	{:else if blocked === 'off'}
		<p class="source">{$t('domains.places.find.off')}</p>
	{:else}
		{#if failure}
			<InlineError message={failure} onretry={() => meadow.discover(lang)} live />
		{/if}
		<div class="row">
			<Button
				label={$t(searching ? 'domains.places.find.searching' : 'domains.places.find.button')}
				icon="sparkles"
				variant="ai"
				disabled={searching || !online || blocked !== undefined || !availability}
				onclick={() => void meadow.discover(lang)}
			/>
			{#if searching}<Spinner size="sm" label={$t('domains.places.find.searchingWeb')} />{/if}
		</div>
		<p class="source">
			{#if !online}
				{$t('domains.places.find.offline')}
			{:else if blocked}
				{$t(`domains.places.failure.${blocked}`)}
			{:else if availability?.available}
				{$t('domains.places.find.sends', {
					values: {
						brief: meadow.brief(),
						area: areaWords(meadow.area),
						provider,
						cost: formatCost(availability.estimateUsd ?? 0),
					},
				})}
			{/if}
		</p>
	{/if}
	{#if meadow.search.unplaced.length}
		<p class="source">
			{$t('domains.places.find.unplaced', {
				values: { count: meadow.search.unplaced.length, names: meadow.search.unplaced.join(', ') },
			})}
		</p>
	{/if}
</section>

<style>
	.find {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.label {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		font-variation-settings: var(--ed-t-label-opsz);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.source {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
	}
</style>
