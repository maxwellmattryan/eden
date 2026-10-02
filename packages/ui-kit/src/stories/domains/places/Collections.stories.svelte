<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { meadowCollections } from '../../sample-data.js'
	import Collections from './Collections.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Meadow/Collections',
		component: Collections,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Meadow’s Collections view: named sets of places, each a list of its own, all on the page at once. Every saved place stands in a list at the side, and one dragged from it onto a collection joins it (D-106); the same move is in each row’s menu.',
				},
			},
		},
		args: { onnew: fn(), onadd: fn(), onaction: fn(), onopen: fn(), onnavigate: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Collections>)}
	<Collections {...args} />
{/snippet}

<!-- Two collections and every saved place beside them -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('tab', { name: 'Collections' })).toHaveAttribute('aria-selected', 'true')
		for (const collection of meadowCollections)
			await expect(canvas.getByRole('heading', { level: 2, name: collection.name })).toBeVisible()
	}}
/>

<!-- None yet -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('No collections yet')).toBeVisible()
		await userEvent.click(canvas.getAllByRole('button', { name: 'New collection' }).at(-1)!)
		await expect(args.onnew).toHaveBeenCalled()
	}}
/>
