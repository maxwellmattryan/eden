<script module lang="ts">
	/** One short row of a Garden tile: a text with an optional note beneath, a meta value at the end. */
	export interface WidgetRow {
		id: string
		text: string
		/** A second line under the text, in body-sm. */
		note?: string
		/** The trailing value, in mono; it wraps under the text when the tile is too narrow for both (the 1×1 case). */
		meta?: string
		/** Sets the text in mono, for a repo or project name. */
		mono?: boolean
		/** Lifts the meta to the primary colour: overdue, expiring. */
		warn?: boolean
		/** Strikes the text through: a done task. */
		done?: boolean
	}
</script>

<script lang="ts">
	// The short rows a Garden tile's body is usually made of, in one place so the wrapping rule that keeps a 1×1 tile's
	// rows from overlapping holds for every domain's tiles, on the desktop and on the phone. What the rows say is the
	// app's: the kit only sets them.
	let { rows }: { rows: WidgetRow[] } = $props()
</script>

<ul class="ed-widget-rows rows">
	{#each rows as row (row.id)}
		<li class:done={row.done}>
			<span class="text">
				<span class:mono={row.mono}>{row.text}</span>
				{#if row.note}<span class="note">{row.note}</span>{/if}
			</span>
			{#if row.meta}<span class="meta" class:warn={row.warn}>{row.meta}</span>{/if}
		</li>
	{/each}
</ul>

<style>
	.rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rows li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 0 var(--space-2);
		min-width: 0;
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.note {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.meta {
		margin-left: auto;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.warn {
		color: var(--text-primary);
	}
	.mono {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
	}
	.done .text {
		color: var(--text-secondary);
		text-decoration: line-through;
	}
</style>
