<script module lang="ts">
	/** The access levels a tool declares (D-8); the confirm rule follows from them. */
	export type ToolAccess = 'read' | 'write-draft' | 'write' | 'act-external'
	export type ToolState = 'pending' | 'done' | 'cancelled'
</script>

<script lang="ts">
	// A tool call inside a Gardener reply, in honey: the Gardener acting rather than speaking (D-40). The badge says the
	// access level. A write or act-external card carries its confirm inline, with the payload in full and a button that
	// repeats the verb, so the owner confirms exactly what will happen; read and write-draft cards have no buttons.
	// After the choice the card says what it did, or that nothing changed. Never-automated actions have no card at all.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import Badge from '../Badge/Badge.svelte'
	import Button from '../Button/Button.svelte'
	import ToolChrome from './ToolChrome.svelte'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'oncancel'> & {
		/** The tool's registered name ("create-event"). */
		name: string
		/** Its access level; read shows no badge. */
		access?: ToolAccess
		/** What it will do, in the voice. */
		text?: string
		/** The exact payload, shown in full. */
		payload?: string
		/** The verb the confirm button repeats ("Create event"). With write or act-external access it puts the confirm inline. */
		confirm?: string
		/** Called when the owner confirms. */
		onconfirm?: () => void
		/** Called when the owner cancels. */
		oncancel?: () => void
		/** pending, done or cancelled (bindable); the buttons set it. */
		state?: ToolState
	}
	let {
		name,
		access = 'read',
		text,
		payload,
		confirm,
		onconfirm,
		oncancel,
		state = $bindable('pending'),
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const confirmable = $derived(!!confirm && (access === 'write' || access === 'act-external'))
	const result = $derived(
		state === 'done'
			? confirm
				? s.gardener.confirmed(confirm)
				: s.done
			: state === 'cancelled'
				? s.gardener.cancelledNothingChanged
				: undefined
	)

	function decide(next: ToolState) {
		state = next
		if (next === 'done') onconfirm?.()
		else oncancel?.()
	}
</script>

{#snippet confirmRow()}
	<Button variant="quiet" label={s.cancel} onclick={() => decide('cancelled')} />
	<Button variant="honey" label={confirm ?? s.confirm} onclick={() => decide('done')} />
{/snippet}

<ToolChrome
	tone="honey"
	icon="shovel"
	heading={name}
	done={state === 'done'}
	{result}
	actions={confirmable ? confirmRow : undefined}
	class={className}
	{...rest}
>
	{#snippet badge()}<Badge kind={access} />{/snippet}
	{#if text}<p class="ed-toolcard-text">{text}</p>{/if}
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
	}
</style>
