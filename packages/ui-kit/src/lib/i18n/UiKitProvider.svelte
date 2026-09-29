<script lang="ts">
	import type { Snippet } from 'svelte'
	import { setStringsSource } from './context.js'
	import { defaultStrings, mergeStrings, type UiStringsOverride } from './strings.js'

	type Props = {
		/** Translations over the English defaults; pass a new object when the locale changes. */
		strings?: UiStringsOverride
		children?: Snippet
	}
	let { strings, children }: Props = $props()

	const merged = $derived(mergeStrings(defaultStrings, strings))
	setStringsSource({
		get current() {
			return merged
		},
	})
</script>

{@render children?.()}
