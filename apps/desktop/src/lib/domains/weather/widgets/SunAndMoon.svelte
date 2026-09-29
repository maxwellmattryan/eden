<script lang="ts">
	// The sun-and-moon tile: today's light and the moon, computed on-device; offline, when the light is from.
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import WidgetRows from '$lib/shell/WidgetRows.svelte'
	import { formatTime } from '@eden/shared/dates'
	import { weather } from '../store.svelte'

	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })
	const rows = $derived(
		weather.sun
			? [
					{ id: 'sunrise', text: $t('garden.sunrise'), meta: weather.sun.sunrise },
					{ id: 'sunset', text: $t('garden.sunset'), meta: weather.sun.sunset },
					{ id: 'golden', text: $t('garden.goldenHour'), meta: weather.sun.goldenHour },
					{
						id: 'moon',
						text: $t('garden.moon'),
						meta: $t('domains.weather.moonLine', {
							values: {
								phase: $t(`domains.weather.moonPhase.${weather.sun.moon.phase}`),
								percent: weather.sun.moon.illumination,
							},
						}),
					},
				]
			: []
	)
</script>

<WidgetRows {rows} />
{#if weather.offline && weather.lastGood}
	<p class="meta">{$t('garden.lastUpdated', { values: { time: formatTime(weather.lastGood, format) } })}</p>
{/if}

<style>
	.meta {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
