<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import Widgets from './Widgets.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Vigor/Widgets',
		component: Widgets,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Vigor’s four Garden tiles, none in the default Garden (added from the catalog, D-155): `this-week-training`, this calendar week’s sessions done or planned; `streak`, the run of weeks with a workout in sessions; `next-session`, the next planned one; `weight-trend`, the latest weight over a fortnight’s sparkline with the seven-day average as its reference, and the goal.',
				},
			},
		},
		args: { onopen: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Widgets>)}
	<Widgets {...args} />
{/snippet}

<!-- Each tile with the sample week: two done of three, a streak of six, Friday's Push A, 82.4 kg -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const week = within(canvas.getByRole('region', { name: 'This week' }))
		await expect(week.getByText('2 of 3 done')).toBeVisible()
		await expect(week.getAllByText('Done')).toHaveLength(2)
		await expect(within(canvas.getByRole('region', { name: 'Streak' })).getByText('6')).toBeVisible()
		await expect(within(canvas.getByRole('region', { name: 'Next session' })).getByText('Fri · 18:00')).toBeVisible()
		const weight = within(canvas.getByRole('region', { name: 'Weight trend' }))
		await expect(weight.getByText('Goal 80.0 kg by 31 Dec')).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Open body' }))
		await expect(args.onopen).toHaveBeenCalledWith('weight-trend')
	}}
/>

<!-- Nothing logged or planned: each tile says its prompt -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('Plan a session or log a workout to see your week.')).toBeVisible()
		await expect(canvas.getByText('Log a workout to start a streak.')).toBeVisible()
		await expect(canvas.getByText('Plan a session from a template.')).toBeVisible()
		await expect(canvas.getByText('Log a weight to start the trend.')).toBeVisible()
	}}
/>
