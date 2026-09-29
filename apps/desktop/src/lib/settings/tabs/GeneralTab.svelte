<script lang="ts">
	// General: the language for now (D-20). Date and time formats, timezone, work hours and units (D-27) follow.
	import { Segmented } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { languages } from '@eden/shared/types'
	import SettingsRow from './SettingsRow.svelte'

	const items = $derived([$t('settings.general.english'), $t('settings.general.japanese')])
	const selected = $derived(Math.max(0, languages.indexOf(settings.language)))
</script>

<SettingsRow label={$t('settings.general.language')} help={$t('settings.general.languageHelp')}>
	<Segmented
		{items}
		{selected}
		label={$t('settings.general.language')}
		onchange={(index) => settings.setLanguage(languages[index] ?? 'en')}
	/>
</SettingsRow>
