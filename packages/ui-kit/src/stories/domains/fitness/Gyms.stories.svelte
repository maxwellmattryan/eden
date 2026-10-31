<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { gyms } from '../../sample-data.js'
	import Gyms from './Gyms.svelte'

	const castleHill = gyms[0]!

	const { Story } = defineMeta({
		title: 'Domains/Vigor/Gyms',
		component: Gyms,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Vigor’s Gyms view: Castle Hill Fitness and the home rack, each with how much equipment it has. The open gym shows its equipment as chips, its hours and notes, and the venue Place it is linked to with its address. The form adds equipment a chip at a time from a field and links a venue from the workspace’s Places; Delete comes with undo.',
				},
			},
		},
		args: { onadd: fn(), onaction: fn(), onsave: fn(), onsample: fn(), onnavigate: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Gyms>)}
	<Gyms {...args} />
{/snippet}

<!-- The two gyms; Castle Hill open with its equipment, hours, notes and Place -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('tab', { name: 'Gyms' })).toHaveAttribute('aria-selected', 'true')
		const list = within(canvas.getByRole('grid', { name: 'Gyms' }))
		await expect(list.getAllByRole('row')).toHaveLength(gyms.length)
		await expect(list.getByText('6 pieces of equipment')).toBeVisible()
		if (canvas.queryByRole('complementary', { name: castleHill.name })) {
			const pane = within(canvas.getByRole('complementary', { name: castleHill.name }))
			const equipment = within(pane.getByRole('list', { name: 'Equipment' }))
			await expect(equipment.getAllByRole('listitem')).toHaveLength(castleHill.equipment.length)
			await expect(pane.getByText(castleHill.place!.address)).toBeVisible()
		}
	}}
/>

<!-- Edit on Castle Hill: its equipment as chips that each remove, and its venue -->
<Story
	name="Form"
	{template}
	args={{ editing: true }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const page = within(canvasElement.ownerDocument.body)
		const sheet = within(await page.findByRole('dialog', { name: 'Edit gym' }))
		await waitFor(() => expect(sheet.getByRole('textbox', { name: 'Name' })).toBeVisible())
		await expect(sheet.getByRole('textbox', { name: 'Name' })).toHaveValue(castleHill.name)
		await expect(sheet.getByRole('button', { name: 'Remove Pull-up bar' })).toBeVisible()
		await expect(sheet.getByRole('combobox', { name: 'Place' })).toHaveValue('castle-hill')
	}}
/>

<!-- No gyms: the EmptyState with Add gym and the sample-data link -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'No gyms yet' })).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Add sample data' }))
		await expect(args.onsample).toHaveBeenCalledTimes(1)
	}}
/>
