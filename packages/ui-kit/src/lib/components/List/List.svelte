<script module lang="ts">
	import type { ListRowData as RowData } from '../ListRow/ListRow.svelte'

	/** One row's data, without the row's callbacks: what `rows` takes. */
	export type ListRowData = RowData
</script>

<script lang="ts">
	// Rows on a card, with a header naming the section and counting it, and a select mode (D-41). A click picks a row
	// (`onpick`; the caller names the one it shows as `current`, which the list highlights), a double-click or Enter on
	// the current row opens it, and a Ctrl, Cmd or Shift click on a `selectable` list starts the selection from there
	// (D-94): Ctrl or Cmd toggles the row, with the current row taken along, Shift takes every row from the last one
	// toggled to this one. "Select" in the
	// header (and at the top of every row's menu) turns the mode on: the marks slide in, a click or Space toggles a
	// row, the header reads "n selected" and offers Done, which leaves the mode and clears the selection; `bulk` puts the
	// caller's actions on the selection beside that count. Outside the
	// mode the rows show no mark at all. The rows are a grid with one tab stop: arrows, Home and End move between rows
	// and a letter jumps to the next row starting with it; the header's button is outside the grid, as ARIA asks.
	// The selection is a SvelteSet of row ids; a $derived keeps only the ids still in `rows`, so nothing syncs in an effect.
	// A row that leaves `rows` collapses (ListRow's `collapse`) and is in the DOM until it has; the grid stays mounted
	// so the last row can leave too, and it is a grid only while it has rows. A leaving row that holds focus hands it
	// to the row that takes its place, or to the one before it when it was last (`onleave`).
	// With a `dragGroup` the rows can be dragged out, by a desktop pointer, to a DropTarget that accepts the group.
	// With `leading` or `trailing` the rows swipe on the phone (ListRow draws them through SwipeRow,
	// D-TBD(list-swipe)); a row with no menu of its own takes the two actions as its menu on both platforms, so they
	// are never reached by a swipe alone.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { untrack } from 'svelte'
	import { SvelteSet } from 'svelte/reactivity'
	import { useStrings } from '../../i18n/context.js'
	import { roving } from '../../internal/roving.js'
	import Button from '../Button/Button.svelte'
	import ListRow, { swipeItems } from '../ListRow/ListRow.svelte'
	import type { MenuItem } from '../Menu/Menu.svelte'
	import type { SwipeLeading, SwipeTrailing } from '../SwipeRow/SwipeRow.svelte'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onselect'> & {
		/** The section name, in the small title style; it names the grid. */
		header?: string
		/** The id of a heading outside the list that names the grid, for a list with no `header` of its own. */
		labelledby?: string
		/**
		 * No header row at all: the caller shows the name and the count itself, and while `selecting` its own Done and
		 * actions on what `onselect` reports. Select stays in every row's menu.
		 */
		headless?: boolean
		/** The count beside the name, in mono. */
		count?: number | string
		/** The rows, keyed and selected by `id`. */
		rows: ListRowData[]
		/** Hides every row's detail line; the 32 px height comes from data-density through --ed-row. */
		compact?: boolean
		/** Offers select mode: "Select" in the header and in every row's menu. */
		selectable?: boolean
		/** Bindable. Select mode, on or off; Done sets it back to false. */
		selecting?: boolean
		/** The id of the row the caller is showing; it is highlighted outside select mode. */
		current?: string
		/** A click on a row, or Enter on one that is not `current`: the caller shows it. */
		onpick?: (row: ListRowData) => void
		/** A double-click on a row, or Enter on the `current` one: its main action. A click too, with no `onpick`. */
		onopen?: (row: ListRowData) => void
		/** The checkbox of a `checkable` row, with what `done` becomes. */
		oncheck?: (row: ListRowData, done: boolean) => void
		/** A pick from a row's menu (never the list's own "Select" item). */
		onaction?: (item: MenuItem, row: ListRowData) => void
		/** The selected ids after every toggle, and [] when Done clears them. */
		onselect?: (ids: string[]) => void
		/**
		 * The action a drag to the right reveals on the phone, per row (done, check); nothing for a row without one.
		 * Its own `onaction` is the whole of it: the list's `onaction` never hears a swipe action.
		 */
		leading?: (row: ListRowData) => SwipeLeading | undefined
		/** The action a drag to the left reveals on the phone, per row (delete, on the danger ground). */
		trailing?: (row: ListRowData) => SwipeTrailing | undefined
		/**
		 * Makes the rows ones a desktop pointer can drag to a `DropTarget` that accepts this group. Off while
		 * selecting.
		 */
		dragGroup?: string
		/** A row was picked up (`true`) or let go, dropped or not (`false`). */
		ondragstate?: (dragging: boolean) => void
		/** Content after the rows: an EmptyState when there are none, a footer link. */
		children?: Snippet
		/** Actions on the selection, in the header beside the count while selecting; takes the selected ids. */
		bulk?: Snippet<[string[]]>
	}
	const uid = $props.id()
	let {
		header,
		labelledby,
		headless = false,
		count,
		rows,
		compact = false,
		selectable = false,
		selecting = $bindable(false),
		current,
		onpick,
		onopen,
		oncheck,
		onaction,
		onselect,
		leading,
		trailing,
		dragGroup,
		ondragstate,
		children,
		bulk,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const headerId = `${uid}-header`
	const selectId = `${uid}-select`

	/** What has been toggled on, as ids. */
	const picked = new SvelteSet<string>()
	/** The selection that counts: the picked ids still present in `rows`, and none outside select mode. */
	const selection = $derived.by(() => {
		if (!selecting) return new Set<string>()
		const ids = new Set(rows.map((row) => row.id))
		return new Set([...picked].filter((id) => ids.has(id)))
	})
	/** The row that last held focus, so a DOM change inside the grid keeps the tab stop where it was. */
	let focused = $state(-1)

	const selectItem = $derived<MenuItem>({ id: selectId, label: s.select, icon: 'check', onselect: enter })

	function enter() {
		picked.clear()
		selecting = true
		onselect?.([])
	}
	function leave() {
		selecting = false
		picked.clear()
		onselect?.([])
	}
	/** The row a Shift click reaches from: the last one toggled. */
	let from: string | undefined
	function toggle(row: ListRowData, on: boolean) {
		if (on) picked.add(row.id)
		else picked.delete(row.id)
		from = row.id
		onselect?.([...selection])
	}
	/** A Ctrl, Cmd or Shift click: the selection starts here when the list was not selecting, the current row with it. */
	function extend(row: ListRowData, how: 'toggle' | 'range') {
		if (!selecting) {
			enter()
			from = undefined
			if (current && current !== row.id && rows.some((entry) => entry.id === current)) {
				picked.add(current)
				from = current
			}
		}
		if (how === 'toggle') return toggle(row, !picked.has(row.id))
		const ids = rows.map((entry) => entry.id)
		const start = from && ids.includes(from) ? ids.indexOf(from) : ids.indexOf(row.id)
		const end = ids.indexOf(row.id)
		for (const id of ids.slice(Math.min(start, end), Math.max(start, end) + 1)) picked.add(id)
		onselect?.([...selection])
	}
	function actionsFor(row: ListRowData): MenuItem[] {
		// a row with no menu of its own takes its swipe actions as one
		const own = row.actions?.length ? row.actions : swipeItems(leading?.(row), trailing?.(row))
		return selectable && !selecting ? [selectItem, ...own] : own
	}
	/** The rows of the grid that are staying: those still in `rows`, by id, so a row on its way out is not counted. */
	function staying(grid: Element): Element[] {
		const ids = new Set(rows.map((row) => row.id))
		return [...grid.children].filter((el) => el instanceof HTMLElement && ids.has(el.dataset.id ?? ''))
	}
	function onfocusin(e: FocusEvent) {
		const row = e.target instanceof Element ? e.target.closest('[role="row"]') : null
		if (row?.parentElement) focused = staying(row.parentElement).indexOf(row)
	}
	/**
	 * A leaving row that holds focus hands it on: to the next row that stays, or to the last one when it was last. The
	 * row says so as its leave begins, before Svelte makes it inert, which would drop the focus on the body.
	 */
	function onleave(row: HTMLElement) {
		if (!row.parentElement || !row.contains(document.activeElement)) return
		const rest = staying(row.parentElement)
		let next = row.nextElementSibling
		while (next && !rest.includes(next)) next = next.nextElementSibling
		const target = next ?? rest[rest.length - 1]
		if (target instanceof HTMLElement) target.focus({ preventScroll: true })
	}
</script>

<div class={['ed-list', { 'ed-list-selecting': selecting }, className]} {...rest}>
	{#if !headless && (header || count !== undefined || selectable)}
		<div class="ed-list-header">
			<span class="ed-list-title" id={headerId}>{header}</span>
			<span class="ed-list-header-right">
				{#if selecting && bulk}{@render bulk([...selection])}{/if}
				{#if selectable}
					<span class="ed-list-toggle">
						<Button variant="quiet" label={selecting ? s.done : s.select} onclick={selecting ? leave : enter} />
					</span>
				{/if}
				<span class="ed-list-count" aria-live="polite">{selecting ? s.selected(selection.size) : (count ?? '')}</span>
			</span>
		</div>
	{/if}
	<!-- always mounted, so the last row can leave; a grid only while it has rows -->
	<div
		class="ed-list-grid"
		role={rows.length ? 'grid' : undefined}
		aria-labelledby={rows.length ? (header ? headerId : labelledby) : undefined}
		aria-multiselectable={rows.length && selecting ? 'true' : undefined}
		{onfocusin}
		{@attach roving(() => ({
			selector: '[role="row"]',
			orientation: 'vertical',
			homeEnd: true,
			typeahead: true,
			current: () => untrack(() => Math.max(0, focused)),
		}))}
	>
		{#each rows as row (row.id)}
			<ListRow
				{...row}
				inGrid
				{compact}
				{selecting}
				selected={selection.has(row.id)}
				current={current === row.id}
				actions={actionsFor(row)}
				onpick={onpick ? () => onpick(row) : undefined}
				onopen={onopen ? () => onopen(row) : undefined}
				oncheck={(done) => oncheck?.(row, done)}
				onextend={selectable ? (how) => extend(row, how) : undefined}
				onaction={(item) => {
					if (item.id !== selectId) onaction?.(item, row)
				}}
				onselect={(on) => toggle(row, on)}
				{onleave}
				swipeLeading={leading?.(row)}
				swipeTrailing={trailing?.(row)}
				dragGroup={selecting ? undefined : dragGroup}
				{ondragstate}
			/>
		{/each}
	</div>
	{#if children}<div class="ed-list-extra">{@render children()}</div>{/if}
</div>

<style>
	.ed-list {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		min-width: 0;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		color: var(--text-primary);
		overflow: hidden;
	}
	.ed-list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		box-sizing: border-box;
		min-height: var(--ed-control);
		/* the rows' own padding, so the header's right side stands over the rows' columns */
		padding: 0 var(--space-2) 0 var(--space-3);
		border-bottom: 1px solid var(--stroke-subtle);
		color: var(--text-secondary);
	}
	.ed-list-title {
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ed-list-header-right {
		display: inline-flex;
		align-items: center;
		/* the rows' gap between the meta and the ⋯ button */
		gap: var(--space-3);
		flex: none;
	}
	/* the count is always centred on the rows' ⋯ column, whether or not any row has one now (an empty list, a list
	   with no menus), so every count in the kit stands in the same place: a box the width of the rows' sm
	   IconButton, which a longer "n selected" outgrows toward the leading side */
	.ed-list-count {
		box-sizing: border-box;
		min-width: calc(var(--control-height) - var(--space-1));
		text-align: center;
		white-space: nowrap;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variation-settings: var(--ed-t-data-sm-opsz);
		font-variant-numeric: tabular-nums;
	}
	.ed-list-toggle {
		display: inline-flex;
		/* the Select label ends where the rows' meta ends: the button gives up its trailing padding */
		margin-inline-end: calc(-1 * var(--ed-btn-pad));
	}
	.ed-list-grid {
		display: flex;
		flex-direction: column;
	}
	.ed-list-extra {
		min-width: 0;
	}
</style>
