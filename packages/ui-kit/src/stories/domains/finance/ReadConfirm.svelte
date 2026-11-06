<script lang="ts">
	// Orchard's read-and-confirm sheet (product/domains/finance.md §6, D-190): the kit's DocumentSheet with Orchard's
	// letter. A letter, statement or pay stub is read on this device, its account numbers masked to their last four
	// digits, and shown as text to check before the Gardener drafts anything from it. Where the reading went badly the
	// owner may send the picture instead. A file read before is known by its fingerprint (D-189) and is not read again.
	// Nothing is saved until the owner confirms the draft. Story-only.
	import { DocumentSheet } from '$lib/index.js'
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

	// svelte-ignore state_referenced_locally
	let text = $state(phase === 'read-badly' ? orchardLetter.garbled : orchardLetter.text)
</script>

<DocumentSheet
	open
	phase={phase === 'read-badly' ? 'read' : phase}
	quality={phase === 'read-badly' ? 'poor' : 'good'}
	file={{ name: orchardLetter.file, detail: orchardLetter.detail }}
	bind:text
	masked={orchardLetter.masked}
	imported={{ day: dayLabel(orchardLetter.importedOn), detail: `It made ${orchardLetter.madeBill}.` }}
	confirmLabel="Draft the bill"
	next="The Gardener drafts a bill from this text. Nothing is saved until you confirm the draft."
	provider={orchardLetter.provider}
	cost={orchardLetter.cost}
	{onfiles}
	{onconfirm}
	{onsendpicture}
	{oncancel}
	{onclose}
/>
