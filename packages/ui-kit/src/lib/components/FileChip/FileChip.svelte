<script lang="ts">
	// One file, on one line: a small picture of it when it has one (an image's thumbnail), else a glyph for its kind,
	// then its name, which gives way first, and a quiet detail (its size). With `onremove` a cross takes it away, as
	// in the composer before a message is sent; with `onopen` the body is a button. `busy` is a file still being read,
	// `error` one that could not be taken, `missing` one that is no longer on this device: the last two say so in
	// place of the detail.
	import type { HTMLAttributes } from 'svelte/elements'
	import type { IconName } from '../../icons/icons.js'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import IconButton from '../IconButton/IconButton.svelte'

	type Props = HTMLAttributes<HTMLSpanElement> & {
		/** The file's name. */
		name: string
		/** A quiet word after the name: the size. */
		detail?: string
		/** The glyph for its kind, when there is no thumbnail. */
		icon?: IconName
		/** A small picture of the file: a URL the page may load, a data URL. */
		thumbnail?: string
		/** busy: still being read. error: could not be taken. missing: no longer on this device. */
		state?: 'ready' | 'busy' | 'error' | 'missing'
		/** Shows the cross; called when it is pressed. */
		onremove?: () => void
		/** Makes the body a button; called when it is pressed. */
		onopen?: () => void
	}
	let {
		name,
		detail,
		icon = 'file',
		thumbnail,
		state = 'ready',
		onremove,
		onopen,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const note = $derived(state === 'missing' ? s.file.missing : state === 'error' ? s.file.failed : detail)
	const glyph = $derived<IconName>(state === 'error' ? 'triangle-alert' : icon)
</script>

{#snippet body()}
	{#if thumbnail && state !== 'error' && state !== 'missing'}
		<img class="ed-file-thumb" src={thumbnail} alt="" />
	{:else}
		<span class="ed-file-glyph"><Icon name={glyph} size="sm" /></span>
	{/if}
	<span class="ed-file-text">
		<span class="ed-file-name">{name}</span>{#if note}<span class="ed-file-detail">{note}</span>{/if}
	</span>
{/snippet}

<span
	class={['ed-file', `ed-file-${state}`, { 'ed-file-removable': onremove }, className]}
	aria-busy={state === 'busy' ? true : undefined}
	{...rest}
>
	{#if onopen}
		<button class="ed-file-body" type="button" aria-label={s.file.open(name)} onclick={onopen}>
			{@render body()}
		</button>
	{:else}
		<span class="ed-file-body">{@render body()}</span>
	{/if}
	{#if onremove}
		<IconButton class="ed-file-remove" icon="x" size="xs" label={s.remove(name)} onclick={onremove} />
	{/if}
</span>

<style>
	.ed-file {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		max-width: 100%;
		min-width: 0;
		height: var(--space-8);
		box-sizing: border-box;
		padding: 0 var(--space-2) 0 var(--space-1);
		border: 1px solid var(--stroke);
		border-radius: var(--ed-radius-control);
		background: var(--surface-1);
		color: var(--text-primary);
		vertical-align: middle;
	}
	.ed-file-removable {
		padding-right: var(--space-1);
	}
	.ed-file-missing {
		border-style: dashed;
		background: transparent;
	}
	.ed-file-busy .ed-file-body {
		opacity: 0.55;
	}

	.ed-file-body {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		height: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--ed-radius-control);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
		transition: opacity var(--ed-duration-micro) var(--ed-ease-out);
	}
	button.ed-file-body {
		cursor: pointer;
	}
	button.ed-file-body:hover .ed-file-name {
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	button.ed-file-body:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}

	/* The picture and the glyph share one square, so a row of chips keeps one rhythm */
	.ed-file-thumb,
	.ed-file-glyph {
		flex: none;
		width: var(--space-6);
		height: var(--space-6);
		border-radius: calc(var(--ed-radius-control) - 2px);
	}
	.ed-file-thumb {
		object-fit: cover;
		background: var(--surface-2);
	}
	.ed-file-glyph {
		display: inline-grid;
		place-items: center;
		color: var(--text-secondary);
	}
	.ed-file-error .ed-file-glyph {
		color: var(--danger);
	}

	/* One run of text: the name gives way, the detail never does */
	.ed-file-text {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
	}
	.ed-file-name {
		min-width: 0;
		max-width: 24ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ed-file-detail {
		flex: none;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		color: var(--text-secondary);
		white-space: nowrap;
	}
</style>
