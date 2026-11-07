// The document reader's session (D-190; product/domains/finance.md, "The document reader"): the state behind the kit's
// `DocumentSheet`. A caller asks `documentRead.read(options)`; the sheet opens; the file the owner drops or chooses is
// fingerprinted, checked against the caller's `known`, and read on this device with its numbers masked; the promise
// settles once, with the checked text, the picture, or nothing. The bytes stay in memory and are let go when it
// settles. Nothing here sends anything anywhere: the caller decides what the choice becomes.
import type { DocumentFailure, DocumentFile, DocumentPhase, DocumentQuality } from '@eden/ui-kit'
import { fingerprint, readDocument } from './read.js'
import {
	canSendPicture,
	choiceOf,
	mimeOf,
	phaseOf,
	refuses,
	type DocumentChoice,
	type DocumentOutcome,
	type HeldDocument,
	type ReadOptions,
} from './reader.js'

export class DocumentRead {
	open = $state(false)
	phase = $state<DocumentPhase>('collect')
	quality = $state<DocumentQuality>('good')
	failure = $state<DocumentFailure | undefined>()
	file = $state<DocumentFile | undefined>()
	/** The masked text, as the owner edits it in the sheet. */
	text = $state('')
	masked = $state(0)
	pages = $state<{ read: number; total: number } | undefined>()
	imported = $state<{ day: string; detail: string } | undefined>()
	/** What the caller asked for: the confirm label, the sentence about what follows, the provider line. */
	options = $state<ReadOptions | undefined>()

	#held: HeldDocument | undefined
	#settle: ((choice: DocumentChoice | undefined) => void) | undefined
	/** Bumped whenever a read stops mattering, so an answer that comes after Cancel is dropped. */
	#generation = 0

	/** Opens the sheet; resolves once, with the checked text, the picture, or `undefined` for Cancel and Close. */
	read(options: ReadOptions): Promise<DocumentChoice | undefined> {
		// a session still open is given up first: its caller hears nothing chosen
		this.#finish(undefined)
		this.phase = 'collect'
		this.quality = 'good'
		this.failure = undefined
		this.file = undefined
		this.text = ''
		this.masked = 0
		this.pages = undefined
		this.imported = undefined
		this.options = options
		this.open = true
		return new Promise((resolve) => {
			this.#settle = resolve
		})
	}

	/** The files the sheet was given: one is read; several, a refused type or size, say why in the collect step. */
	async take(files: File[]): Promise<void> {
		if (!this.open || this.phase !== 'collect' || files.length === 0) return
		this.failure = refuses(files)
		if (this.failure) return
		const file = files[0]!
		const mime = mimeOf(file)
		const generation = ++this.#generation
		this.file = { name: file.name }
		this.phase = 'reading'
		try {
			const bytes = new Uint8Array(await file.arrayBuffer())
			const print = await fingerprint(bytes)
			if (generation !== this.#generation) return
			this.#held = { bytes, fingerprint: print, name: file.name, mime }
			const known = await this.options?.known?.(print)
			if (generation !== this.#generation) return
			if (known) {
				this.imported = known
				this.phase = 'imported'
				return
			}
			this.#apply(await readDocument(bytes, mime), generation)
		} catch {
			// the reader could not answer (a broken file, a lost call): nothing of the document is logged
			this.#apply({ outcome: 'failed', reason: 'no-text' }, generation)
		}
	}

	/** The text as checked: the field's current text, never blank. */
	confirm(text: string = this.text): void {
		if (this.phase !== 'read' || !this.#held || !text.trim()) return
		this.#finish(choiceOf('text', this.#held, text))
	}

	/** The picture instead: after any read, or a failure a picture can help with. */
	sendPicture(): void {
		const allowed = this.phase === 'read' || (this.phase === 'failed' && canSendPicture(this.failure))
		if (!allowed || !this.#held) return
		this.#finish(choiceOf('picture', this.#held))
	}

	/** Cancel, Close, or the sheet dismissed: nothing chosen. */
	cancel(): void {
		this.#finish(undefined)
	}

	/** A read's answer, unless the session it belongs to has ended or moved on. */
	#apply(outcome: DocumentOutcome, generation: number): void {
		if (generation !== this.#generation || !this.open) return
		const next = phaseOf(outcome)
		this.phase = next.phase
		this.quality = next.quality ?? 'good'
		this.failure = next.failure
		if (outcome.outcome === 'read') {
			this.text = outcome.text
			this.masked = outcome.masked
			this.pages = { read: outcome.pagesRead, total: outcome.pages }
		}
	}

	#finish(choice: DocumentChoice | undefined): void {
		const settle = this.#settle
		this.#settle = undefined
		this.#generation++
		this.#held = undefined
		this.text = ''
		this.open = false
		settle?.(choice)
	}
}

/** The one session both apps' views bind `DocumentSheet` to. */
export const documentRead = new DocumentRead()
