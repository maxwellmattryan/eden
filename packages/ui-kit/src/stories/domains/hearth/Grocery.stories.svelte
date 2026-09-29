<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { grocery, sidebar } from '../../sample-data.js'
	import Grocery from './Grocery.svelte'

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
						'Hearth’s Grocery view (product/domains/kitchen.md), mocked from kit components under D-54. The Stock header with the Grocery tab selected and Add as the primary action, a quick-add line, then the active list grouped by store with its shop-day Event beside the store’s name. Each row carries an origin badge (manual, recipe, low stock); a checked row is struck through and stays until Clear checked. On mobile a swipe to the right checks a row off and a swipe to the left deletes it.',
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
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Grocery>)}
	<Grocery {...args} />
{/snippet}

<!-- H-E-B Saturday: four items, the ginger already checked -->
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

<!-- Nothing on the list: the EmptyState with Add as its action -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'The list is empty' })).toBeVisible()
		await expect(rowsIn(canvas)).toBe(0)
	}}
/>
