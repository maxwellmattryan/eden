<script lang="ts">
	// Integrations, as far as it is built (product/substrate/settings-utilities.md): Sky's forecast provider (D-56)
	// and the sources beside it. The choice is offered only where more than one provider can run, so a platform
	// without WeatherKit sees no disabled option, only what Sky uses. The catalog with connect and disconnect follows.
	import { onMount } from 'svelte'
	import { Segmented } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import {
		airQualitySources,
		availableProviders,
		providerFor,
		weather,
		type ForecastProvider,
	} from '@eden/shared/weather'
	import SettingsRow from './SettingsRow.svelte'

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

<style>
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
