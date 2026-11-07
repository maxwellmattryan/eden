<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { hasCanvas } from '../../../storybook/play.js'
	import ReadConfirm from './ReadConfirm.svelte'

	const sheet = async (canvasElement: HTMLElement) =>
		within(await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Read a document' }))

	const { Story } = defineMeta({
		title: 'Domains/Orchard/ReadConfirm',
		component: ReadConfirm,
		tags: ['autodocs'],
		parameters: {
			// a sheet is in the top layer, which no frame can contain
			platformFrame: 'inline',
			docs: {
				description: {
					component:
						'Orchard’s read-and-confirm sheet (D-190): a letter, statement or pay stub is read on this device and its account numbers masked to their last four digits, then shown as text to check before the Gardener drafts a bill from it. Where it read badly the picture can go instead. A file read before is known by its fingerprint and not read again (D-189). Nothing is saved until the draft is confirmed.',
				},
			},
		},
		args: { onfiles: fn(), onconfirm: fn(), onsendpicture: fn(), oncancel: fn(), onclose: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof ReadConfirm>)}
	<ReadConfirm {...args} />
{/snippet}

<!-- Nothing chosen yet: drop or choose a document, read on this device -->
<Story
	name="Collect"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const pane = await sheet(canvasElement)
		await waitFor(() => expect(pane.getByText('Drop a letter, statement or pay stub')).toBeVisible())
		await expect(pane.getByRole('button', { name: 'Choose a file' })).toBeVisible()
		await expect(pane.getByText('It is read on this device. Nothing leaves it until you confirm.')).toBeVisible()
	}}
/>

<!-- The letter being read on the device -->
<Story
	name="Reading"
	{template}
	args={{ phase: 'reading' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const pane = await sheet(canvasElement)
		await waitFor(() => expect(pane.getByText('Reading on this device')).toBeVisible())
		const live = pane.getByText('Reading on this device').closest('[role="status"]')!
		await expect(within(live as HTMLElement).getByText('austin-energy-2026-09.pdf')).toBeVisible()
		await expect(pane.queryByRole('button', { name: 'Draft the bill' })).toBeNull()
	}}
/>

<!-- The text read from the Austin Energy letter, two numbers masked, ready to draft -->
<Story
	name="Read"
	{template}
	args={{ phase: 'read' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const pane = await sheet(canvasElement)
		const text = pane.getByRole('textbox', { name: 'Text read from the document' })
		await waitFor(() => expect(text).toBeVisible())
		await expect((text as HTMLTextAreaElement).value).toContain('Account number: ••••7781')
		await expect(pane.getByText('2 numbers masked to their last four digits')).toBeVisible()
		await expect(pane.getByText('Claude Sonnet · about $0.01')).toBeVisible()
		await expect(pane.getByRole('button', { name: 'Draft the bill' })).toHaveClass('ed-btn-primary')
		await userEvent.click(pane.getByRole('button', { name: 'Draft the bill' }))
		await expect(args.onconfirm).toHaveBeenCalledTimes(1)
		await userEvent.click(pane.getByRole('button', { name: 'Send the picture instead' }))
		await expect(args.onsendpicture).toHaveBeenCalledTimes(1)
	}}
/>

<!-- The letter read badly: the warning, the picture offered first, Draft the bill still there -->
<Story
	name="Read badly"
	{template}
	args={{ phase: 'read-badly' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const pane = await sheet(canvasElement)
		await waitFor(() => expect(pane.getByText(/^Parts of this document read badly/)).toBeVisible())
		await expect(pane.getByRole('button', { name: 'Send the picture instead' })).toHaveClass('ed-btn-primary')
		await expect(pane.getByRole('button', { name: 'Draft the bill' })).toHaveClass('ed-btn-secondary')
	}}
/>

<!-- The same letter read before: its fingerprint is known, so nothing is drafted twice -->
<Story
	name="Already imported"
	{template}
	args={{ phase: 'imported' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const pane = await sheet(canvasElement)
		await waitFor(() => expect(pane.getByText('You read this document on Tue 22 Sep')).toBeVisible())
		await expect(pane.getByText('It made the Austin Energy bill for September.')).toBeVisible()
		await expect(pane.queryByRole('button', { name: 'Draft the bill' })).toBeNull()
		await userEvent.click(pane.getByRole('button', { name: 'Close' }))
		await expect(args.onclose).toHaveBeenCalled()
	}}
/>
