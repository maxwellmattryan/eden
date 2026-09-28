<script lang="ts">
	// Mirrors the toolbar globals onto <html>, exactly where the app's pre-paint script puts them. addon-themes owns data-theme.
	import type { Snippet } from 'svelte'

	let { accent, brand, face, children }: { accent: string; brand: string; face: string; children?: Snippet } = $props()

	$effect(() => {
		// effect: imperative DOM
		const root = document.documentElement
		root.setAttribute('data-accent', accent)
		root.setAttribute('data-brand', brand)
		root.setAttribute('data-face', face)
	})
</script>

{@render children?.()}
