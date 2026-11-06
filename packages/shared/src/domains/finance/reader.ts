// The document reader's rules (D-190; product/domains/finance.md, "The document reader"): which file may be read, how
// a read's outcome sets the sheet, and what a session hands its caller. Pure, so they are tested apart from the
// session (`reader.svelte.ts`) and the crate's `read_document` (src-tauri/src/domains/finance).
import type { DocumentFailure, DocumentPhase, DocumentQuality } from '@eden/ui-kit'
import { attachmentForm, attachmentMime, maxBytesFor } from '../../gardener/attachment-limits.js'
import type { DirectPreview } from '../../shell/gardener/types.js'

/** Why the crate could not read a file: the reasons `read_document` answers with. */
export type ReaderFailure = Exclude<DocumentFailure, 'several'>

/** What `read_document` answers: the text, already masked, or why there is none. */
export type DocumentOutcome =
	| {
			outcome: 'read'
			text: string
			/** How many runs were masked. */
			masked: number
			source: 'text-layer' | 'recognized'
			pages: number
			pagesRead: number
			quality: DocumentQuality
	  }
	| { outcome: 'failed'; reason: ReaderFailure }

/** What a session hands its caller: the checked text, or the picture the owner chose to send instead. */
export type DocumentChoice =
	| { kind: 'text'; text: string; fingerprint: string; name: string; mime: string }
	| { kind: 'picture'; bytes: Uint8Array; fingerprint: string; name: string; mime: string }

/** What a caller (#78's bills, #74's statements) asks the reader for. */
export interface ReadOptions {
	/** The sheet's primary button: "Draft the bill". */
	confirmLabel: string
	/** The sentence about what follows a confirm. */
	next: string
	/** Whether this file was read before, by its fingerprint: the day it was and what it made, both formatted. */
	known?: (fingerprint: string) => Promise<{ day: string; detail: string } | undefined>
	/** Who would act on the text and what it would cost, for the provider line. */
	preview?: DirectPreview
}

/** A file as the session holds it while the sheet is open: in memory only. */
export interface HeldDocument {
	bytes: Uint8Array
	fingerprint: string
	name: string
	mime: string
}

/** What the reader takes: PDF, JPEG, PNG and WebP. HEIC is refused, as on the composer. */
export const READ_ACCEPT: readonly string[] = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

/** The type a file is read as: by its extension first, as an attachment is, else as the engine gave it. */
export function mimeOf(file: Pick<File, 'name' | 'type'>): string {
	return attachmentMime(file.name, file.type)
}

/** Why the files cannot be read, before any is: several at once, a type the reader does not take, or too large. */
export function refuses(files: readonly Pick<File, 'name' | 'type' | 'size'>[]): DocumentFailure | undefined {
	if (files.length > 1) return 'several'
	const [file] = files
	if (!file) return undefined
	const mime = mimeOf(file)
	if (attachmentForm(mime) === 'text' || !READ_ACCEPT.includes(mime)) return 'unsupported'
	return file.size > maxBytesFor(mime) ? 'too-large' : undefined
}

/** Where a read leaves the sheet: the text to check, read well or badly, or the failure in its own words. */
export function phaseOf(outcome: DocumentOutcome): {
	phase: Extract<DocumentPhase, 'read' | 'failed'>
	quality?: DocumentQuality
	failure?: ReaderFailure
} {
	return outcome.outcome === 'read'
		? { phase: 'read', quality: outcome.quality }
		: { phase: 'failed', failure: outcome.reason }
}

/** Whether a failure leaves the picture worth sending: the text could not be read, but the picture can go. */
export function canSendPicture(failure: DocumentFailure | undefined): boolean {
	return failure === 'no-text' || failure === 'unavailable'
}

/** What the caller gets for a confirm (the text as edited) or for "Send the picture instead" (the bytes). */
export function choiceOf(kind: DocumentChoice['kind'], held: HeldDocument, text = ''): DocumentChoice {
	const { fingerprint, name, mime } = held
	return kind === 'text'
		? { kind, text, fingerprint, name, mime }
		: { kind, bytes: held.bytes, fingerprint, name, mime }
}
