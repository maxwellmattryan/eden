<script lang="ts">
	// General: the language (D-20), the home every domain measures from (D-143), then the measurement system, the
	// week start and the clock every domain reads (D-58). Units and the clock show an example of the current choice, written by the formatters the domains use.
	// Date formats, timezone and work hours follow.
	import { Button, Segmented } from '@eden/ui-kit'
	import { formatAddress } from '@eden/shared/address'
	import { formatTime } from '@eden/shared/dates'
	import { home } from '@eden/shared/home'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { clockFormats, languages, measurementSystems, weekStarts } from '@eden/shared/types'
	import { distance, pressure, rainfall, speed } from '@eden/shared/weather'
	import { homeUi } from '@eden/shared/shell/home'
	import { settingsUi } from '@eden/shared/shell/settings'
	import SettingsRow from './SettingsRow.svelte'

	// half past six in the evening, on the device's own clock
	const SAMPLE_TIME = Date.parse('2026-01-01T18:30:00')

	const items = $derived([$t('settings.general.english'), $t('settings.general.japanese')])
	const selected = $derived(Math.max(0, languages.indexOf(settings.language)))
	const measurementItems = $derived([$t('settings.general.metric'), $t('settings.general.imperial')])
	const selectedMeasurement = $derived(Math.max(0, measurementSystems.indexOf(settings.measurement)))
	const weekStartItems = $derived([$t('settings.general.monday'), $t('settings.general.sunday')])
	const selectedWeekStart = $derived(Math.max(0, weekStarts.indexOf(settings.weekStart)))
	const clockItems = $derived([$t('settings.general.clock24'), $t('settings.general.clock12')])
	const selectedClock = $derived(Math.max(0, clockFormats.indexOf(settings.clock)))

	const measurementExample = $derived(
		[
			settings.measurement === 'imperial' ? '°F' : '°C',
			...[speed, pressure, distance, rainfall].map((convert) =>
				$t(`domains.weather.units.${convert(0, settings.measurement).unit}`)
			),
		].join(', ')
	)
	/** Where home is, in a line: its address, or its name while it has none. */
	const homeExample = $derived(
		home.chosen
			? formatAddress(home.current.address, { locale: settings.language }) || home.current.label
			: $t('settings.general.homeUnset')
	)
	/** One sheet at a time: Settings closes, and the home's sheet opens in its place. */
	function changeHome() {
		settingsUi.hide()
		homeUi.show()
	}
	const clockExample = $derived(formatTime(SAMPLE_TIME, { lang: settings.language, clock: settings.clock }))
</script>

<SettingsRow label={$t('settings.general.language')} help={$t('settings.general.languageHelp')}>
	<Segmented
		{items}
		{selected}
		label={$t('settings.general.language')}
		onchange={(index) => settings.setLanguage(languages[index] ?? 'en')}
	/>
</SettingsRow>

<SettingsRow label={$t('settings.general.home')} help={$t('settings.general.homeHelp')} example={homeExample}>
	<Button label={$t(home.chosen ? 'home.card.change' : 'home.card.set')} icon="house" onclick={changeHome} />
</SettingsRow>

<SettingsRow
	label={$t('settings.general.measurement')}
	help={$t('settings.general.measurementHelp')}
	example={measurementExample}
>
	<Segmented
		items={measurementItems}
		selected={selectedMeasurement}
		label={$t('settings.general.measurement')}
		onchange={(index) => settings.setMeasurement(measurementSystems[index] ?? 'metric')}
	/>
</SettingsRow>

<SettingsRow label={$t('settings.general.weekStart')} help={$t('settings.general.weekStartHelp')}>
	<Segmented
		items={weekStartItems}
		selected={selectedWeekStart}
		label={$t('settings.general.weekStart')}
		onchange={(index) => settings.setWeekStart(weekStarts[index] ?? 'monday')}
	/>
</SettingsRow>

<SettingsRow label={$t('settings.general.clock')} help={$t('settings.general.clockHelp')} example={clockExample}>
	<Segmented
		items={clockItems}
		selected={selectedClock}
		label={$t('settings.general.clock')}
		onchange={(index) => settings.setClock(clockFormats[index] ?? '24h')}
	/>
</SettingsRow>
