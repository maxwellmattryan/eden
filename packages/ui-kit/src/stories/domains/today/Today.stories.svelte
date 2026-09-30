<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { sidebar, todayHabit, todayRoutine, todayTasks } from '../../sample-data.js'
	import Today from './Today.svelte'

	const today = sidebar.items.find((entry) => entry.id === 'today')!
	const overdue = todayTasks.find((task) => task.state === 'overdue')!
	/** The rows in the page: grid rows on desktop, list items in the swipe rows on mobile. The navs' items sit outside main. */
	const rowsIn = (canvas: ReturnType<typeof canvasOf>) => {
		const main = within(canvas.getByRole('main'))
		return main.queryAllByRole('row').length + main.queryAllByRole('listitem').length
	}

	const { Story } = defineMeta({
		title: 'Domains/Today/Today',
		component: Today,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Today (product/substrate/tasks.md), the mirror of the page built in apps/desktop: the Quick Log strip with the enabled domains’ quick actions, the quick-add line that reads a todo, a routine or a habit from what is typed, then Overdue (closed until opened, its count in view), Due today, Routines and Habits, one list each. Done is Enter, a double-click or the first item of a row’s menu; a done row leaves with a collapse, a done routine stays struck through with its time. On mobile a swipe to the right is Done and a swipe to the left Delete.',
				},
			},
		},
		args: {
			onadd: fn(),
			ondone: fn(),
			ondelete: fn(),
			onopen: fn(),
			onaction: fn(),
			onquicklog: fn(),
			onsample: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Today>)}
	<Today {...args} />
{/snippet}

<!-- Wednesday: one overdue behind its chevron, the library card due, the morning routine done, the habit at 2 of 3 -->
<Story
	name="Wednesday"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('main')).toBeVisible()
		await expect(canvas.getByRole('heading', { level: 1, name: today.name })).toBeVisible()
		await expect(canvas.getByRole('navigation', { name: 'Quick Log' })).toBeVisible()
		await expect(canvas.getByRole('textbox', { name: 'Add a task, a routine or a habit' })).toBeVisible()
		for (const section of ['Overdue', 'Due today', 'Routines', 'Habits']) {
			await expect(canvas.getByRole('heading', { level: 2, name: section })).toBeVisible()
		}
		// Overdue is closed: its one row is counted, not shown
		await expect(canvas.getByRole('button', { name: 'Show overdue' })).toHaveAttribute('aria-expanded', 'false')
		await expect(canvas.queryByText(overdue.title)).toBeNull()
		await expect(rowsIn(canvas)).toBe(3)
		await expect(canvas.getByText(todayRoutine.doneAt)).toBeVisible()
		await expect(canvas.getByText(todayHabit.tally)).toBeVisible()
	}}
/>

<!-- Overdue open: the dentist since Monday, its day in the meta -->
<Story
	name="Overdue expanded"
	{template}
	args={{ overdueOpen: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('button', { name: 'Hide overdue' })).toHaveAttribute('aria-expanded', 'true')
		await expect(canvas.getByText(overdue.title)).toBeVisible()
		await expect(canvas.getByText(overdue.when)).toBeVisible()
		await expect(rowsIn(canvas)).toBe(4)
	}}
/>

<!-- Nothing to do: the EmptyState with the sample link; the strip and the quick-add line stay -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'Nothing due today' })).toBeVisible()
		await expect(canvas.getByRole('textbox', { name: 'Add a task, a routine or a habit' })).toBeVisible()
		await expect(rowsIn(canvas)).toBe(0)
	}}
/>

<!-- A line typed: the title and the day with its time as chips before it is saved -->
<Story
	name="Parsed quick-add"
	{template}
	args={{ typed: 'Call dentist tomorrow 3pm' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('textbox', { name: 'Add a task, a routine or a habit' })).toHaveValue(
			'Call dentist tomorrow 3pm'
		)
		await expect(canvas.getByText('Call dentist')).toBeVisible()
		await expect(canvas.getByText('Tomorrow 15:00')).toBeVisible()
	}}
/>
