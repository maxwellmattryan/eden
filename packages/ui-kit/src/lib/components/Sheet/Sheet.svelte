<script lang="ts">
	// The modal base every sheet composes: a <dialog> opened with showModal(), so the browser makes the rest of the
	// page inert, keeps focus inside, returns it on close and paints the scrim as ::backdrop. Escape arrives as the
	// dialog's `cancel` event; a click on the scrim lands on the dialog element itself. The browser does not cycle Tab
	// inside a modal dialog (focus can leave to its own chrome), so the panel also carries the focus trap. Focus return
	// stays native, but an opener that was clicked rather than tabbed to is blurred after it, so closing (Escape
	// included) never lights a ring on it. `placement: 'auto'` is a bottom sheet on mobile and a centred sheet on
	// desktop. Enter unfurls (scale .98 and fade, a short rise for a bottom sheet) and the scrim fades in; closing plays
	// the same backwards before the dialog really closes, so `onclose` and the focus return follow the fade. Under
	// reduced motion the panel duration is zero and the sheet simply appears and goes.
	import type { Snippet } from 'svelte'
	import type { HTMLDialogAttributes } from 'svelte/elements'
	import { onDestroy } from 'svelte'
	import { isLeaving, leave } from '../../internal/leave.js'
	import { rememberOpener } from '../../internal/opener.js'
	import { platformOf } from '../../internal/platform.js'
	import { trapFocus } from '../../internal/trap-focus.js'

	export type SheetCloseReason = 'escape' | 'scrim' | 'api'
	export type SheetPlacement = 'auto' | 'bottom' | 'center' | 'side'

	type Props = Omit<HTMLDialogAttributes, 'open' | 'oncancel' | 'onclose' | 'onkeydown'> & {
		/** Bindable. Set it to open and close; every close path sets it back to false. */
		open?: boolean
		/** auto follows data-platform: bottom on mobile, center on desktop. side is the desktop detail-pane style. */
		placement?: SheetPlacement
		/** sm 360, md 440, lg up to 900, full the whole viewport. Bottom sheets are always full width. */
		size?: 'sm' | 'md' | 'lg' | 'full'
		/** The accessible name, when no visible title is labelled through `labelledby`. */
		label?: string
		labelledby?: string
		/** Where focus lands on open: `auto` (the first text control when there is one, else the panel itself, so a
		 * confirm shows no ring and no pressed button until Tab is pressed), `first` (any focusable; an `autofocus`
		 * element wins) or `container`. */
		initialFocus?: 'auto' | 'first' | 'container'
		/** When false, Escape and the scrim do nothing; the sheet closes only through `open`. */
		dismissible?: boolean
		/** Called after the sheet has closed, with why. */
		onclose?: (reason: SheetCloseReason) => void
		header?: Snippet
		footer?: Snippet
		children: Snippet
	}
	let {
		open = $bindable(false),
		placement = 'auto',
		size = 'md',
		label,
		labelledby,
		initialFocus = 'auto',
		dismissible = true,
		onclose,
		header,
		footer,
		children,
		class: className = '',
		...rest
	}: Props = $props()

	let dialog = $state<HTMLDialogElement>()
	let panel = $state<HTMLDivElement>()
	let unleave: (() => void) | undefined
	let reason: SheetCloseReason = 'api'
	let settle: (() => void) | undefined
	const resolved = $derived<Exclude<SheetPlacement, 'auto'>>(
		placement === 'auto' ? (dialog && platformOf(dialog) === 'mobile' ? 'bottom' : 'center') : placement
	)

	$effect(() => {
		// effect: imperative DOM. showModal() and close() follow `open`; close() waits for the sheet to fade, and a sheet
		// opened again on its way out eases back.
		const el = dialog
		const body = panel
		if (!el || !body) return
		if (open) {
			unleave?.()
			if (!el.open) {
				settle = rememberOpener()
				el.showModal()
			}
		} else if (el.open && !isLeaving(el)) {
			// the panel is the part that moves: its transition is the one to wait for
			unleave = leave(
				el,
				() => {
					el.close()
					settleFocus()
				},
				body
			)
		}
	})

	onDestroy(() => unleave?.())

	function settleFocus() {
		settle?.()
		settle = undefined
	}

	// Escape is handled here, on the focused descendant's keydown, and `cancel` stays as the fallback for close requests
	// that arrive another way (a back gesture through the close watcher).
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || e.defaultPrevented) return
		e.preventDefault()
		requestClose('escape')
	}
	function oncancel(e: Event) {
		e.preventDefault()
		requestClose('escape')
	}
	function requestClose(why: SheetCloseReason) {
		if (!dismissible) return
		reason = why
		open = false
	}
	function onclosed() {
		settleFocus()
		if (open) open = false
		onclose?.(reason)
		reason = 'api'
	}
	function onscrim(e: MouseEvent) {
		if (e.target === dialog) requestClose('scrim')
	}
</script>

<dialog
	bind:this={dialog}
	class="ed-sheet ed-sheet-{resolved} ed-sheet-{size} {className}"
	aria-label={label}
	aria-labelledby={labelledby}
	{oncancel}
	{onkeydown}
	onclose={onclosed}
	onclick={onscrim}
	{...rest}
>
	<div
		bind:this={panel}
		class="ed-sheet-panel"
		role="document"
		{@attach trapFocus(() => ({ active: open, initial: initialFocus, returnFocus: false }))}
	>
		{#if resolved === 'bottom'}<span class="ed-sheet-handle" aria-hidden="true"></span>{/if}
		{#if header}<header class="ed-sheet-header">{@render header()}</header>{/if}
		<div class="ed-sheet-body">{@render children()}</div>
		{#if footer}<footer class="ed-sheet-footer">{@render footer()}</footer>{/if}
	</div>
</dialog>

<style>
	.ed-sheet {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		display: none;
		box-sizing: border-box;
	}
	.ed-sheet[open] {
		display: grid;
	}
	.ed-sheet::backdrop {
		background: var(--ed-scrim, rgba(31, 42, 34, 0.32));
		transition: opacity var(--ed-duration-panel) var(--ed-ease-out);
	}
	.ed-sheet-panel {
		/* the grain layer (styles/base.css) is placed against the panel and blends with it alone */
		position: relative;
		isolation: isolate;
		background: var(--surface-1);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-sheet);
		box-shadow: var(--shadow-sheet);
		padding: var(--ed-sheet-pad);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
		max-height: 100%;
		overflow: auto;
		box-sizing: border-box;
		transition:
			transform var(--ed-duration-panel) var(--ed-ease-out),
			opacity var(--ed-duration-panel) var(--ed-ease-out);
	}
	/* The panel takes focus only from the trap (tabindex -1), never from Tab, so it draws no ring of its own. */
	.ed-sheet-panel:focus {
		outline: none;
	}
	.ed-sheet-header,
	.ed-sheet-footer {
		flex: none;
	}
	.ed-sheet-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
	/* The body scrolls under the pinned footer. A scroll container clips anything outside its box, so it takes inner
	   padding equal to the focus ring's reach and the same negative margin: layout is unchanged and rings have room. */
	.ed-sheet-body {
		--ring-room: calc(var(--focus-ring-offset) + var(--focus-ring-width));
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
		padding: var(--ring-room);
		margin: calc(-1 * var(--ring-room));
	}
	/* A full-height sheet gives its body the height the header and the footer leave, so the footer sits at the foot. */
	.ed-sheet-full .ed-sheet-body {
		flex: 1;
	}

	/* centred: the desktop default */
	.ed-sheet-center {
		place-items: center;
		padding: var(--ed-gutter);
	}
	.ed-sheet-center .ed-sheet-panel {
		width: 100%;
	}
	.ed-sheet-center.ed-sheet-sm .ed-sheet-panel {
		max-width: var(--sheet-sm);
	}
	.ed-sheet-center.ed-sheet-md .ed-sheet-panel {
		max-width: var(--sheet-md);
	}
	.ed-sheet-center.ed-sheet-lg .ed-sheet-panel {
		max-width: var(--sheet-max);
	}
	.ed-sheet-center.ed-sheet-full {
		padding: 0;
	}
	.ed-sheet-center.ed-sheet-full .ed-sheet-panel {
		height: 100%;
		border-radius: 0;
		border: 0;
	}

	/* bottom: mobile */
	.ed-sheet-bottom {
		align-items: end;
		justify-items: stretch;
	}
	.ed-sheet-bottom .ed-sheet-panel {
		width: 100%;
		max-height: 92dvh;
		border-radius: var(--ed-radius-sheet) var(--ed-radius-sheet) 0 0;
		border-bottom: 0;
		padding-bottom: calc(var(--ed-sheet-pad) + var(--ed-safe-bottom));
	}
	.ed-sheet-bottom.ed-sheet-full .ed-sheet-panel {
		max-height: 100%;
		height: 100%;
		border-radius: 0;
		padding-top: calc(var(--ed-sheet-pad) + var(--ed-safe-top));
	}
	.ed-sheet-handle {
		display: block;
		width: 36px;
		height: 4px;
		border-radius: var(--radius-full);
		background: var(--stroke-hover);
		margin: 0 auto;
		flex: none;
	}

	/* side: the desktop detail-pane style */
	.ed-sheet-side {
		justify-items: end;
		align-items: stretch;
	}
	.ed-sheet-side .ed-sheet-panel {
		height: 100%;
		width: min(var(--sheet-md), 100%);
		border-radius: var(--ed-radius-sheet) 0 0 var(--ed-radius-sheet);
		border-right: 0;
	}
	.ed-sheet-side.ed-sheet-lg .ed-sheet-panel {
		width: min(var(--sheet-max), 100%);
	}

	/* the unfurl: scale .98 and fade for centred and side sheets, a short rise for bottom sheets, the scrim fading in
	   behind. The way out is the same states under data-closing, which leave() holds until the transition is over. */
	@starting-style {
		.ed-sheet[open] .ed-sheet-panel {
			opacity: 0;
			transform: scale(0.98);
		}
		.ed-sheet-bottom[open] .ed-sheet-panel {
			transform: translateY(var(--space-4));
		}
		.ed-sheet[open]::backdrop {
			opacity: 0;
		}
	}
	.ed-sheet:global([data-closing]) .ed-sheet-panel {
		opacity: 0;
		transform: scale(0.98);
	}
	.ed-sheet-bottom:global([data-closing]) .ed-sheet-panel {
		transform: translateY(var(--space-4));
	}
	.ed-sheet:global([data-closing])::backdrop {
		opacity: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.ed-sheet-panel {
			transition-property: opacity;
		}
		.ed-sheet:global([data-closing]) .ed-sheet-panel,
		.ed-sheet-bottom:global([data-closing]) .ed-sheet-panel {
			transform: none;
		}
		@starting-style {
			.ed-sheet[open] .ed-sheet-panel,
			.ed-sheet-bottom[open] .ed-sheet-panel {
				transform: none;
			}
		}
	}
</style>
