<script lang="ts">
	// The mobile list: one `<li>` per row, each wrapped in a SwipeRow so a drag reveals the leading (check off) and
	// trailing (delete) actions (design/ux-patterns.md, "Mobile adaptations"). The row itself is plain markup on the
	// ListRow's data shape and tokens, 44 px tall, a button that opens the row on tap. ListRow is not used here: its own
	// listitem role cannot sit inside a swipe row inside a list without breaking the list's required children, so the
	// row is drawn by hand until the kit gives ListRow a swipe of its own. The card chrome is the caller's.
	import { Badge, Chip, Icon, SwipeRow, type ListRowData, type SwipeLeading, type SwipeTrailing } from '$lib/index.js'

	type Props = {
		rows: ListRowData[]
		/** The action a drag to the right reveals, per row. */
		leading?: (row: ListRowData) => SwipeLeading
		/** The action a drag to the left reveals, per row. */
		trailing?: (row: ListRowData) => SwipeTrailing
		/** A tap on the row. */
		onopen?: (row: ListRowData) => void
	}
	let { rows, leading, trailing, onopen }: Props = $props()
</script>

<!-- role="list" restated: a list without markers loses its semantics in WebKit -->
<ul class="list" role="list">
	{#each rows as row (row.id)}
		<li class="item">
			<SwipeRow leading={leading?.(row)} trailing={trailing?.(row)}>
				<button class={['row', { 'row-done': row.done }]} type="button" onclick={() => onopen?.(row)}>
					{#if row.icon}<Icon name={row.icon} size="sm" class="row-icon" />{/if}
					<span class="row-text">
						<span class="row-primary">{row.primary}</span>
						{#if row.secondary || row.chips?.length || row.badges?.length}
							<span class="row-detail">
								{#if row.secondary}<span class="row-secondary">{row.secondary}</span>{/if}
								{#each row.chips ?? [] as chip (chip.id ?? chip.label)}
									<Chip label={chip.label} icon={chip.icon} tone={chip.tone} mono={chip.mono} />
								{/each}
								{#each row.badges ?? [] as badge (badge.id ?? `${badge.kind}:${badge.label ?? ''}`)}
									<Badge kind={badge.kind} label={badge.label} />
								{/each}
							</span>
						{/if}
					</span>
					{#if row.meta}<span class={['row-meta', { 'row-meta-warn': row.metaWarn }]}>{row.meta}</span>{/if}
				</button>
			</SwipeRow>
		</li>
	{/each}
</ul>

<style>
	.list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.item {
		border-bottom: 1px solid var(--stroke-subtle);
	}
	.item:last-child {
		border-bottom: 0;
	}
	/* The row on the ListRow's measure: 44 px on the phone, the text in the platform style, the meta in mono */
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		box-sizing: border-box;
		width: 100%;
		min-height: var(--ed-row);
		margin: 0;
		padding: var(--space-1) var(--space-3);
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--text-primary);
		font: var(--ed-t-text);
		text-align: left;
		cursor: pointer;
	}
	.row:focus-visible {
		outline: 2px solid transparent;
		box-shadow: inset 0 0 0 var(--focus-ring-width) var(--brand-primary);
	}
	.row :global(.row-icon) {
		flex: none;
		color: var(--text-secondary);
	}
	.row-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.row-primary {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row-detail {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.row-secondary {
		font: var(--ed-t-text-sm);
		color: var(--text-secondary);
	}
	.row-meta {
		flex: none;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.row-meta-warn {
		color: var(--text-primary);
	}
	.row-done .row-primary {
		color: var(--text-secondary);
		text-decoration: line-through;
	}
</style>
