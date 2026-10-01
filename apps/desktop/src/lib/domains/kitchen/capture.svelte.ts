// Capture a haul (product/domains/kitchen.md, "Capture a haul"; D-13, D-86): the state behind the capture sheet. The
// owner brings what they have of a shop (photos of the groceries, receipts, an order confirmation as a PDF, a
// screenshot, an email or pasted text); the sheet names who will read them and what it costs; Read sends them all in
// one request (`capture-haul`, run without a conversation); the rows come back to be edited; Commit writes the stock.
// Nothing is stored before Commit: the files wait in memory (`StagedSources`), and closing the sheet lets them go.
// The same sheet takes stock (D-89): photos of the shelves as they stand, read as what is there now. Either way, an
// item seen in a photo gets a picture cut from it (D-90), shown on its row and kept with the item. A haul read from
// a receipt or an order names its store and prices its rows; the store, once the owner has checked it, learns them.
import { get } from 'svelte/store'
import { logError } from '@eden/shared/api'
import { newId, readAttachment, toUri } from '@eden/shared/data'
import { remerge, storeNamed, type CaptureMode, type HaulRow } from '@eden/shared/domains/kitchen'
import { attachmentForm, type DraftCard } from '@eden/shared/gardener'
import { t } from '@eden/shared/i18n'
import { threadAttachments } from '$lib/shell/gardener/attachments.svelte'
import type { DirectPreview } from '$lib/shell/gardener/runtime.svelte'
import type { ToolFailure } from '$lib/shell/gardener/types'
import { undoToast } from '$lib/shell/undo'
import { cutPicture, StagedSources } from './staging.svelte.js'
import { kitchen, type HaulImage } from './store.svelte.js'

export type CapturePhase = 'collect' | 'reading' | 'rows' | 'failed'

const TOOL = 'kitchen.capture-haul'

export class HaulCapture {
	open = $state(false)
	phase = $state<CapturePhase>('collect')
	/** What is being read: a shop just brought home, or the shelves as they stand. */
	mode = $state<CaptureMode>('haul')
	rows = $state<HaulRow[]>([])
	/** The shop the sources name, as printed; the store of the owner's it was bought at, which learns the prices
	 * (D-105); and the day on the receipt, as an ISO date. */
	storeRead = $state<string>()
	storeId = $state<string>()
	boughtOn = $state<string>()
	/** Why the last read did not answer. */
	failure = $state<ToolFailure | undefined>()
	/** Who would read the sources and roughly what it would cost; absent until it has been worked out. */
	preview = $state<DirectPreview | undefined>()
	/** What the owner brought of the shop. */
	readonly staging = new StagedSources(() => void this.#refresh())

	#settle: ((state: 'committed' | 'discarded') => void) | undefined
	#previewing = 0

	/** Whether Read can be pressed: something is staged, all of it measured, and a model can take it. */
	readonly ready = $derived(
		this.staging.sources.length > 0 && this.staging.settled && !!this.preview && 'provider' in this.preview
	)

	/** Opens the sheet, on the files it is given when it is opened by a drop or a paste. */
	start(files: File[] = [], mode: CaptureMode = 'haul'): void {
		if (!this.open) this.#reset()
		this.mode = mode
		this.open = true
		void kitchen.load()
		if (files.length) void this.add(files)
		else void this.#refresh()
	}

	/** Stages more files, from the sheet's own drop zone, its picker or a paste. */
	async add(files: File[]): Promise<void> {
		if (this.phase !== 'collect' && this.phase !== 'failed') return
		this.phase = 'collect'
		await this.staging.add(files)
	}

	addText(text: string, name: string): void {
		if (this.phase !== 'collect' && this.phase !== 'failed') return
		this.phase = 'collect'
		this.staging.addText(text, name)
	}

	remove(key: string): void {
		this.staging.remove(key)
	}

	/** Works out again who would read the sources and what it would cost; the latest call wins. */
	async #refresh(): Promise<void> {
		const turn = ++this.#previewing
		try {
			const { runtime } = await import('$lib/shell/gardener/runtime.svelte')
			const preview = await runtime.previewDirect(TOOL, { mode: this.mode }, { files: this.staging.files() })
			if (turn === this.#previewing) this.preview = preview
		} catch (error) {
			if (turn === this.#previewing) this.preview = { unavailable: 'unavailable' }
			void logError('gardener', 'The capture preview failed', String(error)).catch(() => null)
		}
	}

	/** Sends the sources, all in one request, and shows the rows that come back. Pressing Read is the consent (D-86). */
	async read(): Promise<void> {
		if (!this.ready || this.phase === 'reading') return
		this.phase = 'reading'
		this.failure = undefined
		const { runtime } = await import('$lib/shell/gardener/runtime.svelte')
		const result = await runtime.runDirect(TOOL, { mode: this.mode }, { files: this.staging.files(), confirmed: true })
		// the owner closed the sheet while it was read: there is nothing to show the answer on
		if (!this.open || this.phase !== 'reading') return
		if (result.card?.kind === 'capture') {
			this.rows = result.card.rows as HaulRow[]
			this.#bought(result.card)
			this.phase = 'rows'
			void this.#picture()
			return
		}
		if (result.failure === 'cancelled') {
			this.phase = 'collect'
			return
		}
		this.failure = result.failure ?? 'network'
		this.phase = 'failed'
		void this.#refresh()
	}

	/**
	 * Cuts each row's picture from the photo it was seen in, one photo at a time, as the rows are being checked. A row
	 * the owner removed meanwhile is passed over; a photo that will not decode leaves its rows without one.
	 */
	async #picture(): Promise<void> {
		const turn = this.#previewing
		// each photo is read once, however many rows were seen in it
		const photos: Record<number, Blob | undefined> = {}
		for (const { id, seen } of $state.snapshot(this.rows) as HaulRow[]) {
			if (!seen) continue
			if (!(seen.file in photos)) photos[seen.file] = await this.#photo(seen.file)
			const photo = photos[seen.file]
			const image = photo ? await cutPicture(photo, seen.box) : undefined
			// the sheet was closed, or opened on something else, while the photo was being cut
			if (turn !== this.#previewing) return
			if (image) this.rows = this.rows.map((row) => (row.id === id ? { ...row, image } : row))
		}
	}

	/** The photo a row names, counted from 1 among the sources: its bytes when it is an image, here or in the workspace. */
	async #photo(file: number): Promise<Blob | undefined> {
		const source = this.staging.sources[file - 1]
		if (!source || attachmentForm(source.mime) !== 'image') return undefined
		if (!source.stored) return source.file
		const bytes = await readAttachment(source.stored).catch(() => null)
		return bytes ? new Blob([bytes as Uint8Array<ArrayBuffer>], { type: source.mime }) : undefined
	}

	/** Stops the read; the sources stay staged. */
	async stop(): Promise<void> {
		const { runtime } = await import('$lib/shell/gardener/runtime.svelte')
		await runtime.cancel()
	}

	/**
	 * Changes a row. A change of what the merge is worked out from (the name, the brand, the place, the amount) works it out
	 * again; the merge's own switch is the owner's choice and is kept as given.
	 */
	edit(id: string, patch: Partial<Omit<HaulRow, 'merge'>> & { merge?: { on: boolean } }): void {
		this.rows = this.rows.map((row) => {
			if (row.id !== id) return row
			const { merge, ...fields } = patch
			const next: HaulRow = { ...row, ...fields }
			if ('expiry' in fields && !fields.expiry) {
				delete next.expiry
				delete next.estimated
			}
			if (merge && row.merge) return { ...next, merge: { ...row.merge, on: merge.on } }
			const moved = 'name' in fields || 'brand' in fields || 'location' in fields || 'qty' in fields || 'unit' in fields
			return moved ? remerge(next, kitchen.stock) : next
		})
	}

	addRow(): void {
		this.rows = [...this.rows, { id: newId(), name: '', qty: '1', location: 'pantry' }]
	}

	removeRow(id: string): void {
		this.rows = this.rows.filter((row) => row.id !== id)
	}

	/** Writes the rows to the stock with the photos they were read from, and closes; the toast carries the undo. */
	commit(): void {
		const rows = ($state.snapshot(this.rows) as HaulRow[]).filter((row) => row.name.trim())
		if (!rows.length) return
		const images: HaulImage[] = this.staging.sources
			.filter((source) => !source.stored && attachmentForm(source.mime) === 'image')
			.map((source) => ({
				file: source.file,
				name: source.name,
				mime: source.mime,
				thumbnail: source.thumbnail,
				width: source.width,
				height: source.height,
			}))
		const linked = this.staging.sources.flatMap((source) => (source.stored ? [toUri('attachment', source.stored)] : []))
		const from = this.storeId ? { storeId: this.storeId, boughtOn: this.boughtOn } : undefined
		const { created, merged, undo } = kitchen.commitHaul(rows, images, linked, this.mode, from)
		if (created + merged > 0) {
			const key =
				this.mode === 'stock' ? 'domains.kitchen.capture.toast.taken' : 'domains.kitchen.capture.toast.committed'
			undoToast(get(t)(key, { values: { count: created + merged } }), undo)
		}
		this.#settle?.('committed')
		this.close()
	}

	/**
	 * Opens the sheet on rows the Gardener drafted in a conversation: the files are the message's, already in the
	 * workspace, and the rows are checked against the stock as it is now. Committing settles the draft's card; closing
	 * leaves the card as it was, to be opened again.
	 */
	async fromDraft(
		card: Extract<DraftCard, { kind: 'capture' }>,
		settle: (state: 'committed' | 'discarded') => void
	): Promise<void> {
		await kitchen.load()
		this.#reset()
		this.mode = card.mode ?? 'haul'
		this.#settle = settle
		this.staging.sources = (card.sources ?? []).map((source) => ({
			key: source.id,
			stored: source.id,
			name: source.name,
			mime: source.mime,
			size: 0,
			file: new Blob(),
			busy: false,
			thumbnail: threadAttachments.thumbnail(source.id),
		}))
		this.rows = card.rows.map((row) => remerge(row as HaulRow, kitchen.stock))
		this.#bought(card)
		this.phase = 'rows'
		this.open = true
		void this.#picture()
	}

	/** Closes the sheet and lets the draft go: the files, the rows, whatever was being read. */
	close(): void {
		if (this.phase === 'reading') void this.stop()
		this.open = false
		this.#reset()
	}

	/** Takes where and when the haul was bought from what was read: the store of the owner's the name finds, if any. */
	#bought(card: { store?: string; boughtOn?: string }): void {
		this.storeRead = card.store
		this.storeId = card.store ? storeNamed(card.store, kitchen.grocery.stores)?.id : undefined
		this.boughtOn = card.boughtOn
	}

	/** The owner's own choice of the store the haul was bought at; none is no store, and no prices are kept. */
	setStore(id: string | undefined): void {
		this.storeId = id
	}

	#reset(): void {
		this.#previewing += 1
		this.storeRead = undefined
		this.storeId = undefined
		this.boughtOn = undefined
		this.#settle = undefined
		this.phase = 'collect'
		this.mode = 'haul'
		this.staging.clear()
		this.rows = []
		this.failure = undefined
		this.preview = undefined
	}
}

export const capture = new HaulCapture()
