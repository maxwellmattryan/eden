<script lang="ts">
	// Vigor's Body tab, ported from Domains/Vigor/Body: the latest weight, the seven-day average and the goal as three
	// Stats with Set goal quietly beside them, the last 30 days' weights as a TrendChart with the average and the goal
	// as its references, and the other metrics, each with its latest value, its day and Log. Weights are kept in kg and
	// shown in the owner's system (D-58, D-177). With no weight there is the empty state alone.
	import { Button, EmptyState, Stat, TrendChart } from '@eden/ui-kit'
	import { addDays, formatDateOf, todayIso } from '../../../dates/index.js'
	import { locale, t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { dayOf } from '../progress.js'
	import { fitness } from '../store.svelte.js'
	import type { MetricKind } from '../types.js'
	import { toDisplay, unitOf } from '../units.js'
	import { dayLine } from '../words.js'

	type Props = {
		onlogweight: () => void
		onsetgoal: () => void
		onlogmetric: (kind: MetricKind) => void
		onsample: () => void
	}
	let { onlogweight, onsetgoal, onlogmetric, onsample }: Props = $props()

	const uid = $props.id()
	const lang = $derived($locale ?? 'en')
	const system = $derived(settings.measurement)
	const unit = $derived(unitOf('weight', system))
	const shown = (kind: MetricKind, value: number) => toDisplay(kind, value, system).toFixed(1)

	const month = $derived(fitness.weights.filter((weight) => weight.day >= addDays(todayIso(), -29)))
	const values = $derived(month.map((weight) => toDisplay('weight', weight.value, system)))
	const references = $derived([
		...(fitness.average === undefined
			? []
			: [
					{
						value: toDisplay('weight', fitness.average, system),
						label: $t('domains.fitness.body.referenceAverage', { values: { value: shown('weight', fitness.average) } }),
					},
				]),
		...(fitness.goal
			? [
					{
						value: toDisplay('weight', fitness.goal.target, system),
						label: $t('domains.fitness.body.referenceGoal', {
							values: { value: shown('weight', fitness.goal.target) },
						}),
					},
				]
			: []),
	])
	const OTHERS: MetricKind[] = ['body-fat', 'waist']
</script>

{#if !fitness.latestWeight}
	<EmptyState
		title={$t('domains.fitness.body.empty.title')}
		text={$t('domains.fitness.body.empty.text')}
		action={{ label: $t('domains.fitness.body.logWeight'), icon: 'gauge', onclick: onlogweight }}
		sample={{ onclick: onsample }}
	/>
{:else}
	<div class="body">
		<div class="stats">
			<dl class="figures">
				<div class="figure">
					<dt>{$t('domains.fitness.body.latest')}</dt>
					<dd><Stat value={shown('weight', fitness.latestWeight.value)} {unit} size="md" /></dd>
				</div>
				{#if fitness.average !== undefined}
					<div class="figure">
						<dt>{$t('domains.fitness.body.average')}</dt>
						<dd><Stat value={shown('weight', fitness.average)} {unit} size="md" /></dd>
					</div>
				{/if}
				<div class="figure">
					<dt>{$t('domains.fitness.body.goal')}</dt>
					<dd>
						{#if fitness.goal}
							<Stat
								value={shown('weight', fitness.goal.target)}
								unit={$t('domains.fitness.body.goalBy', {
									values: { unit, date: formatDateOf(fitness.goal.by, lang) },
								})}
								size="md"
							/>
						{:else}
							<span class="quiet">{$t('domains.fitness.body.noGoal')}</span>
						{/if}
					</dd>
				</div>
			</dl>
			<Button label={$t('domains.fitness.body.setGoal')} variant="quiet" onclick={onsetgoal} />
		</div>
		<section class="card" aria-labelledby="{uid}-chart">
			<h2 class="card-title" id="{uid}-chart">{$t('domains.fitness.body.chart')}</h2>
			<TrendChart
				{values}
				labels={month.map((weight) => formatDateOf(weight.day, lang))}
				titles={month.map((weight) => dayLine(weight.day, lang))}
				format={(value) => value.toFixed(1)}
				height={176}
				label={$t('domains.fitness.body.chartLabel', {
					values: {
						first: values[0]?.toFixed(1) ?? '',
						last: values.at(-1)?.toFixed(1) ?? '',
						unit,
					},
				})}
				{references}
			/>
		</section>
		<section class="card" aria-labelledby="{uid}-others">
			<h2 class="card-title" id="{uid}-others">{$t('domains.fitness.body.others')}</h2>
			<ul class="metrics">
				{#each OTHERS as kind (kind)}
					{@const latest = fitness.latestOf(kind)}
					{@const name = $t(`domains.fitness.body.kinds.${kind}`)}
					<li class="metric">
						<span class="metric-name">{name}</span>
						<span class="metric-value"
							>{latest
								? `${shown(kind, latest.value)} ${unitOf(kind, system)}`
								: $t('domains.fitness.body.notLogged')}</span
						>
						<span class="metric-day">{latest ? dayLine(dayOf(latest.at), lang) : ''}</span>
						<Button
							label={$t('domains.fitness.body.log')}
							aria-label={$t('domains.fitness.body.logKind', { values: { kind: name.toLowerCase() } })}
							variant="quiet"
							icon="plus"
							onclick={() => onlogmetric(kind)}
						/>
					</li>
				{/each}
			</ul>
		</section>
	</div>
{/if}

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.figures {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-6);
		margin: 0;
	}
	.figure {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.figure dt {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.figure dd {
		margin: 0;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
	}
	.card-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.metrics {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.metric {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto auto;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0;
	}
	.metric + .metric {
		border-top: 1px solid var(--stroke-subtle);
	}
	.metric-name {
		font: var(--ed-t-text);
	}
	.metric-value {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
	}
	.metric-day {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
	.quiet {
		color: var(--text-secondary);
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
</style>
