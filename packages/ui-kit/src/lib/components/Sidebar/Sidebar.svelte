<script module lang="ts">
	import type { IconName } from '$lib/icons/icons.js'

	/** One entry of the domain nav or of the pinned pair at the bottom. */
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
	}
</script>

<script lang="ts">
	// Garden, Today, the domains in the owner's order, then Gardener and Settings pinned at the bottom. Subtitles and
	// shortcuts are off by default. The whole nav is one tab stop: arrows, Home and End and typing a name move focus
	// through `roving`; Enter or a click makes an item current. There is no sidebar on mobile: BottomTabBar instead.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '$lib/i18n/context.js'
	import { roving } from '$lib/internal/roving.js'
	import SidebarItem from '../SidebarItem/SidebarItem.svelte'

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
		/** Garden, Today, then the enabled domains in the owner's order. */
		items: SidebarEntry[]
		/** Gardener and Settings, pinned at the bottom. */
		pinned?: SidebarEntry[]
		/** Shows each subtitle beneath its name (the onboarding default, until the owner turns it off). */
		subtitles?: boolean
		/** Shows the ⌘ positions. */
		shortcuts?: boolean
		/** The current entry's id. Bindable. */
		current?: string
		/** The nav's accessible name; defaults to the strings' "Domains". */
		label?: string
		/** Called with the id after a click or Enter makes an entry current. */
		onselect?: (id: string) => void
	}
	let {
		items,
		pinned = [],
		subtitles = false,
		shortcuts = false,
		current = $bindable(),
		label,
		onselect,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()

	function pick(id: string) {
		current = id
		onselect?.(id)
	}
</script>

{#snippet entry(item: SidebarEntry)}
	<li>
		<SidebarItem
			{...item}
			current={item.id === current}
			showSubtitle={subtitles}
			showShortcut={shortcuts}
			data-sidebar-item
			onclick={() => pick(item.id)}
		/>
	</li>
{/snippet}

<nav
	class={['ed-sidebar', className]}
	aria-label={label ?? s.sidebar.label}
	{@attach roving(() => ({ selector: '[data-sidebar-item]', orientation: 'vertical', typeahead: true }))}
	{...rest}
>
	<ul class="ed-sidebar-list">
		{#each items as item (item.id)}{@render entry(item)}{/each}
	</ul>
	{#if pinned.length}
		<ul class="ed-sidebar-list ed-sidebar-pinned" aria-label={s.sidebar.pinned}>
			{#each pinned as item (item.id)}{@render entry(item)}{/each}
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
