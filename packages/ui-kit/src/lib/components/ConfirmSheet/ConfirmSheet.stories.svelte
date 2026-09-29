<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import ConfirmSheet from './ConfirmSheet.svelte'
	import Button from '../Button/Button.svelte'
	import { budget, grocery, recipes } from '../../../stories/sample-data.js'

	// A destructive local write, and the Gardener sending the shop day to a calendar outside the device.
	const del = {
		title: `Delete the recipe ‘${recipes[0].name}’?`,
		subject: 'You',
		resource: 'recipe',
		text: 'Its stock links will become text.',
		verb: 'Delete recipe',
		danger: true,
	}
	const send = {
		title: 'Send to Google?',
		subject: `Gardener · ${budget.model}`,
		resource: 'shop-day',
		destination: 'Google Calendar “Work”',
		payload: `Shop day\n${grocery.shopDay}\nH-E-B, 2400 S Congress`,
		verb: 'Send to Google',
		danger: false,
	}
	const trigger = 'Open the confirm sheet'

	const { Story } = defineMeta({
		title: 'Components/Sheets/ConfirmSheet',
		component: ConfirmSheet,
		tags: ['autodocs'],
		parameters: { platformFrame: 'inline' },
		args: { ...del, onconfirm: fn(), oncancel: fn() },
	})
</script>

<script lang="ts">
	let open = $state(false)
</script>

{#snippet template(args: ComponentProps<typeof ConfirmSheet>)}
	<Button label={trigger} onclick={() => (open = true)} />
	<ConfirmSheet {...args} bind:open />
{/snippet}

<!-- The verb button repeats the action in danger; confirming calls onconfirm and closes -->
<Story
	name="Delete"
	args={{ onconfirm: fn(), oncancel: fn() }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		const dialog = await canvas.findByRole('dialog', { name: del.title })
		await expect(dialog).toBeVisible()
		await waitFor(() => expect(canvas.getByText(del.text)).toBeVisible())
		await userEvent.click(canvas.getByRole('button', { name: del.verb }))
		await expect(args.onconfirm).toHaveBeenCalledTimes(1)
		await waitFor(() => expect(dialog).not.toBeVisible())
		await expect(args.oncancel).not.toHaveBeenCalled()
	}}
/>

<!-- An external action names its destination and shows the exact payload -->
<Story
	name="External"
	args={{ ...send, onconfirm: fn(), oncancel: fn() }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		const dialog = await canvas.findByRole('dialog', { name: send.title })
		await waitFor(() => expect(canvas.getByText(send.destination)).toBeVisible())
		await expect(dialog.querySelector('pre')).toHaveTextContent(grocery.shopDay)
		await userEvent.click(canvas.getByRole('button', { name: send.verb }))
		await expect(args.onconfirm).toHaveBeenCalledTimes(1)
		await waitFor(() => expect(dialog).not.toBeVisible())
	}}
/>

<Story name="Mobile" args={{ ...send }} parameters={{ platforms: ['mobile'] }} {template} />

<!-- Escape and the scrim take the cancel path; focus returns to the opener -->
<Story
	name="Keyboard: Escape cancels"
	args={{ onconfirm: fn(), oncancel: fn() }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const opener = canvas.getByRole('button', { name: trigger })
		await userEvent.click(opener)
		const dialog = await canvas.findByRole('dialog', { name: del.title })
		await expect(dialog.contains(document.activeElement)).toBe(true)
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(args.oncancel).toHaveBeenCalledTimes(1))
		await expect(dialog).not.toBeVisible()
		await expect(args.onconfirm).not.toHaveBeenCalled()
		await waitFor(() => expect(document.activeElement).toBe(opener))
		// the Cancel button takes the same path, once
		await userEvent.click(opener)
		await canvas.findByRole('dialog', { name: del.title })
		await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }))
		await waitFor(() => expect(dialog).not.toBeVisible())
		await expect(args.oncancel).toHaveBeenCalledTimes(2)
	}}
/>
