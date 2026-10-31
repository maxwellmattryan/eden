<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { plannedSessions, workoutLogs } from '../../sample-data.js'
	import History from './History.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Vigor/History',
		component: History,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Vigor’s History view: Friday’s planned Push A under Planned, then the logged workouts newest first under week headings from the week start (D-58). A row reads the template, the exercise count, RPE, duration and gym, with the day as its meta; the open log shows its sets in the pane on desktop. Each row’s menu deletes it, with undo.',
				},
			},
		},
		args: { onlog: fn(), ondelete: fn(), onsample: fn(), onnavigate: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof History>)}
	<History {...args} />
{/snippet}

<!-- Friday's Push A planned, then three weeks of logs; Monday's Pull A open with its sets -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true')
		const planned = within(canvas.getByRole('grid', { name: 'Planned' }))
		await expect(planned.getAllByRole('row')).toHaveLength(plannedSessions.length)
		await expect(planned.getByText('Fri 2 Oct · 18:00')).toBeVisible()
		const week = within(canvas.getByRole('grid', { name: 'Week of 28 Sep' }))
		await expect(week.getAllByRole('row')).toHaveLength(2)
		await expect(week.getByText('5 exercises · RPE 7 · 52 min · Castle Hill Fitness')).toBeVisible()
		const rows = canvas.getAllByRole('row').filter((row) => !row.closest('table'))
		await expect(rows).toHaveLength(plannedSessions.length + workoutLogs.length)
		if (canvas.queryByRole('complementary', { name: 'Pull A' })) {
			const pane = within(canvas.getByRole('complementary', { name: 'Pull A' }))
			await expect(pane.getByRole('table', { name: 'Sets in Pull A' })).toBeVisible()
			await expect(pane.getByText('Deadlift')).toBeVisible()
		}
	}}
/>

<!-- Nothing logged: the EmptyState with Log a workout and the sample-data link -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'Nothing logged yet' })).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Add sample data' }))
		await expect(args.onsample).toHaveBeenCalledTimes(1)
	}}
/>
