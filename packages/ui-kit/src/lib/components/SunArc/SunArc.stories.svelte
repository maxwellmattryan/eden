<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf, hasCanvas, pointAcross } from '../../../storybook/play.js'
	import { homeLatitude, skyToday } from '../../../stories/sample-data.js'
	import SunArc from './SunArc.svelte'

	/** A sample time (`HH:MM`) on the sample Wednesday, as an instant. */
	const at = (time: string) => {
		const [hour = 0, minute = 0] = time.split(':').map(Number)
		return Date.UTC(2026, 8, 30, hour, minute)
	}
	const sunrise = at(skyToday.sunrise)
	const sunset = at(skyToday.sunset)
	const labels = { sunrise: skyToday.sunrise, sunset: skyToday.sunset }
	const up = `The sun is up. It rose at ${skyToday.sunrise} and sets at ${skyToday.sunset}.`
	const before = `The sun rises at ${skyToday.sunrise} and sets at ${skyToday.sunset}.`
	const after = `The sun set at ${skyToday.sunset}.`
	/** An instant on the sample day's clock, `HH:MM`. */
	const clock = (instant: number) => new Date(instant).toISOString().slice(11, 16)

	const { Story } = defineMeta({
		title: 'Components/Data/SunArc',
		component: SunArc,
		tags: ['autodocs'],
		args: { sunrise, sunset, now: at(skyToday.lastGood), latitude: homeLatitude, labels, label: up },
		parameters: { layout: 'padded' },
	})
</script>

<!-- The sample Wednesday at 07:40: the sun a little above the horizon, eighteen minutes after it rose -->
<Story
	name="Morning"
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(await canvas.findByRole('img', { name: up })).toBeVisible()
		await expect(canvas.getByText(skyToday.sunrise)).toBeVisible()
		await expect(canvas.getByText(skyToday.sunset)).toBeVisible()
	}}
/>

<Story name="Noon" args={{ now: at('13:18') }} />

<Story name="Golden hour" args={{ now: at(skyToday.goldenHour) }} />

<!-- Beneath the horizon the sun is hollow, so the colour is not what says it is down -->
<Story name="After sunset" args={{ now: at('21:30'), label: after }} />

<Story name="Before sunrise" args={{ now: at('05:10'), label: before }} />

<!-- The wave is the place's and the season's: a midsummer day at 52° north climbs to 61° and never reaches night -->
<Story
	name="Long day"
	args={{
		sunrise: Date.UTC(2026, 5, 21, 3, 44),
		sunset: Date.UTC(2026, 5, 21, 20, 22),
		now: Date.UTC(2026, 5, 21, 12, 3),
		latitude: 52,
		labels: undefined,
	}}
/>

<!-- and its midwinter day barely clears the horizon, with a long night beneath every twilight -->
<Story
	name="Short day"
	args={{
		sunrise: Date.UTC(2026, 11, 21, 8, 4),
		sunset: Date.UTC(2026, 11, 21, 15, 54),
		now: Date.UTC(2026, 11, 21, 12, 0),
		latitude: 52,
		labels: undefined,
	}}
/>

<!-- Near the equator the sun goes almost straight up and straight down -->
<Story
	name="At the equator"
	args={{
		sunrise: Date.UTC(2026, 2, 20, 6, 4),
		sunset: Date.UTC(2026, 2, 20, 18, 10),
		now: Date.UTC(2026, 2, 20, 9, 0),
		latitude: 0,
		labels: undefined,
	}}
/>

<Story name="Without times" args={{ labels: undefined }} />

<!-- A narrow container keeps the times only while they have room beside each other -->
<Story name="Narrow">
	{#snippet template(args)}
		<div class="narrow"><SunArc {...args} /></div>
	{/snippet}
</Story>

<Story name="Short" args={{ height: 72 }} />

<!-- The pointer on the wave: the time of day there, the light, and the sun's elevation and bearing -->
<Story
	name="Reading the wave"
	args={{ format: clock }}
	play={async ({ canvasElement, userEvent }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await canvas.findByRole('img', { name: up })
		const chart = canvasElement.querySelector('.ed-canvas .ed-sun')!
		await expect(chart.querySelector('.ed-chart-tip')).toBeNull()
		await pointAcross(userEvent, chart, 0.5)
		// solar noon at Austin on 30 September: the sun due south, 57° up
		const tip = () => chart.querySelector('.ed-chart-tip')
		await expect(tip()).toHaveTextContent(`${clock((sunrise + sunset) / 2)} · Daylight`)
		await expect(tip()).toHaveTextContent('Elevation 57°')
		await expect(tip()).toHaveTextContent('Azimuth 180° S')
		// and the end of the day, deep in the night to the north
		await pointAcross(userEvent, chart, 0.97)
		await expect(tip()).toHaveTextContent('Night')
		await expect(tip()).toHaveTextContent('Elevation −6')
	}}
/>

<style>
	.narrow {
		width: calc(var(--space-8) * 5);
	}
</style>
