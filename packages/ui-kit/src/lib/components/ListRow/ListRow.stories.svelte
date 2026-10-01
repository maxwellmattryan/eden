<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { iconNames } from '$lib/icons/icons.js'
	import { grocery, stock } from '../../../stories/sample-data.js'
	import type { MenuItem } from '../Menu/Menu.svelte'
	import ListRow from './ListRow.svelte'

	const strings = defaultStrings
	const chicken = stock[0]!
	const spinach = stock[3]!
	const ginger = grocery.items[2]!

	/** The fridge row's menu: Delete arrives last and renders last, after a separator. */
	const actions: MenuItem[] = [
		{ id: 'edit', label: 'Edit', icon: 'pencil', onselect: fn() },
		{ id: 'grocery', label: 'Add to grocery', icon: 'plus', onselect: fn() },
		{ id: 'cook', label: 'Cook tonight', icon: 'cooking-pot', onselect: fn() },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true, onselect: fn() },
	]

	const { Story } = defineMeta({
		title: 'Components/Data/ListRow',
		component: ListRow,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'One row: a leading icon, the primary text with detail chips and badges beneath, trailing metadata in mono, and a ⋯ button that opens the row’s menu (a right-click, a long-press and Shift+F10 open the same one). Enter or a double-click opens the row. Selection is a mode: outside it the row shows no mark; while the list is selecting a round mark slides in and a click or Space toggles the row. Standalone it is a list item; inside List it is a grid row.',
				},
			},
		},
		args: {
			id: chicken.id,
			primary: chicken.name,
			chips: [{ label: `${chicken.qty} ${chicken.unit}`, mono: true }],
			meta: chicken.expiry,
			onopen: fn(),
			onaction: fn(),
			onselect: fn(),
		},
		argTypes: {
			icon: { control: 'select', options: iconNames },
			actions: { control: false },
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof ListRow>)}
	<div class="card" role="list"><ListRow {...args} /></div>
{/snippet}

<!-- The primary text, a mono quantity chip and the expiry in mono; Enter opens -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const row = canvas.getByRole('listitem')
		row.focus()
		await userEvent.keyboard('{Enter}')
		await expect(args.onopen).toHaveBeenCalledTimes(1)
		await expect(canvas.queryByRole('button')).toBeNull()
	}}
/>

<!-- A leading icon, a secondary line, then the chips and badges: a warning with its date and `estimated` -->
<Story
	name="Detail"
	args={{
		id: spinach.id,
		primary: spinach.name,
		secondary: 'From the 09-29 haul',
		icon: 'leaf',
		chips: [
			{ label: `${spinach.qty} ${spinach.unit}`, mono: true },
			{ label: 'Fridge', icon: 'house' },
		],
		badges: [{ kind: 'warning', label: 'expires tomorrow' }, { kind: 'estimated' }],
		meta: spinach.expiry,
		metaWarn: true,
	}}
	{template}
/>

<!-- Checked off: struck through and quiet -->
<Story
	name="Done"
	args={{
		id: ginger.id,
		primary: ginger.name,
		chips: [{ label: ginger.qty, mono: true }],
		badges: [{ kind: 'origin', label: ginger.origin }],
		done: true,
	}}
	{template}
/>

<!-- Select mode needs a grid (aria-selected is not allowed on a list item): a row outside the mode, one inside it, one selected. Space toggles. -->
<Story
	name="Selecting"
	args={{ selecting: true }}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const rows = canvas.getAllByRole('row')
		await expect(rows[0]).not.toHaveAttribute('aria-selected')
		await expect(rows[1]).toHaveAttribute('aria-selected', 'false')
		await expect(rows[2]).toHaveAttribute('aria-selected', 'true')
		rows[1]!.focus()
		await userEvent.keyboard(' ')
		await expect(rows[1]).toHaveAttribute('aria-selected', 'true')
		await expect(args.onselect).toHaveBeenLastCalledWith(true)
		await userEvent.keyboard(' ')
		await expect(rows[1]).toHaveAttribute('aria-selected', 'false')
		await expect(args.onselect).toHaveBeenLastCalledWith(false)
		// Enter still opens, Space never does
		await userEvent.keyboard('{Enter}')
		await expect(args.onopen).toHaveBeenCalledTimes(1)
	}}
>
	{#snippet template(args: ComponentProps<typeof ListRow>)}
		<div class="card" role="grid" aria-multiselectable="true">
			<ListRow {...args} id={spinach.id} primary={spinach.name} inGrid selecting={false} />
			<ListRow {...args} inGrid />
			<ListRow {...args} id={stock[2]!.id} primary={stock[2]!.name} inGrid selected />
		</div>
	{/snippet}
</Story>

<!-- The ⋯ button and the same menu from the keyboard: Shift+F10 opens it with the first item focused, Escape hands focus back to the row -->
<Story
	name="With actions"
	args={{ actions }}
	parameters={{ platformFrame: 'inline' }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const row = canvas.getByRole('listitem')
		const more = canvas.getByRole('button', { name: strings.actionsFor(chicken.name) })
		await expect(more).toHaveAttribute('aria-haspopup', 'menu')
		await expect(more).toHaveAttribute('aria-expanded', 'false')
		row.focus()
		await userEvent.keyboard('{Shift>}{F10}{/Shift}')
		const menu = await canvas.findByRole('menu')
		const items = canvas.getAllByRole('menuitem')
		await waitFor(() => expect(items[0]).toHaveFocus())
		await expect(more).toHaveAttribute('aria-expanded', 'true')
		await expect(items[items.length - 1]).toHaveTextContent('Delete')
		await expect(canvas.getByRole('separator')).toBeInTheDocument()
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(menu).not.toBeVisible())
		await waitFor(() => expect(row).toHaveFocus())
		// the ⋯ button opens the same menu, and pressed again closes it (a popover; the phone's sheet is modal)
		await userEvent.click(more)
		const opened = await canvas.findByRole('menu')
		if (opened.closest('[popover]')) {
			await userEvent.click(more)
			await waitFor(() => expect(opened).not.toBeVisible())
			await expect(more).toHaveAttribute('aria-expanded', 'false')
			await userEvent.click(more)
			await canvas.findByRole('menu')
		}
		// a pick reaches onaction
		await userEvent.click(canvas.getByRole('menuitem', { name: 'Edit' }))
		await waitFor(() => expect(args.onaction).toHaveBeenLastCalledWith(actions[0]))
	}}
/>

<!-- Compact hides the detail line; the 32 px height comes from data-density -->
<Story name="Compact" args={{ compact: true, icon: 'leaf', actions }} parameters={{ platforms: ['desktop'] }}>
	{#snippet template(args: ComponentProps<typeof ListRow>)}
		<div data-density="compact">
			<div class="card" role="list">
				<ListRow {...args} />
				<ListRow {...args} id={spinach.id} primary={spinach.name} meta={spinach.expiry} metaWarn />
			</div>
		</div>
	{/snippet}
</Story>

<!-- The 44 px row and the larger text on the phone -->
<Story name="Mobile" args={{ icon: 'leaf', actions }} parameters={{ platforms: ['mobile'] }} {template} />

<style>
	.card {
		max-width: calc(var(--sheet-max) * 0.55);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		overflow: hidden;
	}
</style>
