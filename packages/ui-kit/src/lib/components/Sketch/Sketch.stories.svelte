<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, waitFor } from 'storybook/test'
	import Sketch from './Sketch.svelte'
	import { skyField } from '../../sketches/sky-field.js'
	import { skyMotif } from '../../../stories/sample-data.js'

	/** The backing store holds something: the sketch has drawn. */
	function painted(canvas: HTMLCanvasElement): boolean {
		const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
		for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true
		return false
	}
	const surface = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLCanvasElement>('canvas.ed-sketch')!

	const { Story } = defineMeta({
		title: 'Components/Brand/Sketch',
		component: Sketch,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'The kit’s one canvas. A sketch is a plain definition, `setup` and `draw`, in nannou’s shape; the component sizes the backing store, resolves the theme’s colours where it stands, drives the frames at no more than `fps`, rests while it is out of sight, and under reduced motion draws the sketch once as a still. It fills its container. The stories draw `skyField`, Sky’s motif: the wind as a flow field.',
				},
			},
		},
		args: { sketch: skyField, params: skyMotif, seed: 1, fps: 30 },
		argTypes: {
			seed: { control: { type: 'number' } },
			fps: { control: { type: 'range', min: 1, max: 60, step: 1 } },
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Sketch>)}
	<div style="height: calc(var(--space-8) * 4)"><Sketch {...args} /></div>
{/snippet}

<!-- Wednesday 07:40: a light wind from the south-south-east -->
<Story
	name="Light wind"
	{template}
	play={async ({ canvasElement }) => {
		const canvas = surface(canvasElement)
		await expect(canvas).toHaveAttribute('aria-hidden', 'true')
		await expect(canvas.width).toBeGreaterThan(0)
		// the streaks grow from nothing, so the first frames are empty
		await waitFor(() => expect(painted(canvas)).toBe(true))
	}}
/>

<!-- A steady wind from the west holds its line across the page -->
<Story name="Westerly" {template} args={{ params: { ...skyMotif, windFrom: 270, windSpeed: 32, windGust: 38 } }} />

<!-- Gusts far above the sustained wind: the streaks run unevenly -->
<Story name="Gusty" {template} args={{ params: { ...skyMotif, windFrom: 300, windSpeed: 22, windGust: 55 } }} />

<!-- Showers: the streaks lean down and thicken with the cloud -->
<Story name="Rain" {template} args={{ params: { ...skyMotif, cloudCover: 90, precipitation: 3.2 } }} />

<!-- A calm: the streaks wander, since there is no wind to hold them to a line -->
<Story name="Calm" {template} args={{ params: { ...skyMotif, windSpeed: 0, windGust: 0 } }} />

<!-- A sketch that says something carries a name and is an image -->
<Story
	name="Named"
	{template}
	args={{ label: 'A light wind from the south-south-east' }}
	play={async ({ canvasElement }) => {
		const canvas = surface(canvasElement)
		await expect(canvas).toHaveAttribute('role', 'img')
		await expect(canvas).toHaveAccessibleName('A light wind from the south-south-east')
	}}
/>

<!-- Held on the frame it reached -->
<Story name="Paused" {template} args={{ paused: true }} />
