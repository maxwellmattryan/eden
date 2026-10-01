<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'

	/** One entry of the nav's groups or of the pinned list at the bottom. */
	export interface SidebarEntry {
		/** The plain id (kitchen, gardener): what `current` holds and `onselect` receives. */
		id: string
		/** The themed display name. */
		name: string
		/** The plain subtitle: shown beneath the name with `subtitles`, else the item's tooltip. */
		subtitle?: string
		/** The glyph: pass `domainGlyph(id)`. */
		icon: IconName
		/** The ⌘ position, such as ⌘3. */
		shortcut?: string
		/** A URL when the entry is a link; without one the item is a button. */
		href?: string
		/** An action rather than a place (Settings opens a sheet): it reports through `onselect` and never becomes current. */
		action?: boolean
	}
</script>

<script lang="ts">
	// The app mark and wordmark at the head when the app passes its name (D-55); then the groups top to bottom with a
	// rule between each (Today; Garden, Gardener and Toolbench; then the domains in the owner's order); then Settings
	// pinned at the bottom (D-64). Subtitles and shortcuts are off by default, except the pinned list, which always shows
	// its keys. The whole nav is one tab stop: arrows, Home and End and typing a name move focus through `roving` across
	// every group; Enter or a click makes an item current, unless the entry is an action. Collapsed, it is a rail of
	// the mark and the glyphs, each named by its tooltip (D-119); the app owns the dragging and may size the nav
	// itself through `style`. There is no sidebar on mobile: BottomTabBar instead.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import { roving } from '../../internal/roving.js'
	import AppMark from '../AppMark/AppMark.svelte'
	import SidebarItem from '../SidebarItem/SidebarItem.svelte'
	import Wordmark from '../Wordmark/Wordmark.svelte'

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children' | 'onselect'> & {
		/** The nav's groups top to bottom, a rule between each: Today, the Garden's group, then the enabled domains. */
		groups: SidebarEntry[][]
		/** The app's name as the locale writes it (D-66): shows the mark and the wordmark at the head. */
		brand?: string
		/** Settings, pinned at the bottom; its shortcut always shows. */
		pinned?: SidebarEntry[]
		/** Shows each subtitle beneath its name (the onboarding default, until the owner turns it off). */
		subtitles?: boolean
		/** Shows the ⌘ positions. */
		shortcuts?: boolean
		/** Collapses the nav to a rail: the mark without the wordmark, and each entry's glyph with its name as the tooltip. */
		collapsed?: boolean
		/** The current entry's id. Bindable. */
		current?: string
		/** The nav's accessible name; defaults to the strings' "Domains". */
		label?: string
		/** Called with the id after a click or Enter on an entry, current or an action. */
		onselect?: (id: string) => void
	}
	let {
		groups,
		brand,
		pinned = [],
		subtitles = false,
		shortcuts = false,
		collapsed = false,
		current = $bindable(),
		label,
		onselect,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()

	function pick(item: SidebarEntry) {
		if (!item.action) current = item.id
		onselect?.(item.id)
	}
</script>

{#snippet entry({ action, ...item }: SidebarEntry, keys = shortcuts)}
	<li>
		<SidebarItem
			{...item}
			current={!action && item.id === current}
			showSubtitle={subtitles}
			showShortcut={keys}
			{collapsed}
			data-sidebar-item
			onclick={() => pick({ action, ...item })}
		/>
	</li>
{/snippet}

<nav
	class={['ed-sidebar', collapsed && 'ed-sidebar-collapsed', className]}
	aria-label={label ?? s.sidebar.label}
	{@attach roving(() => ({ selector: '[data-sidebar-item]', orientation: 'vertical', typeahead: true }))}
	{...rest}
>
	{#if brand}
		<div class="ed-sidebar-brand">
			<AppMark />
			{#if !collapsed}<Wordmark name={brand} size="md" />{/if}
		</div>
	{/if}
	<div class="ed-sidebar-groups">
		{#each groups as group, index (group[0]?.id ?? index)}
			{#if index > 0}<hr class="ed-sidebar-rule" />{/if}
			<ul class="ed-sidebar-list">
				{#each group as item (item.id)}{@render entry(item)}{/each}
			</ul>
		{/each}
	</div>
	{#if pinned.length}
		<ul class="ed-sidebar-list ed-sidebar-pinned" aria-label={s.sidebar.pinned}>
			{#each pinned as item (item.id)}{@render entry(item, true)}{/each}
		</ul>
	{/if}
</nav>

<style>
	.ed-sidebar {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		box-sizing: border-box;
		width: var(--sidebar);
		height: 100%;
		padding: var(--space-2);
		background: var(--surface-1);
		border-inline-end: 1px solid var(--stroke-subtle);
		color: var(--text-primary);
		overflow: hidden auto;
	}
	.ed-sidebar-collapsed {
		width: var(--sidebar-rail);
	}
	.ed-sidebar-collapsed .ed-sidebar-brand {
		padding-inline: 0;
	}
	/* the head: centred, with air on every side and more below, so the nav starts a step down from the name */
	.ed-sidebar-brand {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-2);
		margin-block-end: var(--space-2);
	}
	.ed-sidebar-groups {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	/* inset to the items' own padding, so the rule reads as a pause in the list rather than a border */
	.ed-sidebar-rule {
		margin: 0 var(--space-2);
		border: 0;
		border-top: 1px solid var(--stroke);
	}
	.ed-sidebar-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ed-sidebar-pinned {
		margin-top: auto;
	}
</style>
