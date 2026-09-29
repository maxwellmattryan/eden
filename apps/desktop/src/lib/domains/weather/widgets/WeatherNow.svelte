<script lang="ts">
	// The weather-now tile: the current reading, the same one the Sky page's Now block shows; offline, when it is from.
	import { SkyGlyph, Stat, useStrings } from '@eden/ui-kit'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { formatTime } from '@eden/shared/dates'
	import { conditionLabel, weather } from '@eden/shared/weather'

	const s = useStrings()
	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock, timeZone: weather.timeZone })
</script>

{#if weather.now}
	<div class="now">
		<SkyGlyph condition={weather.now.condition} night={weather.now.night} size="lg" class="now-glyph" />
		<Stat
			value="{weather.temperature(weather.now.temp)}°"
			unit={conditionLabel(s, weather.now.condition, weather.now.night)}
		/>
	</div>
	{#if weather.offline && weather.lastGood}
		<p class="meta">{$t('garden.lastUpdated', { values: { time: formatTime(weather.lastGood, format) } })}</p>
	{/if}
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
