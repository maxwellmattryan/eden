<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import Profile from './Profile.svelte'

	/** The Phase 1 facts of the dataset, and the home area the substrate derives. */
	const FACTS = 21

	const { Story } = defineMeta({
		title: 'Domains/Garden/Profile',
		component: Profile,
		tags: ['autodocs'],
		parameters: {
			platforms: ['desktop'],
			docs: {
				description: {
					component:
						'What Eden knows about me (product/substrate/profile.md), mocked from kit components under D-54; desktop only in Phase 1, reached from the Garden. One List per owner the registry names (Eden, Hearth, Toolbench, and Wellspring for the fact the owner may assert before it ships), each row the value as one line, then its type, who wrote it and when, the lock on T2, the Gardener’s confidence on what it inferred, a weight where the value has one, and how many Gardener requests read it. The derived home area carries no menu. A proposal sits above the groups in the Gardener’s green (D-40) until it is answered; a fact past its window is greyed and offers Renew; add and edit open a small sheet with the fields the type asks for.',
				},
			},
		},
		args: {
			onadd: fn(),
			onopen: fn(),
			onaction: fn(),
			onaccept: fn(),
			ondismiss: fn(),
			onsave: fn(),
			onsample: fn(),
			onnavigate: fn(),
			onback: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Profile>)}
	<Profile {...args} />
{/snippet}

<!-- The facts table: four owners, the allergies and the medical restriction behind the lock, the cilantro the Gardener inferred -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const main = within(canvas.getByRole('main'))
		await expect(main.getByRole('heading', { level: 1, name: 'What Eden knows about me' })).toBeVisible()
		for (const owner of ['Eden', 'Hearth', 'Toolbench', 'Wellspring']) {
			await expect(main.getByRole('grid', { name: owner })).toBeVisible()
		}
		await expect(main.getAllByRole('row')).toHaveLength(FACTS)
		// the two allergies and the medical restriction are T2
		await expect(main.getAllByText('T2')).toHaveLength(3)
		await expect(main.getByText('80% sure')).toBeVisible()
		// what the substrate derived is not the owner's to edit
		await expect(main.queryByRole('button', { name: 'Actions for Austin, Texas, United States' })).toBeNull()
		await expect(main.getByRole('button', { name: 'Actions for Rowan' })).toBeVisible()
		// the morning's Hearth request read the allergies, the dietary preference and the restriction
		await expect(main.getAllByText('used by 1 request')).toHaveLength(4)
		await userEvent.click(main.getByRole('button', { name: 'Add a fact' }))
		await expect(args.onadd).toHaveBeenCalledTimes(1)
	}}
/>

<!-- Before anything is known: one sentence, the way to add, and the sample data -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const main = within(canvasOf(canvasElement).getByRole('main'))
		await expect(main.getByText('Eden knows nothing about you yet')).toBeVisible()
		await expect(main.queryByRole('grid')).toBeNull()
		await userEvent.click(main.getByRole('button', { name: /sample/i }))
		await expect(args.onsample).toHaveBeenCalledTimes(1)
	}}
/>

<!-- The Gardener noticed: nothing is stored until the owner accepts, so the cilantro has no row yet -->
<Story
	name="Proposal"
	{template}
	args={{ proposal: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const main = within(canvasOf(canvasElement).getByRole('main'))
		const card = within(main.getByRole('region', { name: 'The Gardener noticed' }))
		await expect(card.getByText('I noticed you avoid cilantro. Save as a dislike?')).toBeVisible()
		await expect(main.getAllByRole('row')).toHaveLength(FACTS - 1)
		await userEvent.click(card.getByRole('button', { name: 'Accept' }))
		await expect(args.onaccept).toHaveBeenCalledTimes(1)
	}}
/>

<!-- Past its window: readers no longer get the fact, the page greys it and its menu offers Renew -->
<Story
	name="Expired"
	{template}
	args={{ expired: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const main = within(canvasOf(canvasElement).getByRole('main'))
		await expect(main.getByText(/expired 31 Aug/)).toBeVisible()
		await expect(main.getAllByRole('row')).toHaveLength(FACTS)
	}}
/>

<!-- Editing the tree-nut allergy: the fields its value asks for, a note, and the window it holds in -->
<Story
	name="Editing"
	{template}
	args={{ editing: true }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const page = within(canvasElement.ownerDocument.body)
		const sheet = within(await page.findByRole('dialog', { name: 'Edit Allergy' }))
		await expect(sheet.getByRole('textbox', { name: 'Substance' })).toHaveValue('tree nuts')
		await expect(sheet.getByRole('tab', { name: 'severe' })).toHaveAttribute('aria-selected', 'true')
		await userEvent.click(sheet.getByRole('button', { name: 'Save' }))
		await expect(args.onsave).toHaveBeenCalledTimes(1)
	}}
/>
