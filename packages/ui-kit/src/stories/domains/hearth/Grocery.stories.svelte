<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
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
						'Hearth’s Grocery view (product/domains/kitchen.md), mocked from kit components under D-54. The Stock header with the Grocery tab selected and one action, Add, whose menu offers Add item and Add store (D-102), then one list per store (D-96), all on the page at once: the store’s name in the display face, its shop day when it has one, about what it costs (D-105), Complete, Add (the item’s form with that store picked) and Edit store as quiet icon buttons, and its rows; what names no store yet sits in Miscellaneous. Each row carries an origin badge (manual, recipe, low stock); a checked row is struck through and stays until its list is completed. On desktop the side holds Buy it again and, beneath it, the stores in the owner’s order (D-101): each row says what is left to buy and the store’s shop day or its last trip, a click goes to its list and its menu edits, moves and deletes it; a store’s form (its name, what it sells, where it is, a note, its optional shop day) and an item’s open in a sheet (D-95), the same one to add as to edit. On mobile there is no side: a swipe to the right checks a row off and a swipe to the left deletes it.',
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
			ongostore: fn(),
			onmovestore: fn(),
			onaddstore: fn(),
			onsavestore: fn(),
			ondeletestore: fn(),
			onstorepicture: fn(),
			onfetchpicture: fn(),
			onremovepicture: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Grocery>)}
	<Grocery {...args} />
{/snippet}

<!-- Three lists at once: H-E-B with its shop day and the ginger checked, Target, and Miscellaneous; on desktop the pane holds the stores -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('main')).toBeVisible()
		await expect(canvas.getByRole('heading', { level: 1, name: hearth.name })).toBeVisible()
		await expect(canvas.getByRole('tab', { name: 'Grocery' })).toHaveAttribute('aria-selected', 'true')
		for (const name of ['H-E-B', 'Target', 'Miscellaneous']) {
			await expect(canvas.getByRole('heading', { level: 2, name })).toBeVisible()
		}
		await expect(canvas.queryByText('H-E-B Saturday')).toBeNull()
		// nothing is typed on the page: adding is the header's one action (D-102)
		await expect(within(canvas.getByRole('main')).queryAllByRole('textbox')).toHaveLength(0)
		await expect(canvas.getByRole('button', { name: 'Add' })).toHaveAttribute('aria-haspopup', 'menu')
		const heb = listOf(canvas, 'H-E-B')
		await expect(heb.getByText(groceryShopDay)).toBeVisible()
		await expect(heb.getByText('about $46.32, 1 unpriced')).toBeVisible()
		const target = listOf(canvas, 'Target')
		// nothing on Target's list has a price, so it says no sum
		await expect(target.queryByText(/^about/)).toBeNull()
		await expect(target.queryByText(groceryShopDay)).toBeNull()
		await expect(target.getByRole('button', { name: 'Complete Target' })).toBeDisabled()
		await userEvent.click(heb.getByRole('button', { name: 'Complete H-E-B' }))
		await expect(args.oncomplete).toHaveBeenCalledWith('gs-01')
		if (canvas.queryByRole('contentinfo', { name: strings.statusBar.label })) {
			await expect(rowsIn(canvas)).toBe(grocery.items.length + grocery.stores.length)
			// the side: nothing to buy again, then the stores, each with what is left and its shop day or last trip
			await expect(canvas.getByText('Nothing to buy again.')).toBeVisible()
			const stores = within(canvas.getByRole('grid', { name: 'Stores' })).getAllByRole('row')
			await expect(stores).toHaveLength(grocery.stores.length)
			await expect(stores[0]).toHaveTextContent('2 left')
			await expect(stores[0]).toHaveTextContent(groceryShopDay)
			await expect(stores[1]).toHaveTextContent('Shopped 5 days ago')
			// each store leads with its picture (D-103): H-E-B its own, Target the store glyph on a tile
			await expect(stores[0]!.querySelector('img.ed-thumb')).not.toBeNull()
			await expect(stores[1]!.querySelector('.ed-thumb-tile')).not.toBeNull()
			await expect(canvas.getByRole('region', { name: 'H-E-B' }).querySelector('img.ed-thumb')).not.toBeNull()
			await expect(canvas.getByRole('region', { name: 'Miscellaneous' }).querySelector('.ed-thumb')).toBeNull()
			await userEvent.click(stores[1]!)
			await expect(args.ongostore).toHaveBeenCalledWith('gs-02')
		} else {
			await expect(rowsIn(canvas)).toBe(grocery.items.length)
			await expect(canvas.queryByRole('grid', { name: 'Stores' })).toBeNull()
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
		await expect(heb.getByText('Everything is checked. Complete the list once you are home.')).toBeVisible()
		await expect(heb.getByRole('button', { name: 'Complete H-E-B' })).toBeEnabled()
		await expect(listOf(canvas, 'Target').getByRole('button', { name: 'Complete Target' })).toBeEnabled()
	}}
/>

<!-- Nothing on any list: the EmptyState with Add an item, and every store still there -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'Nothing to buy' })).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Add an item' })).toBeVisible()
		await expect(canvas.getByRole('heading', { level: 2, name: 'Target' })).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Complete H-E-B' })).toBeDisabled()
		await expect(canvas.queryByRole('heading', { level: 2, name: 'Miscellaneous' })).toBeNull()
		await expect(within(canvas.getByRole('region', { name: 'H-E-B' })).queryAllByRole('row')).toHaveLength(0)
	}}
/>

<!-- No list has a shop day: no chip on any store, and the store's form offers Today and Tomorrow -->
<Story
	name="No shop day"
	{template}
	args={{ noShopDay: true, store: 'gs-01' }}
	parameters={{ platforms: ['desktop'], platformFrame: 'inline' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.queryByText(groceryShopDay)).toBeNull()
		const sheet = within(await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Edit store' }))
		// the panel unfurls before its controls can be seen
		await waitFor(() => expect(sheet.getByLabelText('Shop day')).toBeVisible())
		await expect(sheet.getByLabelText('Shop day')).toHaveValue('')
		await expect(sheet.getByLabelText('Time')).toBeDisabled()
		await expect(sheet.queryByRole('button', { name: 'No shop day' })).toBeNull()
		await userEvent.click(sheet.getByRole('button', { name: 'Tomorrow' }))
		await expect(sheet.getByLabelText('Shop day')).toHaveValue('2026-10-02')
		await expect(sheet.getByRole('button', { name: 'No shop day' })).toBeVisible()
	}}
/>

<!-- Edit store on H-E-B: its form in a sheet (D-95), its name, what it sells and its shop day, with Delete store at the foot -->
<Story
	name="Store form"
	{template}
	args={{ store: 'gs-01' }}
	parameters={{ platforms: ['desktop'], platformFrame: 'inline' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const sheet = within(await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Edit store' }))
		await waitFor(() => expect(sheet.getByRole('textbox', { name: 'Name' })).toBeVisible())
		await expect(sheet.getByRole('textbox', { name: 'Name' })).toHaveValue('H-E-B')
		await expect(sheet.getByRole('button', { name: 'Grocery' })).toHaveAttribute('aria-pressed', 'true')
		await expect(sheet.getByRole('button', { name: 'Home goods' })).toHaveAttribute('aria-pressed', 'false')
		await userEvent.click(sheet.getByRole('button', { name: 'Home goods' }))
		await expect(sheet.getByRole('button', { name: 'Home goods' })).toHaveAttribute('aria-pressed', 'true')
		await expect(sheet.getByRole('textbox', { name: 'Address' })).toHaveValue('2400 S Congress Ave, Austin')
		await expect(sheet.getByRole('textbox', { name: 'Website' })).toHaveValue('https://www.heb.com')
		// its picture, with the buttons that change it (D-103)
		await userEvent.click(sheet.getByRole('button', { name: 'Fetch the picture from the website' }))
		await expect(args.onfetchpicture).toHaveBeenCalledWith('gs-01')
		await userEvent.click(sheet.getByRole('button', { name: 'Remove the picture' }))
		await expect(args.onremovepicture).toHaveBeenCalledWith('gs-01')
		await expect(sheet.getByLabelText('Shop day')).toHaveValue('2026-10-03')
		await expect(sheet.getByLabelText('Time')).toHaveValue('10:00')
		await userEvent.click(sheet.getByRole('button', { name: 'Delete store' }))
		await expect(args.ondeletestore).toHaveBeenCalledWith('gs-01')
	}}
/>

<!-- Edit on the ginger's row: its form in a sheet (D-95), its store picked among the stores, the recipe it came from as its note -->
<Story
	name="Editing an item"
	{template}
	args={{ editing: 'g-03' }}
	parameters={{ platforms: ['desktop'], platformFrame: 'inline' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const sheet = within(await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Edit item' }))
		await waitFor(() => expect(sheet.getByRole('textbox', { name: 'Name' })).toBeVisible())
		await expect(sheet.getByRole('textbox', { name: 'Name' })).toHaveValue('Ginger')
		await expect(sheet.getByRole('textbox', { name: 'Quantity' })).toHaveValue('1')
		const where = within(sheet.getByRole('group', { name: 'Store' }))
		await expect(where.getByRole('button', { name: 'H-E-B' })).toHaveAttribute('aria-pressed', 'true')
		// the store it is on stays picked when it is clicked again
		await userEvent.click(where.getByRole('button', { name: 'H-E-B' }))
		await expect(where.getByRole('button', { name: 'H-E-B' })).toHaveAttribute('aria-pressed', 'true')
		await userEvent.click(where.getByRole('button', { name: 'Target' }))
		await expect(where.getByRole('button', { name: 'Target' })).toHaveAttribute('aria-pressed', 'true')
		await expect(where.getByRole('button', { name: 'H-E-B' })).toHaveAttribute('aria-pressed', 'false')
		await expect(where.getByRole('button', { name: 'Miscellaneous' })).toBeVisible()
		await expect(sheet.getByRole('textbox', { name: 'Note' })).toHaveValue('soba')
		await expect(sheet.getByRole('button', { name: 'Save' })).toBeEnabled()
		await expect(args.onsave).not.toHaveBeenCalled()
	}}
/>

<!-- Add in the header opens a menu of what can be added (D-102); Add store opens the store's form, blank -->
<Story
	name="Add menu"
	{template}
	parameters={{ platforms: ['desktop'], platformFrame: 'inline' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: 'Add' }))
		const item = await canvas.findByRole('menuitem', { name: 'Add item' })
		// the menu unfurls before its items can be seen
		await waitFor(() => expect(item).toBeVisible())
		await userEvent.click(canvas.getByRole('menuitem', { name: 'Add store' }))
		const sheet = within(await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Add store' }))
		await waitFor(() => expect(sheet.getByRole('textbox', { name: 'Name' })).toBeVisible())
		await expect(sheet.getByRole('textbox', { name: 'Name' })).toHaveValue('')
	}}
/>

<!-- Add on a list: the item's form, blank, with that list's store already picked -->
<Story
	name="Adding to a list"
	{template}
	parameters={{ platforms: ['desktop'], platformFrame: 'inline' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await userEvent.click(listOf(canvas, 'Target').getByRole('button', { name: 'Add to Target' }))
		const sheet = within(await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Add item' }))
		await waitFor(() => expect(sheet.getByRole('textbox', { name: 'Name' })).toBeVisible())
		const where = within(sheet.getByRole('group', { name: 'Store' }))
		await expect(where.getByRole('button', { name: 'Target' })).toHaveAttribute('aria-pressed', 'true')
		await userEvent.type(sheet.getByRole('textbox', { name: 'Name' }), 'Dish soap')
		await userEvent.click(sheet.getByRole('button', { name: 'Add' }))
		await expect(args.onadd).toHaveBeenCalledWith('Dish soap', 'gs-02')
	}}
/>

<!-- Add item: the item's form, blank, with no store picked until one is; Add reports the name and the store -->
<Story
	name="Adding an item"
	{template}
	args={{ adding: 'item' }}
	parameters={{ platforms: ['desktop'], platformFrame: 'inline' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const sheet = within(await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Add item' }))
		await waitFor(() => expect(sheet.getByRole('textbox', { name: 'Name' })).toBeVisible())
		await expect(sheet.getByRole('button', { name: 'Add' })).toBeDisabled()
		const where = within(sheet.getByRole('group', { name: 'Store' }))
		for (const name of ['H-E-B', 'Target', 'Miscellaneous']) {
			await expect(where.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
		}
		await expect(sheet.getByText('With no store picked, it goes where it was last bought.')).toBeVisible()
		await userEvent.type(sheet.getByRole('textbox', { name: 'Name' }), 'Oat milk')
		// a store picked can be unpicked again while adding
		await userEvent.click(where.getByRole('button', { name: 'H-E-B' }))
		await userEvent.click(where.getByRole('button', { name: 'H-E-B' }))
		await expect(where.getByRole('button', { name: 'H-E-B' })).toHaveAttribute('aria-pressed', 'false')
		await userEvent.click(where.getByRole('button', { name: 'Target' }))
		await userEvent.click(sheet.getByRole('button', { name: 'Add' }))
		await expect(args.onadd).toHaveBeenCalledWith('Oat milk', 'gs-02')
	}}
/>

<!-- Add store: the store's form, blank, Grocery picked among what it sells and no Delete store at its foot -->
<Story
	name="Adding a store"
	{template}
	args={{ adding: 'store' }}
	parameters={{ platforms: ['desktop'], platformFrame: 'inline' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const sheet = within(await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Add store' }))
		await waitFor(() => expect(sheet.getByRole('textbox', { name: 'Name' })).toBeVisible())
		await expect(sheet.getByRole('button', { name: 'Grocery' })).toHaveAttribute('aria-pressed', 'true')
		await expect(sheet.queryByRole('button', { name: 'Delete store' })).toBeNull()
		await expect(sheet.getByRole('button', { name: 'Add' })).toBeDisabled()
		await userEvent.type(sheet.getByRole('textbox', { name: 'Name' }), 'Central Market')
		await userEvent.click(sheet.getByRole('button', { name: 'Add' }))
		await expect(args.onaddstore).toHaveBeenCalledWith('Central Market')
	}}
/>

<!-- Buy it again (D-92): what ran out sits at the side above the stores (D-101), and a click on a row puts it on the list it was last bought from -->
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
