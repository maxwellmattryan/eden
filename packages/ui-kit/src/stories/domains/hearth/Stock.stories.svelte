<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { sidebar, stock } from '../../sample-data.js'
	import Stock from './Stock.svelte'

	const strings = defaultStrings
	const hearth = sidebar.items.find((entry) => entry.id === 'kitchen')!
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
						'Hearth’s Stock view (product/domains/kitchen.md), mocked from kit components under D-54. The page header carries Capture a haul as the primary action, the domain’s tabs and the Expiring, Low stock and sort chips; a quick-add line sits above one List per location (Fridge, Freezer, Pantry, Counter) sorted by expiry, quantities in mono, `estimated` where the capture guessed, a warning where stock is low. On desktop the selected item opens in a detail pane with its fields, the storage tip and the row’s actions; on mobile every row sits in a SwipeRow whose trailing action deletes.',
				},
			},
		},
		args: {
			oncapture: fn(),
			onadd: fn(),
			onopen: fn(),
			onaction: fn(),
			ondelete: fn(),
			onsample: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Stock>)}
	<Stock {...args} />
{/snippet}

<!-- The sample stock in its four locations; chicken thighs open in the detail pane on desktop -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('main')).toBeVisible()
		await expect(canvas.getByRole('heading', { level: 1, name: hearth.name })).toBeVisible()
		await expect(canvas.getByRole('tab', { name: 'Stock' })).toHaveAttribute('aria-selected', 'true')
		await expect(canvas.getByRole('button', { name: 'Capture a haul' })).toBeVisible()
		await expect(canvas.getByRole('textbox', { name: 'Add to stock' })).toBeVisible()
		await expect(rowsIn(canvas)).toBe(stock.length)
		if (canvas.queryByRole('contentinfo', { name: strings.statusBar.label })) {
			await expect(canvas.getByRole('grid', { name: 'Fridge' })).toBeVisible()
			await expect(canvas.getByRole('complementary', { name: stock[0]!.name })).toBeVisible()
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

<!-- Nothing in stock: the EmptyState with Capture a haul and the sample-data link; the header's actions step back -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'Nothing in stock yet' })).toBeVisible()
		await expect(rowsIn(canvas)).toBe(0)
		const link = canvas.getByRole('button', { name: 'Add sample data' })
		link.click()
		await expect(args.onsample).toHaveBeenCalledTimes(1)
	}}
/>

<!-- The phone alone: 44 px rows, each in a SwipeRow whose trailing action deletes -->
<Story name="Mobile" {template} parameters={{ platforms: ['mobile'] }} />
