<script module lang="ts">
	import type { IconName } from '$lib/icons/icons.js'
	import type { RovingOptions } from '$lib/internal/roving.js'

	/** One action. Destructive items render last, after a separator, whatever their position in `items`. */
	export interface MenuItem {
		/** Stable identity; the label stands in when absent. */
		id?: string
		/** Sentence-case verb. */
		label: string
		icon?: IconName
		/** Rendered last, after a separator, in the danger colour. */
		destructive?: boolean
		/** A hint such as ⌘C, shown in mono; the menu does not bind it. */
		shortcut?: string
		/** Shown at half opacity; arrows and typeahead skip it. */
		disabled?: boolean
		/** Called with the item when it is picked, before the menu's own `onselect`. */
		onselect?: (item: MenuItem) => void
	}
	export type MenuPresentation = 'auto' | 'menu' | 'sheet'

	/** Enabled items only: a disabled item is neither a tab stop nor a typeahead hit. */
	const ROVING: RovingOptions = {
		selector: '[role=menuitem]:not([aria-disabled=true])',
		orientation: 'vertical',
		loop: true,
		homeEnd: true,
		typeahead: true,
	}
</script>

<script lang="ts">
	// The action menu and the context menu: the same items in the same order, destructive ones last and separated.
	// A Popover with role="menu" on desktop; on mobile a bottom Sheet listing the same items as full-width rows
	// (`presentation="auto"` reads data-platform once). `roving` moves focus (arrows, Home, End, first-letter
	// typeahead); Enter, Space or a click picks, which calls the item's onselect, then the menu's, then closes; Escape
	// and Tab close without picking. Every close hands focus back to the anchor.
	import type { AnchorLike } from '$lib/internal/anchor.js'
	import Icon from '$lib/icons/Icon.svelte'
	import { useStrings } from '$lib/i18n/context.js'
	import { platformOf } from '$lib/internal/platform.js'
	import { roving } from '$lib/internal/roving.js'
	import Popover from '../Popover/Popover.svelte'
	import Sheet from '../Sheet/Sheet.svelte'

	type Props = {
		/** The actions, in the order they should appear; destructive ones move to the end whatever their position. */
		items: MenuItem[]
		/** Bindable. Set it to open and close; every close path sets it back to false. */
		open?: boolean
		/** The ⋯ button, or a rect-like object for a context menu at the pointer. */
		anchor?: AnchorLike | null
		/** Which edge of the anchor the menu lines up with. */
		align?: 'start' | 'end'
		/** The menu's accessible name; the strings' "Actions" by default. */
		label?: string
		/** auto is a popover menu on desktop and a bottom sheet on mobile, decided once from data-platform. */
		presentation?: MenuPresentation
		/** Called with the picked item, after the item's own onselect and before the menu closes. */
		onselect?: (item: MenuItem) => void
		class?: string
	}
	let {
		items,
		open = $bindable(false),
		anchor,
		align = 'end',
		label,
		presentation = 'auto',
		onselect,
		class: className = '',
	}: Props = $props()

	const s = useStrings()
	const name = $derived(label ?? s.actions)
	const ordered = $derived([...items.filter((i) => !i.destructive), ...items.filter((i) => i.destructive)])
	const firstDestructive = $derived(ordered.findIndex((i) => i.destructive))

	// The menu has no root of its own (a popover or a sheet), so a hidden probe reads the platform where it renders.
	let probe = $state<HTMLElement>()
	let list = $state<HTMLElement>()
	const mode = $derived<Exclude<MenuPresentation, 'auto'>>(
		presentation === 'auto' ? (platformOf(probe) === 'mobile' ? 'sheet' : 'menu') : presentation
	)

	function pick(item: MenuItem) {
		item.onselect?.(item)
		onselect?.(item)
		open = false
	}
	// Tab leaves a popover menu: it closes, focus lands on the anchor, and the browser moves on from there.
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Tab') open = false
	}

	$effect(() => {
		// effect: imperative DOM. The first enabled item takes focus once the panel shows, a microtask after this flush.
		const root = list
		if (!open || !root) return
		queueMicrotask(() => {
			if (open) root.querySelector<HTMLElement>(ROVING.selector)?.focus({ preventScroll: true })
		})
	})
</script>

{#snippet rows()}
	{#each ordered as item, i (item.id ?? item.label)}
		{#if i === firstDestructive && i > 0}<hr class="ed-menu-sep" />{/if}
		<button
			class={['ed-menu-item', { 'ed-menu-danger': item.destructive }]}
			type="button"
			role="menuitem"
			tabindex="-1"
			disabled={item.disabled}
			aria-disabled={item.disabled ? 'true' : undefined}
			onclick={() => pick(item)}
		>
			{#if item.icon}<Icon name={item.icon} size={mode === 'sheet' ? 'md' : 'sm'} />{/if}
			<span class="ed-menu-label">{item.label}</span>
			{#if item.shortcut}<kbd class="ed-menu-key" data-tertiary>{item.shortcut}</kbd>{/if}
		</button>
	{/each}
{/snippet}

<span class="ed-menu-probe" bind:this={probe} hidden></span>

{#if mode === 'sheet'}
	<Sheet bind:open placement="bottom" label={name}>
		<div
			class={['ed-menu', 'ed-menu-sheet', className]}
			role="menu"
			aria-label={name}
			bind:this={list}
			{@attach roving(() => ROVING)}
		>
			{@render rows()}
		</div>
	</Sheet>
{:else}
	<Popover bind:open {anchor} {align} role="menu" label={name} {onkeydown}>
		<div class={['ed-menu', className]} bind:this={list} {@attach roving(() => ROVING)}>
			{@render rows()}
		</div>
	</Popover>
{/if}

<style>
	.ed-menu-probe {
		display: none;
	}
	.ed-menu {
		display: flex;
		flex-direction: column;
		/* half the small sheet: the handoff's 180 px */
		min-width: calc(var(--sheet-sm) / 2);
		padding: var(--space-1);
		box-sizing: border-box;
	}
	.ed-menu-sheet {
		min-width: 0;
		padding: 0;
	}
	.ed-menu-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		height: var(--ed-row);
		margin: 0;
		padding: 0 var(--space-3);
		border: 0;
		border-radius: calc(var(--ed-radius-card) - var(--space-1));
		background: transparent;
		color: var(--text-primary);
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		text-align: left;
		white-space: nowrap;
		cursor: pointer;
		box-sizing: border-box;
		transition:
			background-color var(--ed-duration-micro) var(--ed-ease-out),
			color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-menu-sheet .ed-menu-item {
		border-radius: var(--ed-radius-control);
	}
	.ed-menu-item :global(.ed-icon) {
		color: var(--text-secondary);
	}
	.ed-menu-item:not(:disabled):hover {
		background: var(--surface-2);
	}
	/* the ring sits inside the row, so a full-width row on a sheet keeps all of it */
	.ed-menu-item:focus-visible {
		outline: 2px solid transparent;
		background: var(--surface-2);
		box-shadow: inset 0 0 0 var(--focus-ring-width) var(--brand-primary);
	}
	.ed-menu-item:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.ed-menu-danger,
	.ed-menu-danger :global(.ed-icon) {
		color: var(--danger);
	}
	.ed-menu-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ed-menu-key {
		margin-left: auto;
		padding-left: var(--space-3);
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-tertiary);
	}
	.ed-menu-sep {
		margin: var(--space-1) 0;
		border: 0;
		border-top: 1px solid var(--stroke-subtle);
	}
</style>
