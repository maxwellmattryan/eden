<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { domainGlyph, type GlyphId } from '$lib/icons/domain-glyphs.js'
	import UiKitProvider from '$lib/i18n/UiKitProvider.svelte'
	import { sidebar, sidebarJa } from '../../../stories/sample-data.js'
	import Sidebar, { type SidebarEntry } from './Sidebar.svelte'

	/** The sample entries with their stand-in glyphs; the ids are the plain domain and shell ids. */
	const withGlyphs = (entries: Omit<SidebarEntry, 'icon'>[]): SidebarEntry[] =>
		entries.map((entry) => ({ ...entry, icon: domainGlyph(entry.id as GlyphId) }))
	const groups = sidebar.groups.map(withGlyphs)
	const pinned = withGlyphs(sidebar.pinned)

	const { Story } = defineMeta({
		title: 'Components/Shell/Sidebar',
		component: Sidebar,
		tags: ['autodocs'],
		args: { groups, pinned, brand: 'eden', current: 'kitchen', subtitles: false, shortcuts: false, onselect: fn() },
		parameters: { platforms: ['desktop'] },
	})
</script>

<!-- a shell of fixed height, so the pinned pair sits at the bottom as it does in the app -->
{#snippet template(args: ComponentProps<typeof Sidebar>)}
	<div class="sb-shell">
		<Sidebar {...args} />
		<div class="sb-page"></div>
	</div>
{/snippet}

<!-- The mark and wordmark at the head; Today, a rule, Garden, a rule, then Hearth, Toolbench, Sky; Gardener and Settings pinned. One tab stop across the groups: arrows, Home, End and typing move focus; Enter selects -->
<Story
	name="Phase-1 sidebar"
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		if (!canvasElement.querySelector('.ed-canvas')) return
		const canvas = canvasOf(canvasElement)
		await userEvent.tab()
		await expect(canvas.getByRole('button', { name: 'Hearth' })).toHaveFocus()
		await userEvent.keyboard('{ArrowDown}')
		const toolbench = canvas.getByRole('button', { name: 'Toolbench' })
		await expect(toolbench).toHaveFocus()
		await userEvent.keyboard('{Enter}')
		await expect(args.onselect).toHaveBeenLastCalledWith('toolbench')
		await expect(toolbench).toHaveAttribute('aria-current', 'page')
		await expect(canvas.getByRole('button', { name: 'Hearth' })).not.toHaveAttribute('aria-current')
		await userEvent.keyboard('{End}')
		await expect(canvas.getByRole('button', { name: 'Settings' })).toHaveFocus()
		await userEvent.keyboard('g')
		await expect(canvas.getByRole('button', { name: 'Garden' })).toHaveFocus()
		await userEvent.keyboard('{Home}')
		await expect(canvas.getByRole('button', { name: 'Today' })).toHaveFocus()
		await userEvent.keyboard('{ArrowDown}')
		await expect(canvas.getByRole('button', { name: 'Garden' })).toHaveFocus()
	}}
/>

<!-- the onboarding default: each plain subtitle beneath its themed name -->
<Story name="Subtitles on" args={{ subtitles: true }} {template} />

<Story name="Shortcuts on" args={{ shortcuts: true }} {template} />

<!-- without a name there is no head: the groups start at the top -->
<Story name="Without brand" args={{ brand: undefined }} {template} />

<Story
	name="Japanese"
	args={{ groups: sidebarJa.groups.map(withGlyphs), pinned: withGlyphs(sidebarJa.pinned), subtitles: true, lang: 'ja' }}
>
	{#snippet template(args)}
		<UiKitProvider strings={{ sidebar: { label: '領域', pinned: '庭師と設定' } }}>
			<div class="sb-shell">
				<Sidebar {...args} />
				<div class="sb-page"></div>
			</div>
		</UiKitProvider>
	{/snippet}
</Story>

<style>
	.sb-shell {
		display: flex;
		height: calc(var(--sheet-max) * 0.6);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-0);
		overflow: hidden;
	}
	.sb-page {
		flex: 1;
	}
</style>
