<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'

	/** positive is the success green, warning and danger their colours, neutral the secondary ink; each colours the glyph and the value together. */
	export type DetailRowTone = 'positive' | 'warning' | 'danger' | 'neutral'

	/** One label and value pair in a section's list. */
	export interface DetailRow {
		/** The name of the value, in the caption style. */
		label: string
		/** The value, as text; the app formats it. */
		value: string
		/** Sets the value in mono, for ids, figures and codes. */
		mono?: boolean
		/** A glyph before the value. */
		icon?: IconName
		/** Colours the glyph and the value; the word still carries the meaning. */
		tone?: DetailRowTone
	}
</script>

<script lang="ts">
	// One section of a DetailPopover: a caption, a definition list of rows on a two-column grid (labels at their widest,
	// values taking the rest and wrapping anywhere), then whatever the app brings after them (a list, a pre block, a
	// button). A section with neither rows nor children renders nothing, so a consumer can hand it an empty list.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		/** The section's caption, in the label style; it names the group for assistive technology. */
		label?: string
		/** The label and value pairs. */
		rows?: DetailRow[]
		/** Rendered after the rows: lists, pre blocks, the buttons the app brings. */
		children?: Snippet
	}
	let { label, rows = [], children, class: className = '', ...rest }: Props = $props()

	const uid = $props.id()
	const labelId = `${uid}-label`
</script>

{#if rows.length || children}
	<div class={['ed-detail-section', className]} role="group" aria-labelledby={label ? labelId : undefined} {...rest}>
		{#if label}<p class="ed-detail-label" id={labelId}>{label}</p>{/if}
		{#if rows.length}
			<dl class="ed-detail-rows">
				{#each rows as row, i (i)}
					<dt class="ed-detail-dt">{row.label}</dt>
					<dd class={['ed-detail-dd', { 'ed-detail-mono': row.mono }, row.tone && `ed-detail-${row.tone}`]}>
						{#if row.icon}<Icon name={row.icon} size="sm" class="ed-detail-row-glyph" />{/if}<span>{row.value}</span>
					</dd>
				{/each}
			</dl>
		{/if}
		{#if children}
			<div class="ed-detail-content">{@render children()}</div>
		{/if}
	</div>
{/if}

<style>
	.ed-detail-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		padding: var(--space-3);
		box-sizing: border-box;
	}
	.ed-detail-label {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		font-variation-settings: var(--ed-t-label-opsz);
		color: var(--text-secondary);
	}

	/* labels at their widest, values taking the rest and wrapping wherever they must */
	.ed-detail-rows {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		column-gap: var(--space-3);
		row-gap: var(--space-1);
		margin: 0;
		min-width: 0;
	}
	.ed-detail-dt {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		color: var(--text-secondary);
		/* the caption sits on the body line's baseline */
		align-self: baseline;
	}
	.ed-detail-dd {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		margin: 0;
		min-width: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
		color: var(--text-primary);
		overflow-wrap: anywhere;
		align-self: baseline;
	}
	.ed-detail-dd > span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.ed-detail-mono {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variation-settings: var(--ed-t-data-sm-opsz);
		font-variant-numeric: tabular-nums;
	}
	/* the glyph sits on the value's first line, in the value's colour */
	.ed-detail-dd :global(.ed-detail-row-glyph) {
		margin-top: calc((1lh - var(--icon-sm)) / 2);
	}
	.ed-detail-positive {
		color: var(--success);
	}
	.ed-detail-warning {
		color: var(--warning);
	}
	.ed-detail-danger {
		color: var(--danger);
	}
	.ed-detail-neutral {
		color: var(--text-secondary);
	}

	.ed-detail-content {
		min-width: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
	}
</style>
