<script lang="ts">
	// Appearance: theme, accent, font, density and the sidebar subtitles, every change applied to <html> at once
	// through the shared settings and persisted to the keys the pre-paint script reads. The accent row is a set of
	// selectable chips rather than the eventual picker (OQ-18).
	import { Chip, Segmented, Toggle, accents, type Accent } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { fontSettings, themeSettings } from '@eden/shared/types'
	import SettingsRow from './SettingsRow.svelte'

	const themeItems = $derived([
		$t('settings.appearance.light'),
		$t('settings.appearance.dark'),
		$t('settings.appearance.system'),
	])
	const fontItems = $derived([$t('settings.appearance.fontDefault'), $t('settings.appearance.fontSystem')])
	const themeIndex = $derived(Math.max(0, themeSettings.indexOf(settings.theme)))
	const fontIndex = $derived(Math.max(0, fontSettings.indexOf(settings.font)))
	const accentRows = $derived(accents.map((id: Accent) => ({ id, label: $t(`settings.appearance.accents.${id}`) })))
</script>

<SettingsRow label={$t('settings.appearance.theme')}>
	<Segmented
		items={themeItems}
		selected={themeIndex}
		label={$t('settings.appearance.theme')}
		onchange={(index) => settings.setTheme(themeSettings[index] ?? 'system')}
	/>
</SettingsRow>

<SettingsRow label={$t('settings.appearance.accent')}>
	<div class="accents" role="group" aria-label={$t('settings.appearance.accent')}>
		{#each accentRows as accent (accent.id)}
			<Chip
				label={accent.label}
				selectable
				selected={settings.accent === accent.id}
				onselect={(on) => on && settings.setAccent(accent.id)}
			/>
		{/each}
	</div>
</SettingsRow>

<SettingsRow label={$t('settings.appearance.font')}>
	<Segmented
		items={fontItems}
		selected={fontIndex}
		label={$t('settings.appearance.font')}
		onchange={(index) => settings.setFont(fontSettings[index] ?? 'default')}
	/>
</SettingsRow>

<Toggle
	label={$t('settings.appearance.density')}
	description={$t('settings.appearance.densityHelp')}
	checked={settings.density === 'compact'}
	onchange={(on) => settings.setDensity(on ? 'compact' : 'comfortable')}
/>

<Toggle
	label={$t('settings.appearance.subtitles')}
	description={$t('settings.appearance.subtitlesHelp')}
	checked={settings.subtitles}
	onchange={(on) => settings.setSubtitles(on)}
/>

<style>
	.accents {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
