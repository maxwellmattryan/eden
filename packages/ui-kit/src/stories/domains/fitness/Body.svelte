<script lang="ts">
	// Vigor's Body view (product/domains/fitness.md, "Surfaces"): the latest weight, the seven-day average and the goal
	// as three Stats with Set goal quietly beside them, the daily weights as a TrendChart with the average and the goal
	// as its two named references (D-117 reads the hovered day out), and the other metrics beneath, each with its
	// latest value, its day and Log. Log weight in the header opens Quick Log on Vigor's weight tab. Story-only.
	import { Button, EmptyState, Field, Select, Sheet, Stat, TrendChart, type PageHeaderAction } from '$lib/index.js'
	import VigorPage, { dayLabel } from './VigorPage.svelte'
	import { bodyMetrics, weightAverage, weightDays, weightGoal, weightGoalBy, weightSeries } from '../../sample-data.js'

	type Props = {
		/** No weight logged: no Stats, no chart, the empty state. */
		empty?: boolean
		/** The goal sheet open. */
		settingGoal?: boolean
		/** The metric sheet open, on this kind. */
		loggingMetric?: 'body-fat' | 'waist'
		onlogweight?: () => void
		onsave?: (form: string) => void
		onsample?: () => void
		onnavigate?: (id: string) => void
	}
	let { empty = false, settingGoal = false, loggingMetric, onlogweight, onsave, onsample, onnavigate }: Props = $props()

	const uid = $props.id()
	const latest = weightSeries.at(-1)!
	const one = (value: number) => value.toFixed(1)
	const goalDay = dayLabel(weightGoalBy).slice(4)
	const METRICS = [
		{ kind: 'body-fat' as const, label: 'Body fat', unit: '%' },
		{ kind: 'waist' as const, label: 'Waist', unit: 'cm' },
	]
	const others = METRICS.map((metric) => ({
		...metric,
		latest: bodyMetrics.find((entry) => entry.kind === metric.kind),
	}))

	// svelte-ignore state_referenced_locally
	let goalOpen = $state(settingGoal)
	let goal = $state({ target: one(weightGoal), by: `2026-${weightGoalBy}` })
	// svelte-ignore state_referenced_locally
	let metricOpen = $state(loggingMetric !== undefined)
	// svelte-ignore state_referenced_locally
	let metric = $state({ kind: loggingMetric ?? 'body-fat', value: '', date: '2026-09-30' })
	const metricUnit = $derived(METRICS.find((entry) => entry.kind === metric.kind)?.unit)

	const actions = $derived<PageHeaderAction[]>([{ label: 'Log weight', icon: 'gauge', onclick: onlogweight }])
</script>

<VigorPage tab="Body" {actions} {onnavigate}>
	{#snippet children(_platform)}
		{#if empty}
			<EmptyState
				title="No weight logged yet"
				text="Log a weight from anywhere with Quick Log; a week of them draws the trend and its seven-day average."
				action={{ label: 'Log weight', icon: 'gauge', onclick: onlogweight }}
				sample={{ onclick: onsample }}
			/>
		{:else}
			<div class="body">
				<div class="stats">
					<dl class="figures">
						<div class="figure">
							<dt>Latest</dt>
							<dd><Stat value={one(latest)} unit="kg" size="md" /></dd>
						</div>
						<div class="figure">
							<dt>7-day average</dt>
							<dd><Stat value={one(weightAverage)} unit="kg" size="md" /></dd>
						</div>
						<div class="figure">
							<dt>Goal</dt>
							<dd><Stat value={one(weightGoal)} unit="kg by {goalDay}" size="md" /></dd>
						</div>
					</dl>
					<Button label="Set goal" variant="quiet" onclick={() => (goalOpen = true)} />
				</div>
				<section class="card" aria-labelledby="{uid}-chart">
					<h2 class="card-title" id="{uid}-chart">Weight, last 30 days</h2>
					<TrendChart
						values={weightSeries}
						labels={weightDays.map((day) => dayLabel(day).slice(4))}
						format={one}
						height={176}
						extremes={false}
						label="Weight, last 30 days, from {one(weightSeries[0]!)} to {one(latest)} kg"
						references={[
							{ value: weightAverage, label: `average ${one(weightAverage)}` },
							{ value: weightGoal, label: `goal ${one(weightGoal)}` },
						]}
					/>
				</section>
				<section class="card" aria-labelledby="{uid}-others">
					<h2 class="card-title" id="{uid}-others">Other metrics</h2>
					<ul class="metrics">
						{#each others as entry (entry.kind)}
							<li class="metric">
								<span class="metric-name">{entry.label}</span>
								<span class="metric-value">{entry.latest ? `${one(entry.latest.value)} ${entry.unit}` : '—'}</span>
								<span class="metric-day">{entry.latest ? dayLabel(entry.latest.day) : ''}</span>
								<Button
									label="Log"
									aria-label="Log {entry.label.toLowerCase()}"
									variant="quiet"
									icon="plus"
									onclick={() => {
										metric = { kind: entry.kind, value: '', date: '2026-09-30' }
										metricOpen = true
									}}
								/>
							</li>
						{/each}
					</ul>
				</section>
			</div>
		{/if}

		<Sheet bind:open={goalOpen} size="sm" labelledby="{uid}-goal-title">
			{#snippet header()}
				<h2 class="form-title" id="{uid}-goal-title">Set a goal</h2>
			{/snippet}
			<form
				class="form"
				id="{uid}-goal"
				onsubmit={(event) => {
					event.preventDefault()
					onsave?.('goal')
					goalOpen = false
				}}
			>
				<Field label="Target weight" unit="kg" bind:value={goal.target} mono inputmode="decimal" />
				<Field label="By" type="date" bind:value={goal.by} />
			</form>
			{#snippet footer()}
				<Button label="Cancel" variant="quiet" onclick={() => (goalOpen = false)} />
				<Button
					label="Save"
					variant="primary"
					type="submit"
					form="{uid}-goal"
					disabled={!(Number(goal.target) > 0) || !goal.by}
				/>
			{/snippet}
		</Sheet>

		<Sheet bind:open={metricOpen} size="sm" labelledby="{uid}-metric-title">
			{#snippet header()}
				<h2 class="form-title" id="{uid}-metric-title">Log a metric</h2>
			{/snippet}
			<form
				class="form"
				id="{uid}-metric"
				onsubmit={(event) => {
					event.preventDefault()
					onsave?.('metric')
					metricOpen = false
				}}
			>
				<Select
					label="Kind"
					options={METRICS.map((entry) => ({ value: entry.kind, label: entry.label }))}
					bind:value={metric.kind}
				/>
				<Field label="Value" unit={metricUnit} bind:value={metric.value} mono inputmode="decimal" />
				<Field label="Date" type="date" bind:value={metric.date} />
			</form>
			{#snippet footer()}
				<Button label="Cancel" variant="quiet" onclick={() => (metricOpen = false)} />
				<Button
					label="Save"
					variant="primary"
					type="submit"
					form="{uid}-metric"
					disabled={!(Number(metric.value) > 0)}
				/>
			{/snippet}
		</Sheet>
	{/snippet}
</VigorPage>

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
	.form-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
