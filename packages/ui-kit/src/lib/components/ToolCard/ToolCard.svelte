<script module lang="ts">
	/** The access levels a tool declares (D-8); the confirm rule follows from them. */
	export type ToolAccess = 'read' | 'write-draft' | 'write' | 'act-external'
	export type ToolState = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
	/** What became of the draft a tool left for the owner: still waiting, kept or discarded. */
	export type ToolDraft = 'pending' | 'committed' | 'discarded'
</script>

<script lang="ts">
	// A tool call inside a Gardener reply, in honey: the Gardener acting rather than speaking (D-40). The badge says the
	// access level. A write or act-external card carries its confirm inline, with the payload in full and a button that
	// repeats the verb, so the owner confirms exactly what will happen; read and write-draft cards have no buttons.
	// `pending` waits on that confirm. From there the state is the glyph at the end of the title line: a spinner while
	// the tool runs, a success check when it is done, a danger x with the error in the body when it failed, and a danger
	// x with "nothing was changed" when the owner cancelled. A done card whose `draft` still waits on the owner is not
	// settled: it keeps the tint and its badge and shows a warning triangle; once the owner keeps the draft the badge
	// fades out and the check comes, and once they discard it the badge fades out and the card reads as cancelled.
	// Never-automated actions have no card at all.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import Badge from '../Badge/Badge.svelte'
	import Button from '../Button/Button.svelte'
	import ToolChrome, { type ToolStatus } from './ToolChrome.svelte'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'oncancel'> & {
		/** The tool's registered name ("create-event"). */
		name: string
		/** Its access level; read shows no badge. */
		access?: ToolAccess
		/** What it will do, in the voice; on a failed card, what went wrong. */
		text?: string
		/** The exact payload, shown in full. */
		payload?: string
		/** The verb the confirm button repeats ("Create event"). With write or act-external access it puts the confirm inline. */
		confirm?: string
		/** Called when the owner confirms. */
		onconfirm?: () => void
		/** Called when the owner cancels. */
		oncancel?: () => void
		/** Puts an info glyph in the head, named "About this tool"; called with the button so a popover can hang on it. */
		oninfo?: (anchor: HTMLElement) => void
		/** pending (waiting on the confirm), running, done, failed or cancelled (bindable); the buttons set running or cancelled. */
		state?: ToolState
		/** What became of the draft the tool left, when it left one: a done card waits on it. */
		draft?: ToolDraft
	}
	let {
		name,
		access = 'read',
		text,
		payload,
		confirm,
		onconfirm,
		oncancel,
		oninfo,
		state = $bindable('pending'),
		draft,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const confirmable = $derived(!!confirm && (access === 'write' || access === 'act-external'))
	// the draft decides how a done card reads; any other state is the tool's own
	const shown = $derived<ToolStatus | undefined>(
		state === 'pending'
			? undefined
			: state !== 'done'
				? state
				: draft === 'pending'
					? 'waiting'
					: draft === 'discarded'
						? 'cancelled'
						: 'done'
	)
	const result = $derived(shown === 'cancelled' ? s.gardener.cancelledNothingChanged : undefined)
	const settledDraft = $derived(state === 'done' && (draft === 'committed' || draft === 'discarded'))

	function decide(next: 'running' | 'cancelled') {
		state = next
		if (next === 'running') onconfirm?.()
		else oncancel?.()
	}
</script>

{#snippet confirmRow()}
	<Button variant="quiet" label={s.cancel} onclick={() => decide('cancelled')} />
	<Button variant="honey" label={confirm ?? s.confirm} onclick={() => decide('running')} />
{/snippet}

{#snippet badge()}<Badge kind={access} />{/snippet}

<ToolChrome
	tone="honey"
	icon="shovel"
	heading={name}
	done={shown === 'done'}
	status={shown}
	badge={settledDraft ? undefined : badge}
	{result}
	actions={confirmable && state === 'pending' ? confirmRow : undefined}
	{oninfo}
	class={className}
	{...rest}
>
	{#if text}<p class={['ed-toolcard-text', { 'ed-toolcard-failed': state === 'failed' }]}>{text}</p>{/if}
	{#if payload}<pre class="ed-toolcard-payload">{payload}</pre>{/if}
</ToolChrome>

<style>
	.ed-toolcard-text {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-primary);
		text-wrap: pretty;
		user-select: text;
		-webkit-user-select: text;
	}
	.ed-toolcard-failed {
		color: var(--danger);
	}
	.ed-toolcard-payload {
		margin: 0;
		font: var(--ed-t-code);
		letter-spacing: var(--ed-t-code-tracking);
		color: var(--text-primary);
		background: var(--surface-0);
		border-radius: calc(var(--ed-radius-control) / 2);
		padding: var(--space-2) var(--space-3);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		user-select: text;
		-webkit-user-select: text;
	}
</style>
