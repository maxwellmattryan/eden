<script lang="ts">
	// The lowercase wordmark in display-xl. Splash and About only; nowhere else in the chrome. The name arrives from
	// the app's locale (D-20), so the text itself is the accessible name and no aria-label is needed.
	import type { HTMLAttributes } from 'svelte/elements'

	type Props = HTMLAttributes<HTMLSpanElement> & {
		/** The app's name, lowercase, from the locale. */
		name?: string
	}
	let { name = 'eden', class: className = '', ...rest }: Props = $props()
</script>

<span class="ed-wordmark {className}" {...rest}>{name}</span>

<style>
	.ed-wordmark {
		display: inline-block;
		font: var(--ed-t-display-xl);
		letter-spacing: var(--ed-t-display-xl-tracking);
		font-variation-settings: var(--ed-t-display-xl-opsz);
		color: var(--text-primary);
	}
</style>
