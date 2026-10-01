<script module lang="ts">
	import type { TransitionConfig } from 'svelte/transition'
	import { quintOut } from 'svelte/easing'
	import type { IconName } from '../../icons/icons.js'

	/** A column: its header, whether it holds numbers (mono, tabular figures) and whether it is quiet. */
	export interface DataTableColumn {
		label: string
		numeric?: boolean
		muted?: boolean
		/** A sentence explaining the column, as a tooltip on an info glyph beside its header. */
		hint?: string
	}

	/** A richer cell: text with an optional glyph before it, a tone that colours both, and mono on its own. */
	export interface DataTableCell {
		text: string
		icon?: IconName
		tone?: 'positive' | 'warning' | 'danger' | 'neutral'
		mono?: boolean
		/** The code style, for an identifier: a model id, a URI. */
		code?: boolean
	}

	/** The cell as an object, so the template reads one shape. */
	const cellOf = (cell: string | DataTableCell): DataTableCell => (typeof cell === 'string' ? { text: cell } : cell)

	/** The controls inside a row that a click on the row must not answer for. */
	const CONTROLS = 'button, a, input'

	/**
	 * A row's detail opening beneath it: its height and its opacity open together over the panel duration (quintOut,
	 * the token's ease-out), so the table grows and the rows beneath settle down as it goes; it closes the same way. A
	 * zero panel duration, which is reduced motion, fades instead, over the micro duration.
	 */
	function unfold(node: HTMLElement): TransitionConfig {
		const style = getComputedStyle(node)
		const duration = parseFloat(style.getPropertyValue('--ed-duration-panel')) || 0
		if (!duration) {
			return { duration: parseFloat(style.getPropertyValue('--ed-duration-micro')) || 0, css: (t) => `opacity: ${t}` }
		}
		const height = node.getBoundingClientRect().height
		return {
			duration,
			easing: quintOut,
			css: (t) => `height: ${(t * height).toFixed(2)}px; opacity: ${t}`,
		}
	}
</script>

<script lang="ts">
	// Tables are for rows of mostly numbers (stock quantities, metrics, the egress ledger, the audit log): anything
	// else is a list. Every column is left-aligned like every list; a numeric column only takes Geist Mono with tabular
	// figures so its digits line up, text columns stay in Inter. A cell may carry a glyph and a tone (an outcome column:
	// ok, error, cut short) or ask for mono on its own. The caption names the table for assistive technology and is
	// visually hidden unless `showCaption`. Cells are formatted strings, so the caller decides separators, decimals and
	// units. With `onrow` each body row is a focusable target that opens on click, Enter or Space; its cells name it.
	// With `detail` a row unfolds instead: a chevron at the row's end (the keyboard's target) or a click on the row
	// opens the snippet beneath it, one row at a time (`expanded`, bindable), the table growing over the panel duration.
	import type { Snippet } from 'svelte'
	import type { HTMLTableAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { smoothSize } from '../../internal/smooth-size.js'
	import IconButton from '../IconButton/IconButton.svelte'

	type Props = Omit<HTMLTableAttributes, 'children'> & {
		/** The columns, in order; `numeric` sets mono with tabular figures, `muted` dims the column to text-secondary. */
		columns: DataTableColumn[]
		/** One cell per column per row, already formatted with its unit: a string, or a `DataTableCell`. */
		rows: (string | DataTableCell)[][]
		/** The table's name: its caption, visually hidden unless `showCaption`. */
		label: string
		/** Shows the caption above the table. */
		showCaption?: boolean
		/** Makes every body row interactive; called with the row's index and its element (for a popover to hang on). */
		onrow?: (index: number, element: HTMLTableRowElement) => void
		/** What a row unfolds to, beneath it, given the row's index; with it every row carries a chevron. */
		detail?: Snippet<[number]>
		/** detail only: the index of the row that is open (bindable); one at a time. */
		expanded?: number
	}
	let {
		columns,
		rows,
		label,
		showCaption = false,
		onrow,
		detail,
		expanded = $bindable(),
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const uid = $props.id()

	function toggle(index: number) {
		expanded = expanded === index ? undefined : index
	}
	function click(event: MouseEvent, index: number) {
		const row = event.currentTarget as HTMLTableRowElement
		// a control in the row answers for itself, the chevron included
		if (detail && event.target instanceof Element && event.target.closest(CONTROLS)) return
		if (detail) toggle(index)
		onrow?.(index, row)
	}

	function keydown(event: KeyboardEvent, index: number) {
		if (event.target !== event.currentTarget) return
		if (event.key !== 'Enter' && event.key !== ' ') return
		event.preventDefault()
		onrow?.(index, event.currentTarget as HTMLTableRowElement)
	}
</script>

<table class={['ed-table', { 'ed-table-rows': !!onrow || !!detail }, className]} {...rest}>
	<caption class={showCaption ? 'ed-table-caption' : 'ed-sr-only'}>{label}</caption>
	<thead>
		<tr>
			{#each columns as column, c (`${column.label}-${c}`)}
				<th scope="col">
					<span class="ed-table-head">
						{column.label}
						{#if column.hint}<IconButton
								icon="info"
								size="xs"
								label={s.about(column.label)}
								tooltip={column.hint}
							/>{/if}
					</span>
				</th>
			{/each}
			{#if detail}<td class="ed-table-fold-head"></td>{/if}
		</tr>
	</thead>
	<tbody>
		<!-- rows are plain arrays with no identity of their own, so the index is the only stable key -->
		{#each rows as row, r (r)}
			<!-- with onrow the row is the target: its cells name it, so it needs no role or label of its own -->
			<tr
				class={{ 'ed-table-open': !!detail && expanded === r }}
				tabindex={onrow ? 0 : undefined}
				onclick={onrow || detail ? (e) => click(e, r) : undefined}
				onkeydown={onrow ? (e) => keydown(e, r) : undefined}
			>
				{#each row as raw, c (c)}
					{@const cell = cellOf(raw)}
					<td
						class={[
							{
								'ed-table-num': columns[c]?.numeric,
								'ed-table-mono': cell.mono,
								'ed-table-code': cell.code,
								'ed-table-muted': columns[c]?.muted,
							},
							cell.tone && `ed-table-${cell.tone}`,
						]}
					>
						{#if cell.icon}<Icon name={cell.icon} size="sm" class="ed-table-glyph" />{/if}<span>{cell.text}</span>
					</td>
				{/each}
				{#if detail}
					<td class="ed-table-fold-cell">
						<IconButton
							icon={expanded === r ? 'chevron-up' : 'chevron-down'}
							size="xs"
							label={expanded === r ? s.hide : s.show}
							aria-expanded={expanded === r}
							aria-controls="{uid}-detail-{r}"
							onclick={() => toggle(r)}
						/>
					</td>
				{/if}
			</tr>
			{#if detail && expanded === r}
				<tr class="ed-table-detail">
					<td colspan={columns.length + 1}>
						<!-- the frame opens and closes; the body inside eases it when a section folds or rows arrive -->
						<div class="ed-table-detail-frame" id="{uid}-detail-{r}" transition:unfold>
							<div class="ed-table-detail-body" {@attach smoothSize()}>{@render detail(r)}</div>
						</div>
					</td>
				</tr>
			{/if}
		{/each}
	</tbody>
</table>

<style>
	.ed-table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		overflow: hidden;
		background: var(--surface-1);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		color: var(--text-primary);
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.ed-table-caption {
		caption-side: top;
		padding: 0 0 var(--space-2);
		text-align: left;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
		color: var(--text-primary);
	}
	.ed-table th {
		padding: var(--space-2) var(--space-3);
		text-align: left;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
		border-bottom: 1px solid var(--stroke-subtle);
		white-space: nowrap;
	}
	.ed-table-head {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.ed-table td {
		height: var(--ed-row);
		padding: 0 var(--space-3);
		text-align: left;
		border-bottom: 1px solid var(--stroke-subtle);
		transition: background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-table tr:last-child td {
		border-bottom: 0;
	}
	.ed-table tbody tr:not(.ed-table-detail):hover td {
		background: var(--surface-2);
	}
	.ed-table td.ed-table-num,
	.ed-table td.ed-table-mono {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
	}
	.ed-table td.ed-table-code {
		font: var(--ed-t-code);
		letter-spacing: var(--ed-t-code-tracking);
		font-variation-settings: var(--ed-t-code-opsz);
	}
	.ed-table .ed-table-muted {
		color: var(--text-secondary);
	}
	/* a glyph sits on the text's line, before it, in the cell's colour */
	.ed-table td :global(.ed-table-glyph) {
		vertical-align: -0.2em;
		margin-right: var(--space-1);
	}
	.ed-table .ed-table-positive {
		color: var(--success);
	}
	.ed-table .ed-table-warning {
		color: var(--warning);
	}
	.ed-table .ed-table-danger {
		color: var(--danger);
	}
	.ed-table .ed-table-neutral {
		color: var(--text-secondary);
	}
	/* interactive rows: a pointer, a hover ground, and a ring inside the row so the table's clipping keeps all of it */
	.ed-table-rows tbody tr:not(.ed-table-detail) {
		cursor: pointer;
	}
	.ed-table-rows tbody tr:focus-visible {
		outline: var(--focus-ring-width) solid var(--brand-primary);
		outline-offset: calc(-1 * var(--focus-ring-width));
	}

	/* a row that unfolds: the chevron's cell hugs the row's end, and the open row shares its ground with its detail */
	.ed-table .ed-table-fold-head {
		border-bottom: 1px solid var(--stroke-subtle);
	}
	.ed-table td.ed-table-fold-cell {
		width: 1%;
		padding-left: 0;
		text-align: right;
		white-space: nowrap;
	}
	.ed-table tr.ed-table-open td {
		background: var(--surface-2);
		border-bottom-color: transparent;
	}
	.ed-table tr.ed-table-detail td {
		height: auto;
		padding: 0;
		background: var(--surface-2);
	}
	/* clipped, so the frame can close over its body */
	.ed-table-detail-frame {
		overflow: hidden;
	}
</style>
