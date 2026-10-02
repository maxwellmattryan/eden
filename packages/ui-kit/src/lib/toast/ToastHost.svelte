<script lang="ts">
	// Mount once near the root. Renders the store's current toast at the bottom centre, above the mobile tab bar and the
	// safe-area inset, rising in by 8 px as it fades (under reduced motion --ed-duration-panel is 0, so it simply
	// appears) and sinking back the same way when it goes; a toast that replaces another rises through the one that is
	// leaving, in the same place. The strip ignores the pointer; only the toast takes it. While the pointer or keyboard focus is on the
	// toast the store's clock pauses, and it runs again once both have left. Each toast is a fresh element keyed on its
	// id, so a replacement announces again, and a dismiss from an older toast cannot remove the one that replaced it.
	// A modal Sheet is a <dialog> in the top layer, and everything outside it is inert: a toast left in the page would
	// sit behind the scrim, unpressable. So while a modal dialog is open the strip is moved inside the top-most one
	// (`aboveModals`, D-169), where it is seen over the sheet and its action can be pressed, and it
	// goes back to its anchor when none is open. One host serves the page and every sheet; it looks the same in both.
	import type { HTMLAttributes } from 'svelte/elements'
	import type { TransitionConfig } from 'svelte/transition'
	import { quintOut } from 'svelte/easing'
	import { aboveModals } from '../internal/above-modals.js'
	import Toast from './Toast.svelte'
	import { toastStore, type ToastStore } from './toast.svelte.js'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** The store to render: the shared `toastStore` unless a story or a test brings its own. */
		store?: ToastStore
	}
	let { store = toastStore, class: className = '', ...rest }: Props = $props()

	const within = (el: EventTarget | null, node: EventTarget | null) =>
		el instanceof Node && node instanceof Node && el.contains(node)

	function pause() {
		store.pause()
	}
	function onpointerleave(e: PointerEvent) {
		if (within(e.currentTarget, document.activeElement)) return
		store.resume()
	}
	function onfocusout(e: FocusEvent) {
		const el = e.currentTarget
		if (within(el, e.relatedTarget) || (el instanceof Element && el.matches(':hover'))) return
		store.resume()
	}
	/** The way out is the rise backwards: down by --space-2 while it fades, over the panel duration (zero under reduced motion). */
	function sink(node: HTMLElement): TransitionConfig {
		const style = getComputedStyle(node)
		const drop = parseFloat(style.getPropertyValue('--space-2')) || 0
		return {
			duration: parseFloat(style.getPropertyValue('--ed-duration-panel')) || 0,
			easing: quintOut,
			css: (t, u) => `opacity: ${t}; transform: translateY(${(u * drop).toFixed(2)}px)`,
		}
	}
	function dismiss(id: number) {
		if (store.current?.id === id) store.dismiss()
	}
</script>

<!-- the anchor stays where the host is mounted; the strip inside it is what moves into an open modal dialog -->
<div class="ed-toast-anchor">
	<div class={['ed-toast-host', className]} {@attach aboveModals()} {...rest}>
		{#key store.current?.id}
			{#if store.current}
				{@const item = store.current}
				<div class="ed-toast-enter" out:sink|global>
					<Toast
						message={item.message}
						action={item.action}
						error={item.error}
						ondismiss={() => dismiss(item.id)}
						onpointerenter={pause}
						{onpointerleave}
						onfocusin={pause}
						{onfocusout}
					/>
				</div>
			{/if}
		{/key}
	</div>
</div>

<style>
	.ed-toast-anchor {
		display: contents;
	}
	.ed-toast-host {
		position: fixed;
		left: 0;
		right: 0;
		bottom: calc(var(--ed-tab-bar) + var(--ed-safe-bottom) + var(--space-4));
		z-index: var(--ed-z-toast);
		/* one cell, so the toast that is leaving and the one replacing it share the spot */
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		justify-items: center;
		box-sizing: border-box;
		padding: 0 calc(var(--ed-gutter) + var(--ed-safe-right)) 0 calc(var(--ed-gutter) + var(--ed-safe-left));
		pointer-events: none;
	}
	.ed-toast-enter {
		grid-area: 1 / 1;
		display: flex;
		justify-content: center;
		min-width: 0;
		max-width: 100%;
		pointer-events: auto;
		opacity: 1;
		transform: none;
		transition:
			opacity var(--ed-duration-panel) var(--ed-ease-out),
			transform var(--ed-duration-panel) var(--ed-ease-out);
	}
	/* The rise: 8 px up as it fades in. --ed-duration-panel is 0 under reduced motion, so nothing moves there. */
	@starting-style {
		.ed-toast-enter {
			opacity: 0;
			transform: translateY(var(--space-2));
		}
	}
</style>
