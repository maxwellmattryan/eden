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
	// the body and shows what the Garden's edit mode acts through (D-155): the grip, which the arrow keys move, the ⋯
	// button with the tile's menu, and a corner that resizes a tile among the sizes it declares, dragged or stepped
	// with the arrow keys. The grip and the corner are the desktop pointer's; on a phone the menu is the way. The
	// dragging itself, the menu's items and what a move or a size does are the app's. Widgets compute locally from
	// their declared reads: nothing runs a model because the Garden opened. At 1×1 the title row has room for the glyph and the title
	// only, so the domain name is not drawn there and a long title wraps to a second line: the glyph names the domain
	// (ux-patterns, "Widgets").
	import { tick, type Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import type { IconName } from '../../icons/icons.js'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { platformOf } from '../../internal/platform.js'
	import { resizeCorner } from '../../internal/resize-corner.js'
	import Button from '../Button/Button.svelte'
	import IconButton from '../IconButton/IconButton.svelte'
	import Menu, { type MenuItem } from '../Menu/Menu.svelte'

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children' | 'title' | 'onresize'> & {
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
		/** The Garden's edit mode: the body dims and the controls below show. Dragging is the app's. */
		editing?: boolean
		/** While editing: the tile's actions (move, size, remove), behind a ⋯ button at the end of the title row. */
		menu?: MenuItem[]
		/** While editing: the sizes the tile declares. With more than one, on desktop, a corner resizes it among them. */
		sizes?: readonly WidgetSize[]
		/** While editing: the tile is the one being dragged, and dims. */
		dragging?: boolean
		/** While editing: a dragged tile would land before or after this one; a bar marks the edge. */
		drop?: 'before' | 'after'
		/** An arrow key on the grip: one place earlier (-1) or later (1). The grip shows only with it, on desktop. */
		onmove?: (delta: -1 | 1) => void
		/** The corner was dragged or stepped to another declared size. */
		onresize?: (size: WidgetSize) => void
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
		menu,
		sizes,
		dragging = false,
		drop,
		onmove,
		onresize,
		children,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const titleId = `${uid}-title`

	let root = $state<HTMLElement>()
	const desktop = $derived(root ? platformOf(root) === 'desktop' : false)
	const resizable = $derived(editing && desktop && !!onresize && (sizes?.length ?? 0) > 1)
	/** The size the corner is dragged to, while it is held: the tile takes it at once, so the grid shows the result. */
	let preview = $state<WidgetSize>()
	const shown = $derived(editing ? (preview ?? size) : size)

	let menuAnchor = $state<HTMLElement>()
	let menuOpen = $state(false)

	function onGripKey(e: KeyboardEvent) {
		const delta =
			e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0
		if (!delta) return
		e.preventDefault()
		// the tile is moved in the DOM, which drops the focus: the grip takes it back, so the next arrow moves it again
		const grip = e.currentTarget as HTMLElement
		onmove?.(delta)
		void tick().then(() => grip.focus())
	}
</script>

<section
	bind:this={root}
	class={[
		'ed-widget',
		`ed-widget-${shown}`,
		{ 'ed-widget-editing': editing, 'ed-widget-dragging': editing && dragging },
		className,
	]}
	aria-labelledby={titleId}
	data-drop={editing ? drop : undefined}
	{...rest}
>
	<header class="ed-widget-head">
		{#if editing && desktop && onmove}
			<IconButton
				class="ed-widget-grip"
				icon="grip-vertical"
				label={s.widget.move(title)}
				size="sm"
				onkeydown={onGripKey}
			/>
		{/if}
		{#if icon}<Icon name={icon} size="sm" class="ed-widget-glyph" />{/if}
		<h2 class="ed-widget-title" id={titleId}>{title}</h2>
		{#if domain}<span class="ed-widget-domain" data-tertiary>{domain}</span>{/if}
		{#if editing && menu?.length}
			<IconButton
				class="ed-widget-more"
				icon="ellipsis"
				label={s.widget.options(title)}
				size="sm"
				active={menuOpen}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				onclick={(event) => {
					menuAnchor = event.currentTarget
					menuOpen = !menuOpen
				}}
			/>
		{/if}
	</header>
	<div class="ed-widget-body">
		{#if children}{@render children()}{:else}<p class="ed-widget-empty">{empty ?? s.nothingYet}</p>{/if}
	</div>
	{#if action}
		<footer class="ed-widget-foot">
			<Button label={action.label} variant="quiet" onclick={action.onclick} />
		</footer>
	{/if}
	{#if resizable}
		<button
			class="ed-widget-corner"
			class:ed-widget-corner-both={sizes?.includes('l')}
			type="button"
			aria-label={s.widget.resize(title)}
			{@attach resizeCorner(() => ({
				sizes: () => sizes ?? [],
				size: () => size,
				tile: () => root,
				onpreview: (next) => (preview = next),
				onresize: (next) => onresize?.(next),
			}))}
		></button>
	{/if}
</section>
{#if editing && menu?.length}
	<Menu bind:open={menuOpen} anchor={menuAnchor} label={s.widget.options(title)} items={menu} />
{/if}

<style>
	.ed-widget {
		position: relative;
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
		transition:
			outline-color var(--ed-duration-micro) var(--ed-ease-out),
			opacity var(--ed-duration-micro) var(--ed-ease-out);
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
	/* the ⋯ button ends the row, after the domain name when there is one */
	.ed-widget-head :global(.ed-widget-more) {
		flex: none;
		margin-left: auto;
		margin-right: calc(-1 * var(--space-2));
	}
	.ed-widget-domain + :global(.ed-widget-more) {
		margin-left: 0;
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
	/* a 1×1 tile's title row also holds the grip and the ⋯ button, so the title keeps to one line and is cut short */
	.ed-widget-editing.ed-widget-s .ed-widget-head {
		align-items: center;
	}
	.ed-widget-editing.ed-widget-s .ed-widget-title {
		display: block;
		white-space: nowrap;
	}
	.ed-widget-editing.ed-widget-s .ed-widget-head :global(.ed-widget-glyph) {
		margin-top: 0;
	}
	/* the tile that is held */
	.ed-widget-dragging {
		opacity: 0.4;
	}
	/* where a dragged tile would land: a bar in the gutter, on the edge it would take */
	.ed-widget[data-drop]::before {
		content: '';
		position: absolute;
		inset-block: 0;
		width: var(--space-1);
		border-radius: var(--ed-radius-control);
		background: var(--brand-primary);
		pointer-events: none;
	}
	.ed-widget[data-drop='before']::before {
		inset-inline-start: calc(-1 * (var(--space-3) + var(--space-1) / 2));
	}
	.ed-widget[data-drop='after']::before {
		inset-inline-end: calc(-1 * (var(--space-3) + var(--space-1) / 2));
	}
	/* the resize corner: two strokes in the tile's bottom right, dragged or stepped with the arrow keys */
	.ed-widget-corner {
		position: absolute;
		inset-block-end: var(--space-1);
		inset-inline-end: var(--space-1);
		width: var(--space-6);
		height: var(--space-6);
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--ed-radius-control);
		background: transparent;
		color: var(--brand-primary);
		cursor: ew-resize;
		touch-action: none;
	}
	.ed-widget-corner-both {
		cursor: nwse-resize;
	}
	.ed-widget-corner::after {
		content: '';
		position: absolute;
		inset-block-end: var(--space-1);
		inset-inline-end: var(--space-1);
		width: var(--space-2);
		height: var(--space-2);
		border-inline-end: 2px solid currentColor;
		border-block-end: 2px solid currentColor;
		border-end-end-radius: var(--ed-radius-control);
	}
	.ed-widget-corner:hover {
		background: var(--surface-2);
	}
	.ed-widget-corner:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
</style>
