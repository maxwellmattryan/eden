<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { domainGlyph } from '$lib/icons/domain-glyphs.js'
	import Button from '../Button/Button.svelte'
	import WidgetCatalog, { type WidgetCatalogGroup } from './WidgetCatalog.svelte'
	import { sidebar } from '../../../stories/sample-data.js'

	const nameOf = (id: string) => sidebar.items.find((item) => item.id === id)?.name ?? id
	const groups: WidgetCatalogGroup[] = [
		{
			id: 'kitchen',
			label: nameOf('kitchen'),
			icon: domainGlyph('kitchen'),
			items: [
				{ id: 'expiring-soon', title: 'Expiring soon', note: 'Small or wide', placed: true },
				{ id: 'cook-tonight', title: 'Cook tonight', note: 'Wide', placed: true },
				{ id: 'grocery-quick-add', title: 'Add to grocery', note: 'Small' },
			],
		},
		{
			id: 'weather',
			label: nameOf('weather'),
			icon: domainGlyph('weather'),
			items: [
				{ id: 'weather-now', title: 'Now', note: 'Small or wide', placed: true },
				{ id: 'sun-and-moon', title: 'Sun and moon', note: 'Small' },
			],
		},
		{ id: 'fitness', label: 'Vigor', icon: domainGlyph('fitness'), items: [] },
	]
	const placed: WidgetCatalogGroup[] = groups.map((group) => ({
		...group,
		items: group.items.map((item) => ({ ...item, placed: true })),
	}))
	const trigger = 'Open the catalog'

	const { Story } = defineMeta({
		title: 'Components/Garden/WidgetCatalog',
		component: WidgetCatalog,
		tags: ['autodocs'],
		parameters: { platformFrame: 'inline' },
		args: { groups, onadd: fn(), onclose: fn() },
	})
</script>

<script lang="ts">
	let open = $state(false)
</script>

{#snippet template(args: ComponentProps<typeof WidgetCatalog>)}
	<Button label={trigger} onclick={() => (open = true)} />
	<WidgetCatalog {...args} bind:open />
{/snippet}

<!-- A tile not yet on the Garden has Add; the sheet stays open after it, and Done closes it -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		const dialog = await canvas.findByRole('dialog', { name: 'Add a tile' })
		await waitFor(() => expect(dialog).toBeVisible())
		await expect(canvas.queryByText('Vigor')).toBeNull()
		await userEvent.click(canvas.getByRole('button', { name: 'Add Sun and moon' }))
		await expect(args.onadd).toHaveBeenLastCalledWith('sun-and-moon')
		await expect(dialog).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Done' }))
		await waitFor(() => expect(dialog).not.toBeVisible())
		await waitFor(() => expect(args.onclose).toHaveBeenCalledTimes(1))
	}}
/>

<Story
	name="Everything placed"
	args={{ groups: placed }}
	{template}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		const dialog = await canvas.findByRole('dialog', { name: 'Add a tile' })
		await waitFor(() => expect(dialog).toBeVisible())
		await expect(canvas.queryByRole('button', { name: /^Add / })).toBeNull()
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(dialog).not.toBeVisible())
	}}
/>

<!-- On a phone the catalog is a bottom sheet -->
<Story
	name="Mobile"
	parameters={{ platforms: ['mobile'] }}
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		const dialog = await canvas.findByRole('dialog', { name: 'Add a tile' })
		await waitFor(() => expect(dialog).toBeVisible())
		await expect(dialog).toHaveClass('ed-sheet-bottom')
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(dialog).not.toBeVisible())
	}}
/>
