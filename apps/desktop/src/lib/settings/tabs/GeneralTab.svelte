<script lang="ts">
	// General: the language (D-20) and the temperature units (D-27). Date and time formats, timezone and work hours
	// follow.
	import { Segmented } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { languages, temperatureUnits } from '@eden/shared/types'
	import SettingsRow from './SettingsRow.svelte'

	const items = $derived([$t('settings.general.english'), $t('settings.general.japanese')])
	const selected = $derived(Math.max(0, languages.indexOf(settings.language)))
	const unitItems = $derived([$t('settings.general.celsius'), $t('settings.general.fahrenheit')])
	const selectedUnit = $derived(Math.max(0, temperatureUnits.indexOf(settings.units)))
</script>

<SettingsRow label={$t('settings.general.language')} help={$t('settings.general.languageHelp')}>
	<Segmented
		{items}
		{selected}
		label={$t('settings.general.language')}
		onchange={(index) => settings.setLanguage(languages[index] ?? 'en')}
	/>
</SettingsRow>

<SettingsRow label={$t('settings.general.units')} help={$t('settings.general.unitsHelp')}>
	<Segmented
		items={unitItems}
		selected={selectedUnit}
		label={$t('settings.general.units')}
		onchange={(index) => settings.setUnits(temperatureUnits[index] ?? 'celsius')}
	/>
</SettingsRow>
