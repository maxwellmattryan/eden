<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { meadowHome, meadowPlaces, meadowSuggestions } from '../../../stories/sample-data.js'
	import StaticGround from '../../../stories/domains/places/StaticGround.svelte'
	import PinLayer, { type MapPinData } from './PinLayer.svelte'

	const saved: MapPinData[] = meadowPlaces.map((place) => ({
		id: place.id,
		point: place.point,
		kind: 'saved',
		label: place.name,
	}))
	const found: MapPinData[] = meadowSuggestions.map((place) => ({
		id: place.id,
		point: place.point,
		kind: 'suggested',
		label: place.name,
	}))
	const home: MapPinData = { id: 'home', point: meadowHome.point, kind: 'home', label: meadowHome.name }

	const { Story } = defineMeta({
		title: 'Components/Data/PinLayer',
		component: PinLayer,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'The pins over a map (D-129). The map is whatever draws the ground under the layer; all the layer asks of it is `project`, and a `revision` that changes whenever the ground has moved. The pins are one tab stop with arrows between them, and the layer itself takes no pointer, so the ground under it still pans. The stories stand on a still drawing: Storybook never mounts a map.',
				},
			},
		},
		args: { pins: [home, ...saved], label: 'Places on the map', onselect: fn(), project: () => null },
	})
</script>

{#snippet template(args: ComponentProps<typeof PinLayer>)}
	<div style="position: relative; height: calc(var(--sheet-max) * 0.6)">
		<StaticGround>
			{#snippet children({ project, revision })}
				<PinLayer {...args} {project} {revision} />
			{/snippet}
		</StaticGround>
	</div>
{/snippet}

<!-- The saved places and home, each standing on its point -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const group = canvas.getByRole('group', { name: 'Places on the map' })
		await expect(group).toBeVisible()
		const pins = canvas.getAllByRole('button')
		await expect(pins).toHaveLength(saved.length + 1)
		// placed: no two pins share a spot
		await waitFor(() => {
			const spots = new Set(pins.map((pin) => pin.parentElement!.style.transform))
			expect(spots.size).toBe(pins.length)
		})
		// one tab stop for the lot
		await expect(pins.filter((pin) => pin.tabIndex === 0)).toHaveLength(1)
		await userEvent.click(canvas.getByRole('button', { name: saved[1]!.label }))
		await expect(args.onselect).toHaveBeenCalledWith(saved[1]!.id)
	}}
/>

<!-- One picked: it stands above its neighbours and holds the tab stop -->
<Story
	name="Selected"
	{template}
	args={{ selected: saved[2]!.id }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const pin = canvasOf(canvasElement).getByRole('button', { name: saved[2]!.label })
		await expect(pin).toHaveAttribute('aria-pressed', 'true')
		await waitFor(() => expect(pin.tabIndex).toBe(0))
	}}
/>

<!-- What the Gardener found, in its green among the saved -->
<Story name="With suggestions" {template} args={{ pins: [home, ...saved, ...found] }} />

<!-- No pins: an empty group, and the ground alone -->
<Story name="Empty" {template} args={{ pins: [] }} />
