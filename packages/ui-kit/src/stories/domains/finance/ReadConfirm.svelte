<script lang="ts">
	// Orchard's read-and-confirm sheet (product/domains/finance.md §6, D-190): a letter, statement or pay stub is read
	// on this device, its account numbers masked to their last four digits, and shown as text to check before the
	// Gardener drafts anything from it. Where the reading went badly the owner may send the picture instead. A file
	// read before is known by its fingerprint (D-189) and is not read again. Nothing is saved until the owner confirms
	// the draft. Story-only.
	import {
		Button,
		Dropzone,
		Field,
		FileButton,
		FileChip,
		Icon,
		InlineError,
		Notice,
		Sheet,
		Spinner,
		type Platform,
	} from '$lib/index.js'
	import { platformOf } from '$lib/internal/platform.js'
	import { dayLabel } from './OrchardPage.svelte'
	import { orchardLetter } from '../../sample-data.js'

	type Props = {
		/** collect: nothing chosen yet; reading: on the device now; read and read-badly: the text to check; imported: a file read before. */
		phase?: 'collect' | 'reading' | 'read' | 'read-badly' | 'imported'
		onfiles?: (files: File[]) => void
		/** Draft the bill from the checked text. */
		onconfirm?: (text: string) => void
		/** Send the picture to the model instead of the text. */
		onsendpicture?: () => void
		oncancel?: () => void
		onclose?: () => void
	}
	let { phase = 'collect', onfiles, onconfirm, onsendpicture, oncancel, onclose }: Props = $props()

	const uid = $props.id()
	const ACCEPT = ['application/pdf', 'image/*']
	// svelte-ignore state_referenced_locally
	let text = $state(phase === 'read-badly' ? orchardLetter.garbled : orchardLetter.text)
	let body = $state<HTMLElement>()
	const platform = $derived<Platform>(body ? platformOf(body) : 'desktop')
	const badly = $derived(phase === 'read-badly')
	const checking = $derived(phase === 'read' || phase === 'read-badly')
</script>

<Sheet open size="lg" labelledby="{uid}-title" onclose={() => onclose?.()}>
	{#snippet header()}
		<h2 class="title" id="{uid}-title">Read a document</h2>
	{/snippet}
	<div class="body" bind:this={body}>
		{#if phase === 'collect'}
			<Dropzone accept={ACCEPT} ondrop={(accepted) => accepted.length > 0 && onfiles?.(accepted)}>
				<div class="zone">
					<Icon name="scan-text" size="lg" />
					<p class="invite">Drop a letter, statement or pay stub</p>
					<p class="note">PDF or a picture</p>
				</div>
			</Dropzone>
			<div class="choose">
				<FileButton
					label="Choose a file"
					icon="file-text"
					accept={ACCEPT}
					camera
					tooltip
					onfiles={(files) => onfiles?.(files)}
				/>
			</div>
			<p class="note">It is read on this device. Nothing leaves it until you confirm.</p>
		{:else if phase === 'reading'}
			<div class="file" role="status">
				<FileChip name={orchardLetter.file} detail={orchardLetter.detail} icon="file-text" state="busy" />
				<span class="reading"><Spinner size="sm" label="Reading" /> Reading on this device</span>
			</div>
		{:else}
			<div class="file">
				<FileChip name={orchardLetter.file} detail={orchardLetter.detail} icon="file-text" />
			</div>
			{#if phase === 'imported'}
				<Notice
					tone="info"
					title="You read this letter on {dayLabel(orchardLetter.importedOn)}"
					detail="It made {orchardLetter.madeBill}."
				/>
			{:else}
				{#if badly}
					<InlineError message="Parts of this letter read badly. Check the text, or send the picture instead." />
				{/if}
				<div class="text">
					<Field label="Text read from the letter" multiline rows={8} mono bind:value={text} />
					<p class="note">{orchardLetter.masked} numbers masked to their last four digits</p>
				</div>
				<section class="next" aria-labelledby="{uid}-next">
					<h3 class="next-title" id="{uid}-next">What happens next</h3>
					<p class="next-body">
						The Gardener drafts a bill from this text. Nothing is saved until you confirm the draft.
					</p>
					<p class="note">{orchardLetter.provider} · {orchardLetter.cost}</p>
				</section>
			{/if}
		{/if}
	</div>
	{#snippet footer()}
		{#if phase === 'imported'}
			<Button label="Close" variant="primary" onclick={() => onclose?.()} />
		{:else if checking}
			{@const send = { label: 'Send the picture instead', onclick: () => onsendpicture?.() }}
			{@const draft = { label: 'Draft the bill', onclick: () => onconfirm?.(text) }}
			<div class={['actions', { stacked: platform === 'mobile' }]}>
				{#if platform === 'mobile'}
					<!-- the phone stacks them full width, the primary first -->
					<Button {...badly ? send : draft} variant="primary" />
					<Button {...badly ? draft : send} variant="secondary" />
					<Button label="Cancel" variant="quiet" onclick={() => oncancel?.()} />
				{:else}
					<Button {...badly ? draft : send} variant="secondary" />
					<Button label="Cancel" variant="quiet" onclick={() => oncancel?.()} />
					<Button {...badly ? send : draft} variant="primary" />
				{/if}
			</div>
		{:else}
			<Button label="Cancel" variant="quiet" onclick={() => oncancel?.()} />
		{/if}
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.body {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-3);
	}
	.file {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-8) var(--space-4);
		border: 1px dashed var(--stroke);
		border-radius: var(--ed-radius-card);
		color: var(--text-secondary);
		text-align: center;
	}
	.invite {
		margin: 0;
		font: var(--ed-t-text);
		color: var(--text-primary);
	}
	.choose {
		display: flex;
		justify-content: center;
	}
	.note {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.reading {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font: var(--ed-t-body-sm);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.next {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.next-title {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
	}
	.next-body {
		margin: 0;
		font: var(--ed-t-body-sm);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2);
		width: 100%;
	}
	.stacked {
		flex-direction: column;
		align-items: stretch;
	}
</style>
