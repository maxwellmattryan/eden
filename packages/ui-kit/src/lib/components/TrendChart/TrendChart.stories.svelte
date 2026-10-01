<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf, hasCanvas, pointAcross } from '../../../storybook/play.js'
	import { skyHours, weightSeries } from '../../../stories/sample-data.js'
	import TrendChart from './TrendChart.svelte'

	const temps = skyHours.map((hour) => hour.temp)
	const hours = skyHours.map((hour) => hour.time)
	const sentence = `Temperature from ${hours[0]} to ${hours.at(-1)}, from ${temps[0]}° to ${temps.at(-1)}°`
	const degrees = (value: number) => `${value}°`

	const { Story } = defineMeta({
		title: 'Components/Data/TrendChart',
		component: TrendChart,
		tags: ['autodocs'],
		args: { values: temps, labels: hours, format: degrees, label: sentence },
		parameters: { layout: 'padded' },
	})
</script>

<!-- The sample Wednesday's temperature: a tick for every hour, as many hours written as have room -->
<Story
	name="Temperature"
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(await canvas.findByRole('img', { name: sentence })).toBeVisible()
		await expect(canvas.getByText(hours[0]!)).toBeVisible()
	}}
/>

<!-- The pointer over the last hour: the point is read out above itself, on a hairline down to its tick -->
<Story
	name="Reading a point"
	play={async ({ canvasElement, userEvent }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await canvas.findByRole('img', { name: sentence })
		const chart = canvasElement.querySelector('.ed-canvas .ed-trend')!
		await expect(chart.querySelector('.ed-chart-tip')).toBeNull()
		await pointAcross(userEvent, chart, 0.99)
		const tip = chart.querySelector('.ed-chart-tip')!
		await expect(tip).toHaveTextContent(hours.at(-1)!)
		await expect(tip).toHaveTextContent(degrees(temps.at(-1)!))
		await expect(chart.querySelector('.ed-trend-guide')).not.toBeNull()
	}}
/>

<Story
	name="Without labels"
	args={{ labels: [], values: weightSeries, format: undefined, label: 'Weight over 14 days' }}
/>

<Story name="Short" args={{ height: 72 }} />

<!-- Only the round hours named: the rest are ticks without words -->
<Story name="Round hours" args={{ labels: hours.map((hour, i) => (i % 4 === 0 ? hour : '')) }} />

<!-- Tens up the side: the scale runs from the ten below the lowest value to the ten above the highest -->
<Story name="In tens" args={{ step: 10, height: 144 }} />

<Story name="Without extremes" args={{ extremes: false, figures: 4 }} />

<!-- A narrow container writes fewer labels and keeps every tick -->
<Story name="Narrow">
	{#snippet template(args)}
		<div class="narrow"><TrendChart {...args} /></div>
	{/snippet}
</Story>

<Story name="Empty" args={{ values: [], labels: [], label: 'No data yet' }} />

<style>
	.narrow {
		width: calc(var(--space-8) * 7);
	}
</style>
