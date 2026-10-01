<script module lang="ts">
	// @starting-style arrived after the popover API in every engine. Where it is missing, a data attribute set after a
	// forced style flush starts the unfurl instead; the CSS keys the native path on data-unfurl so both never fight.
	// The way out is the same in both: `leave` marks the panel data-closing and hides it once it has faded.
	const nativeUnfurl = typeof globalThis !== 'undefined' && 'CSSStartingStyleRule' in globalThis
</script>

<script lang="ts">
	// An anchored floating panel in the browser's top layer: menus, the inbox behind the bell, the Quick Log sheet
	// behind +, an integration's status. The root is a `popover="manual"` div, so it paints above everything without a
	// portal; `anchor` places it below the anchor (above when there is no room, or when side="top" fits) and sets
	// data-side, so the unfurl starts from the anchor's edge. `dismiss` handles Escape and a pointer down outside; as a
	// dialog the panel also traps Tab and focuses its first control. Every close path hands focus back to the anchor
	// when it was inside the panel, and the panel leaves as it came: it folds back towards the anchor and fades before
	// it is hidden. Below the popover API the panel is portalled to <body> and toggled with `hidden`.
	import type { Snippet } from 'svelte'
	import type { AriaRole, HTMLAttributes } from 'svelte/elements'
	import { onDestroy, untrack } from 'svelte'
	import { anchor as anchored, type AnchorLike } from '../../internal/anchor.js'
	import { dismiss } from '../../internal/dismiss.js'
	import { FOCUSABLE, focusables } from '../../internal/focusable.js'
	import { leave } from '../../internal/leave.js'
	import { hasTopLayer, portal } from '../../internal/portal.js'
	import { smoothSize } from '../../internal/smooth-size.js'
	import { trapFocus } from '../../internal/trap-focus.js'

	export type PopoverCloseReason = 'escape' | 'outside' | 'api'
	/** An element, or anything with `getBoundingClientRect` (a pointer position for a context menu). */
	export type PopoverAnchor = AnchorLike

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'popover' | 'hidden' | 'children' | 'onclose'> & {
		/** What the panel hangs from: an element, or a rect-like object for a context menu at the pointer. */
		anchor?: AnchorLike | null
		/** Bindable. Set it to open and close; every close path sets it back to false. */
		open?: boolean
		/** Which edge of the anchor the panel lines up with. */
		align?: 'start' | 'end'
		/** The preferred side; the panel flips when there is no room. */
		side?: 'top' | 'bottom'
		/** Space between the anchor and the panel, in px. */
		gap?: number
		/** dialog (the default) traps Tab inside and focuses the first control; menu and the rest leave focus to their content. */
		role?: AriaRole
		/** The accessible name. */
		label?: string
		/** Called after the panel has closed (it fades first), with why. */
		onclose?: (reason: PopoverCloseReason) => void
		children: Snippet
	}
	let {
		anchor,
		open = $bindable(false),
		align = 'start',
		side = 'bottom',
		gap = 6,
		role = 'dialog',
		label,
		onclose,
		children,
		class: className = '',
		...rest
	}: Props = $props()

	// With the popover API the panel lives in the top layer; without it, it is portalled to <body> and toggled with hidden.
	const topLayer = hasTopLayer()

	let el = $state<HTMLDivElement>()
	let reason: PopoverCloseReason = 'api'
	// What the DOM currently shows. The effect owns it, so an unrelated re-run never shows or hides twice.
	let showing = false
	// Closed but still fading: the panel keeps its anchor and its place until it is hidden.
	let leaving = $state(false)
	let unleave: (() => void) | undefined

	function requestClose(why: PopoverCloseReason) {
		reason = why
		open = false
	}

	/** Hands focus back to the anchor, or to the control inside it, when focus sits in the panel. */
	function returnFocus(node: HTMLElement) {
		if (!(anchor instanceof HTMLElement) || !node.contains(document.activeElement)) return
		const target = anchor.matches(FOCUSABLE) ? anchor : (focusables(anchor)[0] ?? anchor)
		target.focus({ preventScroll: true })
	}

	$effect(() => {
		// effect: imperative DOM. showPopover() and hidePopover() (or, below the API, the hidden toggle in the markup)
		// follow `open`; focus goes back to the anchor before the panel leaves, and once it has faded it is hidden and
		// `onclose` reports why. Opened again on its way out, it eases back from where it had got to and reports nothing.
		const node = el
		if (!node || open === showing) return
		showing = open
		if (open) {
			unleave?.()
			leaving = false
			if (topLayer && !node.matches(':popover-open')) node.showPopover()
			if (!nativeUnfurl) {
				// a style flush with the panel rendered but not yet shown, so the transition has a state to start from
				node.getBoundingClientRect()
				node.dataset.shown = ''
			}
		} else {
			untrack(() => returnFocus(node))
			delete node.dataset.shown
			leaving = true
			const why = reason
			reason = 'api'
			unleave = leave(node, () => {
				leaving = false
				if (topLayer && node.matches(':popover-open')) node.hidePopover()
				untrack(() => onclose?.(why))
			})
		}
	})

	onDestroy(() => unleave?.())
</script>

<div
	bind:this={el}
	class={['ed-popover', className]}
	popover={topLayer ? 'manual' : undefined}
	hidden={topLayer ? undefined : !open && !leaving}
	{role}
	aria-label={label}
	data-align={align}
	data-unfurl={nativeUnfurl ? 'native' : undefined}
	{@attach anchored(() => ({ anchor: open || leaving ? anchor : null, side, align, gap }))}
	{@attach dismiss(() => ({
		when: open,
		onDismiss: (why) => requestClose(why === 'focusout' ? 'outside' : why),
		ignore: () => [anchor],
	}))}
	{@attach trapFocus(() => ({ active: open && role === 'dialog', initial: 'auto' }))}
	{@attach !topLayer && portal()}
	{...rest}
>
	<!-- the body scrolls inside the frame, so the grain the frame carries (base.css) covers whatever is showing; when
	     the body changes size the frame eases to it -->
	<div class="ed-popover-body" {@attach smoothSize(() => ({ active: open }))}>{@render children()}</div>
</div>

<style>
	.ed-popover {
		/* the UA centres a popover with inset: 0 and margin: auto; anchor() places this one by top and left */
		position: fixed;
		inset: auto;
		margin: 0;
		padding: 0;
		box-sizing: border-box;
		max-width: calc(100dvw - 2 * var(--space-2));
		/* no taller than the viewport, nor than the room on the side of the anchor it opened on (anchor sets it) */
		max-height: min(calc(100dvh - 2 * var(--space-2)), var(--ed-anchor-room, 100dvh));
		/* never a display of its own: the UA hides a closed popover with display: none, and a rule here would override
		   it and leave the closed panel, invisible, over the page */
		overflow: hidden;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		color: var(--text-primary);
		box-shadow: var(--shadow-sheet);
		opacity: 0;
		transform: scale(0.98);
		/* the same transition both ways: leave() keeps the panel shown, in the top layer, until it has faded */
		transition:
			opacity var(--ed-duration-panel) var(--ed-ease-out),
			transform var(--ed-duration-panel) var(--ed-ease-out);
	}
	/* the body scrolls inside the frame, under the frame's own max height less its border. It carries the frame's
	   radius itself: WebKit gives a scroller its own layer, which the frame's rounded clip does not reach, so the
	   corners went square once the body had something to scroll. And it never rubber-bands: an elastic overscroll
	   pulls the head band away from the frame's edge and shows the ground behind it. */
	.ed-popover-body {
		border-radius: inherit;
		overscroll-behavior: none;
		min-width: 0;
		max-height: calc(min(100dvh - 2 * var(--space-2), var(--ed-anchor-room, 100dvh)) - 2px);
		overflow: auto;
	}
	/* the frame takes focus only from the trap (tabindex -1), never from Tab, so it draws no ring of its own */
	.ed-popover:focus-visible {
		outline: none;
	}
	/* below the popover API there is no top layer, so the portalled panel needs a stacking order of its own */
	.ed-popover:not([popover]) {
		z-index: var(--ed-z-popover);
	}

	/* the unfurl starts from the anchor's edge */
	.ed-popover[data-side='bottom'] {
		transform-origin: top left;
	}
	.ed-popover[data-side='bottom'][data-align='end'] {
		transform-origin: top right;
	}
	.ed-popover[data-side='top'] {
		transform-origin: bottom left;
	}
	.ed-popover[data-side='top'][data-align='end'] {
		transform-origin: bottom right;
	}

	/* shown: in the top layer through :popover-open, whose start state @starting-style supplies; elsewhere through
	   data-shown, set after a style flush. Two rules, so an engine without :popover-open keeps the second. */
	.ed-popover[data-unfurl='native']:popover-open {
		opacity: 1;
		transform: none;
	}
	.ed-popover[data-shown] {
		opacity: 1;
		transform: none;
	}
	@starting-style {
		.ed-popover[data-unfurl='native']:popover-open {
			opacity: 0;
			transform: scale(0.98);
		}
	}
	/* on its way out (data-closing, set by leave()) the panel returns to the state it started from; the fallback
	   loses data-shown instead */
	.ed-popover[data-unfurl='native']:popover-open:global([data-closing]) {
		opacity: 0;
		transform: scale(0.98);
	}

	/* reduced motion fades only; the panel duration is already 0 there, and the scale is neutralised */
	@media (prefers-reduced-motion: reduce) {
		.ed-popover,
		.ed-popover[data-unfurl='native']:popover-open:global([data-closing]) {
			transform: none;
		}
		@starting-style {
			.ed-popover[data-unfurl='native']:popover-open {
				transform: none;
			}
		}
	}
</style>
