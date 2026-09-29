<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { domainGlyph, type GlyphId } from '$lib/icons/domain-glyphs.js'
	import type { IconName } from '$lib/icons/icons.js'
	import UiKitProvider from '$lib/i18n/UiKitProvider.svelte'
	import { bottomTabs, sidebarJa } from '../../../stories/sample-data.js'
	import BottomTabBar, { type BottomTab } from './BottomTabBar.svelte'

	/** A tab's glyph: the domain's stand-in, or the menu glyph for More. */
	const glyphFor = (id: string): IconName => (id === 'more' ? 'menu' : domainGlyph(id as GlyphId))
	const tabs: BottomTab[] = bottomTabs.map((tab) => ({ id: tab.id, label: tab.label, icon: glyphFor(tab.id) }))
	const withBadge = tabs.map((tab) => (tab.id === 'today' ? { ...tab, badge: 2 } : tab))
	const tabsJa: BottomTab[] = bottomTabs.map((tab) => ({
		id: tab.id,
		label: sidebarJa.items.find((item) => item.id === tab.id)?.name ?? 'その他',
		icon: glyphFor(tab.id),
	}))

	const { Story } = defineMeta({
		title: 'Components/Shell/BottomTabBar',
		component: BottomTabBar,
		tags: ['autodocs'],
		args: { items: tabs, current: 'garden', onselect: fn() },
		parameters: { platforms: ['mobile'] },
	})
</script>

<!-- the kit renders a block; this wrapper pins it to the bottom of the phone canvas, as the app pins it to its viewport -->
{#snippet template(args: ComponentProps<typeof BottomTabBar>)}
	<div class="sb-screen"></div>
	<div class="sb-dock"><BottomTabBar {...args} /></div>
{/snippet}

<!-- Garden, Today, two pinned domains, More. One tab stop: arrows, Home and End move focus; Enter or a tap selects -->
<Story
	name="Five tabs"
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		if (!canvasElement.querySelector('.ed-canvas')) return
		const canvas = canvasOf(canvasElement)
		await userEvent.tab()
		await expect(canvas.getByRole('button', { name: 'Garden' })).toHaveFocus()
		await userEvent.keyboard('{ArrowRight}')
		const today = canvas.getByRole('button', { name: 'Today' })
		await expect(today).toHaveFocus()
		await userEvent.keyboard('{Enter}')
		await expect(args.onselect).toHaveBeenLastCalledWith('today')
		await expect(today).toHaveAttribute('aria-current', 'page')
		await expect(canvas.getByRole('button', { name: 'Garden' })).not.toHaveAttribute('aria-current')
		await userEvent.keyboard('{End}')
		await expect(canvas.getByRole('button', { name: 'More' })).toHaveFocus()
		await userEvent.keyboard('{Home}')
		await expect(canvas.getByRole('button', { name: 'Garden' })).toHaveFocus()
	}}
/>

<!-- a count on Today's glyph, read as part of the tab's name -->
<Story
	name="With badge"
	args={{ items: withBadge }}
	{template}
	play={async ({ canvasElement }) => {
		if (!canvasElement.querySelector('.ed-canvas')) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('button', { name: 'Today, 2 new' })).toBeVisible()
	}}
/>

<Story name="Japanese" args={{ items: tabsJa, lang: 'ja' }}>
	{#snippet template(args)}
		<UiKitProvider strings={{ tabBar: { label: 'セクション' } }}>
			<div class="sb-screen"></div>
			<div class="sb-dock"><BottomTabBar {...args} /></div>
		</UiKitProvider>
	{/snippet}
</Story>

<style>
	/* room above the bar in an inline canvas, which has no phone bottom to reach */
	.sb-screen {
		height: calc(var(--tab-bar) * 3);
	}
	.sb-dock {
		position: absolute;
		inset-inline: 0;
		bottom: 0;
	}
</style>
