<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { grocery, ideas, stock } from '../../../stories/sample-data.js'
	import EmptyState from '../EmptyState/EmptyState.svelte'
	import type { MenuItem } from '../Menu/Menu.svelte'
	import List, { type ListRowData } from './List.svelte'

	const strings = defaultStrings
	/** Today is 09-30: anything dated 10-01 expires tomorrow. */
	const tomorrow = '10-01'

	const fridgeActions: MenuItem[] = [
		{ id: 'edit', label: 'Edit', icon: 'pencil' },
		{ id: 'move', label: 'Move', icon: 'arrow-right' },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
	]
	const fridge: ListRowData[] = stock
		.filter((item) => item.location === 'fridge')
		.map((item) => ({
			id: item.id,
			primary: item.name,
			chips: [{ label: item.unit ? `${item.qty} ${item.unit}` : item.qty, mono: true }],
			badges: [
				...(item.expiry === tomorrow ? [{ kind: 'warning' as const, label: 'expires tomorrow' }] : []),
				...(item.estimated ? [{ kind: 'estimated' as const }] : []),
			],
			meta: item.expiry,
			metaWarn: item.expiry === tomorrow,
			actions: fridgeActions,
		}))

	const groceryActions: MenuItem[] = [
		{ id: 'check', label: 'Check off', icon: 'check' },
		{ id: 'edit', label: 'Edit', icon: 'pencil' },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
	]
	const groceries: ListRowData[] = grocery.items.map((item) => ({
		id: item.id,
		primary: item.name,
		chips: item.qty ? [{ label: item.qty, mono: true }] : [],
		badges: [{ kind: 'origin', label: item.origin }],
		done: item.done,
		actions: groceryActions,
	}))

	const ideaRows: ListRowData[] = ideas
		.filter((idea) => idea.status !== 'archived')
		.map((idea) => ({
			id: idea.id,
			primary: idea.title,
			icon: 'lightbulb',
			meta: 'untouchedDays' in idea ? `${idea.untouchedDays} d` : idea.status,
			metaWarn: 'untouchedDays' in idea,
		}))

	const { Story } = defineMeta({
		title: 'Components/Data/List',
		component: List,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Rows on a card with a header and a select mode (D-41). "Select" in the header or at the top of any row’s menu turns the mode on: the marks slide in, a click or Space toggles a row, the header counts the selection and offers Done. The rows are one tab stop: arrows, Home and End move, a letter jumps to the next row starting with it, Enter opens.',
				},
			},
		},
		args: {
			header: 'Fridge',
			count: fridge.length,
			rows: fridge,
			selectable: true,
			onopen: fn(),
			onaction: fn(),
			onselect: fn(),
		},
		argTypes: { rows: { control: false } },
	})
</script>

<script lang="ts">
	/** The Leaving story's rows: Delete in a row's menu takes it away, and the row collapses. */
	let staying = $state<ListRowData[]>(fridge.slice(0, 4))
	function remove(item: MenuItem, row: ListRowData) {
		if (item.id === 'delete') staying = staying.filter((entry) => entry.id !== row.id)
	}
</script>

{#snippet template(args: ComponentProps<typeof List>)}
	<div class="col"><List {...args} /></div>
{/snippet}

<!-- The fridge: expiry in mono, `estimated` where the capture guessed; arrows move between rows, Enter opens, ⋯ opens the menu with Select first -->
<Story
	name="Fridge"
	parameters={{ platformFrame: 'inline' }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const grid = canvas.getByRole('grid', { name: 'Fridge' })
		const rows = canvas.getAllByRole('row')
		await expect(rows).toHaveLength(fridge.length)
		await expect(grid).not.toHaveAttribute('aria-multiselectable')
		// one tab stop: the first row, then the arrows
		await expect(rows[0]).toHaveAttribute('tabindex', '0')
		await expect(rows[1]).toHaveAttribute('tabindex', '-1')
		rows[0]!.focus()
		await userEvent.keyboard('{ArrowDown}')
		await expect(rows[1]).toHaveFocus()
		await userEvent.keyboard('{End}')
		await expect(rows[rows.length - 1]).toHaveFocus()
		await userEvent.keyboard('{Home}')
		await expect(rows[0]).toHaveFocus()
		// typeahead on the primary text: t jumps to Tofu
		await userEvent.keyboard('t')
		await expect(rows[6]).toHaveFocus()
		await userEvent.keyboard('{Enter}')
		await expect(args.onopen).toHaveBeenLastCalledWith(fridge[6])
		// the menu leads with Select while the list is selectable; a pick reaches onaction with its row
		await userEvent.click(canvas.getByRole('button', { name: strings.actionsFor(fridge[0]!.primary) }))
		await canvas.findByRole('menu')
		const items = canvas.getAllByRole('menuitem')
		await expect(items[0]).toHaveTextContent(strings.select)
		await userEvent.click(canvas.getByRole('menuitem', { name: 'Delete' }))
		await waitFor(() => expect(args.onaction).toHaveBeenLastCalledWith(fridgeActions[2], fridge[0]))
		await expect(args.onselect).not.toHaveBeenCalled()
	}}
/>

<!-- Select in the header: marks on every row, Space toggles, the header counts, Done clears -->
<Story
	name="Select mode"
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const marks = () => canvasElement.querySelectorAll('.ed-row-mark')
		await expect(marks()).toHaveLength(0)
		const toggleButton = canvas.getByRole('button', { name: strings.select })
		await userEvent.click(toggleButton)
		const rows = canvas.getAllByRole('row')
		await expect(canvas.getByRole('grid')).toHaveAttribute('aria-multiselectable', 'true')
		await expect(marks()).toHaveLength(rows.length)
		for (const row of rows) await expect(row).toHaveAttribute('aria-selected', 'false')
		await expect(toggleButton).toHaveAccessibleName(strings.done)
		// Tab from the header lands on the first row; Space toggles, ArrowDown moves
		await userEvent.tab()
		await expect(rows[0]).toHaveFocus()
		await userEvent.keyboard(' ')
		await expect(rows[0]).toHaveAttribute('aria-selected', 'true')
		await expect(args.onselect).toHaveBeenLastCalledWith([fridge[0]!.id])
		await userEvent.keyboard('{ArrowDown}')
		await userEvent.keyboard(' ')
		await expect(rows[1]).toHaveAttribute('aria-selected', 'true')
		await expect(args.onselect).toHaveBeenLastCalledWith([fridge[0]!.id, fridge[1]!.id])
		await expect(canvas.getByText(strings.selected(2))).toBeVisible()
		// Done leaves the mode and clears the selection
		await userEvent.click(toggleButton)
		await expect(args.onselect).toHaveBeenLastCalledWith([])
		await expect(toggleButton).toHaveAccessibleName(strings.select)
		for (const row of rows) await expect(row).not.toHaveAttribute('aria-selected')
		await waitFor(() => expect(marks()).toHaveLength(0))
		await expect(canvas.getByText(String(fridge.length))).toBeVisible()
	}}
/>

<!-- Compact hides the detail lines; the 32 px rows come from data-density -->
<Story
	name="Compact"
	args={{ header: 'Ideas', count: ideaRows.length, rows: ideaRows, compact: true, selectable: false }}
	parameters={{ platforms: ['desktop'] }}
>
	{#snippet template(args: ComponentProps<typeof List>)}
		<div class="col" data-density="compact"><List {...args} /></div>
	{/snippet}
</Story>

<!-- No rows: the header stays and an EmptyState fills the card through `children` -->
<Story name="Empty" args={{ rows: [], count: 0, selectable: false }}>
	{#snippet template(args: ComponentProps<typeof List>)}
		<div class="col">
			<List {...args}>
				<EmptyState
					title="Nothing in the fridge yet"
					text="Capture a haul or add an item."
					action={{ label: 'Add an item', icon: 'plus', onclick: fn() }}
				/>
			</List>
		</div>
	{/snippet}
</Story>

<!-- Check-off rows: `done` strikes the name through; the origin badge says where the item came from -->
<Story
	name="Grocery"
	args={{ header: grocery.name, count: groceries.length, rows: groceries }}
	{template}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('grid', { name: grocery.name })).toBeInTheDocument()
		await expect(canvas.getAllByRole('row')).toHaveLength(groceries.length)
	}}
/>

<!-- A row that leaves collapses over the settle duration (a fade under reduced motion); its focus goes to the row that takes its place, or to the one before it when it was last -->
<Story
	name="Leaving"
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		const rows = () => canvas.getAllByRole('row')
		const remove = async (row: HTMLElement) => {
			row.focus()
			await userEvent.keyboard('{Shift>}{F10}{/Shift}')
			await canvas.findByRole('menu')
			await userEvent.click(canvas.getByRole('menuitem', { name: 'Delete' }))
		}
		await expect(rows()).toHaveLength(4)
		// a middle row: the row after it takes its place and its focus
		await remove(rows()[1]!)
		await waitFor(() => expect(rows()).toHaveLength(3))
		await expect(rows()[1]).toHaveTextContent(fridge[2]!.primary)
		await expect(rows()[1]).toHaveFocus()
		// the last row: the one before it takes the focus
		await remove(rows()[2]!)
		await waitFor(() => expect(rows()).toHaveLength(2))
		await expect(rows()[1]).toHaveTextContent(fridge[2]!.primary)
		await expect(rows()[1]).toHaveFocus()
	}}
>
	{#snippet template()}
		<div class="col"><List header="Fridge" count={staying.length} rows={staying} onaction={remove} /></div>
	{/snippet}
</Story>

<!-- The phone: 44 px rows, the larger text, the menu as a bottom sheet -->
<Story name="Mobile" parameters={{ platforms: ['mobile'] }} {template} />

<style>
	.col {
		max-width: calc(var(--sheet-max) * 0.55);
	}
</style>
