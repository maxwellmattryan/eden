<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import CaptureSheet, { type CaptureRow } from './CaptureSheet.svelte'
	import Button from '../Button/Button.svelte'
	import { haul, stock } from '../../../stories/sample-data.js'

	// The sample haul as captured; a version where the first six rows already in stock merge; a short one to empty.
	const inStock = new Set<string>(stock.map((item) => item.name))
	const merging: CaptureRow[] = haul.rows.map((row, i) =>
		i < 6 && inStock.has(row.name) ? { ...row, merge: row.merge ?? row.name } : row
	)
	const few = haul.rows.slice(0, 3)
	// A neutral stand-in for the photo, so the img path renders without a binary asset.
	const image =
		'data:image/svg+xml,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#dcd8c8"/><circle cx="2" cy="1.5" r="0.6" fill="#c4c1b1"/></svg>'
		)
	const trigger = 'Open the capture'
	const title = 'Verify the haul'

	const { Story } = defineMeta({
		title: 'Components/Sheets/CaptureSheet',
		component: CaptureSheet,
		tags: ['autodocs'],
		parameters: { platformFrame: 'inline' },
		args: { provider: haul.provider, cost: haul.cost, rows: haul.rows, layout: 'auto', oncommit: fn(), onclose: fn() },
		argTypes: {
			layout: { control: 'inline-radio', options: ['auto', 'wide', 'stacked'] },
		},
	})
</script>

<script lang="ts">
	let open = $state(false)
</script>

{#snippet template(args: ComponentProps<typeof CaptureSheet>)}
	<Button label={trigger} onclick={() => (open = true)} />
	<CaptureSheet {...args} bind:open />
{/snippet}

<!-- Removing a row updates the footer's counts; Commit hands back the kept rows and closes -->
<Story
	name="Haul"
	args={{ oncommit: fn(), onclose: fn() }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		const dialog = await canvas.findByRole('dialog', { name: title })
		const list = canvas.getByRole('list', { name: 'Draft rows' })
		await expect(within(list).getAllByRole('listitem')).toHaveLength(haul.rows.length)
		const note = canvas.getByRole('status')
		await expect(note).toHaveTextContent('9 to create, 2 to merge')
		await userEvent.click(canvas.getByRole('button', { name: 'Remove Napkins' }))
		await expect(within(list).getAllByRole('listitem')).toHaveLength(haul.rows.length - 1)
		await expect(note).toHaveTextContent('8 to create, 2 to merge')
		await userEvent.click(canvas.getByRole('button', { name: 'Commit' }))
		await expect(args.oncommit).toHaveBeenCalledWith(haul.rows.filter((row) => row.id !== 'h-11'))
		await waitFor(() => expect(dialog).not.toBeVisible())
		await expect(args.onclose).not.toHaveBeenCalled()
	}}
/>

<!-- Merging rows sit on brand-muted with the stock item named; the location radios move with the arrow keys -->
<Story
	name="With merges"
	args={{ rows: merging, image }}
	{template}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		await canvas.findByRole('dialog', { name: title })
		await expect(canvas.getByRole('status')).toHaveTextContent('5 to create, 6 to merge')
		await expect(canvas.getAllByText('Merges with Eggs')).toHaveLength(1)
		const group = canvas.getByRole('radiogroup', { name: 'Location of Eggs' })
		const fridge = within(group).getByRole('radio', { name: 'Fridge' })
		await expect(fridge).toHaveAttribute('aria-checked', 'true')
		await userEvent.click(fridge)
		await userEvent.keyboard('{ArrowRight}')
		const freezer = within(group).getByRole('radio', { name: 'Freezer' })
		await expect(freezer).toHaveFocus()
		await expect(freezer).toHaveAttribute('aria-checked', 'true')
		await expect(fridge).toHaveAttribute('aria-checked', 'false')
		await userEvent.keyboard('{End}')
		await expect(within(group).getByRole('radio', { name: 'Counter' })).toHaveAttribute('aria-checked', 'true')
		await userEvent.keyboard('{Escape}')
	}}
/>

<!-- Once every row is removed the footer says so and Commit is disabled -->
<Story
	name="All removed"
	args={{ rows: few, oncommit: fn(), onclose: fn() }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		await canvas.findByRole('dialog', { name: title })
		for (const row of few) await userEvent.click(canvas.getByRole('button', { name: `Remove ${row.name}` }))
		await expect(canvas.getByRole('status')).toHaveTextContent('Every row was removed')
		await expect(canvas.getByRole('button', { name: 'Commit' })).toBeDisabled()
		await userEvent.click(canvas.getByRole('button', { name: 'Discard' }))
		await expect(args.onclose).toHaveBeenCalledTimes(1)
		await expect(args.oncommit).not.toHaveBeenCalled()
	}}
/>

<Story name="Mobile" args={{ image }} parameters={{ platforms: ['mobile'] }} {template} />
