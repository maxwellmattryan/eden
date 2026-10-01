<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { grocery, sidebar } from '../../sample-data.js'
	import Grocery from './Grocery.svelte'

	const strings = defaultStrings
	const hearth = sidebar.items.find((entry) => entry.id === 'kitchen')!
	/** The grocery rows in the page: grid rows on desktop, list items in the swipe rows on mobile. The navs' items sit outside main. */
	const rowsIn = (canvas: ReturnType<typeof canvasOf>) => {
		const main = within(canvas.getByRole('main'))
		return main.queryAllByRole('row').length + main.queryAllByRole('listitem').length
	}

	const { Story } = defineMeta({
		title: 'Domains/Hearth/Grocery',
		component: Grocery,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Hearth’s Grocery view (product/domains/kitchen.md), mocked from kit components under D-54. The Stock header with the Grocery tab selected and Add as the primary action, a quick-add line, then the active list grouped by store with its shop-day Event beside the store’s name. Each row carries an origin badge (manual, recipe, low stock); a checked row is struck through and stays until Clear checked. On desktop the pane on the right is the list itself (its name, its store, its shop day and time) or the fields of the item being edited. On mobile there is no pane: a swipe to the right checks a row off and a swipe to the left deletes it.',
				},
			},
		},
		args: {
			onadd: fn(),
			onclear: fn(),
			oncheck: fn(),
			ondelete: fn(),
			onopen: fn(),
			onaction: fn(),
			onsave: fn(),
			onclearshopday: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Grocery>)}
	<Grocery {...args} />
{/snippet}

<!-- H-E-B Saturday: four items, the ginger already checked; on desktop the pane holds the list's name, store and shop day -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('main')).toBeVisible()
		await expect(canvas.getByRole('heading', { level: 1, name: hearth.name })).toBeVisible()
		await expect(canvas.getByRole('tab', { name: 'Grocery' })).toHaveAttribute('aria-selected', 'true')
		await expect(canvas.getByRole('heading', { level: 2, name: 'H-E-B' })).toBeVisible()
		await expect(canvas.getByText(grocery.shopDay)).toBeVisible()
		await expect(canvas.getByRole('textbox', { name: 'Add to the list' })).toBeVisible()
		await expect(rowsIn(canvas)).toBe(grocery.items.length)
		await expect(canvas.getByText('1 of 4 checked')).toBeVisible()
		if (canvas.queryByRole('contentinfo', { name: strings.statusBar.label })) {
			const pane = within(canvas.getByRole('complementary', { name: 'The list' }))
			await expect(pane.getByRole('textbox', { name: 'Name' })).toHaveValue(grocery.name)
			await expect(pane.getByRole('textbox', { name: 'Store' })).toHaveValue('H-E-B')
			await expect(pane.getByLabelText('Shop day')).toHaveValue('2026-10-03')
			await expect(pane.getByLabelText('Time')).toHaveValue('10:00')
			await expect(pane.getByRole('button', { name: 'Clear the shop day' })).toBeVisible()
		} else {
			await expect(canvas.queryByRole('complementary')).toBeNull()
		}
	}}
/>

<!-- Every row checked off: struck through, the count full, one sentence about clearing -->
<Story
	name="All checked"
	{template}
	args={{ allChecked: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('4 of 4 checked')).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Clear checked' })).toBeVisible()
	}}
/>

<!-- Nothing on the list: the quick-add line, the EmptyState with Add as its action, and nothing to clear -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'The list is empty' })).toBeVisible()
		await expect(canvas.getByRole('textbox', { name: 'Add to the list' })).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Clear checked' })).toBeDisabled()
		await expect(rowsIn(canvas)).toBe(0)
	}}
/>

<!-- Edit on the ginger's row: the pane becomes its fields, the store chip beneath Store, the recipe it came from as its note -->
<Story
	name="Editing an item"
	{template}
	args={{ editing: 'g-03' }}
	parameters={{ platforms: ['desktop'] }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const pane = within(canvas.getByRole('complementary', { name: 'Edit item' }))
		await expect(pane.getByRole('textbox', { name: 'Name' })).toHaveValue('Ginger')
		await expect(pane.getByRole('textbox', { name: 'Quantity' })).toHaveValue('1')
		await expect(pane.getByRole('textbox', { name: 'Store' })).toHaveValue('')
		await expect(pane.getByText('Left empty, it is bought at H-E-B.')).toBeVisible()
		await expect(pane.getByRole('button', { name: 'H-E-B' })).toBeVisible()
		await expect(pane.getByRole('textbox', { name: 'Note' })).toHaveValue('soba')
		await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
		await expect(args.onsave).not.toHaveBeenCalled()
		await expect(canvas.queryByRole('complementary', { name: 'The list' })).toBeNull()
	}}
/>
