<script lang="ts">
	// A small compass in the traditional way, north up: a dial with a tick at each point of eight, the letter for
	// north above it, and a needle on its pivot that points along a bearing, its leading half filled and its trailing
	// half left open. For saying which way something runs (the wind, a heading) without a sentence on the page.
	// Decorative unless it is given a label; `tooltip` shows a sentence on hover, the visible form of what the label
	// and the page already say. The needle turns to a new bearing over the settle duration.
	import type { SVGAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import { tooltip as attachTooltip } from '../Tooltip/tooltip.js'

	type Props = Omit<SVGAttributes<SVGSVGElement>, 'aria-label'> & {
		/** Where the needle points, in degrees clockwise from north. */
		bearing: number
		/** sm 16, md 20 and lg 24 are the icon sizes; xl is the one at which the letter reads, and the default. */
		size?: 'sm' | 'md' | 'lg' | 'xl'
		/** The accessible name; without one the glyph is hidden from assistive technology. */
		label?: string
		/** A sentence shown on hover. Never on touch. */
		tooltip?: string
	}
	let { bearing, size = 'xl', label, tooltip = '', class: className = '', ...rest }: Props = $props()

	const s = useStrings()
	/** The dial's centre and radius: it sits low in the box, under the letter. */
	const CX = 16
	const CY = 21
	const R = 10
	/** The points of eight, as turns of the one tick drawn at north; the four cardinal ones are the longer. */
	const POINTS = [0, 45, 90, 135, 180, 225, 270, 315]
</script>

<svg
	class={['ed-compass', `ed-compass-${size}`, className]}
	viewBox="0 0 32 32"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	{@attach attachTooltip(() => tooltip)}
	{...rest}
>
	<text class="ed-compass-letter" x={CX} y="8" font-size="7.5" aria-hidden="true">{s.compass.north}</text>
	<circle class="ed-compass-dial" cx={CX} cy={CY} r={R} />
	{#each POINTS as point (point)}
		<line
			class={['ed-compass-tick', { 'ed-compass-north': point === 0 }]}
			x1={CX}
			x2={CX}
			y1={CY - R + 1.25}
			y2={CY - R + (point % 90 === 0 ? 3.25 : 2.25)}
			transform="rotate({point} {CX} {CY})"
		/>
	{/each}
	<g class="ed-compass-needle" style:rotate="{bearing}deg">
		<path class="ed-compass-tail" d="M{CX - 2.4} {CY}L{CX} {CY + 6.5}L{CX + 2.4} {CY}Z" />
		<path class="ed-compass-head" d="M{CX - 2.4} {CY}L{CX} {CY - 6.5}L{CX + 2.4} {CY}Z" />
	</g>
	<circle class="ed-compass-pivot" cx={CX} cy={CY} r="0.9" />
</svg>

<style>
	.ed-compass {
		flex: none;
		display: inline-block;
		vertical-align: middle;
		overflow: visible;
		color: var(--text-tertiary);
	}
	.ed-compass-sm {
		width: var(--icon-sm);
		height: var(--icon-sm);
	}
	.ed-compass-md {
		width: var(--icon-md);
		height: var(--icon-md);
	}
	.ed-compass-lg {
		width: var(--icon-lg);
		height: var(--icon-lg);
	}
	.ed-compass-xl {
		width: var(--space-8);
		height: var(--space-8);
	}
	/* The letter is set in the drawing's own units, so it keeps its place over the dial at every size */
	.ed-compass-letter {
		font-family: var(--ed-font-sans);
		font-weight: 600;
		text-anchor: middle;
		fill: var(--text-secondary);
	}
	.ed-compass-dial,
	.ed-compass-tick {
		fill: none;
		stroke: currentColor;
		stroke-width: 1;
		stroke-linecap: round;
	}
	.ed-compass-dial {
		opacity: 0.55;
	}
	.ed-compass-tick {
		opacity: 0.75;
	}
	.ed-compass-north {
		stroke: var(--text-secondary);
		opacity: 1;
	}
	.ed-compass-needle {
		transform-origin: 16px 21px;
		transition: rotate var(--ed-duration-settle) var(--ed-ease-out);
	}
	.ed-compass-head,
	.ed-compass-tail {
		stroke: var(--text-secondary);
		stroke-width: 0.75;
		stroke-linejoin: round;
	}
	.ed-compass-head {
		fill: var(--text-secondary);
	}
	.ed-compass-tail {
		fill: var(--surface-0);
	}
	.ed-compass-pivot {
		fill: var(--surface-0);
	}
</style>
