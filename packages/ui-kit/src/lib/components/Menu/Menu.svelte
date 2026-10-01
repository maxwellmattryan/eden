<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'
	import type { RovingOptions } from '../../internal/roving.js'

	/** One action. Destructive items render last, after a separator, whatever their position in `items`. */
	export interface MenuItem {
		/** Stable identity; the label stands in when absent. */
		id?: string
		/** Sentence-case verb. */
		label: string
		icon?: IconName
		/** Marks the current choice: a trailing check and aria-current, beside any leading icon. */
		checked?: boolean
		/** Rendered last, after a separator, in the danger colour. */
		destructive?: boolean
		/** A hint such as ⌘C, shown in mono; the menu does not bind it. */
		shortcut?: string
		/** Shown at half opacity; arrows and typeahead skip it. */
		disabled?: boolean
		/** A submenu: picking the item swaps the menu's rows for these, under a back row; the item itself is never reported. */
		children?: MenuItem[]
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
	// and Tab close without picking. Every close hands focus back to the anchor. A sheet is modal until it has faded and
	// closed, and only then can focus go back, so a pick on a sheet is reported once it has: a pick that removes the
	// opener finds the focus where it expects it.
	import type { AnchorLike } from '../../internal/anchor.js'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { platformOf } from '../../internal/platform.js'
	import { roving } from '../../internal/roving.js'
	import Self from './Menu.svelte'
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
		/** Called with the picked item, after the item's own onselect: as a popover menu starts to close, once a sheet has closed. */
		onselect?: (item: MenuItem) => void
		class?: string
		/** `right` is a submenu: a flyout beside its parent item, closed by ArrowLeft. Set by a parent menu, not by apps. */
		side?: 'bottom' | 'right'
		/** The pointer entered or left the panel; a parent menu keeps a submenu open while it is over it. */
		onhover?: (inside: boolean) => void
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
		side = 'bottom',
		onhover,
	}: Props = $props()

	const s = useStrings()
	const name = $derived(label ?? s.actions)
	// A submenu opens as a flyout on hover, click or ArrowRight on a desktop menu, and as the rows of a drill-in on a
	// sheet (below): `sub` is the drill-in's, `flyItem` and `flyOpen` the flyout's.
	let sub = $state<MenuItem>()
	const shown = $derived(sub?.children ?? items)
	const ordered = $derived([...shown.filter((i) => !i.destructive), ...shown.filter((i) => i.destructive)])
	const firstDestructive = $derived(ordered.findIndex((i) => i.destructive))

	// The menu has no root of its own (a popover or a sheet), so a hidden probe reads the platform where it renders.
	let probe = $state<HTMLElement>()
	let list = $state<HTMLElement>()
	const mode = $derived<Exclude<MenuPresentation, 'auto'>>(
		presentation === 'auto' ? (platformOf(probe) === 'mobile' ? 'sheet' : 'menu') : presentation
	)

	let flyItem = $state<MenuItem>()
	let flyAnchor = $state<HTMLElement>()
	let flyOpen = $state(false)
	let flyTimer: ReturnType<typeof setTimeout> | undefined
	const FLY_LEAVE_MS = 150
	function flyCancel() {
		clearTimeout(flyTimer)
	}
	function flyShow(item: MenuItem, button: HTMLElement) {
		flyCancel()
		flyItem = item
		flyAnchor = button
		flyOpen = true
	}
	/** Closes after a beat, so the pointer can cross the gap to the submenu. */
	function flyHide() {
		flyCancel()
		flyTimer = setTimeout(() => (flyOpen = false), FLY_LEAVE_MS)
	}
	function onrowenter(item: MenuItem, e: PointerEvent) {
		if (mode === 'sheet') return
		if (item.children?.length && !item.disabled) flyShow(item, e.currentTarget as HTMLElement)
		else if (flyOpen) flyHide()
	}

	// the pick made on a sheet, held until the sheet has closed
	let picked: MenuItem | undefined

	let rowEls: Record<string, HTMLElement> = {}
	const anchorOf = (item: MenuItem) => rowEls[item.id ?? item.label]
	function rowref(item: MenuItem) {
		return (el: HTMLElement) => {
			const key = item.id ?? item.label
			rowEls[key] = el
			return () => delete rowEls[key]
		}
	}

	function report(item: MenuItem) {
		item.onselect?.(item)
		onselect?.(item)
	}
	function pick(item: MenuItem) {
		if (item.children?.length) {
			if (mode === 'sheet') sub = item
			else {
				const el = anchorOf(item)
				if (el) flyShow(item, el)
			}
			return
		}
		if (mode === 'sheet') picked = item
		else report(item)
		open = false
	}
	function onsheetclose() {
		const item = picked
		picked = undefined
		if (item) report(item)
	}
	// Tab leaves a popover menu: it closes, focus lands on the anchor, and the browser moves on from there.
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Tab') open = false
		else if (side === 'right' && e.key === 'ArrowLeft') open = false
		else if (e.key === 'ArrowRight' && e.target instanceof HTMLElement) {
			const item = ordered.find((i) => anchorOf(i) === e.target)
			if (item?.children?.length && !item.disabled) flyShow(item, e.target)
		}
	}

	$effect(() => {
		// effect: imperative DOM. A closed menu starts at its top level the next time.
		if (!open) {
			sub = undefined
			flyCancel()
			flyOpen = false
		}
	})
	$effect(() => {
		// effect: imperative DOM. The list takes focus once the panel shows, a microtask after this flush: nothing looks
		// chosen until the owner presses an arrow, which lands on the first item (ux-patterns.md, "Keyboard and focus").
		const root = list
		if (!open || !root) return
		queueMicrotask(() => {
			if (open) root.focus({ preventScroll: true })
		})
	})
</script>

{#snippet rows()}
	{#if sub}
		<button
			class="ed-menu-item ed-menu-back"
			type="button"
			role="menuitem"
			tabindex="-1"
			onclick={() => (sub = undefined)}
		>
			<Icon name="chevron-left" size={mode === 'sheet' ? 'md' : 'sm'} />
			<span class="ed-menu-label">{sub.label}</span>
		</button>
		<hr class="ed-menu-sep" />
	{/if}
	{#each ordered as item, i (item.id ?? item.label)}
		{#if i === firstDestructive && i > 0}<hr class="ed-menu-sep" />{/if}
		<button
			class={['ed-menu-item', { 'ed-menu-danger': item.destructive }]}
			type="button"
			role="menuitem"
			tabindex="-1"
			disabled={item.disabled}
			aria-disabled={item.disabled ? 'true' : undefined}
			aria-current={item.checked ? 'true' : undefined}
			aria-haspopup={item.children?.length ? 'menu' : undefined}
			onclick={() => pick(item)}
			onpointerenter={(e) => onrowenter(item, e)}
			onpointerleave={() => flyOpen && flyItem === item && flyHide()}
			{@attach rowref(item)}
		>
			{#if item.icon}<Icon name={item.icon} size={mode === 'sheet' ? 'md' : 'sm'} />{/if}
			<span class="ed-menu-label">{item.label}</span>
			{#if item.children?.length}<Icon name="chevron-right" size={mode === 'sheet' ? 'md' : 'sm'} />{/if}
			{#if item.checked}<Icon name="check" size={mode === 'sheet' ? 'md' : 'sm'} />{/if}
			{#if item.shortcut}<kbd class="ed-menu-key" data-tertiary>{item.shortcut}</kbd>{/if}
		</button>
	{/each}
{/snippet}

<span class="ed-menu-probe" bind:this={probe} hidden></span>

{#if mode === 'sheet'}
	<Sheet bind:open placement="bottom" label={name} onclose={onsheetclose}>
		<div
			class={['ed-menu', 'ed-menu-sheet', className]}
			role="menu"
			aria-label={name}
			bind:this={list}
			tabindex="-1"
			{@attach roving(() => ROVING)}
		>
			{@render rows()}
		</div>
	</Sheet>
{:else}
	<Popover
		bind:open
		{anchor}
		{align}
		side={side === 'right' ? 'right' : 'bottom'}
		gap={side === 'right' ? 8 : 6}
		inset={side === 'right' ? 4 : 0}
		role="menu"
		label={name}
		{onkeydown}
		onpointerenter={() => onhover?.(true)}
		onpointerleave={() => onhover?.(false)}
	>
		<div class={['ed-menu', className]} bind:this={list} tabindex="-1" {@attach roving(() => ROVING)}>
			{@render rows()}
		</div>
	</Popover>
	{#if flyItem?.children}
		<Self
			bind:open={flyOpen}
			anchor={flyAnchor}
			side="right"
			label={flyItem.label}
			items={flyItem.children}
			onhover={(inside) => (inside ? flyCancel() : flyHide())}
			onselect={(item) => {
				onselect?.(item)
				open = false
			}}
		/>
	{/if}
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
	/* the list takes focus only on open (tabindex -1), never from Tab, so it draws no ring of its own */
	.ed-menu:focus-visible {
		outline: none;
	}
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
	.ed-menu-back {
		color: var(--text-secondary);
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
