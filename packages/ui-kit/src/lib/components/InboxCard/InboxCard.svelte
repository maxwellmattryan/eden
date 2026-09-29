<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'

	/** One inline action on a notification, rendered as a quiet button. The first is the thing the line asks for. */
	export interface InboxAction {
		/** A stable key; the label stands in when it is missing. */
		id?: string
		/** The verb, sentence case. */
		label: string
		/** A leading glyph. */
		icon?: IconName
		/** What the action does. */
		onclick?: (event: MouseEvent) => void
	}
</script>

<script lang="ts">
	// A notification in the inbox (design/ux-patterns.md, "Notifications"): the domain glyph, one line in the voice,
	// when it arrived and which domain sent it, and inline quiet actions. Unread is said by a dot in the accent and a
	// ground one step up (surface-1 against surface-0), never by a heavier line: the voice has one weight. The app
	// dates the card; the kit shows the string it is given.
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import Button from '../Button/Button.svelte'

	type Props = HTMLAttributes<HTMLElement> & {
		/** The domain glyph (domainGlyph(id)); the bell for the shell's own notices. */
		icon?: IconName
		/** The one line, in the voice. */
		line: string
		/** When it arrived, already formatted by the app ("07:05", "yesterday"). */
		when?: string
		/** The sending domain's themed name: metadata a reader can do without. */
		domain?: string
		/** Not yet seen: the accent dot, the raised ground, and "Unread" for a screen reader. */
		unread?: boolean
		/** Inline quiet actions, the first being what the line asks for. */
		actions?: InboxAction[]
	}
	let {
		icon = 'bell',
		line,
		when,
		domain,
		unread = false,
		actions = [],
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const uid = $props.id()
	const lineId = `${uid}-line`
	const unreadId = `${uid}-unread`
</script>

<article
	class={['ed-inbox', { 'ed-inbox-unread': unread }, className]}
	aria-labelledby={unread ? `${unreadId} ${lineId}` : lineId}
	{...rest}
>
	{#if unread}
		<span class="ed-inbox-dot" aria-hidden="true"></span>
		<span class="ed-sr-only" id={unreadId}>{s.unread}</span>
	{/if}
	<span class="ed-inbox-glyph"><Icon name={icon} size="md" /></span>
	<div class="ed-inbox-text">
		<p class="ed-inbox-line" id={lineId}>{line}</p>
		{#if when || domain}
			<p class="ed-inbox-meta">
				{#if when}<span class="ed-inbox-when">{when}</span>{/if}
				{#if when && domain}<span aria-hidden="true">·</span>{/if}
				{#if domain}<span class="ed-inbox-domain" data-tertiary>{domain}</span>{/if}
			</p>
		{/if}
		{#if actions.length}
			<div class="ed-inbox-actions">
				{#each actions as action (action.id ?? action.label)}
					<Button variant="quiet" label={action.label} icon={action.icon} onclick={action.onclick} />
				{/each}
			</div>
		{/if}
	</div>
</article>

<style>
	.ed-inbox {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3);
		border-radius: var(--ed-radius-card);
		border: 1px solid var(--ed-card-border);
		background: var(--surface-0);
		color: var(--text-primary);
		box-sizing: border-box;
		transition: background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-inbox-unread {
		background: var(--surface-1);
	}
	/* The dot sits on the first line's centre: (22 px voice line − 8 px dot) / 2 */
	.ed-inbox-dot {
		width: var(--space-2);
		height: var(--space-2);
		border-radius: var(--radius-full);
		background: var(--brand-primary);
		flex: none;
		margin-top: calc(var(--space-2) - 1px);
	}
	.ed-inbox-glyph {
		display: inline-flex;
		flex: none;
		color: var(--text-secondary);
		margin-top: 1px;
	}
	.ed-inbox-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.ed-inbox-line {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-primary);
		text-wrap: pretty;
	}
	.ed-inbox-meta {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.ed-inbox-domain {
		color: var(--text-tertiary);
	}
	/* Quiet buttons carry their own padding; pulling the row back by it lines the first label up with the text */
	.ed-inbox-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: var(--space-1);
		margin-left: calc(-1 * var(--ed-btn-pad));
	}
</style>
