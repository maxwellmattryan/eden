<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { sidebar, workoutTemplates } from '../../sample-data.js'
	import Workouts from './Workouts.svelte'

	const vigor = sidebar.items.find((entry) => entry.id === 'fitness')!
	const pushA = workoutTemplates[0]!

	const { Story } = defineMeta({
		title: 'Domains/Vigor/Workouts',
		component: Workouts,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Vigor’s Workouts view (product/domains/fitness.md), mocked from kit components. The header logs a workout and, quietly, makes a template; the five tabs sit beneath it. The templates list each one’s exercise count and estimated minutes; the open one shows in the detail pane on desktop (pushed on a narrow page, D-112) with its exercises at their target sets × reps, Start as the pane’s primary, Plan beside it and Edit and Delete in its menu. Start opens the log form prefilled from the template, a block of set rows per exercise; the template form orders exercises from the bundled library or a custom name; Plan asks for a date and a time.',
				},
			},
		},
		args: {
			onlog: fn(),
			onnew: fn(),
			onstart: fn(),
			onplan: fn(),
			onaction: fn(),
			onsave: fn(),
			onretry: fn(),
			onsample: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Workouts>)}
	<Workouts {...args} />
{/snippet}

<!-- The three templates; Push A open in the pane on desktop, with Start and Plan -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 1, name: vigor.name })).toBeVisible()
		await expect(canvas.getByRole('tab', { name: 'Workouts' })).toHaveAttribute('aria-selected', 'true')
		await expect(canvas.getAllByRole('tab')).toHaveLength(5)
		await expect(canvas.getByRole('button', { name: 'Log a workout' })).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'New template' })).toBeVisible()
		const list = within(canvas.getByRole('grid', { name: 'Templates' }))
		await expect(list.getAllByRole('row')).toHaveLength(workoutTemplates.length)
		await expect(list.getByText('5 exercises · 55 min')).toBeVisible()
		if (canvas.queryByRole('complementary', { name: pushA.title })) {
			const pane = within(canvas.getByRole('complementary', { name: pushA.title }))
			await expect(pane.getByRole('table', { name: `Exercises in ${pushA.title}` })).toBeVisible()
			await expect(pane.getByText('4 × 6')).toBeVisible()
			await userEvent.click(pane.getByRole('button', { name: 'Start' }))
			await expect(args.onstart).toHaveBeenCalledWith(pushA.id)
		}
	}}
/>

<!-- The phone with Push A pushed over the list, a back arrow to it -->
<Story
	name="Pushed"
	{template}
	args={{ pushed: true }}
	parameters={{ platforms: ['mobile'] }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('region', { name: pushA.title })).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Start' })).toBeVisible()
	}}
/>

<!-- Start on Push A: the log form, a block of set rows per exercise at the template's targets -->
<Story
	name="Log form"
	{template}
	args={{ logging: 'start' }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const page = within(canvasElement.ownerDocument.body)
		const sheet = within(await page.findByRole('dialog', { name: `Log ${pushA.title}` }))
		await waitFor(() => expect(sheet.getByLabelText('Date')).toBeVisible())
		await expect(sheet.getByLabelText('Date')).toHaveValue('2026-09-30')
		await expect(sheet.getByRole('combobox', { name: 'RPE' })).toBeVisible()
		await expect(sheet.getByRole('group', { name: 'Bench press' })).toBeVisible()
		await expect(sheet.getAllByRole('textbox', { name: 'Reps' })).toHaveLength(
			pushA.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
		)
		await expect(sheet.getByRole('button', { name: 'Save' })).toBeEnabled()
	}}
/>

<!-- New template: the title, the minutes and an ordered list of exercises from the library -->
<Story
	name="Template form"
	{template}
	args={{ editing: true }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const page = within(canvasElement.ownerDocument.body)
		const sheet = within(await page.findByRole('dialog', { name: 'Edit template' }))
		await waitFor(() => expect(sheet.getByRole('textbox', { name: 'Title' })).toBeVisible())
		await expect(sheet.getByRole('textbox', { name: 'Title' })).toHaveValue(pushA.title)
		const exercises = within(sheet.getByRole('list', { name: 'Exercises' }))
		await expect(exercises.getAllByRole('listitem')).toHaveLength(pushA.exercises.length)
		await expect(sheet.getByRole('button', { name: 'Move exercise 1 up' })).toBeDisabled()
		await expect(sheet.getByRole('button', { name: 'Add exercise' })).toBeVisible()
		await expect(sheet.getByRole('button', { name: 'Save' })).toBeEnabled()
	}}
/>

<!-- Plan on Push A: a date and a time, which make a workout-session Event -->
<Story
	name="Plan"
	{template}
	args={{ planning: true }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const page = within(canvasElement.ownerDocument.body)
		const sheet = within(await page.findByRole('dialog', { name: `Plan ${pushA.title}` }))
		await waitFor(() => expect(sheet.getByLabelText('Time')).toBeVisible())
		await expect(sheet.getByLabelText('Time')).toHaveValue('18:00')
	}}
/>

<!-- No templates: the EmptyState with New template and the sample-data link -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'No workouts yet' })).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Add sample data' }))
		await expect(args.onsample).toHaveBeenCalledTimes(1)
	}}
/>

<!-- A write failed: the InlineError with Retry above the body; every tab shows it in the same place -->
<Story
	name="Error"
	{template}
	args={{ error: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('alert')).toHaveTextContent('Vigor could not save your last change.')
		await userEvent.click(canvas.getByRole('button', { name: 'Retry' }))
		await expect(args.onretry).toHaveBeenCalledTimes(1)
		await expect(canvas.getByRole('grid', { name: 'Templates' })).toBeVisible()
	}}
/>
