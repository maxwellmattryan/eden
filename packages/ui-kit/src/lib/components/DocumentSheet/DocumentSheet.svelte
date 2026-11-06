<script module lang="ts">
	/** collect: nothing chosen yet. reading: on the device now. read: the text to check. failed: nothing to check. imported: read before. */
	export type DocumentPhase = 'collect' | 'reading' | 'read' | 'failed' | 'imported'
	/** How the read went: `poor` puts the picture first. */
	export type DocumentQuality = 'good' | 'poor'
	/** Why there is nothing to check: several files dropped, or the reader's own reason. */
	export type DocumentFailure = 'several' | 'unsupported' | 'too-large' | 'locked' | 'no-text' | 'unavailable'
	/** The file as its chip shows it. */
	export interface DocumentFile {
		name: string
		/** The quiet word after the name: "PDF · 1 page". */
		detail?: string
	}

	/** What the reader takes: PDF, JPEG, PNG and WebP. HEIC is refused, as on the composer. */
	export const DOCUMENT_ACCEPT: readonly string[] = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

	/** The failures a picture could still help with: the text could not be read, but the picture can be sent. */
	const PICTURE_HELPS: readonly DocumentFailure[] = ['no-text', 'unavailable']
</script>

<script lang="ts">
	// The document reader's sheet (D-190; docs/product/domains/finance.md, "The document reader"). A letter, statement
	// or pay stub is chosen or dropped, read on this device with its account numbers masked, and shown as text to check
	// before the caller acts on it. Where it read badly, or could not be read at all, the picture can go instead; a file
	// read before is known by its fingerprint and not read again. The sheet holds nothing of its own but the edited text
	// and whether several files were dropped: `phase` and the rest are the parent's, every act is a callback, and the
	// parent closes it. Cancel calls `oncancel`; Close, Escape and the scrim call `onclose`. On the phone the footer's
	// buttons stack full width, the primary first, and the file button offers the camera.
	import { untrack } from 'svelte'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { groupOf } from '../../files/check-files.js'
	import { platformOf } from '../../internal/platform.js'
	import Button from '../Button/Button.svelte'
	import Dropzone from '../Dropzone/Dropzone.svelte'
	import Field from '../Field/Field.svelte'
	import FileButton from '../FileButton/FileButton.svelte'
	import FileChip from '../FileChip/FileChip.svelte'
	import InlineError from '../InlineError/InlineError.svelte'
	import Notice from '../Notice/Notice.svelte'
	import Sheet, { type SheetCloseReason } from '../Sheet/Sheet.svelte'
	import Spinner from '../Spinner/Spinner.svelte'

	type Props = {
		/** Bindable. Set it to open; Escape and the scrim set it back to false. */
		open?: boolean
		/** Where the read stands; the parent moves it on. */
		phase: DocumentPhase
		/** How the read went, in the `read` phase. */
		quality?: DocumentQuality
		/** Why there is nothing to check, in the `failed` phase; in `collect`, a file refused before it was read. */
		failure?: DocumentFailure
		/** The file being read, or read. */
		file?: DocumentFile
		/** Bindable: the masked text, which the owner may edit before confirming. */
		text?: string
		/** How many runs were masked. */
		masked?: number
		/** How many pages were read of how many; the line shows only when the read was cut short. */
		pages?: { read: number; total: number }
		/** A file read before: the day it was, and what it made, both already formatted. */
		imported?: { day: string; detail: string }
		/** The caller's primary button: "Draft the bill". */
		confirmLabel: string
		/** The caller's sentence about what follows a confirm. */
		next?: string
		/** Who acts on the text, the model and the cost, as the provider line names them. */
		provider?: string
		model?: string
		cost?: string
		/** The types the zone and the picker take. */
		accept?: readonly string[]
		/** The one file dropped or chosen. Several dropped at once call nothing: the sheet says one at a time. */
		onfiles?: (files: File[]) => void
		/** The checked text, as edited. */
		onconfirm?: (text: string) => void
		onsendpicture?: () => void
		/** The Cancel button. */
		oncancel?: () => void
		/** Close on a file read before, Escape and the scrim. */
		onclose?: () => void
	}
	const uid = $props.id()
	let {
		open = $bindable(false),
		phase,
		quality = 'good',
		failure,
		file,
		text = $bindable(''),
		masked = 0,
		pages,
		imported,
		confirmLabel,
		next,
		provider,
		model,
		cost,
		accept = DOCUMENT_ACCEPT,
		onfiles,
		onconfirm,
		onsendpicture,
		oncancel,
		onclose,
	}: Props = $props()

	const s = useStrings()
	const titleId = `${uid}-title`
	const nextId = `${uid}-next`

	let body = $state<HTMLElement>()
	const stacked = $derived(!!body && platformOf(body) === 'mobile')

	// Several files dropped at once: the sheet's own refusal, cleared by the next drop or pick.
	let several = $state(false)
	const refusal = $derived<DocumentFailure | undefined>(several ? 'several' : failure)
	const words: Record<DocumentFailure, () => string> = {
		several: () => s.document.failures.several,
		unsupported: () => s.document.failures.unsupported,
		'too-large': () => s.document.failures.tooLarge,
		locked: () => s.document.failures.locked,
		'no-text': () => s.document.failures.noText,
		unavailable: () => s.document.failures.unavailable,
	}

	const badly = $derived(phase === 'read' && quality === 'poor')
	const picture = $derived(phase === 'failed' && !!failure && PICTURE_HELPS.includes(failure))
	const empty = $derived(!text.trim())
	const cut = $derived(!!pages && pages.read < pages.total)
	// the dot stays with the word before it, so a line that breaks never starts with one
	const providerLine = $derived([provider, model, cost].filter(Boolean).join(' · '))
	const glyph = $derived(file && groupOf({ name: file.name, type: '' }) === 'image' ? 'image' : 'file-text')

	function take(files: File[]) {
		several = files.length > 1
		if (files.length === 1) onfiles?.(files)
	}
	// Cancel and every close end the session, so a refusal of several files never greets the next one.
	function cancelled() {
		several = false
		oncancel?.()
	}
	// Escape and the scrim close the dialog themselves and report here; a close through `open` has been accounted for.
	function closed(reason: SheetCloseReason) {
		several = false
		if (reason !== 'api') onclose?.()
	}

	let seen: DocumentPhase | undefined
	$effect(() => {
		// effect: imperative DOM. A new phase takes the pressed control away (the file button, the drop), and the focus
		// it held would fall out of the sheet: the body takes it, so the keyboard stays where the owner is.
		const now = phase
		const was = seen
		seen = now
		const el = body
		if (was === undefined || was === now || !el || !untrack(() => open)) return
		const sheet = el.closest('dialog')
		if (sheet && !sheet.contains(document.activeElement)) el.focus({ preventScroll: true })
	})
</script>

{#snippet chip(busy: boolean)}
	{#if file}
		<FileChip name={file.name} detail={file.detail} icon={glyph} state={busy ? 'busy' : 'ready'} />
	{/if}
{/snippet}

<Sheet bind:open size="lg" labelledby={titleId} onclose={closed} class="ed-document">
	{#snippet header()}
		<h2 class="ed-document-title" id={titleId}>{s.document.title}</h2>
	{/snippet}
	<div class="ed-document-body" bind:this={body} tabindex="-1">
		{#if phase === 'collect'}
			<Dropzone {accept} ondrop={(accepted, rejected) => take([...accepted, ...rejected.map(({ file }) => file)])}>
				<div class="ed-document-zone">
					<Icon name="scan-text" size="lg" />
					<p class="ed-document-invite">{s.document.invite}</p>
					<p class="ed-document-note">{s.document.inviteHint}</p>
				</div>
			</Dropzone>
			{#if refusal}
				<InlineError message={words[refusal]()} />
			{/if}
			<div class="ed-document-choose">
				<FileButton
					label={s.document.choose}
					icon="file-text"
					{accept}
					multiple={false}
					camera
					tooltip
					onfiles={take}
				/>
			</div>
			<p class="ed-document-note">{s.document.onDevice}</p>
		{:else if phase === 'reading'}
			<div class="ed-document-file" role="status">
				{@render chip(true)}
				<span class="ed-document-reading"><Spinner size="sm" label={s.loading} /> {s.document.reading}</span>
			</div>
		{:else}
			<div class="ed-document-file">{@render chip(false)}</div>
			{#if phase === 'imported'}
				<Notice tone="info" title={s.document.importedOn(imported?.day ?? '')} detail={imported?.detail} />
			{:else if phase === 'failed'}
				{#if refusal}
					<InlineError message={words[refusal]()} />
				{/if}
			{:else}
				{#if badly}
					<InlineError message={s.document.readBadly} />
				{/if}
				<div class="ed-document-text">
					<Field label={s.document.textLabel} multiline rows={8} mono bind:value={text} />
					{#if masked > 0}
						<p class="ed-document-note">{s.document.masked(masked)}</p>
					{/if}
					{#if cut && pages}
						<p class="ed-document-note">{s.document.cutShort(pages.read, pages.total)}</p>
					{/if}
				</div>
				{#if next || providerLine}
					<section class="ed-document-next" aria-labelledby={nextId}>
						<h3 class="ed-document-next-title" id={nextId}>{s.document.nextTitle}</h3>
						{#if next}
							<p class="ed-document-next-body">{next}</p>
						{/if}
						{#if providerLine}
							<p class="ed-document-note">{providerLine}</p>
						{/if}
					</section>
				{/if}
			{/if}
		{/if}
	</div>
	{#snippet footer()}
		{@const send = { label: s.document.sendPicture, onclick: () => onsendpicture?.() }}
		{@const confirm = { label: confirmLabel, disabled: empty, onclick: () => !empty && onconfirm?.(text) }}
		{@const cancel = { label: s.cancel, onclick: cancelled }}
		<div class={['ed-document-actions', { 'ed-document-stacked': stacked }]}>
			{#if phase === 'imported'}
				<Button label={s.close} variant="primary" onclick={() => onclose?.()} />
			{:else if phase === 'read'}
				{@const primary = badly ? send : confirm}
				{@const secondary = badly ? confirm : send}
				{#if stacked}
					<!-- the phone stacks them full width, the primary first -->
					<Button {...primary} variant="primary" />
					<Button {...secondary} variant="secondary" />
					<Button {...cancel} variant="quiet" />
				{:else}
					<Button {...secondary} variant="secondary" />
					<Button {...cancel} variant="quiet" />
					<Button {...primary} variant="primary" />
				{/if}
			{:else if picture}
				{#if stacked}
					<Button {...send} variant="primary" />
					<Button {...cancel} variant="quiet" />
				{:else}
					<Button {...cancel} variant="quiet" />
					<Button {...send} variant="primary" />
				{/if}
			{:else}
				<Button {...cancel} variant="quiet" />
			{/if}
		</div>
	{/snippet}
</Sheet>

<style>
	.ed-document-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.ed-document-body {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-3);
		outline: none;
	}
	.ed-document-file {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.ed-document-zone {
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
	.ed-document-invite {
		margin: 0;
		font: var(--ed-t-text);
		color: var(--text-primary);
	}
	.ed-document-choose {
		display: flex;
		justify-content: center;
	}
	.ed-document-note {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.ed-document-reading {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font: var(--ed-t-body-sm);
	}
	.ed-document-text,
	.ed-document-next {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.ed-document-next-title {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
	}
	.ed-document-next-body {
		margin: 0;
		font: var(--ed-t-body-sm);
	}
	.ed-document-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2);
		width: 100%;
	}
	.ed-document-stacked {
		flex-direction: column;
		align-items: stretch;
	}
</style>
