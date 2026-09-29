<script module lang="ts">
	/** A column: its header, whether it holds numbers (right-aligned, mono, tabular) and whether it is quiet. */
	export interface DataTableColumn {
		label: string
		numeric?: boolean
		muted?: boolean
	}
</script>

<script lang="ts">
	// Tables only for numeric data (stock quantities, metrics, the egress ledger, the audit log): anything that is not
	// mostly numbers is a list. Numbers sit right-aligned in Geist Mono with tabular figures so a column of them lines
	// up; text columns stay in Inter. The caption names the table for assistive technology and is visually hidden unless
	// `showCaption`. Rows are formatted strings, so the caller decides separators, decimals and units.
	import type { HTMLTableAttributes } from 'svelte/elements'

	type Props = Omit<HTMLTableAttributes, 'children'> & {
		/** The columns, in order; `numeric` right-aligns in mono, `muted` dims the column to text-secondary. */
		columns: DataTableColumn[]
		/** One string per column per row, already formatted with its unit. */
		rows: string[][]
		/** The table's name: its caption, visually hidden unless `showCaption`. */
		label: string
		/** Shows the caption above the table. */
		showCaption?: boolean
	}
	let { columns, rows, label, showCaption = false, class: className = '', ...rest }: Props = $props()
</script>

<table class="ed-table {className}" {...rest}>
	<caption class={showCaption ? 'ed-table-caption' : 'ed-sr-only'}>{label}</caption>
	<thead>
		<tr>
			{#each columns as column, c (`${column.label}-${c}`)}
				<th scope="col" class:ed-table-num={column.numeric}>{column.label}</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		<!-- rows are plain string arrays with no identity of their own, so the index is the only stable key -->
		{#each rows as row, r (r)}
			<tr>
				{#each row as cell, c (c)}
					<td class:ed-table-num={columns[c]?.numeric} class:ed-table-muted={columns[c]?.muted}>{cell}</td>
				{/each}
			</tr>
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
	.ed-table td {
		height: var(--ed-row);
		padding: 0 var(--space-3);
		border-bottom: 1px solid var(--stroke-subtle);
		transition: background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-table tr:last-child td {
		border-bottom: 0;
	}
	.ed-table tbody tr:hover td {
		background: var(--surface-2);
	}
	.ed-table .ed-table-num {
		text-align: right;
	}
	.ed-table td.ed-table-num {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
	}
	.ed-table .ed-table-muted {
		color: var(--text-secondary);
	}
</style>
