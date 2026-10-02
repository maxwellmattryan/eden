<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { meadowVisits } from '../../sample-data.js'
	import Visits from './Visits.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Meadow/Visits',
		component: Visits,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Meadow’s Visits view: where the owner has been and what they thought, newest first. Each is a day, a rating out of five and a note.',
				},
			},
		},
		args: { onlog: fn(), onopen: fn(), onnavigate: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Visits>)}
	<Visits {...args} />
{/snippet}

<!-- Three visits, the latest first, each with its rating -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const list = within(canvas.getByRole('list', { name: 'Visits' }))
		await expect(list.getAllByRole('listitem')).toHaveLength(meadowVisits.length)
		await expect(list.getByRole('img', { name: 'Zilker Park: 5 of 5' })).toBeVisible()
		await userEvent.click(list.getByRole('button', { name: 'Zilker Park' }))
		await expect(args.onopen).toHaveBeenCalledWith('p-03')
	}}
/>

<!-- None yet -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		await expect(canvasOf(canvasElement).getByText('No visits yet')).toBeVisible()
	}}
/>
