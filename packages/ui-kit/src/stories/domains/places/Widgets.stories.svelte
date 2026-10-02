<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import Widgets from './Widgets.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Meadow/Widgets',
		component: Widgets,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Meadow’s two Garden tiles, both in the default Garden: `nearby-favorites`, the favourites nearest home, and `upcoming-listings`, what is on this weekend. The Garden’s own mockup shows them in place.',
				},
			},
		},
		args: { onopen: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Widgets>)}
	<Widgets {...args} />
{/snippet}

<!-- Three favourites by distance, and the weekend's two listings -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('region', { name: 'Favourites nearby' })).toBeVisible()
		await expect(canvas.getByRole('region', { name: 'This weekend' })).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Open the map' }))
		await expect(args.onopen).toHaveBeenCalledWith('nearby-favorites')
	}}
/>

<!-- Before anything is saved or found: each says its one line -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('Save a place and mark it a favourite.')).toBeVisible()
		await expect(canvas.getByText('Nothing found for the weekend yet.')).toBeVisible()
	}}
/>
