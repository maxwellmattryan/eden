<script lang="ts">
	// One sidebar entry: the glyph and the themed name; the plain subtitle beneath the name when the sidebar shows
	// subtitles, otherwise as the item's tooltip (D-2); the ⌘ position only when asked. An <a> when it has somewhere to
	// go, else a <button>, so the browser handles Enter, middle-click and history for a link and nothing prevents a
	// default. The current item sits on the nav ground the brand dial sets, its glyph and name in the dial's current
	// colours, with the leaf bar beside it in the nav's gutter at every brand level. Becoming current fades the ground in
	// and grows the bar from its middle; reduced motion keeps only the fade.
	import type { HTMLAttributes } from 'svelte/elements'
	import type { IconName } from '../../icons/icons.js'
	import Icon from '../../icons/Icon.svelte'
	import { tooltip } from '../Tooltip/tooltip.js'

	type Props = Omit<HTMLAttributes<HTMLElement>, 'id' | 'onclick' | 'children'> & {
		/** The entry's plain id (kitchen, gardener), rendered as data-id so a nav can find the item. */
		id: string
		/** The themed display name. */
		name: string
		/** The plain subtitle: beneath the name when shown, else the item's tooltip. */
		subtitle?: string
		/** The glyph: pass `domainGlyph(id)`. */
		icon: IconName
		/** Marks the item as the current page. */
		current?: boolean
		/** The ⌘ position, such as ⌘3. */
		shortcut?: string
		/** Shows the subtitle beneath the name; when false the subtitle is the tooltip. */
		showSubtitle?: boolean
		/** Shows the shortcut. */
		showShortcut?: boolean
		/** Renders a link to this URL instead of a button. */
		href?: string
		/** Called on activation, for a link and a button alike. */
		onclick?: () => void
	}
	let {
		id,
		name,
		subtitle,
		icon,
		current = false,
		shortcut,
		showSubtitle = false,
		showShortcut = false,
		href,
		onclick,
		class: className = '',
		...rest
	}: Props = $props()

	const classes = $derived(['ed-side-item', { 'ed-side-item-with-sub': showSubtitle && !!subtitle }, className])
	// the getter form: read when the bubble opens, so it is empty while the subtitle is on show
	const tip = () => (showSubtitle ? '' : (subtitle ?? ''))
</script>

{#snippet inner()}
	<Icon name={icon} size="md" class="ed-side-glyph" />
	<span class="ed-side-text">
		<span class="ed-side-name">{name}</span>
		{#if showSubtitle && subtitle}<span class="ed-side-sub" data-tertiary>{subtitle}</span>{/if}
	</span>
	{#if showShortcut && shortcut}<kbd class="ed-side-key" data-tertiary>{shortcut}</kbd>{/if}
{/snippet}

{#if href}
	<!-- the kit is not a SvelteKit app and never imports $app/paths: the app passes a resolved href -->
	<a
		class={classes}
		{href}
		data-id={id}
		aria-current={current ? 'page' : undefined}
		onclick={() => onclick?.()}
		{@attach tooltip(tip)}
		{...rest}
	>
		{@render inner()}
	</a>
{:else}
	<button
		class={classes}
		type="button"
		data-id={id}
		aria-current={current ? 'page' : undefined}
		onclick={() => onclick?.()}
		{@attach tooltip(tip)}
		{...rest}
	>
		{@render inner()}
	</button>
{/if}

<style>
	.ed-side-item {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		box-sizing: border-box;
		width: 100%;
		min-height: var(--ed-row);
		margin: 0;
		padding: 0 var(--space-2);
		border: 0;
		border-radius: var(--ed-radius-control);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		text-align: start;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--ed-duration-micro) var(--ed-ease-out),
			color var(--ed-duration-micro) var(--ed-ease-out);
	}
	/* two lines need a little air above and below inside the row */
	.ed-side-item-with-sub {
		padding-block: var(--space-1);
	}
	.ed-side-item:hover {
		background: var(--surface-2);
		color: var(--text-primary);
	}
	/* the fade in is a step slower than hover, so moving between pages reads as a settle rather than a flicker */
	.ed-side-item[aria-current='page'] {
		background: var(--ed-nav-current-bg);
		color: var(--ed-nav-current-fg);
		transition-duration: var(--ed-duration-panel);
	}
	/* the leaf bar: a short accent bar in the nav's gutter beside the current item, at every brand level. Always drawn and
	   hidden, so it can fade in and settle to full height as the item becomes current; settle is 0 under reduced motion */
	.ed-side-item::before {
		content: '';
		position: absolute;
		inset-inline-start: calc(-1 * var(--space-2));
		top: 25%;
		width: var(--ed-nav-bar);
		height: 50%;
		border-radius: var(--radius-full);
		background: var(--brand-primary);
		opacity: 0;
		transform: scaleY(0.4);
		transition:
			opacity var(--ed-duration-micro) var(--ed-ease-out),
			transform var(--ed-duration-settle) var(--ed-ease-out);
	}
	.ed-side-item[aria-current='page']::before {
		opacity: 1;
		transform: none;
	}
	.ed-side-item:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.ed-side-item :global(.ed-side-glyph) {
		transition: color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-side-item[aria-current='page'] :global(.ed-side-glyph) {
		color: var(--ed-nav-current-glyph);
	}
	.ed-side-text {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.ed-side-name {
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ed-side-sub {
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ed-side-key {
		flex: none;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-tertiary);
	}
</style>
