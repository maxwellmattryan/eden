<script lang="ts">
	// The sun-and-moon tile: today's light and the moon, computed on-device, in the place's time and on the owner's
	// clock (D-58); offline, when the light is from.
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import WidgetRows from '$lib/shell/WidgetRows.svelte'
	import { formatTime } from '@eden/shared/dates'
	import { weather } from '@eden/shared/weather'

	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock, timeZone: weather.timeZone })
	const rows = $derived(
		weather.sun
			? [
					{ id: 'sunrise', text: $t('garden.sunrise'), meta: formatTime(weather.sun.sunrise, format) },
					{ id: 'sunset', text: $t('garden.sunset'), meta: formatTime(weather.sun.sunset, format) },
					{ id: 'golden', text: $t('garden.goldenHour'), meta: formatTime(weather.sun.goldenHour, format) },
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
