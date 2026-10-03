<script lang="ts">
	// The sun-and-moon tile: today's light and the moon, computed on-device, in the place's time and on the owner's
	// clock (D-58), and how old the forecast it is read from is.
	import { locale, t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { WidgetRows } from '@eden/ui-kit'
	import { formatTime } from '../../../dates/index.js'
	import { weather } from '../../../weather/index.js'
	import { updatedLine } from '../updated.js'

	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock, timeZone: weather.timeZone })
	const updated = $derived(updatedLine($t, lang))
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
{#if updated}<p class="meta">{updated}</p>{/if}

<style>
	.meta {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
