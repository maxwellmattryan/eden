<script module lang="ts">
	/** One speck of a burst: where it starts, how far it drifts, when it leaves. */
	export interface Speck {
		id: number
		x: number
		dx: number
		dy: number
		delay: number
		r: number
	}

	/**
	 * The specks for a burst of `count` inside a `size` square: spread along the bottom, each drifting up and a
	 * little sideways, staggered by 45 ms. Deterministic, so a burst looks the same every time (no randomness in the kit).
	 */
	export function specksFor(count: number, size: number): Speck[] {
		const span = Math.max(1, size - 12)
		return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => ({
			id: i,
			x: 6 + ((i * 7.3) % span),
			dx: (i % 2 ? 1 : -1) * (2 + (i % 3)),
			dy: 8 + ((i * 5) % 7),
			delay: i * 45,
			r: 1.2 + (i % 2) * 0.5,
		}))
	}

	/** A CSS time ('700ms', '.7s', '0ms') in milliseconds; 0 when it is missing or unreadable, so nothing plays. */
	export function parseMs(value: string): number {
		const v = value.trim()
		const n = parseFloat(v)
		if (!Number.isFinite(n)) return 0
		return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : n
	}
</script>

<script lang="ts">
	// A breath of air: a few specks in the accent that rise and fade once beside the thing that just settled (an
	// accepted proposal, a saved log: D-42). Very quiet by design: 2 px specks at 55 % at most, the breeze duration,
	// staggered. The duration is 0 under reduced motion, in which case nothing renders and `onend` fires at once.
	// Mount it when a state resolves and unmount it on `onend`.
	import type { Attachment } from 'svelte/attachments'
	import type { SVGAttributes } from 'svelte/elements'

	type Props = Omit<SVGAttributes<SVGSVGElement>, 'width' | 'height' | 'onanimationend'> & {
		/** How many specks rise. */
		count?: number
		/** The square the specks rise inside, in px: the SVG's width and height. */
		size?: number
		/** Called once, when the last speck has faded (at once under reduced motion), so the parent can unmount it. */
		onend?: () => void
	}
	let { count = 5, size = 28, onend, class: className = '', ...rest }: Props = $props()

	const specks = $derived(specksFor(count, size))
	let plays = $state(true)
	let done = false

	function finish() {
		if (done) return
		done = true
		plays = false
		onend?.()
	}

	// Reads the breeze duration once from the element's computed style: 0 under reduced motion (base.css), so the
	// burst is skipped. A timer backs the animationend event for an element that is never painted.
	const gate: Attachment<SVGSVGElement> = (el) => {
		if (typeof globalThis.matchMedia !== 'function') {
			finish()
			return
		}
		const ms = parseMs(getComputedStyle(el).getPropertyValue('--ed-duration-breeze'))
		if (ms <= 0) {
			finish()
			return
		}
		const lastDelay = specks.at(-1)?.delay ?? 0
		const handle = setTimeout(finish, ms + lastDelay + 100)
		return () => clearTimeout(handle)
	}
</script>

{#if plays}
	<svg
		class="ed-breeze {className}"
		width={size}
		height={size}
		viewBox="0 0 {size} {size}"
		aria-hidden="true"
		focusable="false"
		onanimationend={(e) => {
			if (e.target === e.currentTarget.lastElementChild) finish()
		}}
		{@attach gate}
		{...rest}
	>
		{#each specks as speck (speck.id)}
			<circle
				cx={speck.x}
				cy={size - 6}
				r={speck.r}
				style="--ed-breeze-dx: {speck.dx}px; --ed-breeze-dy: {-speck.dy}px; animation-delay: {speck.delay}ms"
			/>
		{/each}
	</svg>
{/if}

<style>
	.ed-breeze {
		position: absolute;
		left: calc(-1 * var(--space-2));
		top: calc(-1 * var(--space-4));
		pointer-events: none;
		overflow: visible;
	}
	circle {
		fill: var(--brand-primary);
		opacity: 0;
		animation: ed-breeze var(--ed-duration-breeze) var(--ed-ease-out) forwards;
	}
	@keyframes ed-breeze {
		0% {
			opacity: 0;
			transform: translate(0, 4px);
		}
		25% {
			opacity: 0.55;
		}
		100% {
			opacity: 0;
			transform: translate(var(--ed-breeze-dx), var(--ed-breeze-dy));
		}
	}
</style>
