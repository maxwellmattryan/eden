<script lang="ts">
	// The daily line: the one italic in the system, with its source beneath in caption. A widget on the Garden, the
	// line under the wordmark on the splash, and at `large` the Sanctuary size. It is never truncated; it wraps.
	import type { HTMLAttributes } from 'svelte/elements'

	type Props = HTMLAttributes<HTMLElement> & {
		/** The line itself, from Sanctuary or the neutral bundled set. */
		line: string
		/** Who or what the line is from. Metadata a reader can do without, so it may sit in text-tertiary. */
		source?: string
		/** Sanctuary's size: the same italic voice at 28 px (daily-line-lg), still weight 400. */
		large?: boolean
	}
	let { line, source, large = false, class: className = '', ...rest }: Props = $props()
</script>

<figure class={['ed-daily', large && 'ed-daily-lg', className]} {...rest}>
	<blockquote class="ed-daily-line">{line}</blockquote>
	{#if source}<figcaption class="ed-daily-source" data-tertiary>{source}</figcaption>{/if}
</figure>

<style>
	.ed-daily {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		/* a measure, not a width: it follows the line's size so the large line keeps the same line length */
		max-width: 24em;
	}
	.ed-daily-line {
		font: var(--ed-t-daily-line);
		letter-spacing: var(--ed-t-daily-line-tracking);
		font-variation-settings: var(--ed-t-daily-line-opsz);
		/* a fallback face without a true italic (the CJK serifs) stays upright rather than being slanted */
		font-synthesis-style: none;
		color: var(--text-primary);
		margin: 0;
		text-wrap: pretty;
	}
	.ed-daily-lg .ed-daily-line {
		font: var(--ed-t-daily-line-lg);
		letter-spacing: var(--ed-t-daily-line-lg-tracking);
		font-variation-settings: var(--ed-t-daily-line-lg-opsz);
	}
	.ed-daily-source {
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-tertiary);
	}
</style>
