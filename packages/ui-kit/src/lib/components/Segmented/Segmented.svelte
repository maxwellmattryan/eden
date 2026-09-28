<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'

	/** A tab: a plain label, or a label with an icon. `id` disambiguates two tabs with the same label. */
	export type SegmentedItem = string | { label: string; icon?: IconName; id?: string }
</script>

<script lang="ts">
	// Tabs inside a domain. One pill slides to the selected tab over the panel duration (it only fades under reduced
	// motion, where that duration is 0). The pill is measured through the `measure` attachment on the tablist, which
	// stores the root and its latest rect; a $derived reads the selected tab's offsets against them, so nothing runs in
	// an effect.
	// Arrow keys, Home and End move focus through `roving`; a tablist selects on arrow, so the moved-to tab is selected.
	import type { HTMLAttributes } from 'svelte/elements'
	import { untrack } from 'svelte'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { measure } from '../../internal/measure.js'
	import { roving } from '../../internal/roving.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onchange' | 'children'> & {
		/** Two to five tabs; beyond that they are pages in the sidebar. */
		items: SegmentedItem[]
		/** The selected index. Bindable. */
		selected?: number
		/** Which side of the label an icon sits on. */
		iconPosition?: 'left' | 'right'
		/** The tablist's accessible name; defaults to the strings' "Tabs". */
		label?: string
		/** Called with the new index after a click or an arrow key changes the selection. */
		onchange?: (index: number) => void
	}
	let {
		items,
		selected = $bindable(0),
		iconPosition = 'left',
		label,
		onchange,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const tabs = $derived(
		items.map((item) =>
			typeof item === 'string'
				? { id: item, label: item, icon: undefined }
				: { id: item.id ?? item.label, label: item.label, icon: item.icon }
		)
	)

	// The tablist and its latest rect, written by `measure` now, on resize and once fonts load; the pill re-reads on each.
	let root = $state<HTMLElement>()
	let measured = $state<DOMRectReadOnly>()
	const pill = $derived.by(() => {
		if (!root || !measured) return undefined
		const tab = root.querySelectorAll<HTMLElement>('[role="tab"]')[selected]
		return tab ? { x: tab.offsetLeft, w: tab.offsetWidth } : undefined
	})

	function select(index: number) {
		if (index === selected) return
		selected = index
		onchange?.(index)
	}
</script>

<div
	class="ed-seg {className}"
	role="tablist"
	aria-label={label ?? s.tabs}
	{@attach measure((rect, el) => {
		root = el
		measured = rect
	})}
	{@attach roving(() => ({
		selector: '[role="tab"]',
		orientation: 'horizontal',
		current: () => untrack(() => selected),
		onMove: (_, index) => select(index),
	}))}
	{...rest}
>
	<span
		class="ed-seg-pill"
		class:ed-seg-pill-ready={!!pill}
		style:transform="translateX({pill?.x ?? 0}px)"
		style:width="{pill?.w ?? 0}px"
		aria-hidden="true"
	></span>
	{#each tabs as tab, i (tab.id)}
		<button
			class="ed-seg-tab"
			class:ed-seg-tab-icon-right={iconPosition === 'right'}
			type="button"
			role="tab"
			aria-selected={i === selected}
			tabindex={i === selected ? 0 : -1}
			onclick={() => select(i)}
		>
			{#if tab.icon}<Icon name={tab.icon} size="sm" />{/if}<span>{tab.label}</span>
		</button>
	{/each}
</div>

<style>
	.ed-seg {
		position: relative;
		display: inline-flex;
		gap: 2px;
		box-sizing: border-box;
		height: var(--ed-control);
		padding: 2px;
		border-radius: var(--ed-radius-control);
		background: var(--surface-2);
		isolation: isolate;
	}
	.ed-seg-pill {
		position: absolute;
		top: 2px;
		left: 0;
		z-index: 0;
		height: calc(100% - 4px);
		border-radius: calc(var(--ed-radius-control) - 2px);
		background: var(--ed-seg-pill-bg);
		box-shadow: var(--shadow-card);
		opacity: 0;
		transition:
			transform var(--ed-duration-panel) var(--ed-ease-out),
			width var(--ed-duration-panel) var(--ed-ease-out),
			opacity var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-seg-pill-ready {
		opacity: 1;
	}
	.ed-seg-tab {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: calc(var(--ed-control) - 4px);
		margin: 0;
		padding: 0 var(--space-3);
		border: 0;
		border-radius: calc(var(--ed-radius-control) - 2px);
		background: transparent;
		color: var(--text-secondary);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		white-space: nowrap;
		cursor: pointer;
		transition: color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-seg-tab-icon-right {
		flex-direction: row-reverse;
	}
	.ed-seg-tab:hover,
	.ed-seg-tab[aria-selected='true'] {
		color: var(--text-primary);
	}
	.ed-seg-tab:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
</style>
