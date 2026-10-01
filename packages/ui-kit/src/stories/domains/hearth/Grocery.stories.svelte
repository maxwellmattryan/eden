<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { grocery, groceryShopDay, ranOut, sidebar } from '../../sample-data.js'
	import Grocery from './Grocery.svelte'

	const strings = defaultStrings
	const hearth = sidebar.items.find((entry) => entry.id === 'kitchen')!
	/** The grocery rows in the page: grid rows on desktop, list items in the swipe rows on mobile. The navs' items sit outside main. */
	const rowsIn = (canvas: ReturnType<typeof canvasOf>) => {
		const main = within(canvas.getByRole('main'))
		return main.queryAllByRole('row').length + main.queryAllByRole('listitem').length
	}
	/** One store's list on the page, by the store's name. */
	const listOf = (canvas: ReturnType<typeof canvasOf>, name: string) => within(canvas.getByRole('region', { name }))

	const { Story } = defineMeta({
		title: 'Domains/Hearth/Grocery',
		component: Grocery,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Hearth’s Grocery view (product/domains/kitchen.md), mocked from kit components under D-54. The Stock header with the Grocery tab selected and Add as the primary action, a quick-add line that files an item where it was last bought, then one list per store (D-95), all on the page at once: the store’s name, its shop day when it has one, the count of what is checked, Complete and Edit store as quiet icon buttons, its rows and an add line of its own; what names no store yet sits in Any store. Each row carries an origin badge (manual, recipe, low stock); a checked row is struck through and stays until its list is completed. On desktop the pane on the right is the stores, one store’s fields (its name, what it sells, its optional shop day) or the fields of the item being edited. On mobile there is no pane: a swipe to the right checks a row off and a swipe to the left deletes it.',
				},
			},
		},
		args: {
			onadd: fn(),
			oncomplete: fn(),
			oncheck: fn(),
			ondelete: fn(),
			onopen: fn(),
			onagain: fn(),
			onaction: fn(),
			onsave: fn(),
			onaddstore: fn(),
			onsavestore: fn(),
			ondeletestore: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Grocery>)}
	<Grocery {...args} />
{/snippet}

<!-- Three lists at once: H-E-B with its shop day and the ginger checked, Target, and Any store; on desktop the pane holds the stores -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('main')).toBeVisible()
		await expect(canvas.getByRole('heading', { level: 1, name: hearth.name })).toBeVisible()
		await expect(canvas.getByRole('tab', { name: 'Grocery' })).toHaveAttribute('aria-selected', 'true')
		for (const name of ['H-E-B', 'Target', 'Any store']) {
			await expect(canvas.getByRole('heading', { level: 2, name })).toBeVisible()
		}
		await expect(canvas.queryByText('H-E-B Saturday')).toBeNull()
		await expect(canvas.getByRole('textbox', { name: 'Add an item' })).toBeVisible()
		const heb = listOf(canvas, 'H-E-B')
		await expect(heb.getByText(groceryShopDay)).toBeVisible()
		await expect(heb.getByText('1 of 3 checked')).toBeVisible()
		await expect(heb.getByRole('textbox', { name: 'Add to H-E-B' })).toBeVisible()
		const target = listOf(canvas, 'Target')
		await expect(target.getByText('0 of 1 checked')).toBeVisible()
		await expect(target.queryByText(groceryShopDay)).toBeNull()
		await expect(target.getByRole('button', { name: 'Complete Target' })).toBeDisabled()
		await userEvent.click(heb.getByRole('button', { name: 'Complete H-E-B' }))
		await expect(args.oncomplete).toHaveBeenCalledWith('gs-01')
		if (canvas.queryByRole('contentinfo', { name: strings.statusBar.label })) {
			await expect(rowsIn(canvas)).toBe(grocery.items.length + grocery.stores.length)
			const pane = within(canvas.getByRole('complementary', { name: 'Stores' }))
			await expect(pane.getAllByRole('row')).toHaveLength(grocery.stores.length)
			await expect(pane.getByRole('textbox', { name: 'Add a store' })).toBeVisible()
		} else {
			await expect(rowsIn(canvas)).toBe(grocery.items.length)
			await expect(canvas.queryByRole('complementary')).toBeNull()
		}
	}}
/>

<!-- Every row checked off: struck through, each count full, one sentence about completing, and Complete on every list -->
<Story
	name="All checked"
	{template}
	args={{ allChecked: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const heb = listOf(canvas, 'H-E-B')
		await expect(heb.getByText('3 of 3 checked')).toBeVisible()
		await expect(heb.getByText('Everything is checked. Complete the list once you are home.')).toBeVisible()
		await expect(heb.getByRole('button', { name: 'Complete H-E-B' })).toBeEnabled()
		await expect(listOf(canvas, 'Target').getByRole('button', { name: 'Complete Target' })).toBeEnabled()
	}}
/>

<!-- Nothing on any list: the quick-add line, the EmptyState, and every store still there with its own add line -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'Nothing to buy' })).toBeVisible()
		await expect(canvas.getByRole('textbox', { name: 'Add an item' })).toBeVisible()
		await expect(canvas.getByRole('textbox', { name: 'Add to Target' })).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Complete H-E-B' })).toBeDisabled()
		await expect(canvas.queryByRole('heading', { level: 2, name: 'Any store' })).toBeNull()
		await expect(within(canvas.getByRole('region', { name: 'H-E-B' })).queryAllByRole('row')).toHaveLength(0)
	}}
/>

<!-- No list has a shop day: no chip on any store, and the store's pane offers Today and Tomorrow -->
<Story
	name="No shop day"
	{template}
	args={{ noShopDay: true, store: 'gs-01' }}
	parameters={{ platforms: ['desktop'] }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.queryByText(groceryShopDay)).toBeNull()
		const pane = within(canvas.getByRole('complementary', { name: 'Store' }))
		await expect(pane.getByLabelText('Shop day')).toHaveValue('')
		await expect(pane.getByLabelText('Time')).toBeDisabled()
		await expect(pane.queryByRole('button', { name: 'No shop day' })).toBeNull()
		await userEvent.click(pane.getByRole('button', { name: 'Tomorrow' }))
		await expect(pane.getByLabelText('Shop day')).toHaveValue('2026-10-02')
		await expect(pane.getByRole('button', { name: 'No shop day' })).toBeVisible()
	}}
/>

<!-- Edit store on H-E-B: the pane becomes the store's fields, its name, what it sells and its shop day -->
<Story
	name="Store pane"
	{template}
	args={{ store: 'gs-01' }}
	parameters={{ platforms: ['desktop'] }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const pane = within(canvas.getByRole('complementary', { name: 'Store' }))
		await expect(pane.getByRole('textbox', { name: 'Name' })).toHaveValue('H-E-B')
		await expect(pane.getByRole('button', { name: 'Grocery' })).toHaveAttribute('aria-pressed', 'true')
		await expect(pane.getByRole('button', { name: 'Home goods' })).toHaveAttribute('aria-pressed', 'false')
		await expect(pane.getByLabelText('Shop day')).toHaveValue('2026-10-03')
		await expect(pane.getByLabelText('Time')).toHaveValue('10:00')
		await userEvent.click(pane.getByRole('button', { name: 'Delete store' }))
		await expect(args.ondeletestore).toHaveBeenCalledWith('gs-01')
		await expect(canvas.queryByRole('complementary', { name: 'Stores' })).toBeNull()
	}}
/>

<!-- Edit on the ginger's row: the pane becomes its fields, its store picked among the stores, the recipe it came from as its note -->
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
		const where = within(pane.getByRole('group', { name: 'Store' }))
		await expect(where.getByRole('button', { name: 'H-E-B' })).toHaveAttribute('aria-pressed', 'true')
		await userEvent.click(where.getByRole('button', { name: 'Target' }))
		await expect(where.getByRole('button', { name: 'Target' })).toHaveAttribute('aria-pressed', 'true')
		await expect(where.getByRole('button', { name: 'H-E-B' })).toHaveAttribute('aria-pressed', 'false')
		await expect(where.getByRole('button', { name: 'Any store' })).toBeVisible()
		await expect(pane.getByRole('textbox', { name: 'Note' })).toHaveValue('soba')
		await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
		await expect(args.onsave).not.toHaveBeenCalled()
		await expect(canvas.queryByRole('complementary', { name: 'Stores' })).toBeNull()
	}}
/>

<!-- Buy it again (D-92): what ran out sits beneath the lists, and a click on a row puts it on the list it was last bought from -->
<Story
	name="BuyAgain"
	{template}
	args={{ buyAgain: true }}
	parameters={{ platforms: ['desktop'] }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const rows = within(canvas.getByRole('grid', { name: 'Buy it again' })).getAllByRole('row')
		await expect(rows).toHaveLength(ranOut.length)
		await expect(rows[0]).toHaveTextContent('Whole milk')
		await userEvent.click(rows[0]!)
		await expect(args.onagain).toHaveBeenCalledTimes(1)
	}}
/>
