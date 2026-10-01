<script lang="ts">
	// What the Gardener came to (product/substrate/ai.md, "Budgets"; docs/design/screens.md, `gardener-usage`; D-115):
	// this month against the cap, the last thirty days and the whole, then the spend over time stacked by grade, by
	// the day, the week, the month or the year, and where it went over that stretch: by model, by grade, by what ran.
	// The figures are the usage rollup's, which outlives the audit log's ninety days. They are this device's estimates
	// from the owner's price table: close to what the provider bills, never a statement of it. The page follows the
	// mock in the kit's Storybook (Domains/Gardener/Usage).
	import {
		BarChart,
		DataTable,
		EmptyState,
		InlineError,
		Notice,
		Segmented,
		Skeleton,
		Stat,
		Widget,
		WidgetGrid,
		type BarSeries,
		type DataTableCell,
	} from '@eden/ui-kit'
	import { addDays, dateIn } from '@eden/shared/dates'
	import {
		bucketsBetween,
		formatCost,
		formatUsd,
		queryUsage,
		rangeStart,
		SUBSTRATE,
		sumUsage,
		usageOf,
		type UsageDay,
		type UsageRow,
		type UsageSpan,
	} from '@eden/shared/gardener'
	import { locale, t } from '@eden/shared/i18n'
	import { manifestFor } from '$lib/domains'
	import { gardenerSetup } from '../setup.svelte'

	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
	const SPANS: readonly UsageSpan[] = ['day', 'week', 'month', 'year']
	const GRADES = ['light', 'standard', 'deep'] as const

	// every day's rows, read once: the rollup is small, and every figure on the page is a sum over it
	let days = $state<UsageDay[]>([])
	let ready = $state(false)
	let failed = $state(false)
	let span = $state(0)

	async function read() {
		try {
			const rows = await queryUsage({ groupBy: ['day', 'provider', 'model', 'grade', 'kind', 'domain', 'tool'] })
			days = rows.map(({ bucket, ...row }: UsageRow) => ({ ...row, day: bucket ?? '' }) as UsageDay)
			failed = false
		} catch {
			failed = true
		} finally {
			ready = true
		}
	}
	// read again when a request was just audited, which is what moves this month's spend
	$effect(() => {
		void gardenerSetup.spentThisMonth
		void read()
	})

	const today = dateIn(zone, Date.now())
	// cents under a dollar, so a morning's few requests do not read as nothing
	const money = (usd: number) => (usd > 0 ? formatCost(usd) : `$${formatUsd(0)}`)
	const number = $derived(new Intl.NumberFormat($locale ?? 'en'))
	const month = $derived(sumUsage(usageOf(days, { fromDay: `${today.slice(0, 7)}-01` })))
	const last30 = $derived(sumUsage(usageOf(days, { fromDay: addDays(today, -29) })))
	const allTime = $derived(sumUsage(days))
	const percent = $derived(
		gardenerSetup.capUsd > 0 ? Math.min(100, Math.round((month.costUsd / gardenerSetup.capUsd) * 100)) : 0
	)

	// The chart: the span's stretch up to today, a bar a bucket, the three grades stacked.
	const by = $derived(SPANS[span] ?? 'day')
	const from = $derived(
		rangeStart(
			today,
			by,
			days.reduce<string | undefined>((first, row) => (!first || row.day < first ? row.day : first), undefined)
		)
	)
	const buckets = $derived(bucketsBetween(from, today, by))
	const series = $derived.by<BarSeries[]>(() => {
		const rows = usageOf(days, { fromDay: from, groupBy: [by, 'grade'] })
		return GRADES.map((grade) => ({
			id: grade,
			label: $t(`settings.gardener.grades.${grade}`),
			values: buckets.map((bucket) => rows.find((row) => row.bucket === bucket && row.grade === grade)?.costUsd ?? 0),
		}))
	})
	// a day and a week are named by their month and day, a month by its year and month, a year by itself
	const bucketLabel = (bucket: string) => (by === 'day' || by === 'week' ? bucket.slice(5) : bucket)
	const chartLabel = $derived(
		$t('gardenerPage.usage.chart', {
			values: {
				period: $t(`gardenerPage.usage.periods.${by}`),
				from: buckets[0] ?? today,
				to: buckets.at(-1) ?? today,
			},
		})
	)

	// Where it went, over the chart's stretch, the dearest first.
	const dearest = (a: UsageRow, b: UsageRow) => b.costUsd - a.costUsd || b.requests - a.requests
	const byModel = $derived(usageOf(days, { fromDay: from, groupBy: ['model'] }).sort(dearest))
	const byGrade = $derived(usageOf(days, { fromDay: from, groupBy: ['grade'] }).sort(dearest))
	const byTool = $derived(usageOf(days, { fromDay: from, groupBy: ['domain', 'tool'] }).sort(dearest))
	const figures = (row: UsageRow): (string | DataTableCell)[] => [
		number.format(row.requests),
		number.format(row.tokensIn + row.cacheRead + row.cacheWrite),
		number.format(row.tokensOut),
		formatCost(row.costUsd),
	]
	const figureColumns = $derived([
		{
			label: $t('gardenerPage.usage.columns.requests'),
			numeric: true,
			hint: $t('gardenerPage.usage.hints.requests'),
		},
		{
			label: $t('gardenerPage.usage.columns.tokensIn'),
			numeric: true,
			hint: $t('gardenerPage.usage.hints.tokensIn'),
		},
		{
			label: $t('gardenerPage.usage.columns.tokensOut'),
			numeric: true,
			hint: $t('gardenerPage.usage.hints.tokensOut'),
		},
		{ label: $t('audit.columns.cost'), numeric: true, hint: $t('gardenerPage.usage.hints.cost') },
	])
	/** Who a tool is from: Eden for the substrate's, the domain by its name. */
	function ownerOf(domain: string | null): string {
		if (!domain || domain === SUBSTRATE) return $t('gardener.tool.substrate')
		const manifest = manifestFor(domain)
		return manifest ? $t(manifest.name) : domain
	}
</script>

<div class="body">
	{#if failed}
		<InlineError message={$t('gardenerPage.usage.error')} onretry={read} live />
	{:else if !ready}
		<Skeleton rows={4} icon={false} />
	{:else if !days.length}
		<EmptyState title={$t('gardenerPage.usage.empty.title')} text={$t('gardenerPage.usage.empty.text')} />
	{:else}
		{#if gardenerSetup.clamped}
			<Notice
				tone="info"
				title={$t('gardener.devClamp', {
					values: { model: gardenerSetup.map.light.model, deep: gardenerSetup.map.deep.model },
				})}
			/>
		{/if}
		<WidgetGrid>
			<Widget title={$t('gardenerPage.usage.tiles.month')} icon="calendar">
				<Stat
					value={money(month.costUsd)}
					unit={$t('gardenerPage.usage.ofCap', { values: { cap: formatUsd(gardenerSetup.capUsd), percent } })}
				/>
			</Widget>
			<Widget title={$t('gardenerPage.usage.tiles.last30')} icon="clock">
				<Stat value={money(last30.costUsd)} />
			</Widget>
			<Widget title={$t('gardenerPage.usage.tiles.allTime')} icon="chart-column">
				<Stat value={money(allTime.costUsd)} />
			</Widget>
			<Widget title={$t('gardenerPage.usage.tiles.requests')} icon="messages-square">
				<Stat value={number.format(month.requests)} />
			</Widget>
		</WidgetGrid>
		<p class="quiet">{$t('gardenerPage.usage.estimate')}</p>

		<section class="card" aria-labelledby="gardener-usage-spend">
			<header class="card-head">
				<h2 id="gardener-usage-spend">{$t('gardenerPage.usage.spend')}</h2>
				<Segmented
					items={SPANS.map((id) => $t(`gardenerPage.usage.periods.${id}`))}
					bind:selected={span}
					label={$t('gardenerPage.usage.periodsLabel')}
				/>
			</header>
			<BarChart {series} labels={buckets.map(bucketLabel)} format={money} label={chartLabel} />
		</section>

		<div class="tables">
			<section class="table">
				<h2>{$t('gardenerPage.usage.byModel')}</h2>
				<DataTable
					label={$t('gardenerPage.usage.byModel')}
					columns={[{ label: $t('audit.columns.model'), hint: $t('audit.hints.model') }, ...figureColumns]}
					rows={byModel.map((row) => [{ text: row.model ?? '', code: true }, ...figures(row)])}
				/>
			</section>
			<section class="table">
				<h2>{$t('gardenerPage.usage.byGrade')}</h2>
				<DataTable
					label={$t('gardenerPage.usage.byGrade')}
					columns={[{ label: $t('audit.columns.grade'), hint: $t('audit.hints.grade') }, ...figureColumns]}
					rows={byGrade.map((row) => [
						row.grade ? $t(`settings.gardener.grades.${row.grade}`) : $t('gardenerPage.usage.noGrade'),
						...figures(row),
					])}
				/>
			</section>
			<section class="table">
				<h2>{$t('gardenerPage.usage.byTool')}</h2>
				<DataTable
					label={$t('gardenerPage.usage.byTool')}
					columns={[
						{ label: $t('gardenerPage.usage.columns.what'), hint: $t('gardenerPage.usage.hints.what') },
						{ label: $t('tools.columns.owner'), hint: $t('gardenerPage.usage.hints.from') },
						...figureColumns,
					]}
					rows={byTool.map((row) => [
						row.tool ? { text: row.tool, code: true } : $t('gardener.threads'),
						row.tool ? ownerOf(row.domain) : row.domain ? ownerOf(row.domain) : $t('gardener.global'),
						...figures(row),
					])}
				/>
			</section>
		</div>
		<p class="quiet">{$t('gardenerPage.usage.kept')}</p>
	{/if}
</div>

<style>
	.body {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.quiet {
		margin: calc(-1 * var(--space-3)) 0 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
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
		gap: var(--space-6);
		min-width: 0;
	}
	.table {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
</style>
