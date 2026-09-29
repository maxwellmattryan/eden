<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { skyAirQuality, skyDetails } from '../../../stories/sample-data.js'
	import LevelScale from './LevelScale.svelte'

	/** The US air quality index's bands, and the UV index's. */
	const AQI = [50, 100, 150, 200, 300, 500]
	const UV = [2, 5, 7, 10, 12]
	const air = `US air quality index ${skyAirQuality.index}, good`

	const { Story } = defineMeta({
		title: 'Components/Data/LevelScale',
		component: LevelScale,
		tags: ['autodocs'],
		args: { value: skyAirQuality.index, stops: AQI, label: air },
		parameters: { layout: 'padded' },
	})
</script>

<!-- The sample morning's air: 42 on the US index, in the first band -->
<Story
	name="Air quality"
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('img', { name: air })).toBeVisible()
	}}
/>

<Story name="Unhealthy" args={{ value: 168, label: 'US air quality index 168, unhealthy' }} />

<Story name="Beyond the scale" args={{ value: 640, label: 'US air quality index 640, hazardous' }} />

<!-- Five bands: the UV index -->
<Story name="UV index" args={{ value: skyDetails.uv, stops: UV, label: `UV index ${skyDetails.uv}, high` }} />
