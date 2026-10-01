<script lang="ts">
	// The Gardener's sprout, growing while a reply is awaited (D-80): from a line of soil the stem draws upward, one
	// leaf unfurls and then the other, it stands a moment, fades, and grows again, in the Gardener's own green. Shown
	// only while nothing else says the Gardener is at work: no words streaming, no tool card turning its spinner. One
	// growth takes the grow duration, which is zero under reduced motion: the sprout then stands fully grown and the
	// spoken name carries the state alone. Never a page's loading state; that is a skeleton.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'

	type Props = HTMLAttributes<HTMLSpanElement> & {
		/** sm 16, md 20. */
		size?: 'sm' | 'md'
		/** The spoken name; the kit's "Writing a reply" by default. */
		label?: string
	}
	let { size = 'sm', label, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
</script>

<span class={['ed-sprouting', `ed-sprouting-${size}`, className]} role="status" {...rest}>
	<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
		<path class="ed-sprouting-soil" d="M7 20.5h10" />
		<g class="ed-sprouting-plant">
			<path class="ed-sprouting-stem" pathLength="1" d="M12 20.5C12.6 17.5 11.4 14 12 10.5" />
			<path
				class="ed-sprouting-leaf ed-sprouting-first"
				d="M11.9 14.5C9 14.6 6.6 12.8 6.2 9.6c3.2-.2 5.5 1.7 5.7 4.9z"
			/>
			<path class="ed-sprouting-leaf ed-sprouting-second" d="M12 10.5c.1-3.3 2.4-5.6 5.8-5.6 0 3.3-2.4 5.6-5.8 5.6z" />
		</g>
	</svg>
	<span class="ed-sr-only">{label ?? s.gardener.writing}</span>
</span>

<style>
	.ed-sprouting {
		display: inline-flex;
		flex: none;
		/* in a bubble's column it keeps its own width rather than stretching */
		align-self: flex-start;
		color: var(--ai);
	}
	.ed-sprouting svg {
		display: block;
		overflow: visible;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	/* the dense icon stroke, in the drawing's own units so the stem's dash stays measured along the path */
	.ed-sprouting-sm svg {
		width: var(--icon-sm);
		height: var(--icon-sm);
		stroke-width: 2.6;
	}
	.ed-sprouting-md svg {
		width: var(--icon-md);
		height: var(--icon-md);
		stroke-width: 2.1;
	}
	.ed-sprouting-soil {
		opacity: 0.5;
	}
	.ed-sprouting-plant {
		animation: ed-sprouting-fade var(--ed-duration-grow) var(--ed-ease-out) infinite;
	}
	.ed-sprouting-stem {
		stroke-dasharray: 1;
		animation: ed-sprouting-stem var(--ed-duration-grow) var(--ed-ease-out) infinite;
	}
	.ed-sprouting-leaf {
		transform-box: view-box;
		animation: ed-sprouting-leaf var(--ed-duration-grow) var(--ed-ease-out) infinite;
	}
	.ed-sprouting-first {
		transform-origin: 11.9px 14.5px;
	}
	.ed-sprouting-second {
		transform-origin: 12px 10.5px;
		animation-name: ed-sprouting-leaf-late;
	}
	@keyframes ed-sprouting-fade {
		0%,
		82% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
	@keyframes ed-sprouting-stem {
		0% {
			stroke-dashoffset: 1;
		}
		35%,
		100% {
			stroke-dashoffset: 0;
		}
	}
	@keyframes ed-sprouting-leaf {
		0%,
		22% {
			transform: scale(0);
		}
		52%,
		100% {
			transform: scale(1);
		}
	}
	@keyframes ed-sprouting-leaf-late {
		0%,
		38% {
			transform: scale(0);
		}
		68%,
		100% {
			transform: scale(1);
		}
	}
</style>
