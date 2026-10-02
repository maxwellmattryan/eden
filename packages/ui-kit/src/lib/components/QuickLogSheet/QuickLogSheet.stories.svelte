<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import QuickLogSheet, { type QuickLog } from './QuickLogSheet.svelte'
	import Button from '../Button/Button.svelte'
	import { ideas, quickLogs } from '../../../stories/sample-data.js'

	// The sample logs with their tab glyphs: weight (number), the supplement dose (check), a note (text), and the
	// haul (launch).
	const weight: QuickLog = { ...quickLogs[0]!, icon: 'leaf' }
	const supplement: QuickLog = { ...quickLogs[1]!, icon: 'pill' }
	const note: QuickLog = { ...quickLogs[2]!, icon: 'pencil', helper: 'Goes to Toolbench as an idea.' }
	const haul: QuickLog = {
		id: 'haul',
		label: 'Capture a haul',
		icon: 'camera',
		kind: 'launch',
		helper: 'Photos and receipts, read into stock.',
	}
	const logs = [weight, supplement, note]
	const idea = ideas[3].title
	const trigger = 'Open Quick Log'
	const title = 'Quick Log'

	const { Story } = defineMeta({
		title: 'Components/Sheets/QuickLogSheet',
		component: QuickLogSheet,
		tags: ['autodocs'],
		parameters: { platformFrame: 'inline' },
		args: { logs, selected: 0, embedded: false, onsave: fn() },
	})
</script>

<script lang="ts">
	let open = $state(false)
</script>

{#snippet template(args: ComponentProps<typeof QuickLogSheet>)}
	<Button label={trigger} onclick={() => (open = true)} />
	<QuickLogSheet {...args} bind:open />
{/snippet}

{#snippet embedded(args: ComponentProps<typeof QuickLogSheet>)}
	<div
		style="max-width: var(--sheet-sm); padding: var(--space-4); background: var(--surface-1); border: 1px solid var(--ed-card-border); border-radius: var(--ed-radius-card)"
	>
		<QuickLogSheet {...args} />
	</div>
{/snippet}

<!-- The large mono field with its unit, the last value beneath and the trend; Enter saves and closes -->
<Story
	name="Number"
	args={{ logs: [weight], onsave: fn() }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		const dialog = await canvas.findByRole('dialog', { name: title })
		const input = canvas.getByRole('textbox', { name: weight.label })
		await expect(canvas.getByRole('button', { name: 'Save' })).toBeDisabled()
		await userEvent.type(input, '82.1{Enter}')
		await expect(args.onsave).toHaveBeenCalledWith(weight, '82.1')
		await waitFor(() => expect(dialog).not.toBeVisible())
	}}
/>

<Story
	name="Text"
	args={{ logs: [note], onsave: fn() }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		const dialog = await canvas.findByRole('dialog', { name: title })
		await userEvent.type(canvas.getByRole('textbox', { name: note.label }), `${idea}{Enter}`)
		await expect(args.onsave).toHaveBeenCalledWith(note, idea)
		await waitFor(() => expect(dialog).not.toBeVisible())
	}}
/>

<!-- A single option starts selected, so the dose is one press of "Took it" -->
<Story
	name="Check"
	args={{ logs: [supplement], onsave: fn() }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		const dialog = await canvas.findByRole('dialog', { name: title })
		const option = supplement.options![0]!
		await expect(canvas.getByRole('button', { name: option })).toHaveAttribute('aria-pressed', 'true')
		await userEvent.click(canvas.getByRole('button', { name: 'Took it' }))
		await expect(args.onsave).toHaveBeenCalledWith(supplement, option)
		await waitFor(() => expect(dialog).not.toBeVisible())
	}}
/>

<!-- No field: the button hands the caller the launch, and the sheet closes for what it opens -->
<Story
	name="Launch"
	args={{ logs: [haul], onsave: fn() }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		const dialog = await canvas.findByRole('dialog', { name: title })
		await userEvent.click(canvas.getByRole('button', { name: 'Open' }))
		await expect(args.onsave).toHaveBeenCalledWith(haul, '')
		await waitFor(() => expect(dialog).not.toBeVisible())
	}}
/>

<!-- Each tab keeps its own draft -->
<Story
	name="Tabs"
	args={{ logs, onsave: fn() }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		await canvas.findByRole('dialog', { name: title })
		await userEvent.type(canvas.getByRole('textbox', { name: weight.label }), '82.1')
		await userEvent.click(canvas.getByRole('tab', { name: note.label }))
		const noteInput = canvas.getByRole('textbox', { name: note.label })
		await expect(noteInput).toHaveValue('')
		await userEvent.type(noteInput, idea)
		await userEvent.click(canvas.getByRole('tab', { name: weight.label }))
		await expect(canvas.getByRole('textbox', { name: weight.label })).toHaveValue('82.1')
		await userEvent.click(canvas.getByRole('tab', { name: note.label }))
		await expect(canvas.getByRole('textbox', { name: note.label })).toHaveValue(idea)
		await expect(args.onsave).not.toHaveBeenCalled()
		await userEvent.keyboard('{Escape}')
	}}
/>

<!-- The panel alone, for the status bar's popover: a save clears the field and stays -->
<Story
	name="Embedded"
	args={{ logs: [weight], embedded: true, onsave: fn() }}
	parameters={{ platformFrame: 'framed' }}
	template={embedded}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const input = canvas.getByRole('textbox', { name: weight.label })
		await userEvent.type(input, '82.1{Enter}')
		await expect(args.onsave).toHaveBeenCalledWith(weight, '82.1')
		await expect(input).toHaveValue('')
		await expect(canvas.getByRole('group', { name: title })).toBeVisible()
	}}
/>

<Story name="Mobile" parameters={{ platforms: ['mobile'] }} {template} />
