<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { skyToday } from '../../../stories/sample-data.js'
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

	const { Story } = defineMeta({
		title: 'Components/Data/SunArc',
		component: SunArc,
		tags: ['autodocs'],
		args: { sunrise, sunset, now: at(skyToday.lastGood), labels, label: up },
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

<!-- The horizon sinks through the wave in summer and rises in winter: the wave itself is the same -->
<Story name="Long day" args={{ sunrise: at('05:30'), sunset: at('20:36'), now: at('13:03'), labels: undefined }} />

<Story name="Short day" args={{ sunrise: at('08:10'), sunset: at('16:20'), now: at('12:15'), labels: undefined }} />

<Story name="Without times" args={{ labels: undefined }} />

<!-- A narrow container keeps the times only while they have room beside each other -->
<Story name="Narrow">
	{#snippet template(args)}
		<div class="narrow"><SunArc {...args} /></div>
	{/snippet}
</Story>

<Story name="Short" args={{ height: 72 }} />

<style>
	.narrow {
		width: calc(var(--space-8) * 5);
	}
</style>
