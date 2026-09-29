<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, screen, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { domainGlyph } from '$lib/icons/domain-glyphs.js'
	import { iconNames } from '$lib/icons/icons.js'
	import { sidebar } from '../../../stories/sample-data.js'
	import SidebarItem from './SidebarItem.svelte'

	const hearth = sidebar.items.find((item) => item.id === 'kitchen')!

	const { Story } = defineMeta({
		title: 'Components/Shell/SidebarItem',
		component: SidebarItem,
		tags: ['autodocs'],
		args: {
			id: hearth.id,
			name: hearth.name,
			subtitle: hearth.subtitle,
			icon: domainGlyph('kitchen'),
			shortcut: hearth.shortcut,
			current: false,
			showSubtitle: false,
			showShortcut: false,
			onclick: fn(),
		},
		argTypes: { icon: { control: 'select', options: iconNames } },
	})
</script>

<!-- a strip of the sidebar's ground and gutter, so the leaf bar beside the current item has somewhere to sit -->
{#snippet template(args: ComponentProps<typeof SidebarItem>)}
	<div class="sb-rail"><SidebarItem {...args} /></div>
{/snippet}

<Story
	name="Default"
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: hearth.name }))
		await expect(args.onclick).toHaveBeenCalledTimes(1)
	}}
/>

<!-- the nav ground and the current colours from the brand dial, with the leaf bar in the gutter (0 wide at plain) -->
<Story name="Current" args={{ current: true }} {template} />

<Story name="With subtitle" args={{ showSubtitle: true, current: true }} {template} />

<Story name="With shortcut" args={{ showShortcut: true }} {template} />

<!-- with the subtitle collapsed it is the item's tooltip: on hover, and at once on keyboard focus -->
<Story
	name="Subtitle as tooltip"
	parameters={{ platformFrame: 'inline' }}
	{template}
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.tab()
		await expect(canvas.getByRole('button', { name: hearth.name })).toHaveFocus()
		const tip = await screen.findByRole('tooltip')
		await expect(tip).toHaveTextContent(hearth.subtitle)
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
	}}
/>

<!-- with an href the item is a real link: the browser navigates, and onclick still fires -->
<Story
	name="As a link"
	args={{ href: '/hearth' }}
	{template}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('link', { name: hearth.name })).toHaveAttribute('href', '/hearth')
	}}
/>

<style>
	.sb-rail {
		box-sizing: border-box;
		width: var(--sidebar);
		padding: var(--space-2);
		background: var(--surface-1);
	}
</style>
