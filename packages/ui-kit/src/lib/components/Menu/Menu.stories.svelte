<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { recipes } from '../../../stories/sample-data.js'
	import IconButton from '../IconButton/IconButton.svelte'
	import Menu, { type MenuItem } from './Menu.svelte'

	const strings = defaultStrings
	const recipe = recipes[0]!
	const triggerName = strings.actionsFor(recipe.name)

	// The recipe row's actions. Each item's onselect is a spy, so a play can check it ran before the menu's own.
	const basic: MenuItem[] = [
		{ id: 'open', label: 'Open', onselect: fn() },
		{ id: 'edit', label: 'Edit', onselect: fn() },
		{ id: 'duplicate', label: 'Duplicate', onselect: fn() },
	]
	const withIcons: MenuItem[] = [
		{ id: 'open', label: 'Open', icon: 'chevron-right', shortcut: '↵', onselect: fn() },
		{ id: 'edit', label: 'Edit', icon: 'pencil', shortcut: 'E', onselect: fn() },
		{ id: 'grocery', label: 'Add to grocery', icon: 'plus', onselect: fn() },
		{ id: 'copy', label: 'Copy link', icon: 'copy', shortcut: '⌘C', onselect: fn() },
		{ id: 'delete', label: 'Delete', icon: 'trash', shortcut: '⌫', destructive: true, onselect: fn() },
	]
	// Delete arrives first and must land last, after a separator.
	const destructiveFirst: MenuItem[] = [
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true, onselect: fn() },
		{ id: 'edit', label: 'Edit', icon: 'pencil', onselect: fn() },
		{ id: 'copy', label: 'Copy link', icon: 'copy', onselect: fn() },
	]
	const withDisabled: MenuItem[] = [
		{ id: 'open', label: 'Open', icon: 'chevron-right', onselect: fn() },
		{ id: 'grocery', label: 'Add to grocery', icon: 'plus', disabled: true, onselect: fn() },
		{ id: 'edit', label: 'Edit', icon: 'pencil', onselect: fn() },
	]

	const calls = (spy: unknown) => (spy as ReturnType<typeof fn>).mock.calls.length

	const { Story } = defineMeta({
		title: 'Components/Overlays/Menu',
		component: Menu,
		tags: ['autodocs'],
		parameters: {
			platformFrame: 'inline',
			docs: {
				description: {
					component:
						'The action menu and the context menu: the same items in the same order, destructive items last and separated. Opened by a ⋯ button or a right-click (pass a rect as the anchor). Arrow keys, Home and End move, a letter jumps to the next item starting with it, Enter or Space picks, Escape closes; every close returns focus to the anchor. On mobile (`presentation="auto"`) the same items appear as full-width rows in a bottom sheet.',
				},
			},
		},
		args: { items: basic, align: 'start', presentation: 'menu', onselect: fn() },
		argTypes: {
			align: { control: 'inline-radio', options: ['start', 'end'] },
			presentation: { control: 'inline-radio', options: ['auto', 'menu', 'sheet'] },
			anchor: { control: false },
		},
	})
</script>

<script lang="ts">
	let open = $state(false)
	let trigger = $state<HTMLElement>()
</script>

{#snippet template(args: Record<string, unknown>)}
	<span class="sb-anchor" bind:this={trigger}>
		<IconButton
			icon="ellipsis"
			label={triggerName}
			active={open}
			aria-haspopup="menu"
			aria-expanded={open}
			onclick={() => (open = !open)}
		/>
	</span>
	<Menu bind:open anchor={trigger} {...args} items={args.items as MenuItem[]} />
{/snippet}

<Story
	name="Basic"
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: triggerName })
		await userEvent.click(trigger)
		const menu = await canvas.findByRole('menu')
		const items = () => canvas.getAllByRole('menuitem')
		await waitFor(() => expect(items()[0]).toHaveFocus())
		await userEvent.keyboard('{ArrowDown}')
		await expect(items()[1]).toHaveFocus()
		await userEvent.keyboard('{End}')
		await expect(items()[2]).toHaveFocus()
		await userEvent.keyboard('{ArrowDown}')
		await expect(items()[0]).toHaveFocus()
		await userEvent.keyboard('{ArrowUp}')
		await expect(items()[2]).toHaveFocus()
		await userEvent.keyboard('{Home}')
		await expect(items()[0]).toHaveFocus()
		// typeahead: d jumps to Duplicate
		await userEvent.keyboard('d')
		await expect(items()[2]).toHaveFocus()
		await userEvent.keyboard('{Enter}')
		await waitFor(() => expect(menu).not.toBeVisible())
		await expect(basic[2]!.onselect).toHaveBeenLastCalledWith(basic[2])
		await expect(args.onselect).toHaveBeenLastCalledWith(basic[2])
		await waitFor(() => expect(trigger).toHaveFocus())
	}}
/>

<Story
	name="With icons and shortcuts"
	args={{ items: withIcons }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: triggerName })
		const before = calls(args.onselect)
		await userEvent.click(trigger)
		const menu = await canvas.findByRole('menu')
		const items = canvas.getAllByRole('menuitem')
		await waitFor(() => expect(items[0]).toHaveFocus())
		await expect(items[1]).toHaveTextContent('E')
		await expect(items[items.length - 1]).toHaveTextContent(/^Delete/)
		// Escape closes without picking and hands focus back
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(menu).not.toBeVisible())
		await expect(calls(args.onselect)).toBe(before)
		await waitFor(() => expect(trigger).toHaveFocus())
	}}
/>

<Story
	name="Destructive last"
	args={{ items: destructiveFirst }}
	{template}
	parameters={{
		docs: {
			description: {
				story: 'Delete is first in the array and still renders last, after the separator.',
			},
		},
	}}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: triggerName })
		await userEvent.click(trigger)
		const menu = await canvas.findByRole('menu')
		const items = canvas.getAllByRole('menuitem')
		await expect(items.map((item) => item.textContent?.trim())).toEqual(['Edit', 'Copy link', 'Delete'])
		await expect(canvas.getByRole('separator')).toBeInTheDocument()
		await waitFor(() => expect(items[0]).toHaveFocus())
		// typeahead: d jumps to Delete
		await userEvent.keyboard('d')
		await expect(items[2]).toHaveFocus()
		await userEvent.keyboard('{Enter}')
		await waitFor(() => expect(menu).not.toBeVisible())
		await expect(destructiveFirst[0]!.onselect).toHaveBeenLastCalledWith(destructiveFirst[0])
		await expect(args.onselect).toHaveBeenLastCalledWith(destructiveFirst[0])
		await waitFor(() => expect(trigger).toHaveFocus())
	}}
/>

<Story
	name="Disabled item"
	args={{ items: withDisabled }}
	{template}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: triggerName })
		await userEvent.click(trigger)
		await canvas.findByRole('menu')
		const items = canvas.getAllByRole('menuitem')
		await expect(items[1]).toHaveAttribute('aria-disabled', 'true')
		await waitFor(() => expect(items[0]).toHaveFocus())
		// the arrows skip the disabled item
		await userEvent.keyboard('{ArrowDown}')
		await expect(items[2]).toHaveFocus()
		await userEvent.keyboard('{ArrowUp}')
		await expect(items[0]).toHaveFocus()
		await userEvent.keyboard('{Escape}')
	}}
/>

<Story
	name="Action sheet"
	args={{ items: withIcons, presentation: 'sheet' }}
	parameters={{ platforms: ['mobile'] }}
	{template}
	play={async ({ canvasElement, args }) => {
		// the story is mobile-only; the desktop project renders a note instead of a canvas
		if (!canvasElement.querySelector('.ed-canvas')) return
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: triggerName })
		await userEvent.click(trigger)
		const sheet = await canvas.findByRole('dialog')
		await expect(sheet).toBeVisible()
		const menu = canvas.getByRole('menu')
		const items = canvas.getAllByRole('menuitem')
		await waitFor(() => expect(items[0]).toHaveFocus())
		await userEvent.keyboard('{ArrowDown}')
		await expect(items[1]).toHaveFocus()
		await userEvent.keyboard('{Enter}')
		await waitFor(() => expect(menu).not.toBeVisible())
		await expect(withIcons[1]!.onselect).toHaveBeenLastCalledWith(withIcons[1])
		await expect(args.onselect).toHaveBeenLastCalledWith(withIcons[1])
		await waitFor(() => expect(trigger).toHaveFocus())
	}}
/>

<Story
	name="Auto"
	args={{ items: withIcons, presentation: 'auto' }}
	{template}
	parameters={{
		docs: {
			description: {
				story: 'A popover menu on desktop, an action sheet on mobile: switch the platform in the toolbar.',
			},
		},
	}}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: triggerName })
		const before = calls(args.onselect)
		await userEvent.click(trigger)
		const menu = await canvas.findByRole('menu')
		await waitFor(() => expect(canvas.getAllByRole('menuitem')[0]).toHaveFocus())
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(menu).not.toBeVisible())
		await expect(calls(args.onselect)).toBe(before)
		await waitFor(() => expect(trigger).toHaveFocus())
	}}
/>

<style>
	.sb-anchor {
		display: inline-block;
	}
</style>
