<script lang="ts">
	// The weight-trend tile (Domains/Vigor/Widgets): the latest weight, the last 14 daily weights as a sparkline over
	// the seven-day average, and the goal, in the owner's unit (D-58).
	import { Sparkline, Stat } from '@eden/ui-kit'
	import { formatDateOf } from '../../../dates/index.js'
	import { locale, t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { fitness } from '../store.svelte.js'
	import { toDisplay, unitOf } from '../units.js'

	const lang = $derived($locale ?? 'en')
	const system = $derived(settings.measurement)
	const unit = $derived(unitOf('weight', system))
	const shown = (value: number) => toDisplay('weight', value, system)
	const fortnight = $derived(fitness.weights.slice(-14))
	const average = $derived(fitness.average === undefined ? undefined : shown(fitness.average))
	const latest = $derived(fitness.latestWeight ? shown(fitness.latestWeight.value) : undefined)
</script>

{#if latest !== undefined}
	<Stat value={latest.toFixed(1)} {unit} />
	<Sparkline
		values={fortnight.map((weight) => shown(weight.value))}
		reference={average}
		labels={fortnight.map((weight) => formatDateOf(weight.day, lang))}
		format={(value) => `${value.toFixed(1)} ${unit}`}
		width={360}
		height={48}
		label={$t('domains.fitness.widgets.trendLabel', {
			values: { latest: latest.toFixed(1), unit, average: average?.toFixed(1) ?? '' },
		})}
		referenceLabel={$t('domains.fitness.widgets.averageLegend')}
	/>
	{#if fitness.goal}
		<p class="meta">
			{$t('domains.fitness.widgets.goalLine', {
				values: { target: shown(fitness.goal.target).toFixed(1), unit, date: formatDateOf(fitness.goal.by, lang) },
			})}
		</p>
	{/if}
{/if}

<style>
	.meta {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
