<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { SvelteRenderer } from '@storybook/svelte'
	import type { PlayFunctionContext } from 'storybook/internal/csf'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { grocery, ideas, stock } from '../../../stories/sample-data.js'
	import EmptyState from '../EmptyState/EmptyState.svelte'
	import IconButton from '../IconButton/IconButton.svelte'
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
	const heb = grocery.stores[0]!
	const groceries: ListRowData[] = grocery.items
		.filter((item) => item.listId === 'gl-01')
		.map((item) => ({
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

	const ondelete = fn()

	/** The swipe stories: rows with no menu of their own, so the two swipe actions are their menu. */
	const bare: ListRowData[] = fridge.slice(0, 4).map((row) => ({ ...row, actions: undefined }))
	const swipeDone = fn()
	const swipeDelete = fn()
	const calls = (spy: unknown) => (spy as ReturnType<typeof fn>).mock.calls.length
	/** Presses on a row's content, moves the pointer `dx` to the right (left when negative) and lets go. */
	const drag = (user: PlayFunctionContext<SvelteRenderer>['userEvent'], content: HTMLElement, dx: number) =>
		user.pointer([
			{ keys: '[MouseLeft>]', target: content, coords: { x: 100, y: 20 } },
			{ coords: { x: 100 + dx / 2, y: 21 } },
			{ coords: { x: 100 + dx, y: 22 } },
			{ keys: '[/MouseLeft]' },
		])
	const contentOf = (row: HTMLElement) => row.querySelector<HTMLElement>('.ed-swipe-content')!
	const labels = (items: HTMLElement[]) => items.map((item) => item.textContent?.trim())

	const { Story } = defineMeta({
		title: 'Components/Data/List',
		component: List,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Rows on a card with a header and a select mode (D-41). "Select" in the header or at the top of any row’s menu turns the mode on: the marks slide in, a click or Space toggles a row, the header counts the selection and offers Done. The rows are one tab stop: arrows, Home and End move, a letter jumps to the next row starting with it. A click picks a row and the caller’s `current` row is highlighted; a double-click, or Enter on the current row, opens it; a Ctrl, Cmd or Shift click starts the selection from where it lands (D-94). A `checkable` row leads with a checkbox, for a checklist.',
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

	/** The swipe stories' rows: Done and Delete take a row away, so it collapses as it would in the app. */
	let swiping = $state<ListRowData[]>(bare)
	const take = (row: ListRowData) => (swiping = swiping.filter((entry) => entry.id !== row.id))
	const leading = (row: ListRowData) => ({
		label: 'Done',
		icon: 'check' as const,
		onaction: () => {
			swipeDone(row)
			take(row)
		},
	})
	const trailing = (row: ListRowData) => ({
		label: 'Delete',
		icon: 'trash' as const,
		onaction: () => {
			swipeDelete(row)
			take(row)
		},
	})
	/** The checklist that swipes: a tap, the checkbox and the leading swipe all check a row. */
	let checked = $state<string[]>(groceries.filter((row) => row.done).map((row) => row.id))
	const check = (row: ListRowData) =>
		(checked = checked.includes(row.id) ? checked.filter((id) => id !== row.id) : [...checked, row.id])
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

<!-- `bulk` puts the caller's action on the selection in the header, beside the count, only while selecting -->
<Story
	name="Bulk action"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		ondelete.mockClear()
		await expect(canvas.queryByRole('button', { name: 'Delete selected' })).toBeNull()
		await userEvent.click(canvas.getByRole('button', { name: strings.select }))
		const remove = canvas.getByRole('button', { name: 'Delete selected' })
		await expect(remove).toBeDisabled()
		const rows = canvas.getAllByRole('row')
		await userEvent.click(rows[0]!)
		await userEvent.click(rows[2]!)
		await expect(remove).toBeEnabled()
		await userEvent.click(remove)
		await expect(ondelete).toHaveBeenLastCalledWith([fridge[0]!.id, fridge[2]!.id])
		await userEvent.click(canvas.getByRole('button', { name: strings.done }))
		await expect(canvas.queryByRole('button', { name: 'Delete selected' })).toBeNull()
	}}
>
	{#snippet template(args: ComponentProps<typeof List>)}
		<div class="col">
			<List {...args}>
				{#snippet bulk(ids: string[])}
					<IconButton
						icon="trash"
						size="xs"
						label="Delete selected"
						danger
						tooltip
						disabled={!ids.length}
						onclick={() => ondelete(ids)}
					/>
				{/snippet}
			</List>
		</div>
	{/snippet}
</Story>

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
	args={{
		header: heb.name,
		count: groceries.length,
		rows: groceries.map((row) => ({ ...row, checkable: true })),
		selectable: false,
		onpick: fn(),
		oncheck: fn(),
	}}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('grid', { name: heb.name })).toBeInTheDocument()
		const rows = canvas.getAllByRole('row')
		await expect(rows).toHaveLength(groceries.length)
		// a checklist: every row leads with its checkbox, checked where the row is done
		const boxes = canvas.getAllByRole('checkbox')
		await expect(boxes).toHaveLength(groceries.length)
		const done = groceries.findIndex((row) => row.done)
		await expect(boxes[done]).toBeChecked()
		const open = groceries.findIndex((row) => !row.done)
		await userEvent.click(boxes[open]!)
		await expect(args.oncheck).toHaveBeenCalledTimes(1)
		// a press on the checkbox is not a press on the row
		await expect(args.onpick).not.toHaveBeenCalled()
		await userEvent.click(rows[open]!)
		await expect(args.onpick).toHaveBeenCalledTimes(1)
	}}
/>

<!-- A click picks a row and the caller's `current` row is highlighted; a double-click opens it; a Ctrl or Cmd click
     starts the selection with the current row in it, and a Shift click takes the rows between (D-94) -->
<Story
	name="Picking"
	args={{ current: fridge[1]!.id, onpick: fn(), onopen: fn() }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const rows = canvas.getAllByRole('row')
		await expect(rows[1]).toHaveAttribute('aria-current', 'true')
		await userEvent.click(rows[0]!)
		await expect(args.onpick).toHaveBeenCalledTimes(1)
		await expect(args.onopen).not.toHaveBeenCalled()
		await userEvent.dblClick(rows[0]!)
		await expect(args.onopen).toHaveBeenCalledTimes(1)
		const user = userEvent.setup()
		await user.keyboard('{Control>}')
		await user.click(rows[3]!)
		await user.keyboard('{/Control}')
		await expect(canvas.getByRole('grid')).toHaveAttribute('aria-multiselectable', 'true')
		await expect(rows[1]).toHaveAttribute('aria-selected', 'true')
		await expect(rows[3]).toHaveAttribute('aria-selected', 'true')
		await expect(rows[2]).toHaveAttribute('aria-selected', 'false')
		await user.keyboard('{Shift>}')
		await user.click(rows[5]!)
		await user.keyboard('{/Shift}')
		await expect(rows[4]).toHaveAttribute('aria-selected', 'true')
		await expect(rows[5]).toHaveAttribute('aria-selected', 'true')
		await expect(canvas.getByText(strings.selected(4))).toBeVisible()
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

<!-- Rows that swipe on the phone: a drag to the right past the action's width is Done, to the left Delete; a short
     drag settles back; a tap still opens the row. The rows have no menu of their own, so the two actions are their
     menu, with no ⋯ button: a held press or Shift+F10 opens it, which is the way in under reduced motion too -->
<Story
	name="Swipe"
	parameters={{ platforms: ['mobile'] }}
	args={{ selectable: false, onopen: fn() }}
	play={async ({ canvasElement, userEvent: user, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const rows = () => canvas.getAllByRole('row')
		await expect(rows()).toHaveLength(bare.length)
		await expect(canvas.queryByRole('button', { name: strings.actionsFor(bare[0]!.primary) })).toBeNull()
		// the buttons behind a row are not tab stops: the list is one
		await expect(rows()[0]!.querySelectorAll('.ed-swipe-action[tabindex="-1"]')).toHaveLength(2)
		// the travelling content covers the row from edge to edge, on a ground of its own, so it hides the actions
		const [rowBox, contentBox] = [rows()[0]!.getBoundingClientRect(), contentOf(rows()[0]!).getBoundingClientRect()]
		await expect(Math.round(contentBox.width)).toBe(Math.round(rowBox.width))
		await expect(rowBox.height - contentBox.height).toBeLessThanOrEqual(1)
		await expect(getComputedStyle(contentOf(rows()[0]!)).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
		const [done, removed, opened] = [calls(swipeDone), calls(swipeDelete), calls(args.onopen)]
		// a short drag settles back and fires nothing
		await drag(user, contentOf(rows()[0]!), 30)
		await expect(swipeDone).toHaveBeenCalledTimes(done)
		// past the action's width: Done, and the row leaves
		await drag(user, contentOf(rows()[0]!), 140)
		await expect(swipeDone).toHaveBeenCalledTimes(done + 1)
		await expect(swipeDone).toHaveBeenLastCalledWith(bare[0])
		await waitFor(() => expect(rows()).toHaveLength(bare.length - 1))
		// a drag is never a tap, and a tap still opens
		await expect(args.onopen).toHaveBeenCalledTimes(opened)
		await user.click(rows()[0]!)
		await expect(args.onopen).toHaveBeenLastCalledWith(bare[1])
		// to the left: Delete
		await drag(user, contentOf(rows()[0]!), -140)
		await expect(swipeDelete).toHaveBeenCalledTimes(removed + 1)
		await expect(swipeDelete).toHaveBeenLastCalledWith(bare[1])
		await waitFor(() => expect(rows()).toHaveLength(bare.length - 2))
		// without a swipe: the row's menu holds both, the trailing one last and destructive
		rows()[0]!.focus()
		await user.keyboard('{Shift>}{F10}{/Shift}')
		const menu = await canvas.findByRole('menu')
		await expect(labels(within(menu).getAllByRole('menuitem'))).toEqual(['Done', 'Delete'])
		await user.click(within(menu).getByRole('menuitem', { name: 'Done' }))
		await waitFor(() => expect(swipeDone).toHaveBeenLastCalledWith(bare[2]))
		// a swipe action is its own callback, never the list's onaction
		await expect(args.onaction).not.toHaveBeenCalled()
	}}
>
	{#snippet template(args)}
		<div class="col"><List {...args} count={swiping.length} rows={swiping} {leading} {trailing} /></div>
	{/snippet}
</Story>

<!-- A checklist that swipes, as Grocery is on the phone: a tap checks, the leading swipe checks, the trailing one
     deletes, and the rows keep their own menu, so the ⋯ button stays and its menu is theirs as written. A press on
     the ⋯ button or the checkbox is theirs, never the swipe's -->
<Story
	name="Swipe with a menu"
	parameters={{ platforms: ['mobile'] }}
	args={{ header: heb.name, count: groceries.length, selectable: false }}
	play={async ({ canvasElement, userEvent: user }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const rows = canvas.getAllByRole('row')
		const open = groceries.findIndex((row) => !row.done)
		const box = within(rows[open]!).getByRole('checkbox')
		await expect(box).not.toBeChecked()
		// a tap on the row checks it; the checkbox unchecks it again
		await user.click(rows[open]!)
		await expect(box).toBeChecked()
		await user.click(box)
		await expect(box).not.toBeChecked()
		// the leading swipe checks too
		await drag(user, contentOf(rows[open]!), 140)
		await expect(box).toBeChecked()
		// the ⋯ button's press is its own: the menu opens, and it is the row's menu as written
		const removed = calls(swipeDelete)
		await user.click(within(rows[open]!).getByRole('button', { name: strings.actionsFor(groceries[open]!.primary) }))
		const menu = await canvas.findByRole('menu')
		await expect(labels(within(menu).getAllByRole('menuitem'))).toEqual(groceryActions.map((item) => item.label))
		await user.keyboard('{Escape}')
		await waitFor(() => expect(canvas.queryByRole('menu')).toBeNull())
		await expect(box).toBeChecked()
		await drag(user, contentOf(rows[open]!), -140)
		await expect(swipeDelete).toHaveBeenCalledTimes(removed + 1)
	}}
>
	{#snippet template(args)}
		<div class="col">
			<List
				{...args}
				rows={groceries.map((row) => ({ ...row, checkable: true, done: checked.includes(row.id) }))}
				onpick={check}
				oncheck={check}
				leading={(row) => ({ label: row.done ? 'Uncheck' : 'Check off', icon: 'check', onaction: () => check(row) })}
				trailing={(row) => ({ label: 'Delete', icon: 'trash', onaction: () => swipeDelete(row) })}
			/>
		</div>
	{/snippet}
</Story>

<!-- The same props on desktop: nothing swipes and nothing is drawn behind the rows. A row with no menu of its own
     gets one from the two actions, with its ⋯ button, so Done and Delete are a click, a right-click or Shift+F10 away -->
<Story
	name="Swipe props on desktop"
	parameters={{ platforms: ['desktop'] }}
	args={{ selectable: false }}
	play={async ({ canvasElement, userEvent: user, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const rows = () => canvas.getAllByRole('row')
		await expect(canvasElement.querySelector('.ed-swipe-content, .ed-swipe-action')).toBeNull()
		const removed = calls(swipeDelete)
		await user.click(canvas.getByRole('button', { name: strings.actionsFor(bare[0]!.primary) }))
		const menu = await canvas.findByRole('menu')
		await expect(labels(within(menu).getAllByRole('menuitem'))).toEqual(['Done', 'Delete'])
		await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }))
		await waitFor(() => expect(swipeDelete).toHaveBeenCalledTimes(removed + 1))
		await expect(swipeDelete).toHaveBeenLastCalledWith(bare[0])
		await waitFor(() => expect(rows()).toHaveLength(bare.length - 1))
		await expect(args.onaction).not.toHaveBeenCalled()
	}}
>
	{#snippet template(args)}
		<div class="col"><List {...args} count={swiping.length} rows={swiping} {leading} {trailing} /></div>
	{/snippet}
</Story>

<style>
	.col {
		max-width: calc(var(--sheet-max) * 0.55);
	}
</style>
