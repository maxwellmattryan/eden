<script module lang="ts">
	import type { ListRowData as RowData } from '../ListRow/ListRow.svelte'

	/** One row's data, without the row's callbacks: what `rows` takes. */
	export type ListRowData = RowData
</script>

<script lang="ts">
	// Rows on a card, with a header naming the section and counting it, and a select mode (D-41). "Select" in the
	// header (and at the top of every row's menu) turns the mode on: the marks slide in, a click or Space toggles a
	// row, the header reads "n selected" and offers Done, which leaves the mode and clears the selection. Outside the
	// mode the rows show no mark at all. The rows are a grid with one tab stop: arrows, Home and End move between rows
	// and a letter jumps to the next row starting with it; the header's button is outside the grid, as ARIA asks.
	// The selection is a SvelteSet of row ids; a $derived keeps only the ids still in `rows`, so nothing syncs in an effect.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { untrack } from 'svelte'
	import { SvelteSet } from 'svelte/reactivity'
	import { useStrings } from '$lib/i18n/context.js'
	import { roving } from '$lib/internal/roving.js'
	import Button from '../Button/Button.svelte'
	import ListRow from '../ListRow/ListRow.svelte'
	import type { MenuItem } from '../Menu/Menu.svelte'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onselect'> & {
		/** The section name, in the small title style; it names the grid. */
		header?: string
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
		/** Enter or a double-click on a row. */
		onopen?: (row: ListRowData) => void
		/** A pick from a row's menu (never the list's own "Select" item). */
		onaction?: (item: MenuItem, row: ListRowData) => void
		/** The selected ids after every toggle, and [] when Done clears them. */
		onselect?: (ids: string[]) => void
		/** Content after the rows: an EmptyState when there are none, a footer link. */
		children?: Snippet
	}
	const uid = $props.id()
	let {
		header,
		count,
		rows,
		compact = false,
		selectable = false,
		selecting = $bindable(false),
		onopen,
		onaction,
		onselect,
		children,
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
	}
	function leave() {
		selecting = false
		picked.clear()
		onselect?.([])
	}
	function toggle(row: ListRowData, on: boolean) {
		if (on) picked.add(row.id)
		else picked.delete(row.id)
		onselect?.([...selection])
	}
	function actionsFor(row: ListRowData): MenuItem[] {
		const own = row.actions ?? []
		return selectable && !selecting ? [selectItem, ...own] : own
	}
	function onfocusin(e: FocusEvent) {
		const row = e.target instanceof Element ? e.target.closest('[role="row"]') : null
		if (row?.parentElement) focused = [...row.parentElement.children].indexOf(row)
	}
</script>

<div class={['ed-list', { 'ed-list-selecting': selecting }, className]} {...rest}>
	{#if header || count !== undefined || selectable}
		<div class="ed-list-header">
			<span class="ed-list-title" id={headerId}>{header}</span>
			<span class="ed-list-header-right">
				<span class="ed-list-count" aria-live="polite">{selecting ? s.selected(selection.size) : (count ?? '')}</span>
				{#if selectable}
					<Button variant="quiet" label={selecting ? s.done : s.select} onclick={selecting ? leave : enter} />
				{/if}
			</span>
		</div>
	{/if}
	{#if rows.length}
		<div
			class="ed-list-grid"
			role="grid"
			aria-labelledby={header ? headerId : undefined}
			aria-multiselectable={selecting ? 'true' : undefined}
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
					actions={actionsFor(row)}
					onopen={() => onopen?.(row)}
					onaction={(item) => {
						if (item.id !== selectId) onaction?.(item, row)
					}}
					onselect={(on) => toggle(row, on)}
				/>
			{/each}
		</div>
	{/if}
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
		padding: 0 var(--space-1) 0 var(--space-3);
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
		gap: var(--space-2);
		flex: none;
	}
	.ed-list-count {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variation-settings: var(--ed-t-data-sm-opsz);
		font-variant-numeric: tabular-nums;
	}
	.ed-list-grid {
		display: flex;
		flex-direction: column;
	}
	.ed-list-extra {
		min-width: 0;
	}
</style>
