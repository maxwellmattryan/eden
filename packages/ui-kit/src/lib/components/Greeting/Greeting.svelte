<script lang="ts">
	// The greeting of an empty conversation: one line in the display face, centred in the space the thread will fill,
	// with the owner's name in their accent. The app writes the line (it varies by the hour and the locale) and says
	// which word is the name; the kit only finds it and colours it. Without a name, or when the line does not hold it,
	// the line is drawn plain.
	import type { HTMLAttributes } from 'svelte/elements'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** The whole line as the locale writes it: "What's up, Rowan?". */
		text: string
		/** The owner's name as it appears in `text`; its first occurrence is drawn in the accent. */
		name?: string
	}
	let { text, name, class: className = '', ...rest }: Props = $props()

	const at = $derived(name ? text.indexOf(name) : -1)
</script>

<div class={['ed-greeting', className]} {...rest}>
	<p class="ed-greeting-line">
		{#if name && at >= 0}
			{text.slice(0, at)}<span class="ed-greeting-name">{name}</span>{text.slice(at + name.length)}
		{:else}
			{text}
		{/if}
	</p>
</div>

<style>
	.ed-greeting {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		/* In a column flex parent it takes the space above the composer and centres within it */
		flex: 1 1 auto;
		box-sizing: border-box;
		min-width: 0;
		padding: var(--space-6) var(--space-4);
		text-align: center;
		color: var(--text-primary);
	}
	.ed-greeting-line {
		margin: 0;
		max-width: 100%;
		font: var(--ed-t-display-lg);
		letter-spacing: var(--ed-t-display-lg-tracking);
		font-variation-settings: var(--ed-t-display-lg-opsz);
		text-wrap: balance;
		overflow-wrap: anywhere;
	}
	.ed-greeting-name {
		color: var(--brand-primary);
	}
</style>
