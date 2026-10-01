<script module lang="ts">
	/** neutral sits on surface-2; ai and honey are the Gardener's two colours (D-40): green when it speaks, honey when it acts. */
	export type DetailTone = 'neutral' | 'ai' | 'honey'
	/** The panel's width: sm 320, md 400, lg 520, never wider than the viewport allows. */
	export type DetailWidth = 'sm' | 'md' | 'lg'
</script>

<script lang="ts">
	// A Popover with Eden's chrome for a detail, so an app never fills a bare panel: a head band on the tone's muted
	// ground with the glyph in the tone's ink, the title and a caption beneath; a body of DetailSections parted by
	// hairlines; a footer of actions under a hairline when one is given. The radius, the border, the shadow and the
	// unfurl are the Popover's own, and the band adds no colour of its own: neutral is surface-2 with the secondary ink,
	// ai and honey the Gardener's grounds and inks. The head follows the Widget's: glyph, title in the small title style,
	// the caption in the secondary ink.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import type { IconName } from '../../icons/icons.js'
	import Icon from '../../icons/Icon.svelte'
	import Popover, { type PopoverAnchor, type PopoverCloseReason } from '../Popover/Popover.svelte'

	type Props = Omit<
		HTMLAttributes<HTMLDivElement>,
		'role' | 'popover' | 'hidden' | 'children' | 'onclose' | 'title'
	> & {
		/** What the panel hangs from: an element, or a rect-like object at the pointer. */
		anchor?: PopoverAnchor | null
		/** Bindable. Set it to open and close; every close path sets it back to false. */
		open?: boolean
		/** The head band's colour: neutral, or the Gardener's ai and honey. */
		tone?: DetailTone
		/** The glyph in the head, in the tone's ink. */
		icon?: IconName
		/** The name of the detail, in the small title style. */
		title: string
		/** One caption under the title: a source, a time, a summary. */
		subtitle?: string
		/** The preferred side; the panel flips when there is no room. */
		side?: 'top' | 'bottom'
		/** Which edge of the anchor the panel lines up with. */
		align?: 'start' | 'end'
		/** sm 320, md 400, lg 520 px, capped by the viewport. */
		width?: DetailWidth
		/** The dialog's accessible name; the title by default. */
		label?: string
		/** Called after the panel has closed, with why. */
		onclose?: (reason: PopoverCloseReason) => void
		/** The body: DetailSections. */
		children: Snippet
		/** The actions, in a row aligned to the end under a hairline. */
		footer?: Snippet
	}
	let {
		anchor,
		open = $bindable(false),
		tone = 'neutral',
		icon,
		title,
		subtitle,
		side = 'bottom',
		align = 'start',
		width = 'md',
		label,
		onclose,
		children,
		footer,
		class: className = '',
		...rest
	}: Props = $props()
</script>

<Popover bind:open {anchor} {side} {align} label={label ?? title} {onclose} class={className} {...rest}>
	<div class={['ed-detail', `ed-detail-${tone}`, `ed-detail-${width}`]}>
		<header class="ed-detail-head">
			{#if icon}<span class="ed-detail-glyph"><Icon name={icon} size="sm" /></span>{/if}
			<div class="ed-detail-heading">
				<p class="ed-detail-title">{title}</p>
				{#if subtitle}<p class="ed-detail-subtitle">{subtitle}</p>{/if}
			</div>
		</header>
		<div class="ed-detail-body">{@render children()}</div>
		{#if footer}
			<footer class="ed-detail-foot">{@render footer()}</footer>
		{/if}
	</div>
</Popover>

<style>
	.ed-detail {
		display: flex;
		flex-direction: column;
		width: var(--ed-detail-width);
		max-width: 100%;
		box-sizing: border-box;
		color: var(--text-primary);
	}
	/* 320, 400 and 520 on the 4 px base; the Popover caps the panel at the viewport less a gutter */
	.ed-detail-sm {
		--ed-detail-width: calc(var(--space-8) * 10);
	}
	.ed-detail-md {
		--ed-detail-width: calc(var(--space-8) * 12.5);
	}
	.ed-detail-lg {
		--ed-detail-width: calc(var(--space-8) * 16.25);
	}

	/* The tones: a muted ground and an ink, nothing else */
	.ed-detail-neutral {
		--ed-detail-ground: var(--surface-2);
		--ed-detail-ink: var(--text-secondary);
	}
	.ed-detail-ai {
		--ed-detail-ground: var(--ai-muted);
		--ed-detail-ink: var(--ai);
	}
	.ed-detail-honey {
		--ed-detail-ground: var(--honey-muted);
		--ed-detail-ink: var(--honey);
	}

	.ed-detail-head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--ed-detail-ground);
	}
	/* the glyph is centred on the title's first line, whatever face the brand dial sets */
	.ed-detail-glyph {
		display: inline-flex;
		align-items: center;
		flex: none;
		height: 1lh;
		font: var(--ed-t-title-sm);
		color: var(--ed-detail-ink);
	}
	.ed-detail-heading {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.ed-detail-title {
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.ed-detail-subtitle {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		color: var(--text-secondary);
		overflow-wrap: anywhere;
	}

	/* the sections stack with a hairline between them; each carries its own padding */
	.ed-detail-body {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.ed-detail-body > :global(* + *) {
		border-top: 1px solid var(--stroke-subtle);
	}

	.ed-detail-foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--stroke-subtle);
	}
</style>
