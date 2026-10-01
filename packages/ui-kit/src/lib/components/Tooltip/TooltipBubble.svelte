<script lang="ts">
	// The one bubble every tooltip() host shares. tooltip.ts mounts it into <body> the first time a tooltip is needed,
	// then sets its text, opens it as a manual popover (the top layer, so no ancestor transform or overflow can trap
	// it) and places it with anchor(). The styles live here so lint-css checks them like any component's.
	type Props = {
		/** The id hosts point at through aria-describedby while the bubble describes them. */
		id: string
	}
	let { id }: Props = $props()
</script>

<div class="ed-tooltip" role="tooltip" popover="manual" {id}></div>

<style>
	.ed-tooltip {
		/* the UA centres a popover in the viewport; anchor() sets top and left instead */
		position: fixed;
		inset: auto;
		margin: 0;
		z-index: var(--ed-z-popover);
		display: none;
		box-sizing: border-box;
		max-width: calc(var(--space-8) * 8);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--stroke);
		border-radius: var(--ed-radius-control);
		background: var(--surface-1);
		color: var(--text-primary);
		box-shadow: var(--shadow-card);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		overflow: visible;
		overflow-wrap: anywhere;
		pointer-events: none;
		opacity: 1;
		transform: none;
		transition:
			opacity var(--ed-duration-micro) var(--ed-ease-out),
			transform var(--ed-duration-micro) var(--ed-ease-out);
		/* the unfurl starts on the host's side: from above when the bubble sits below it, from below when above */
		--ed-tooltip-shift: -2px;
	}
	/* data-side and data-open are set by tooltip.ts and anchor(), not the template, so :global() keeps them */
	.ed-tooltip:global([data-side='top']) {
		--ed-tooltip-shift: 2px;
	}
	/* two rules, not one list: a browser without the popover API would drop a list that names :popover-open */
	.ed-tooltip:popover-open {
		display: block;
	}
	.ed-tooltip:global([data-open]) {
		display: block;
	}
	@starting-style {
		.ed-tooltip:popover-open,
		.ed-tooltip:global([data-open]) {
			opacity: 0;
			transform: translateY(var(--ed-tooltip-shift));
		}
	}
	/* the way out is the way in: tooltip.ts holds the bubble shown under data-closing until this has played */
	.ed-tooltip:global([data-closing]) {
		opacity: 0;
		transform: translateY(var(--ed-tooltip-shift));
	}
	/* The micro duration is not zeroed under reduced motion, so the shift is: only the opacity animates then. */
	@media (prefers-reduced-motion: reduce) {
		.ed-tooltip {
			--ed-tooltip-shift: 0px;
		}
	}
</style>
