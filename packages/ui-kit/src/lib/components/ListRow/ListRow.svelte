<script module lang="ts">
	import type { TransitionConfig } from 'svelte/transition'
	import { quintOut } from 'svelte/easing'
	import type { IconName } from '../../icons/icons.js'
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
		/** A tip about the row, shown as an info button with a tooltip. */
		hint?: string
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
		/** A small picture of the row's thing, as a URL the page may load; it takes the glyph's place. */
		thumbnail?: string
		/** Draws the glyph on a tile the size of a picture, so rows with pictures and rows with glyphs line up. */
		tile?: boolean
		/** Crossed out and quiet: a checked-off grocery, a finished task. */
		done?: boolean
		/** The row is one to check off: a round checkbox leads it, checked while `done`. */
		checkable?: boolean
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

	/** What the leave takes: whether the row is a list's, and who to tell as it begins. */
	interface Leave {
		inGrid: boolean
		onleave?: (row: HTMLElement) => void
	}

	/**
	 * A row's leave from a list: its height, its vertical padding and its bottom border close over the settle
	 * duration with its opacity (quintOut, the token's ease-out), so the rows beneath settle up as it goes. A zero
	 * settle duration, which is reduced motion, fades instead, over the micro duration. Only a list's rows leave this
	 * way: a row on its own goes at once. Local, so a page that leaves takes its rows with it without a word. The list
	 * is told first, while the row can still hold focus: Svelte makes a leaving element inert right after.
	 */
	function collapse(node: HTMLElement, { inGrid, onleave }: Leave): TransitionConfig {
		if (!inGrid) return { duration: 0 }
		onleave?.(node)
		const style = getComputedStyle(node)
		const duration = parseFloat(style.getPropertyValue('--ed-duration-settle')) || 0
		if (!duration) {
			return { duration: parseFloat(style.getPropertyValue('--ed-duration-micro')) || 0, css: (t) => `opacity: ${t}` }
		}
		const height = node.getBoundingClientRect().height
		const top = parseFloat(style.paddingTop) || 0
		const bottom = parseFloat(style.paddingBottom) || 0
		const border = parseFloat(style.borderBottomWidth) || 0
		return {
			duration,
			easing: quintOut,
			css: (t) =>
				`overflow: hidden; min-height: 0; height: ${(t * height).toFixed(2)}px; padding-top: ${(t * top).toFixed(2)}px; padding-bottom: ${(t * bottom).toFixed(2)}px; border-bottom-width: ${(t * border).toFixed(2)}px; opacity: ${t}`,
		}
	}
</script>

<script lang="ts">
	// One row of a list: a leading icon, the primary text (with an info glyph after it when the row has a `hint`, its
	// tooltip the hint) and a detail line of chips and badges beneath, trailing metadata in mono, and a ⋯ button that
	// opens the row's menu. A right-click, a long-press and Shift+F10 (or the ContextMenu key) open the same menu. A
	// click picks the row (D-94): the caller shows it, and the `current` row sits on brand-muted; a double-click, or
	// Enter on the current row, opens it, which is the row's main action. With no `onpick` a click opens. A `checkable`
	// row leads with a round checkbox, checked while `done`, which a press or Space toggles. Selection is a mode
	// (D-41): outside it the row shows no mark and gives up no space; while the list is `selecting` a round mark slides
	// in at the leading edge and a click or Space toggles the row onto brand-muted; a Ctrl, Cmd or Shift click outside
	// the mode is the list's to answer (`onextend`). Inside List the row is a grid row with one gridcell and the list manages its tab stop, and
	// it leaves with a collapse (`collapse` above); on its own it is a list item and its own tab stop. A press on a
	// button in the row (the hint, the ⋯) never toggles or opens the row. With a `dragGroup` a desktop pointer can pick
	// the row up and drop it on a DropTarget that accepts the group; the row dims while it is held.
	import { tick } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import type { AnchorLike } from '../../internal/anchor.js'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import Badge from '../Badge/Badge.svelte'
	import Chip from '../Chip/Chip.svelte'
	import IconButton from '../IconButton/IconButton.svelte'
	import Menu from '../Menu/Menu.svelte'
	import Thumbnail from '../Thumbnail/Thumbnail.svelte'
	import { rowDragSource } from '../../internal/row-drag.js'
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
			/** The row is the one the caller is showing: it sits on brand-muted outside select mode. */
			current?: boolean
			/** A click, or Enter on a row that is not `current`: the caller shows the row. */
			onpick?: () => void
			/** A double-click, or Enter on the `current` row: the row's main action. A click too, when there is no `onpick`. */
			onopen?: () => void
			/** A press on the checkbox of a `checkable` row, or Space on the row, with what `done` becomes. */
			oncheck?: (done: boolean) => void
			/** Set by List: a Ctrl or Cmd click (`toggle`) or a Shift click (`range`), in select mode or out of it. */
			onextend?: (how: 'toggle' | 'range') => void
			/** A pick from the row's menu. */
			onaction?: (item: MenuItem) => void
			/** The row toggled in select mode, with its new state. */
			onselect?: (selected: boolean) => void
			/** Set by List: the row's leave from the list has begun, before it goes inert; the list moves its focus on. */
			onleave?: (row: HTMLElement) => void
			/** Makes the row one a pointer can drag to a `DropTarget` that accepts this group; desktop only. */
			dragGroup?: string
			/** The row was picked up (`true`) or let go, dropped or not (`false`). */
			ondragstate?: (dragging: boolean) => void
		}
	let {
		id,
		primary,
		hint,
		secondary,
		chips = [],
		badges = [],
		meta,
		metaWarn = false,
		icon,
		thumbnail,
		tile = false,
		done = false,
		checkable = false,
		actions = [],
		selecting = false,
		selected = $bindable(false),
		compact = false,
		inGrid = false,
		current = false,
		onpick,
		onopen,
		oncheck,
		onextend,
		onaction,
		onselect,
		onleave,
		dragGroup,
		ondragstate,
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
		// the ⋯ button pressed again while its menu is open closes it
		if (menuOpen && menuAnchor === anchor) {
			menuOpen = false
			return
		}
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
	/**
	 * A pick reaches the caller once the menu has closed and handed focus back: a pick that removes the row would
	 * otherwise pause the row, and the menu with it, before the menu could close.
	 */
	async function pick(item: MenuItem) {
		await tick()
		onaction?.(item)
	}

	function onclick(e: MouseEvent) {
		if (inside(e.target, CONTROLS)) return
		if (onextend && (e.shiftKey || e.metaKey || e.ctrlKey)) onextend(e.shiftKey ? 'range' : 'toggle')
		else if (selecting) toggle()
		// the second click of a double-click picks nothing again: the first one did
		else if (e.detail < 2) (onpick ?? onopen)?.()
	}
	/** A Shift click extends the selection: it must not select the text between the two rows. */
	function onmousedown(e: MouseEvent) {
		if (onextend && e.shiftKey && !inside(e.target, CONTROLS)) e.preventDefault()
	}
	function ondblclick(e: MouseEvent) {
		// with no `onpick` the two clicks have opened the row already
		if (selecting || !onpick || inside(e.target, CONTROLS)) return
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
			if (onpick && !current) onpick()
			else onopen?.()
		} else if (e.key === ' ' && selecting) {
			e.preventDefault()
			toggle()
		} else if (e.key === ' ' && checkable) {
			e.preventDefault()
			oncheck?.(!done)
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
	{:else if checkable}
		<button
			type="button"
			class="ed-row-mark ed-row-check"
			class:ed-row-mark-on={done}
			role="checkbox"
			aria-checked={done}
			aria-label={s.checkOff(primary)}
			tabindex={inGrid ? -1 : undefined}
			onclick={() => oncheck?.(!done)}
		>
			<Icon name="check" size="sm" />
		</button>
	{/if}
	{#if thumbnail || (icon && tile)}
		<Thumbnail class="ed-row-thumb" src={thumbnail} {icon} />
	{:else if icon}
		<Icon name={icon} size="sm" class="ed-row-icon" />
	{/if}
	<span class="ed-row-text">
		<span class="ed-row-head">
			<span class="ed-row-primary">{primary}</span>
			{#if hint}
				<IconButton icon="info" size="xs" label={s.about(primary)} tooltip={hint} tabindex={inGrid ? -1 : undefined} />
			{/if}
		</span>
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
		<Menu bind:open={menuOpen} anchor={menuAnchor} align={menuAlign} label={name} items={actions} onselect={pick} />
	{/if}
	{#if selecting && selected && !inGrid}<span class="ed-sr-only">{s.selectedRow}</span>{/if}
{/snippet}

<!-- The row itself is the focus target: a grid row under List's roving tabindex, or a list item on its own. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={root}
	out:collapse={{ inGrid, onleave }}
	class={[
		'ed-row',
		{
			'ed-row-done': done,
			'ed-row-selecting': selecting,
			'ed-row-selected': selecting && selected,
			'ed-row-current': current && !selecting,
			'ed-row-pickable': !!(onpick ?? onopen),
			'ed-row-compact': compact,
		},
		className,
	]}
	role={inGrid ? 'row' : 'listitem'}
	tabindex={inGrid ? -1 : 0}
	aria-selected={selecting && inGrid ? selected : undefined}
	aria-current={current && !selecting ? 'true' : undefined}
	data-id={id}
	{onclick}
	{onmousedown}
	{ondblclick}
	{oncontextmenu}
	{onkeydown}
	{@attach longPress(() => ({ onpress: openAt, ignore: CONTROLS }))}
	{@attach rowDragSource(() => ({
		group: () => dragGroup,
		ids: () => [id],
		onState: (dragging) => ondragstate?.(dragging),
	}))}
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
		transition:
			background-color var(--ed-duration-micro) var(--ed-ease-out),
			opacity var(--ed-duration-micro) var(--ed-ease-out);
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
	.ed-row-selected:hover,
	.ed-row-current,
	.ed-row-current:hover {
		background: var(--brand-muted);
	}
	.ed-row-selecting,
	.ed-row-pickable {
		cursor: pointer;
	}
	/* picked up and held by the pointer: the row left behind goes quiet until it is let go */
	.ed-row[data-dragging] {
		opacity: 0.4;
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
	/* the checkbox of a row to check off: the same mark, as a control of its own */
	.ed-row-check {
		padding: 0;
		cursor: pointer;
	}
	.ed-row-check:focus-visible {
		outline: var(--focus-ring-width) solid var(--brand-primary);
		outline-offset: 2px;
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
	/* the primary text and the hint glyph right after it; the text gives way, the glyph never does */
	.ed-row-head {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
	}
	.ed-row-head :global(.ed-icon-btn) {
		flex: none;
	}
	.ed-row-primary {
		min-width: 0;
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
