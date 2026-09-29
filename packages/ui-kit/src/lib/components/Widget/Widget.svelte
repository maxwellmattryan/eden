<script module lang="ts">
	/** s is one cell, m two across, l two by two on the WidgetGrid. */
	export type WidgetSize = 's' | 'm' | 'l'
	/** The quiet footer action. */
	export interface WidgetAction {
		label: string
		onclick?: () => void
	}
</script>

<script lang="ts">
	// A Garden tile a domain contributes: a title row with the domain glyph, a body, an optional quiet footer action.
	// Sizes s (1×1), m (2×1) and l (2×2) are grid spans, which only bite inside WidgetGrid; on its own a tile fills its
	// container and keeps a minimum height. An empty widget shows a one-line prompt rather than hiding. `editing` dims
	// the body and shows the drag handle; the dragging itself is the app's. Widgets compute locally from their declared
	// reads: nothing runs a model because the Garden opened. At 1×1 the title row has room for the glyph and the title
	// only, so the domain name is not drawn there and a long title wraps to a second line: the glyph names the domain
	// (ux-patterns, "Widgets").
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import type { IconName } from '../../icons/icons.js'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import Button from '../Button/Button.svelte'
	import IconButton from '../IconButton/IconButton.svelte'

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> & {
		/** The tile's name, in the title style; it names the section for assistive technology. */
		title: string
		/** The domain glyph: pass `domainGlyph(id)`. */
		icon?: IconName
		/** The themed domain name, quiet at the right of the title row; not drawn at size s, where the glyph stands for it. */
		domain?: string
		/** s is 1×1, m 2×1, l 2×2 on the grid. */
		size?: WidgetSize
		/** The one-line prompt when there are no children. Defaults to "Nothing yet." */
		empty?: string
		/** A quiet button in the footer. */
		action?: WidgetAction
		/** The Garden's edit mode: the body dims and the drag handle shows. Dragging is the app's. */
		editing?: boolean
		/** The body: a Stat, a Sparkline, a short list. */
		children?: Snippet
	}
	const uid = $props.id()
	let {
		title,
		icon,
		domain,
		size = 's',
		empty,
		action,
		editing = false,
		children,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const titleId = `${uid}-title`
</script>

<section
	class={['ed-widget', `ed-widget-${size}`, { 'ed-widget-editing': editing }, className]}
	aria-labelledby={titleId}
	{...rest}
>
	<header class="ed-widget-head">
		{#if editing}
			<IconButton class="ed-widget-grip" icon="grip-vertical" label={s.widget.move(title)} size="sm" />
		{/if}
		{#if icon}<Icon name={icon} size="sm" class="ed-widget-glyph" />{/if}
		<h2 class="ed-widget-title" id={titleId}>{title}</h2>
		{#if domain}<span class="ed-widget-domain" data-tertiary>{domain}</span>{/if}
	</header>
	<div class="ed-widget-body">
		{#if children}{@render children()}{:else}<p class="ed-widget-empty">{empty ?? s.nothingYet}</p>{/if}
	</div>
	{#if action}
		<footer class="ed-widget-foot">
			<Button label={action.label} variant="quiet" onclick={action.onclick} />
		</footer>
	{/if}
</section>

<style>
	.ed-widget {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		box-sizing: border-box;
		min-width: 0;
		min-height: calc(var(--space-8) * 5);
		padding: var(--space-4);
		background: var(--surface-1);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		box-shadow: var(--shadow-card);
		color: var(--text-primary);
		transition: outline-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	/* the spans only bite inside WidgetGrid; l also reserves two rows and the gutter between them when it stands alone */
	.ed-widget-m {
		grid-column: span 2;
	}
	.ed-widget-l {
		grid-column: span 2;
		grid-row: span 2;
		min-height: calc(var(--space-8) * 10 + var(--space-6));
	}

	.ed-widget-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.ed-widget-head :global(.ed-widget-grip) {
		margin-left: calc(-1 * var(--space-2));
		cursor: grab;
	}
	.ed-widget-head :global(.ed-widget-glyph) {
		color: var(--text-secondary);
	}
	.ed-widget-title {
		margin: 0;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
		color: var(--text-primary);
	}
	.ed-widget-domain {
		margin-left: auto;
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-tertiary);
		white-space: nowrap;
	}
	/* a 1×1 cell has room for the glyph and the title only, and a long title takes a second line rather than an ellipsis */
	.ed-widget-s .ed-widget-domain {
		display: none;
	}
	.ed-widget-s .ed-widget-head {
		align-items: flex-start;
	}
	.ed-widget-s .ed-widget-title {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.ed-widget-s .ed-widget-head :global(.ed-widget-glyph) {
		margin-top: var(--space-1);
	}

	.ed-widget-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		transition: opacity var(--ed-duration-panel) var(--ed-ease-out);
	}
	.ed-widget-empty {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-secondary);
	}
	.ed-widget-foot {
		display: flex;
		transition: opacity var(--ed-duration-panel) var(--ed-ease-out);
	}
	/* the quiet button's label lines up with the body text */
	.ed-widget-foot :global(.ed-btn) {
		margin-left: calc(-1 * var(--ed-btn-pad));
	}

	/* edit mode: a dashed brand outline, the body and the footer at half strength and out of reach */
	.ed-widget-editing {
		outline: 1px dashed var(--brand-primary);
		outline-offset: 2px;
	}
	.ed-widget-editing .ed-widget-body,
	.ed-widget-editing .ed-widget-foot {
		opacity: 0.5;
		pointer-events: none;
	}
</style>
