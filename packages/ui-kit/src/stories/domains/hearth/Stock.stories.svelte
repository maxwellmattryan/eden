<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { ranOut, sidebar, stock } from '../../sample-data.js'
	import Stock from './Stock.svelte'

	const strings = defaultStrings
	const hearth = sidebar.items.find((entry) => entry.id === 'kitchen')!
	const chicken = stock[0]!
	/** What the Expiring filter keeps: anything dated on or before Friday 10-02. */
	const expiring = stock.filter((item) => item.expiry && item.expiry <= '10-02')
	/** The stock rows in the page: grid rows on desktop, list items in the swipe rows on mobile. The navs' items sit outside main. */
	const rowsIn = (canvas: ReturnType<typeof canvasOf>) => {
		const main = within(canvas.getByRole('main'))
		return main.queryAllByRole('row').length + main.queryAllByRole('listitem').length
	}

	const { Story } = defineMeta({
		title: 'Domains/Hearth/Stock',
		component: Stock,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Hearth’s Stock view (product/domains/kitchen.md), mocked from kit components under D-54. The page header carries Capture a haul as the primary action with Take stock and Add beside it, the domain’s three tabs and the Expiring, Low stock and Sort chips, the last a menu (expiry, name, newest); a quick-add line sits above one List per location (Fridge, Freezer, Pantry, Counter). Every row leads with the item’s picture, or its category’s glyph on a tile of the same size (D-90), then quantities in mono, `estimated` where the capture guessed, a warning where stock is low, the info button where an item has a tip (D-87). On desktop the selected item opens in a detail pane with its picture and its tip beside its name, its fields and the row’s actions, and Edit opens its form in a sheet over the page (D-95), picture included; a List in select mode offers Move, Add to grocery and Delete on the selection. On mobile every row sits in a SwipeRow whose trailing action deletes.',
				},
			},
		},
		args: {
			oncapture: fn(),
			ontakestock: fn(),
			onadd: fn(),
			onopen: fn(),
			onaction: fn(),
			onbulk: fn(),
			onsave: fn(),
			onpicture: fn(),
			onremovepicture: fn(),
			ondelete: fn(),
			onsample: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Stock>)}
	<Stock {...args} />
{/snippet}

<!-- The sample stock in its four locations, a picture or a category glyph leading every row; chicken thighs open in
     the detail pane on desktop, its picture and its tip beside its name -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const main = within(canvas.getByRole('main'))
		await expect(canvas.getByRole('main')).toBeVisible()
		await expect(canvas.getByRole('heading', { level: 1, name: hearth.name })).toBeVisible()
		// three tabs: Tips is the info button on a row now, not a section
		await expect(main.getAllByRole('tab')).toHaveLength(3)
		await expect(main.queryByRole('tab', { name: 'Tips' })).toBeNull()
		await expect(canvas.getByRole('tab', { name: 'Stock' })).toHaveAttribute('aria-selected', 'true')
		await expect(canvas.getByRole('button', { name: 'Capture a haul' })).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Take stock' })).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Sort: expiry' })).toHaveAttribute('aria-haspopup', 'menu')
		await expect(canvas.getByRole('textbox', { name: 'Add to stock' })).toBeVisible()
		await expect(rowsIn(canvas)).toBe(stock.length)
		if (canvas.queryByRole('contentinfo', { name: strings.statusBar.label })) {
			const fridge = canvas.getByRole('grid', { name: 'Fridge' })
			await expect(fridge).toBeVisible()
			// every row leads with a picture: the spinach and the chicken their photo, the rest their category's glyph
			const pictures = fridge.querySelectorAll('.ed-row-thumb')
			await expect(pictures).toHaveLength(within(fridge).getAllByRole('row').length)
			await expect(fridge.querySelectorAll('img.ed-row-thumb')).toHaveLength(2)
			// what never expires sits last: the garlic under the dated avocados and bananas
			const counter = within(canvas.getByRole('grid', { name: 'Counter' })).getAllByRole('row')
			await expect(counter[0]).toHaveTextContent('Avocados')
			await expect(counter[2]).toHaveTextContent('Garlic')
			const pane = within(canvas.getByRole('complementary', { name: chicken.name }))
			await expect(pane.getByRole('button', { name: `A tip for ${chicken.name}` })).toBeVisible()
			await expect(pane.getByRole('button', { name: 'Edit' })).toBeVisible()
			await expect(pane.queryByText('Storage tip')).toBeNull()
			await expect(canvas.getByRole('complementary', { name: chicken.name }).querySelector('img.picture')).toBeVisible()
		} else {
			await expect(canvas.getByRole('heading', { level: 2, name: /Fridge/ })).toBeVisible()
			await expect(canvas.getAllByRole('button', { name: 'Delete' })).toHaveLength(stock.length)
		}
	}}
/>

<!-- The Expiring chip on: only what is dated this week, so the Fridge and the Counter remain -->
<Story
	name="Expiring"
	{template}
	args={{ expiring: true, selected: 'st-04' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('button', { name: 'Expiring' })).toHaveAttribute('aria-pressed', 'true')
		await expect(rowsIn(canvas)).toBe(expiring.length)
		await expect(canvas.queryByText('Pantry')).toBeNull()
	}}
/>

<!-- Nothing in stock: the EmptyState with Take stock and the sample-data link; the header's actions step back -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'Nothing in stock yet' })).toBeVisible()
		await expect(canvas.getByText(/^Take stock from a few photos of your fridge, freezer and pantry/)).toBeVisible()
		// Take stock twice: the empty state's own action, and the header's
		await expect(canvas.getAllByRole('button', { name: 'Take stock' })).toHaveLength(2)
		await expect(rowsIn(canvas)).toBe(0)
		const link = canvas.getByRole('button', { name: 'Add sample data' })
		link.click()
		await expect(args.onsample).toHaveBeenCalledTimes(1)
	}}
/>

<!-- The phone alone: 44 px rows, each in a SwipeRow whose trailing action deletes -->
<Story name="Mobile" {template} parameters={{ platforms: ['mobile'] }} />

<!-- The item's form in its sheet (D-95): the chicken's picture with the buttons that change it, then its name, amount, location, date,
     category, threshold and tip; Save writes them as one change -->
<Story
	name="Editing"
	{template}
	args={{ editing: true }}
	parameters={{ platforms: ['desktop'], platformFrame: 'inline' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const page = within(canvasElement.ownerDocument.body)
		const pane = within(await page.findByRole('dialog', { name: 'Edit item' }))
		// the panel unfurls before its controls can be seen
		await waitFor(() => expect(pane.getByRole('button', { name: 'Choose a picture' })).toBeVisible())
		await expect(pane.getByRole('button', { name: 'Remove the picture' })).toBeVisible()
		await expect(pane.getByRole('textbox', { name: 'Name' })).toHaveValue(chicken.name)
		await expect(pane.getByRole('textbox', { name: 'Quantity' })).toHaveValue(chicken.qty)
		await expect(pane.getByRole('textbox', { name: 'Unit' })).toHaveValue(chicken.unit)
		await expect(pane.getByRole('tab', { name: 'Fridge' })).toHaveAttribute('aria-selected', 'true')
		await expect(pane.getByLabelText('Expires')).toHaveValue('2026-10-02')
		await expect(pane.getByRole('button', { name: 'Meat and fish' })).toHaveAttribute('aria-haspopup', 'menu')
		await expect(pane.getByRole('textbox', { name: 'Tip' })).toHaveValue(
			'Keep on the lowest shelf, and cook or freeze within two days of the date.'
		)
		await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
		await expect(args.onsave).not.toHaveBeenCalled()
	}}
/>

<!-- Select mode on the Fridge (D-41): two rows selected, and Move, Add to grocery and Delete beside the count -->
<Story
	name="Selecting"
	{template}
	args={{ selecting: true }}
	parameters={{ platforms: ['desktop'] }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const grid = canvas.getByRole('grid', { name: 'Fridge' })
		const fridge = within(grid.parentElement!)
		await expect(grid).toHaveAttribute('aria-multiselectable', 'true')
		const bulk = ['Move', 'Add to grocery', 'Delete'].map((name) => fridge.getByRole('button', { name }))
		for (const button of bulk) await expect(button).toBeDisabled()
		const rows = within(grid).getAllByRole('row')
		await userEvent.click(rows[0]!)
		await userEvent.click(rows[1]!)
		await expect(rows[0]).toHaveAttribute('aria-selected', 'true')
		await expect(rows[1]).toHaveAttribute('aria-selected', 'true')
		await expect(fridge.getByText(strings.selected(2))).toBeVisible()
		for (const button of bulk) await expect(button).toBeEnabled()
		// the other locations stay out of the mode
		await expect(canvas.getByRole('grid', { name: 'Pantry' })).not.toHaveAttribute('aria-multiselectable')
	}}
/>

<!-- What ran out lately (D-92): the four locations hold what is there, and a fifth list beneath them holds the milk
     and the oats, each with where it was kept and the day it ran out -->
<Story
	name="RanOut"
	{template}
	args={{ ranOut: true }}
	parameters={{ platforms: ['desktop'] }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const grid = canvas.getByRole('grid', { name: 'Ran out' })
		const rows = within(grid).getAllByRole('row')
		await expect(rows).toHaveLength(ranOut.length)
		await expect(rows[0]).toHaveTextContent('Whole milk')
		await expect(rows[0]).toHaveTextContent('Fridge')
		// what ran out is not on its shelf's list
		await expect(within(canvas.getByRole('grid', { name: 'Fridge' })).queryByText('Whole milk')).toBeNull()
	}}
/>
