<script module lang="ts">
	import type { TransitionConfig } from 'svelte/transition'
	import { quintOut } from 'svelte/easing'
	import type { IconName } from '$lib/icons/icons.js'
	import type { BadgeKind } from '../Badge/Badge.svelte'
	import type { ChipTone } from '../Chip/Chip.svelte'
	import type { MenuItem } from '../Menu/Menu.svelte'

	/** A detail chip: a quantity in mono, a location, a tag. */
	export interface ListRowChip {
		/** Stable identity; the label stands in when absent. */
		id?: string
		label: string
		icon?: IconName
		tone?: ChipTone
		/** Mono, for a quantity or an id. */
		mono?: boolean
	}
	/** A detail badge: `estimated`, a warning with its date, an origin. */
	export interface ListRowBadge {
		/** Stable identity; the kind and label stand in when absent. */
		id?: string
		kind: BadgeKind
		label?: string
	}
	/** One row's data: what `List` takes in `rows`, and what a row shows. The callbacks are separate props. */
	export interface ListRowData {
		/** Stable identity: the list keys and selects by it. */
		id: string
		/** The one line, in the platform text style. */
		primary: string
		/** A second line beneath, quieter. */
		secondary?: string
		/** Detail chips beneath the primary text. */
		chips?: ListRowChip[]
		/** Detail badges after the chips. */
		badges?: ListRowBadge[]
		/** Trailing metadata in mono: a date, a count, a status word. */
		meta?: string
		/** Sets the meta in text-primary: due, expiring, overdue. */
		metaWarn?: boolean
		/** A leading glyph. */
		icon?: IconName
		/** Crossed out and quiet: a checked-off grocery, a finished task. */
		done?: boolean
		/** The row's menu, destructive items last; the ⋯ button, a right-click, a long-press and Shift+F10 open it. */
		actions?: MenuItem[]
	}

	/** The controls a click on the row must not toggle, and the overlays a right-click inside must leave alone. */
	const CONTROLS = 'button, a, input, [role="menu"], dialog'
	const OVERLAYS = '[role="menu"], dialog'
	const inside = (target: EventTarget | null, selector: string) =>
		target instanceof Element && !!target.closest(selector)

	/**
	 * The mark's slide along the inline axis: its width and the row's gap before the next item open together over the
	 * panel duration (the token's ease-out is quintOut). A zero panel duration, which is reduced motion, fades instead.
	 */
	function slideIn(node: HTMLElement): TransitionConfig {
		const style = getComputedStyle(node)
		const duration = parseFloat(style.getPropertyValue('--ed-duration-panel')) || 0
		if (!duration) {
			return { duration: parseFloat(style.getPropertyValue('--ed-duration-micro')) || 0, css: (t) => `opacity: ${t}` }
		}
		const width = node.getBoundingClientRect().width
		const gap = node.parentElement ? parseFloat(getComputedStyle(node.parentElement).columnGap) || 0 : 0
		return {
			duration,
			easing: quintOut,
			css: (t, u) =>
				`width: ${(t * width).toFixed(2)}px; margin-inline-end: ${(-u * gap).toFixed(2)}px; opacity: ${t}; overflow: hidden`,
		}
	}
</script>

<script lang="ts">
	// One row of a list: a leading icon, the primary text with a detail line of chips and badges beneath, trailing
	// metadata in mono, and a ⋯ button that opens the row's menu. A right-click, a long-press and Shift+F10 (or the
	// ContextMenu key) open the same menu; Enter or a double-click opens the row. Selection is a mode (D-41): outside
	// it the row shows no mark and gives up no space; while the list is `selecting` a round mark slides in at the
	// leading edge and a click or Space toggles the row onto brand-muted. Inside List the row is a grid row with one
	// gridcell and the list manages its tab stop; on its own it is a list item and its own tab stop.
	import type { HTMLAttributes } from 'svelte/elements'
	import type { AnchorLike } from '$lib/internal/anchor.js'
	import Icon from '$lib/icons/Icon.svelte'
	import { useStrings } from '$lib/i18n/context.js'
	import Badge from '../Badge/Badge.svelte'
	import Chip from '../Chip/Chip.svelte'
	import IconButton from '../IconButton/IconButton.svelte'
	import Menu from '../Menu/Menu.svelte'
	import { longPress } from './long-press.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'id' | 'role' | 'children' | 'onselect'> &
		ListRowData & {
			/** The list is in select mode: the mark slides in, and a click or Space toggles the row. */
			selecting?: boolean
			/** Bindable. Whether the row is in the selection; meaningful only while `selecting`. */
			selected?: boolean
			/** Hides the detail line and the vertical padding, for a compact list. */
			compact?: boolean
			/** Set by List: the row is a grid row (role row, one gridcell) whose tab stop the list manages. Standalone it is a list item. */
			inGrid?: boolean
			/** Enter or a double-click. */
			onopen?: () => void
			/** A pick from the row's menu. */
			onaction?: (item: MenuItem) => void
			/** The row toggled in select mode, with its new state. */
			onselect?: (selected: boolean) => void
		}
	let {
		id,
		primary,
		secondary,
		chips = [],
		badges = [],
		meta,
		metaWarn = false,
		icon,
		done = false,
		actions = [],
		selecting = false,
		selected = $bindable(false),
		compact = false,
		inGrid = false,
		onopen,
		onaction,
		onselect,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const name = $derived(s.actionsFor(primary))
	const hasDetail = $derived(!!secondary || chips.length > 0 || badges.length > 0)

	let root = $state<HTMLDivElement>()
	let more = $state<HTMLElement>()
	let menuOpen = $state(false)
	let menuAnchor = $state<AnchorLike | null>(null)
	let menuAlign = $state<'start' | 'end'>('end')
	// A menu opened from the row itself (keyboard, right-click, long-press) hands focus back to the row when it closes;
	// one opened from the ⋯ button leaves focus there, which is the Menu's own contract.
	let returnToRow = false

	function openMenu(anchor: AnchorLike, align: 'start' | 'end', fromRow: boolean) {
		if (!actions.length) return
		menuAnchor = anchor
		menuAlign = align
		returnToRow = fromRow
		menuOpen = true
	}
	function openAt(x: number, y: number) {
		openMenu({ getBoundingClientRect: () => new DOMRect(x, y, 0, 0) }, 'start', true)
	}
	function toggle() {
		selected = !selected
		onselect?.(selected)
	}

	function onclick(e: MouseEvent) {
		if (!selecting || inside(e.target, CONTROLS)) return
		toggle()
	}
	function ondblclick(e: MouseEvent) {
		if (selecting || inside(e.target, CONTROLS)) return
		onopen?.()
	}
	function oncontextmenu(e: MouseEvent) {
		if (!actions.length || inside(e.target, OVERLAYS)) return
		e.preventDefault()
		openAt(e.clientX, e.clientY)
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.target !== e.currentTarget) return
		if (e.key === 'Enter') {
			onopen?.()
		} else if (e.key === ' ' && selecting) {
			e.preventDefault()
			toggle()
		} else if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
			if (!actions.length) return
			e.preventDefault()
			const anchor = more?.querySelector('button') ?? root
			if (anchor) openMenu(anchor, 'end', true)
		}
	}

	$effect(() => {
		// effect: imperative DOM. Once a menu opened from the row has closed, focus comes back to the row, a microtask
		// after the Menu's own focus return has run.
		if (menuOpen || !returnToRow) return
		returnToRow = false
		const el = root
		queueMicrotask(() => el?.focus({ preventScroll: true }))
	})
</script>

{#snippet content()}
	{#if selecting}
		<span class="ed-row-mark-slot" transition:slideIn>
			<span class="ed-row-mark" class:ed-row-mark-on={selected} aria-hidden="true">
				<Icon name="check" size="sm" />
			</span>
		</span>
	{/if}
	{#if icon}<Icon name={icon} size="sm" class="ed-row-icon" />{/if}
	<span class="ed-row-text">
		<span class="ed-row-primary">{primary}</span>
		{#if hasDetail && !compact}
			<span class="ed-row-detail">
				{#if secondary}<span class="ed-row-secondary">{secondary}</span>{/if}
				{#each chips as chip (chip.id ?? chip.label)}
					<Chip label={chip.label} icon={chip.icon} tone={chip.tone} mono={chip.mono} />
				{/each}
				{#each badges as badge (badge.id ?? `${badge.kind}:${badge.label ?? ''}`)}
					<Badge kind={badge.kind} label={badge.label} />
				{/each}
			</span>
		{/if}
	</span>
	{#if meta}<span class="ed-row-meta" class:ed-row-meta-warn={metaWarn}>{meta}</span>{/if}
	{#if actions.length}
		<span class="ed-row-more" bind:this={more}>
			<IconButton
				icon="ellipsis"
				label={name}
				size="sm"
				active={menuOpen}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				tabindex={inGrid ? -1 : undefined}
				onclick={(e) => openMenu(e.currentTarget, 'end', false)}
			/>
		</span>
		<Menu bind:open={menuOpen} anchor={menuAnchor} align={menuAlign} label={name} items={actions} onselect={onaction} />
	{/if}
	{#if selecting && selected && !inGrid}<span class="ed-sr-only">{s.selectedRow}</span>{/if}
{/snippet}

<!-- The row itself is the focus target: a grid row under List's roving tabindex, or a list item on its own. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={root}
	class={[
		'ed-row',
		{
			'ed-row-done': done,
			'ed-row-selecting': selecting,
			'ed-row-selected': selecting && selected,
			'ed-row-compact': compact,
		},
		className,
	]}
	role={inGrid ? 'row' : 'listitem'}
	tabindex={inGrid ? -1 : 0}
	aria-selected={selecting && inGrid ? selected : undefined}
	data-id={id}
	{onclick}
	{ondblclick}
	{oncontextmenu}
	{onkeydown}
	{@attach longPress(() => ({ onpress: openAt, ignore: CONTROLS }))}
	{...rest}
>
	{#if inGrid}
		<div class="ed-row-cell" role="gridcell">{@render content()}</div>
	{:else}
		{@render content()}
	{/if}
</div>

<style>
	.ed-row,
	.ed-row-cell {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.ed-row {
		position: relative;
		box-sizing: border-box;
		min-height: var(--ed-row);
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
		border-bottom: 1px solid var(--stroke-subtle);
		color: var(--text-primary);
		cursor: default;
		user-select: none;
		-webkit-user-select: none;
		transition: background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-row:last-child {
		border-bottom: 0;
	}
	.ed-row-cell {
		flex: 1;
	}
	.ed-row-compact {
		padding-top: 0;
		padding-bottom: 0;
	}
	.ed-row:hover {
		background: var(--surface-2);
	}
	.ed-row-selected,
	.ed-row-selected:hover {
		background: var(--brand-muted);
	}
	.ed-row-selecting {
		cursor: pointer;
	}
	/* the ring sits inside the row, so the card's clipping and the dividers keep all of it */
	.ed-row:focus-visible {
		outline: 2px solid transparent;
		box-shadow: inset 0 0 0 var(--focus-ring-width) var(--brand-primary);
		z-index: 1;
	}

	/* The selection mark: a hollow circle that fills with the accent; the check fades and settles in */
	.ed-row-mark-slot {
		display: inline-flex;
		flex: none;
	}
	.ed-row-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		box-sizing: border-box;
		width: var(--icon-sm);
		height: var(--icon-sm);
		border: 1.5px solid var(--stroke-hover);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--on-brand);
		transition:
			background-color var(--ed-duration-micro) var(--ed-ease-out),
			border-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-row:hover .ed-row-mark {
		border-color: var(--text-tertiary);
	}
	.ed-row-mark-on {
		background: var(--brand-primary);
		border-color: var(--brand-primary);
	}
	.ed-row-mark :global(.ed-icon) {
		width: var(--space-3);
		height: var(--space-3);
		stroke-width: var(--icon-stroke);
		opacity: 0;
		transform: scale(0.5);
		transition:
			opacity var(--ed-duration-micro) var(--ed-ease-out),
			transform var(--ed-duration-panel) var(--ed-ease-out);
	}
	.ed-row-mark-on :global(.ed-icon) {
		opacity: 1;
		transform: none;
	}

	.ed-row :global(.ed-row-icon) {
		color: var(--text-secondary);
	}
	.ed-row-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.ed-row-primary {
		font: var(--ed-t-text);
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ed-row-detail {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.ed-row-secondary {
		font: var(--ed-t-text-sm);
		color: var(--text-secondary);
	}
	.ed-row-meta {
		flex: none;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variation-settings: var(--ed-t-data-sm-opsz);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.ed-row-meta-warn {
		color: var(--text-primary);
	}
	.ed-row-more {
		display: inline-flex;
		flex: none;
	}
	/* Done: struck through and quiet. text-secondary, not tertiary: the primary is 14–16 px, not 12–13 px metadata. */
	.ed-row-done .ed-row-primary {
		color: var(--text-secondary);
		text-decoration: line-through;
	}
</style>
