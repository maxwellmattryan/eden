<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf, hasCanvas, pointAcross } from '../../../storybook/play.js'
	import { usageByGrade, usageDays } from '../../../stories/sample-data.js'
	import BarChart from './BarChart.svelte'
	import type { BarSeries } from './bars.js'

	const usd = (value: number) => `$${value.toFixed(2)}`
	const byGrade: BarSeries[] = [
		{ id: 'light', label: 'Light', values: usageByGrade.light },
		{ id: 'standard', label: 'Standard', values: usageByGrade.standard },
		{ id: 'deep', label: 'Deep', values: usageByGrade.deep },
	]
	const total: BarSeries[] = [
		{
			id: 'spend',
			label: 'Spend',
			values: usageDays.map((_, i) => byGrade.reduce((sum, series) => sum + series.values[i]!, 0)),
		},
	]
	const sentence = `Spend by day from ${usageDays[0]} to ${usageDays.at(-1)}, in dollars`
	// a year of days: far more buckets than labels have room for
	const year = Array.from({ length: 365 }, (_, i) => Math.round((Math.sin(i / 9) + 1.2) * 40) / 100)
	const yearLabels = year.map((_, i) => (i % 30 === 0 ? `d${i + 1}` : ''))

	const { Story } = defineMeta({
		title: 'Components/Data/BarChart',
		component: BarChart,
		tags: ['autodocs'],
		args: { series: total, labels: usageDays, format: usd, label: sentence },
		parameters: { layout: 'padded' },
	})
</script>

<!-- One series: what each of fourteen days came to. No legend, since the sentence and the axes say what it is -->
<Story
	name="Single series"
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(await canvas.findByRole('img', { name: sentence })).toBeVisible()
		await expect(canvas.queryByRole('list')).toBeNull()
		// the same figures stand as a table for a reader who cannot see the drawing
		await expect(canvas.getByRole('table', { name: sentence })).toBeInTheDocument()
		await expect(canvas.getByRole('rowheader', { name: usageDays[0]! })).toBeInTheDocument()
	}}
/>

<!-- Three series stacked from the floor, each named beside its swatch -->
<Story
	name="Stacked by grade"
	args={{ series: byGrade }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await canvas.findByRole('img', { name: sentence })
		const legend = canvas.getByRole('list')
		for (const series of byGrade) await expect(legend).toHaveTextContent(series.label)
		await expect(canvas.getAllByRole('columnheader')).toHaveLength(3)
	}}
/>

<!-- The pointer over the last day: the bar is read out above itself, each grade with its figure and their sum -->
<Story
	name="Reading a bar"
	args={{ series: byGrade }}
	play={async ({ canvasElement, userEvent }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await canvas.findByRole('img', { name: sentence })
		const plot = canvasElement.querySelector('.ed-canvas .ed-bars-plot')!
		await expect(plot.querySelector('.ed-chart-tip')).toBeNull()
		await pointAcross(userEvent, plot, 0.98)
		const tip = plot.querySelector('.ed-chart-tip')!
		await expect(tip).toHaveTextContent(usageDays.at(-1)!)
		for (const series of byGrade) {
			await expect(tip).toHaveTextContent(`${series.label} ${usd(series.values.at(-1)!)}`)
		}
		await expect(tip).toHaveTextContent(`Total ${usd(total[0]!.values.at(-1)!)}`)
		// and the first day, from the other end
		await pointAcross(userEvent, plot, 0.02)
		await expect(plot.querySelector('.ed-chart-tip')).toHaveTextContent(usageDays[0]!)
	}}
/>

<!-- Nothing spent yet: the floor and its zero, no bars -->
<Story name="Empty" args={{ series: [{ id: 'spend', label: 'Spend', values: usageDays.map(() => 0) }] }} />

<Story
	name="One bar"
	args={{ series: [{ id: 'spend', label: 'Spend', values: [2.84] }], labels: ['2026'], label: 'Spend by year' }}
/>

<!-- A year of days: the bars thin to hairlines and only the labels with room are written -->
<Story
	name="A year of days"
	args={{
		series: [{ id: 'spend', label: 'Spend', values: year }],
		labels: yearLabels,
		label: 'Spend by day over a year',
	}}
/>

<Story name="Short" args={{ height: 96, series: byGrade, legend: false }} />

<!-- A narrow container writes fewer labels and keeps every bar -->
<Story name="Narrow" args={{ series: byGrade }}>
	{#snippet template(args)}
		<div class="narrow"><BarChart {...args} /></div>
	{/snippet}
</Story>

<style>
	.narrow {
		width: calc(var(--space-8) * 7);
	}
</style>
