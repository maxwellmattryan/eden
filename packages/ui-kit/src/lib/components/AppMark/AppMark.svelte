<script lang="ts">
	// The app mark: the stem and its two round leaves in a rounded square, the brand ground behind the on-brand ink,
	// so it follows the theme and the accent. It traces the placeholder in src-tauri/icons/src until the app icon
	// (design/brand.md) is drawn; this file is the one place to swap. Decorative: it always sits beside the Wordmark,
	// which carries the name.
	import type { SVGAttributes } from 'svelte/elements'

	let { class: className = '', ...rest }: SVGAttributes<SVGSVGElement> = $props()
</script>

<svg class={['ed-app-mark', className]} viewBox="64 64 896 896" aria-hidden="true" focusable="false" {...rest}>
	<rect class="ed-app-mark-ground" x="64" y="64" width="896" height="896" rx="208" />
	<g class="ed-app-mark-ink">
		<rect x="479" y="300" width="67" height="460" />
		<circle cx="392" cy="560" r="109" />
		<circle cx="632" cy="430" r="110" />
	</g>
</svg>

<style>
	.ed-app-mark {
		display: block;
		flex: none;
		width: var(--space-8);
		height: var(--space-8);
	}
	.ed-app-mark-ground {
		fill: var(--brand-primary);
	}
	.ed-app-mark-ink {
		fill: var(--on-brand);
	}
</style>
