<script lang="ts">
	// The wordmark, the name with its capital (D-66), in the display face: display-xl on the splash and in About, display-md at the head of the
	// desktop sidebar beside the AppMark (D-55); nowhere else in the chrome. The name arrives from the app's locale
	// (D-20), so the text itself is the accessible name and no aria-label is needed.
	import type { HTMLAttributes } from 'svelte/elements'

	type Props = HTMLAttributes<HTMLSpanElement> & {
		/** The app's name as the locale writes it. */
		name?: string
		/** xl for the splash and About, md for the sidebar's head. */
		size?: 'md' | 'xl'
	}
	let { name = 'Eden', size = 'xl', class: className = '', ...rest }: Props = $props()
</script>

<span class={['ed-wordmark', `ed-wordmark-${size}`, className]} {...rest}>{name}</span>

<style>
	.ed-wordmark {
		display: inline-block;
		color: var(--text-primary);
	}
	.ed-wordmark-xl {
		font: var(--ed-t-display-xl);
		letter-spacing: var(--ed-t-display-xl-tracking);
		font-variation-settings: var(--ed-t-display-xl-opsz);
	}
	.ed-wordmark-md {
		font: var(--ed-t-display-md);
		letter-spacing: var(--ed-t-display-md-tracking);
		font-variation-settings: var(--ed-t-display-md-opsz);
	}
</style>
