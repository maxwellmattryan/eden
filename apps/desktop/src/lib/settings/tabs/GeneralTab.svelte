<script lang="ts">
	// General: the language (D-20), then the measurement system, the week start and the clock every domain reads
	// (D-58). Date formats, timezone and work hours follow.
	import { Segmented } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { clockFormats, languages, measurementSystems, weekStarts } from '@eden/shared/types'
	import SettingsRow from './SettingsRow.svelte'

	const items = $derived([$t('settings.general.english'), $t('settings.general.japanese')])
	const selected = $derived(Math.max(0, languages.indexOf(settings.language)))
	const measurementItems = $derived([$t('settings.general.metric'), $t('settings.general.imperial')])
	const selectedMeasurement = $derived(Math.max(0, measurementSystems.indexOf(settings.measurement)))
	const weekStartItems = $derived([$t('settings.general.monday'), $t('settings.general.sunday')])
	const selectedWeekStart = $derived(Math.max(0, weekStarts.indexOf(settings.weekStart)))
	const clockItems = $derived([$t('settings.general.clock24'), $t('settings.general.clock12')])
	const selectedClock = $derived(Math.max(0, clockFormats.indexOf(settings.clock)))
</script>

<SettingsRow label={$t('settings.general.language')} help={$t('settings.general.languageHelp')}>
	<Segmented
		{items}
		{selected}
		label={$t('settings.general.language')}
		onchange={(index) => settings.setLanguage(languages[index] ?? 'en')}
	/>
</SettingsRow>

<SettingsRow label={$t('settings.general.measurement')} help={$t('settings.general.measurementHelp')}>
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

<SettingsRow label={$t('settings.general.clock')} help={$t('settings.general.clockHelp')}>
	<Segmented
		items={clockItems}
		selected={selectedClock}
		label={$t('settings.general.clock')}
		onchange={(index) => settings.setClock(clockFormats[index] ?? '24h')}
	/>
</SettingsRow>
