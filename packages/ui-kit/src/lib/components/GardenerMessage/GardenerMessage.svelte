<script lang="ts">
	// The Gardener's bubble on ai-muted with its name in ai, whatever the accent, so a reply is never mistaken for the
	// owner's own data (D-40); the owner's own message on surface-2, aligned to the end, with no name. The reply body
	// is the voice in text-primary; the owner's words are body text. Replies stream: `text` may grow word by word, and
	// children (tool and proposal cards) follow the text inside the same bubble.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { domainGlyph } from '../../icons/domain-glyphs.js'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'

	type Props = HTMLAttributes<HTMLElement> & {
		/** The message: one string, or one per paragraph. */
		text?: string | readonly string[]
		/** The owner's own message rather than the Gardener's. */
		owner?: boolean
		/** The speaker's name on a Gardener bubble; the kit's "Gardener" by default. */
		name?: string
		/** What follows the text inside the bubble: tool cards, proposal cards. */
		children?: Snippet
	}
	let { text, owner = false, name, children, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
	const uid = $props.id()
	const paragraphs = $derived(text === undefined ? [] : typeof text === 'string' ? [text] : text)
	const speaker = $derived(name ?? s.gardener.name)
</script>

<article
	class={['ed-msg', owner ? 'ed-msg-owner' : 'ed-msg-ai', className]}
	aria-labelledby={owner ? undefined : `${uid}-name`}
	{...rest}
>
	{#if !owner}
		<p class="ed-msg-name" id="{uid}-name"><Icon name={domainGlyph('gardener')} size="sm" />{speaker}</p>
	{/if}
	<!-- keyed by index: the paragraphs are a plain string list, and a streaming reply grows the last one in place -->
	{#each paragraphs as paragraph, i (i)}
		<p class="ed-msg-p">{paragraph}</p>
	{/each}
	{@render children?.()}
</article>

<style>
	.ed-msg {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--ed-radius-card);
		border: 1px solid transparent;
		color: var(--text-primary);
		box-sizing: border-box;
		max-width: 100%;
		min-width: 0;
		/* a long unbroken word (a URL, an id) breaks rather than widening the thread */
		overflow-wrap: anywhere;
	}
	.ed-msg-ai {
		background: var(--ai-muted);
		border-color: color-mix(in srgb, var(--ai) 25%, transparent);
	}
	.ed-msg-owner {
		background: var(--surface-2);
		align-self: flex-end;
		max-width: 80%;
	}
	.ed-msg-name {
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--ai);
	}
	.ed-msg-p {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		text-wrap: pretty;
	}
	.ed-msg-ai .ed-msg-p {
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
	}
</style>
