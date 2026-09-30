<script lang="ts">
	// The Gardener's bubble on ai-muted with its name in ai, whatever the accent, so a reply is never mistaken for the
	// owner's own data (D-40); the owner's own message on surface-2, aligned to the end, with no name. The reply body
	// is the voice in text-primary; the owner's words are body text. Replies stream: `text` may grow word by word, and
	// children (tool and proposal cards) follow the text inside the same bubble. With `markdown` a reply's text is
	// drawn as Markdown; the owner's words never are. The words select. Under the bubble, when the app gives a `time`
	// or an `oncopy`, a quiet foot says when the message was sent or received and carries a copy glyph that turns to a
	// check for two seconds once the app has copied. `tone="honey"` is the Gardener acting rather than speaking (D-40):
	// a draft it left for the owner to commit, as its own message with its own `name` and `icon` for a header.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { domainGlyph } from '../../icons/domain-glyphs.js'
	import Icon from '../../icons/Icon.svelte'
	import type { IconName } from '../../icons/icons.js'
	import { useStrings } from '../../i18n/context.js'
	import { PausableTimer } from '../../internal/timer.svelte.js'
	import IconButton from '../IconButton/IconButton.svelte'
	import Markdown from '../Markdown/Markdown.svelte'

	type Props = HTMLAttributes<HTMLElement> & {
		/** The message: one string, or one per paragraph. */
		text?: string | readonly string[]
		/** The owner's own message rather than the Gardener's. */
		owner?: boolean
		/** The speaker's name on a Gardener bubble; the kit's "Gardener" by default. */
		name?: string
		/** The glyph beside the name; the Gardener's by default. */
		icon?: IconName
		/** ai when the Gardener speaks, honey when it acts: a draft to commit. */
		tone?: 'ai' | 'honey'
		/** Draws a reply's text as Markdown. The owner's message stays plain. */
		markdown?: boolean
		/** Called with a Markdown link's href instead of following it. */
		onlink?: (href: string) => void
		/** When the message was sent or received, already formatted ("Wed 30 Sep, 19:00"); shown under the bubble. */
		time?: string
		/** Puts a copy glyph under the bubble; the app copies the message's text. */
		oncopy?: () => void | Promise<void>
		/** What follows the text inside the bubble: tool cards, proposal cards. */
		children?: Snippet
	}
	let {
		text,
		owner = false,
		name,
		icon,
		tone = 'ai',
		markdown = false,
		onlink,
		time,
		oncopy,
		children,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const uid = $props.id()
	const paragraphs = $derived(text === undefined ? [] : typeof text === 'string' ? [text] : text)
	const speaker = $derived(name ?? s.gardener.name)

	const COPIED_MS = 2000
	let copied = $state(false)
	const copiedTimer = new PausableTimer(() => (copied = false))
	async function copy() {
		try {
			await oncopy?.()
			copied = true
			copiedTimer.start(COPIED_MS)
		} catch {
			// the clipboard refused: the glyph stays a copy glyph
		}
	}
</script>

<article
	class={['ed-msg', owner ? 'ed-msg-owner' : 'ed-msg-ai', !owner && tone === 'honey' && 'ed-msg-honey', className]}
	aria-labelledby={owner ? undefined : `${uid}-name`}
	{...rest}
>
	<div class="ed-msg-bubble">
		{#if !owner}
			<p class="ed-msg-name" id="{uid}-name"><Icon name={icon ?? domainGlyph('gardener')} size="sm" />{speaker}</p>
		{/if}
		{#if markdown && !owner}
			{#if paragraphs.length}<Markdown source={paragraphs.join('\n\n')} voice {onlink} />{/if}
		{:else}
			<!-- keyed by index: the paragraphs are a plain string list, and a streaming reply grows the last one in place -->
			{#each paragraphs as paragraph, i (i)}
				<p class="ed-msg-p">{paragraph}</p>
			{/each}
		{/if}
		{@render children?.()}
	</div>
	{#if time || oncopy}
		<div class="ed-msg-foot">
			{#if time}<span class="ed-msg-time">{owner ? s.gardener.sentAt(time) : s.gardener.receivedAt(time)}</span>{/if}
			{#if oncopy}
				<IconButton
					icon={copied ? 'check' : 'copy'}
					size="xs"
					label={copied ? s.gardener.copied : s.gardener.copyMessage}
					tooltip
					onclick={() => void copy()}
				/>
			{/if}
		</div>
	{/if}
</article>

<style>
	.ed-msg {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		box-sizing: border-box;
		max-width: 100%;
		min-width: 0;
	}
	.ed-msg-bubble {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--ed-radius-card);
		border: 1px solid transparent;
		color: var(--text-primary);
		box-sizing: border-box;
		min-width: 0;
		/* a long unbroken word (a URL, an id) breaks rather than widening the thread */
		overflow-wrap: anywhere;
	}
	.ed-msg-ai {
		--ed-msg-ink: var(--ai);
		--ed-msg-ground: var(--ai-muted);
	}
	.ed-msg-honey {
		--ed-msg-ink: var(--honey);
		--ed-msg-ground: var(--honey-muted);
	}
	.ed-msg-ai .ed-msg-bubble {
		background: var(--ed-msg-ground);
		border-color: color-mix(in srgb, var(--ed-msg-ink) 25%, transparent);
	}
	.ed-msg-owner {
		align-self: flex-end;
		align-items: flex-end;
		max-width: 80%;
	}
	.ed-msg-owner .ed-msg-bubble {
		background: var(--surface-2);
	}
	.ed-msg-name {
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--ed-msg-ink);
	}
	.ed-msg-p {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		text-wrap: pretty;
		/* the words are there to be read and kept: they select, unlike the app's chrome */
		user-select: text;
		-webkit-user-select: text;
	}
	.ed-msg-ai .ed-msg-p {
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
	}
	.ed-msg-foot {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-1);
		min-height: var(--icon-md);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
</style>
