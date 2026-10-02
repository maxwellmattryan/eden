<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { hasCanvas } from '../../../storybook/play.js'
	import Import from './Import.svelte'

	const sheet = async (canvasElement: HTMLElement) =>
		within(await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Import a list' }))

	const { Story } = defineMeta({
		title: 'Domains/Meadow/Import',
		component: Import,
		tags: ['autodocs'],
		parameters: {
			// a sheet is in the top layer, which no frame can contain
			platformFrame: 'inline',
			docs: {
				description: {
					component:
						'Meadow’s bulk import (product/domains/places.md): a list pasted from a note becomes saved places without typing one. The names are parsed on the device and looked up with a geocoder, row by row; a name found twice is chosen, one not found is placed by a click on the map, and the Gardener may tag vibes, each marked as suggested. No model is needed to import. Save is one change with one undo.',
				},
			},
		},
		args: { onfind: fn(), ontag: fn(), onchoose: fn(), onplace: fn(), onsave: fn(), onclose: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Import>)}
	<Import {...args} />
{/snippet}

<!-- The list as it was pasted from a note, bullets and all -->
<Story
	name="Pasted"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const pane = await sheet(canvasElement)
		await waitFor(() => expect(pane.getByRole('textbox', { name: 'Your list' })).toBeVisible())
		await expect(pane.getByText(/No model is asked/)).toBeVisible()
		await userEvent.click(pane.getByRole('button', { name: 'Find these places' }))
		await expect(args.onfind).toHaveBeenCalled()
	}}
/>

<!-- Each name looked up in turn: three have come back, three are on their way, nothing can be saved yet -->
<Story
	name="Resolving"
	{template}
	args={{ phase: 'resolving' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const pane = await sheet(canvasElement)
		await waitFor(() => expect(pane.getByText('Looking up 3 of 6')).toBeVisible())
		await expect(pane.getAllByRole('listitem')).toHaveLength(6)
		await expect(pane.getByRole('button', { name: /^Save/ })).toBeDisabled()
	}}
/>

<!-- The review: three found, one already saved, one found twice, one not found and placed by hand -->
<Story
	name="Review"
	{template}
	args={{ phase: 'review' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const pane = await sheet(canvasElement)
		await waitFor(() => expect(pane.getByRole('button', { name: 'Save 3 places' })).toBeEnabled())
		await waitFor(() => expect(pane.getByRole('group', { name: 'Matches for Lazarus Brewing' })).toBeVisible())
		await userEvent.click(pane.getByRole('button', { name: 'Place it on the map' }))
		await expect(args.onplace).toHaveBeenCalledWith('i-06')
		await expect(pane.getByRole('button', { name: 'Tag vibes with the Gardener' })).toBeEnabled()
	}}
/>

<!-- The Gardener's vibes on the found rows, in its green: each is on until turned off -->
<Story
	name="Tagged"
	{template}
	args={{ phase: 'review', tagged: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const pane = await sheet(canvasElement)
		await waitFor(() => expect(pane.getByText(/Suggested by the Gardener/)).toBeVisible())
		await expect(pane.getByRole('button', { name: 'Vibes suggested' })).toBeDisabled()
	}}
/>
