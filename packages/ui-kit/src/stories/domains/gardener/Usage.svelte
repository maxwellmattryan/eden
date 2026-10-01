<script module lang="ts">
	/** Everything the page says. The kit's own strings come from UiKitProvider. */
	export const usageCopy = {
		name: 'Gardener',
		subtitle: 'Ask, log, run',
		tabs: ['Usage', 'Conversations', 'Audit log', 'Tools'],
		tabsLabel: 'Gardener pages',
		tiles: { month: 'This month', last30: 'Last 30 days', allTime: 'All time', requests: 'Requests this month' },
		ofCap: (cap: string, percent: number) => `of $${cap} · ${percent}%`,
		estimate: 'An estimate from the prices in Settings. The provider bills what it measured.',
		spend: 'Spend',
		periods: ['Day', 'Week', 'Month', 'Year'],
		periodsLabel: 'Spend by',
		chart: (from: string, to: string) => `Spend by day from ${from} to ${to}, in dollars, by grade`,
		grades: { light: 'Light', standard: 'Standard', deep: 'Deep' },
		byModel: 'By model',
		byTool: 'By what ran',
		columns: {
			model: 'Model',
			tool: 'Tool',
			requests: 'Requests',
			tokensIn: 'Tokens in',
			tokensOut: 'Tokens out',
			cost: 'Cost',
		},
		empty: {
			title: 'Nothing spent yet',
			text: 'What the Gardener costs shows here once it has answered something.',
		},
	}
</script>

<script lang="ts">
	// The Gardener's page, on its Usage tab (product/substrate/ai.md, "Budgets"; D-113, D-115): what this month, the
	// last thirty days and the whole came to, the spend over time stacked by grade, and where it went by model and by
	// what ran. Mocked from kit components under D-54; the app's page follows this composition. The figures are the
	// usage rollup's, which outlives the audit log's ninety days, and they are estimates from the owner's price table.
	import {
		BarChart,
		DataTable,
		EmptyState,
		PageHeader,
		Segmented,
		Stat,
		Widget,
		WidgetGrid,
		domainGlyph,
		type BarSeries,
	} from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import { usageByGrade, usageByModel, usageByTool, usageDays, usageTotals } from '../../sample-data.js'

	type Props = {
		/** Before the first request: no figures, one empty state. */
		empty?: boolean
		copy?: typeof usageCopy
		onnavigate?: (id: string) => void
		ontab?: (index: number) => void
	}
	let { empty = false, copy = usageCopy, onnavigate, ontab }: Props = $props()

	let period = $state(0)
	const usd = (value: number) => `$${value.toFixed(2)}`
	const series = $derived<BarSeries[]>([
		{ id: 'light', label: copy.grades.light, values: usageByGrade.light },
		{ id: 'standard', label: copy.grades.standard, values: usageByGrade.standard },
		{ id: 'deep', label: copy.grades.deep, values: usageByGrade.deep },
	])
</script>

<AppFrame current="gardener" {onnavigate}>
	<div class="page">
		<PageHeader name={copy.name} subtitle={copy.subtitle} icon={domainGlyph('gardener')}>
			{#snippet filters()}
				<Segmented items={copy.tabs} selected={0} label={copy.tabsLabel} onchange={ontab} />
			{/snippet}
		</PageHeader>

		{#if empty}
			<EmptyState title={copy.empty.title} text={copy.empty.text} />
		{:else}
			<WidgetGrid>
				<Widget title={copy.tiles.month} icon="calendar">
					<Stat value="${usageTotals.month}" unit={copy.ofCap(usageTotals.cap, usageTotals.percent)} />
				</Widget>
				<Widget title={copy.tiles.last30} icon="clock"><Stat value="${usageTotals.last30}" /></Widget>
				<Widget title={copy.tiles.allTime} icon="chart-column"><Stat value="${usageTotals.allTime}" /></Widget>
				<Widget title={copy.tiles.requests} icon="messages-square">
					<Stat value={String(usageTotals.requests)} />
				</Widget>
			</WidgetGrid>
			<p class="note">{copy.estimate}</p>

			<section class="card" aria-labelledby="usage-spend">
				<header class="card-head">
					<h2 id="usage-spend">{copy.spend}</h2>
					<Segmented items={copy.periods} bind:selected={period} label={copy.periodsLabel} />
				</header>
				<BarChart {series} labels={usageDays} format={usd} label={copy.chart(usageDays[0]!, usageDays.at(-1)!)} />
			</section>

			<div class="tables">
				<section class="table">
					<h2>{copy.byModel}</h2>
					<DataTable
						label={copy.byModel}
						columns={[
							{ label: copy.columns.model },
							{ label: copy.columns.requests, numeric: true },
							{ label: copy.columns.tokensIn, numeric: true },
							{ label: copy.columns.tokensOut, numeric: true },
							{ label: copy.columns.cost, numeric: true },
						]}
						rows={usageByModel.map((row) => [
							{ text: row.model, code: true },
							String(row.requests),
							row.tokensIn,
							row.tokensOut,
							row.cost,
						])}
					/>
				</section>
				<section class="table">
					<h2>{copy.byTool}</h2>
					<DataTable
						label={copy.byTool}
						columns={[
							{ label: copy.columns.tool },
							{ label: copy.columns.requests, numeric: true },
							{ label: copy.columns.cost, numeric: true },
						]}
						rows={usageByTool.map((row) => [row.tool, String(row.requests), row.cost])}
					/>
				</section>
			</div>
		{/if}
	</div>
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-6);
	}
	.note {
		margin: calc(-1 * var(--space-3)) 0 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
		background: var(--surface-1);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
	}
	.card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.card-head h2,
	.table h2 {
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
	}
	.tables {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(calc(var(--space-8) * 10), 1fr));
		gap: var(--space-6);
		align-items: start;
	}
	.table {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
</style>
