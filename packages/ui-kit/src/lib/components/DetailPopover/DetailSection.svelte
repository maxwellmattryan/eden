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
	// button). A section with neither rows nor children renders nothing, so a consumer can hand it an empty list. The
	// caption's row can carry an info glyph whose tooltip says what the section is (`hint`), and a chevron that folds
	// the body (`collapsible`, closed unless `open`), so a detail keeps its heavier parts a press away.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import IconButton from '../IconButton/IconButton.svelte'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		/** The section's caption, in the label style; it names the group for assistive technology. */
		label?: string
		/** The label and value pairs. */
		rows?: DetailRow[]
		/** A sentence about the section, behind an info glyph beside the caption. */
		hint?: string
		/** The body folds behind a chevron in the caption's row. */
		collapsible?: boolean
		/** collapsible only: whether the body starts open. */
		open?: boolean
		/** Rendered after the rows: lists, pre blocks, the buttons the app brings. */
		children?: Snippet
	}
	let {
		label,
		rows = [],
		hint,
		collapsible = false,
		open = false,
		children,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const uid = $props.id()
	const labelId = `${uid}-label`
	const bodyId = `${uid}-body`
	// `open` is the starting state only; the chevron owns it from then on
	// svelte-ignore state_referenced_locally
	let expanded = $state(open)
	const shown = $derived(!collapsible || expanded)
</script>

{#if rows.length || children}
	<div
		class={['ed-detail-section', className]}
		id={collapsible ? bodyId : undefined}
		role="group"
		aria-labelledby={label ? labelId : undefined}
		{...rest}
	>
		{#if label || hint || collapsible}
			<div class="ed-detail-caption">
				{#if label}<p class="ed-detail-label" id={labelId}>{label}</p>{/if}
				{#if hint}<IconButton icon="info" size="xs" label={hint} tooltip class="ed-detail-hint" />{/if}
				{#if collapsible}
					<IconButton
						icon={expanded ? 'chevron-up' : 'chevron-down'}
						size="xs"
						label={expanded ? s.hide : s.show}
						tooltip
						aria-expanded={expanded}
						aria-controls={bodyId}
						aria-describedby={label ? labelId : undefined}
						class="ed-detail-fold"
						onclick={() => (expanded = !expanded)}
					/>
				{/if}
			</div>
		{/if}
		{#if rows.length && shown}
			<dl class="ed-detail-rows">
				{#each rows as row, i (i)}
					<dt class="ed-detail-dt">{row.label}</dt>
					<dd class={['ed-detail-dd', { 'ed-detail-mono': row.mono }, row.tone && `ed-detail-${row.tone}`]}>
						{#if row.icon}<Icon name={row.icon} size="sm" class="ed-detail-row-glyph" />{/if}<span>{row.value}</span>
					</dd>
				{/each}
			</dl>
		{/if}
		{#if children && shown}
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
	/* the caption's row: the label, then the glyphs, the fold at the end */
	.ed-detail-caption {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-height: calc(var(--icon-sm) + var(--space-1));
	}
	.ed-detail-caption :global(.ed-detail-fold) {
		margin-left: auto;
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
	/* a block of text, not a flex row: the glyph sits inline on the first line, so the value's baseline is the
	   text's and the caption beside it lines up */
	.ed-detail-dd {
		display: block;
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
		overflow-wrap: anywhere;
	}
	.ed-detail-mono {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variation-settings: var(--ed-t-data-sm-opsz);
		font-variant-numeric: tabular-nums;
	}
	/* the glyph sits on the value's first line, before the text, in the value's colour */
	.ed-detail-dd :global(.ed-detail-row-glyph) {
		vertical-align: -0.2em;
		margin-right: var(--space-1);
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
