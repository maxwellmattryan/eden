<script lang="ts">
	// The weather-now tile: the current reading, the same one the Sky page's Now block shows, and how old it is.
	import { SkyGlyph, Stat, useStrings } from '@eden/ui-kit'
	import { locale, t } from '@eden/shared/i18n'
	import { conditionLabel, weather } from '@eden/shared/weather'
	import { updatedLine } from '$lib/domains/weather/updated'

	const s = useStrings()
	const lang = $derived($locale ?? 'en')
	const updated = $derived(updatedLine($t, lang))
</script>

{#if weather.now}
	<div class="now">
		<SkyGlyph condition={weather.now.condition} night={weather.now.night} size="lg" class="now-glyph" />
		<Stat
			value="{weather.temperature(weather.now.temp)}°"
			unit={conditionLabel(s, weather.now.condition, weather.now.night)}
		/>
	</div>
	{#if updated}<p class="meta">{updated}</p>{/if}
{/if}

<style>
	.now {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.now :global(.now-glyph) {
		color: var(--text-secondary);
	}
	.meta {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
