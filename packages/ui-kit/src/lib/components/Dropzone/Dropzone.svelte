<script lang="ts">
	// A region that takes dropped files. It wraps what it covers and, while files are dragged over it, lays a light
	// wash of the accent across the whole region with a card that says what is held: how many files and of what kinds,
	// as far as the engine tells before the drop. A drag it could not take (too many, nothing of a type it accepts)
	// reads as a refusal on a plain ink wash instead. The wash never takes the pointer and is hidden from assistive
	// technology: dragging is a pointer's gesture, so an app pairs the zone with a FileButton for everyone else.
	// On the drop the files are held to the rules (`checkFiles`), and the app gets the ones taken and the ones refused,
	// each with its reason, to say so in its own words. While `disabled` the zone does nothing at all.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { checkFiles, hoverRefusal, summarize, type FileCheck, type FileRules } from '../../files/check-files.js'
	import { dropzone } from './dropzone.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'ondrop'> &
		FileRules & {
			/** Takes nothing and shows nothing: the drag passes as if the zone were not there. */
			disabled?: boolean
			/** Called at the drop with the files the rules take and the ones they refuse; either may be empty. */
			ondrop: (accepted: File[], rejected: FileCheck['rejected']) => void
			/** What the zone covers. */
			children: Snippet
		}
	let {
		accept,
		exclude,
		maxFiles,
		maxSize,
		maxTotalSize,
		count,
		totalSize,
		disabled = false,
		ondrop,
		children,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const rules = $derived<FileRules>({ accept, exclude, maxFiles, maxSize, maxTotalSize, count, totalSize })

	let over = $state(false)
	/** What the drag holds; kept after it leaves so the card does not empty while it fades. */
	let items = $state<{ type: string }[]>([])

	const refusal = $derived(hoverRefusal(items, rules))
	const groups = $derived(summarize(items))
	// a drag whose types the engine withholds is one group of "other": the count in the headline says it all
	const detail = $derived(
		groups.length === 1 && groups[0]?.group === 'other'
			? ''
			: groups.map(({ group, count }) => s.dropzone.groups[group](count)).join(' · ')
	)
</script>

<div
	class={['ed-dropzone', className]}
	{@attach dropzone(() => ({
		disabled: () => disabled,
		onHover: (held) => {
			over = held !== undefined
			if (held) items = held
		},
		onDrop: (files) => {
			const check = checkFiles(files, rules)
			ondrop(check.accepted, check.rejected)
		},
	}))}
	{...rest}
>
	{@render children()}
	<div class={['ed-dropzone-veil', { 'ed-dropzone-over': over, 'ed-dropzone-refused': refusal }]} aria-hidden="true">
		<div class="ed-dropzone-card">
			<Icon name={refusal ? 'x' : 'paperclip'} />
			{#if refusal}
				<span class="ed-dropzone-title">
					{refusal === 'count' && maxFiles !== undefined ? s.dropzone.tooMany(maxFiles) : s.dropzone.notAccepted}
				</span>
			{:else}
				<span class="ed-dropzone-title">{s.dropzone.drop(items.length)}</span>
				{#if detail}<span class="ed-dropzone-detail">{detail}</span>{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.ed-dropzone {
		position: relative;
		min-width: 0;
	}

	/* The wash: over everything the zone covers, never in the pointer's way. It fades in and out on the micro
	   duration, which reduced motion keeps; the card unfurls on the panel duration, which it zeroes. */
	.ed-dropzone-veil {
		position: absolute;
		inset: 0;
		z-index: var(--ed-z-sticky);
		display: grid;
		place-items: center;
		padding: var(--space-6);
		box-sizing: border-box;
		/* the wash has corners of its own and a dashed line on its very edge, whatever shape it covers */
		border: 2px dashed var(--brand-primary);
		border-radius: var(--ed-radius-card);
		background: color-mix(in srgb, var(--brand-primary) 12%, transparent);
		pointer-events: none;
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--ed-duration-micro) var(--ed-ease-out),
			visibility 0s linear var(--ed-duration-micro);
	}
	.ed-dropzone-over {
		opacity: 1;
		visibility: visible;
		transition:
			opacity var(--ed-duration-micro) var(--ed-ease-out),
			visibility 0s;
	}
	/* A drag it cannot take: the accent would say yes, so the wash is the ink and the edge a plain stroke */
	.ed-dropzone-refused {
		border-color: var(--text-tertiary);
		background: color-mix(in srgb, var(--ed-hover-ink) 10%, transparent);
	}

	.ed-dropzone-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		max-width: 100%;
		box-sizing: border-box;
		position: relative;
		padding: var(--space-6) var(--space-8);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-0);
		box-shadow: var(--shadow-sheet);
		color: var(--brand-hover);
		text-align: center;
		transform: scale(0.98);
		transition: transform var(--ed-duration-panel) var(--ed-ease-out);
	}
	.ed-dropzone-over .ed-dropzone-card {
		transform: none;
	}
	.ed-dropzone-refused .ed-dropzone-card {
		color: var(--text-secondary);
	}
	.ed-dropzone-title {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		font-variation-settings: var(--ed-t-label-opsz);
		color: var(--text-primary);
		text-wrap: balance;
	}
	.ed-dropzone-detail {
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		color: var(--text-secondary);
	}
</style>
