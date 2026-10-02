<script lang="ts">
	// Integrations, as far as it is built (product/substrate/settings-utilities.md): Sky's forecast provider (D-56)
	// and the sources beside it. The choice is offered only where more than one provider can run, so a platform
	// without WeatherKit sees no disabled option, only what Sky uses. The catalog with connect and disconnect follows.
	import { onMount } from 'svelte'
	import { Segmented, Toggle } from '@eden/ui-kit'
	import { DETAIL_SOURCES } from '../../../domains/places/index.js'
	import { mapsApps } from '../../../types/index.js'
	import { t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import {
		airQualitySources,
		availableProviders,
		providerFor,
		weather,
		type ForecastProvider,
	} from '../../../weather/index.js'
	import SettingsRow from '../SettingsRow.svelte'

	let providers = $state<ForecastProvider[]>([])
	const items = $derived(providers.map((provider) => provider.name))
	const selected = $derived(
		Math.max(
			0,
			providers.findIndex((provider) => provider.id === settings.weatherProvider)
		)
	)
	const current = $derived(providerFor(providers.length > 1 ? settings.weatherProvider : 'open-meteo'))

	onMount(async () => {
		providers = await availableProviders()
	})

	// Meadow (product/domains/places.md, "Settings"): the sources that reach outside, each on until turned off
	const detailSources = DETAIL_SOURCES.filter((source) => source.destination !== undefined)
	const mapsItems = $derived(mapsApps.map((app) => $t(`settings.integrations.places.maps.${app}`)))

	function choose(index: number) {
		const provider = providers[index]
		if (!provider) return
		settings.setWeatherProvider(provider.id)
		void weather.load()
	}
</script>

{#if providers.length > 1}
	<SettingsRow
		label={$t('settings.integrations.weatherProvider')}
		help={$t('settings.integrations.weatherProviderHelp')}
	>
		<Segmented {items} {selected} label={$t('settings.integrations.weatherProvider')} onchange={choose} />
	</SettingsRow>
{/if}

<SettingsRow label={$t('settings.integrations.weatherSources')} help={$t('settings.integrations.weatherSourcesHelp')}>
	<ul class="sources">
		<li>{$t('domains.weather.sources.forecast', { values: { name: current.name } })}</li>
		{#each airQualitySources as source (source.id)}
			<li>{$t('domains.weather.sources.airQuality', { values: { name: source.name } })}</li>
		{/each}
		<li>{$t('domains.weather.sources.alerts')}</li>
	</ul>
</SettingsRow>

<SettingsRow
	label={$t('settings.integrations.places.discovery')}
	help={$t('settings.integrations.places.discoveryHelp')}
>
	<Toggle
		label={$t('settings.integrations.places.discovery')}
		checked={settings.placesDiscovery}
		onchange={(on) => settings.setPlacesDiscovery(on)}
	/>
</SettingsRow>
<SettingsRow label={$t('settings.integrations.places.weekly')} help={$t('settings.integrations.places.weeklyHelp')}>
	<Toggle
		label={$t('settings.integrations.places.weekly')}
		checked={settings.placesWeekly}
		disabled={!settings.placesDiscovery}
		onchange={(on) => settings.setPlacesWeekly(on)}
	/>
</SettingsRow>
<SettingsRow label={$t('settings.integrations.places.details')} help={$t('settings.integrations.places.detailsHelp')}>
	<div class="toggles">
		{#each detailSources as source (source.id)}
			<Toggle
				label={$t(`settings.integrations.places.sources.${source.id}`)}
				checked={!settings.placesDetailsOff.includes(source.id)}
				onchange={(on) => settings.setPlacesDetail(source.id, on)}
			/>
		{/each}
	</div>
</SettingsRow>
<SettingsRow label={$t('settings.integrations.places.mapsApp')} help={$t('settings.integrations.places.mapsAppHelp')}>
	<Segmented
		items={mapsItems}
		selected={mapsApps.indexOf(settings.mapsApp)}
		label={$t('settings.integrations.places.mapsApp')}
		onchange={(index) => settings.setMapsApp(mapsApps[index] ?? settings.systemMapsApp())}
	/>
</SettingsRow>

<style>
	.toggles {
		display: grid;
		gap: var(--space-2);
	}
	.sources {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		color: var(--text-primary);
	}
</style>
