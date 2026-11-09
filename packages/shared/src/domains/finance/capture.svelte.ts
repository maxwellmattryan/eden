// Capture a bill (product/domains/finance.md §6, "A bill, from letter to paid"; D-189, D-190): the session behind the
// bill form's Drafting state. It opens the document reader with the provider line and the file's earlier import, and
// on the owner's confirm (the consent, D-86) runs `finance.draft` from the page with the checked text, or with the
// picture passed in memory: nothing is written to `attachments/`, and the bytes are let go when the run settles. The
// answer fills the form, as an update of the live bill of the same payee and period when there is one. A draft card
// from a conversation opens the same form (`openDraft`) and settles when the owner saves or cancels it there.
import { get } from 'svelte/store'
import { logError } from '../../api/index.js'
import { queryEntities } from '../../data/index.js'
import type { AttachmentBlock } from '../../gardener/index.js'
import { t } from '../../i18n/index.js'
import { settings } from '../../settings/index.js'
import { toSend } from '../../shell/gardener/files.js'
import type { DirectPreview, ToolFailure, ToolFiles } from '../../shell/gardener/types.js'
import type { BillDraft } from './bills.js'
import { captureTarget, draftFor, type CaptureHow } from './insurance.js'
import type { DocumentChoice } from './reader.js'
import { documentRead } from './reader.svelte.js'
import { finance } from './store.svelte.js'
import { FILE_IMPORT_SOURCE, FINANCE, type DocumentImportPayload } from './types.js'
import { dayLine } from './words.js'

const TOOL = 'finance.draft'

/** A period's month as the owner says it: "September". */
export function monthName(period: string, lang: string): string {
	const [year, month] = period.split('-').map(Number)
	return new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(year!, month! - 1, 1))
}

/** The picture the owner chose to send, as a tool's files: one block, its id and hash the file's fingerprint. */
export function pictureFiles(choice: Extract<DocumentChoice, { kind: 'picture' }>): ToolFiles {
	let bytes: Uint8Array | undefined = choice.bytes
	const block: AttachmentBlock = {
		kind: 'attachment',
		id: choice.fingerprint,
		name: choice.name,
		mime: choice.mime,
		size: choice.bytes.byteLength,
		hash: choice.fingerprint,
	}
	return {
		blocks: [block],
		read: async (asked) => {
			if (asked.id !== block.id || !bytes) return undefined
			const sent = await toSend(bytes, asked)
			// read once, when the request is sent: the bytes go with it and are not kept here
			bytes = undefined
			return sent
		},
	}
}

/**
 * Whether a document was read on this device before, by its fingerprint: the day, and what it made in the owner's
 * words (a letter's bill, or a pay stub's deductions, #85), or that it is gone. Shared by the bill capture and the
 * pay stub reader, so a document is read once whichever of them reads it.
 */
export async function knownDocument(fingerprint: string): Promise<{ day: string; detail: string } | undefined> {
	const [row] = await queryEntities<DocumentImportPayload>({
		type: FINANCE.fileImport,
		source: FILE_IMPORT_SOURCE,
		externalIds: [fingerprint],
	}).catch(() => [])
	if (!row) return undefined
	const tr = get(t)
	const lang = settings.language
	const day = dayLine(row.payload.day, lang)
	if (row.payload.kind === 'pay-stub') {
		const source = finance.incomeById(row.payload.sourceId)
		return {
			day,
			detail: source
				? tr('domains.finance.payStub.known', { values: { employer: source.name } })
				: tr('domains.finance.payStub.knownGone'),
		}
	}
	const bill = finance.billById(row.payload.billId)
	return {
		day,
		detail: bill
			? tr('domains.finance.bills.capture.madeBill', {
					values: { payee: bill.payee, month: monthName(bill.period, lang) },
				})
			: tr('domains.finance.bills.capture.deletedBill'),
	}
}

/** What the form says of the live bill a draft lands on: "Updates the Austin Energy bill for September". */
export interface CaptureNote {
	how: CaptureHow
	payee: string
	month: string
	insurer?: string
}

class BillCapture {
	/** The bill form is open on a capture or a Gardener's card. */
	open = $state(false)
	phase = $state<'drafting' | 'form' | 'failed'>('form')
	/** Why there is no draft; `nothing-owed` for an EOB that leaves nothing to pay (#85). */
	failure = $state<ToolFailure | 'nothing-owed' | undefined>()
	/** What fills the form; none for the empty form. */
	draft = $state<BillDraft | undefined>()
	/** The live bill the draft lands on, and how (`captureTarget`). */
	note = $state<CaptureNote | undefined>()
	/** The fingerprint of the letter the form came from, for its `file-import` row. */
	fingerprint = $state<string | undefined>()
	/** Bumped when the form is opened again, made by hand or let go, so a run that answers late is dropped. */
	opened = $state(0)

	#settle: ((state: 'committed' | 'discarded') => void) | undefined
	#turn = 0

	/** Opens the reader, then drafts the bill from what the owner confirms. Cancel at any step writes nothing. */
	async start(): Promise<void> {
		const { runtime } = await import('../../shell/gardener/runtime.svelte.js')
		const preview = await runtime
			.previewDirect(TOOL, { text: 'bill' })
			.catch((): DirectPreview => ({ unavailable: 'unavailable' }))
		const tr = get(t)
		const choice = await documentRead.read({
			confirmLabel: tr('domains.finance.bills.capture.confirm'),
			next: tr('domains.finance.bills.capture.next'),
			preview,
			known: knownDocument,
		})
		if (!choice) return
		this.#begin(undefined)
		this.fingerprint = choice.fingerprint
		this.phase = 'drafting'
		const turn = this.#turn
		try {
			const result =
				choice.kind === 'text'
					? await runtime.runDirect(TOOL, { text: choice.text }, { confirmed: true })
					: await runtime.runDirect(TOOL, {}, { files: pictureFiles(choice), confirmed: true })
			if (turn !== this.#turn || !this.open) return
			if (result.card?.kind === 'bill') return this.#fill(result.card.bill)
			const status = (result.output as { status?: unknown } | undefined)?.status
			this.failure = status === 'nothing-owed' ? 'nothing-owed' : (result.failure ?? 'network')
			this.phase = 'failed'
		} catch (error) {
			if (turn !== this.#turn) return
			void logError('gardener', 'A bill could not be drafted', String(error)).catch(() => null)
			this.failure = 'network'
			this.phase = 'failed'
		}
	}

	/** A Gardener's card from a conversation: the form opens on it, and the card settles when it is saved or not. */
	openDraft(draft: BillDraft, settle: (state: 'committed' | 'discarded') => void): void {
		this.#begin(settle)
		this.#fill(draft)
	}

	/** "Enter it by hand": the empty form, the letter still the one it came from. */
	byHand(): void {
		this.#turn += 1
		this.draft = undefined
		this.note = undefined
		this.failure = undefined
		this.phase = 'form'
		this.opened += 1
	}

	/** Cancel, Close: nothing is written, so the same file can be read again. A run still going is stopped. */
	async cancel(): Promise<void> {
		const drafting = this.phase === 'drafting'
		this.#settle?.('discarded')
		this.#reset()
		if (drafting) {
			const { runtime } = await import('../../shell/gardener/runtime.svelte.js')
			await runtime.cancel()
		}
	}

	/** The bill was saved from the form. */
	saved(): void {
		this.#settle?.('committed')
		this.#reset()
	}

	#begin(settle: ((state: 'committed' | 'discarded') => void) | undefined) {
		// a form still open from an earlier card is given up first: its card hears nothing kept
		this.#settle?.('discarded')
		this.#reset()
		this.#settle = settle
		this.open = true
		this.opened += 1
	}

	#fill(draft: BillDraft) {
		const target = captureTarget(draft, finance.bills)
		this.draft = target ? draftFor(target, draft) : draft
		this.note = target
			? {
					how: target.how,
					payee: target.bill.payee,
					month: monthName(target.bill.period, settings.language),
					...(target.bill.insurer ? { insurer: target.bill.insurer } : {}),
				}
			: undefined
		this.failure = undefined
		this.phase = 'form'
		this.opened += 1
	}

	#reset() {
		this.#turn += 1
		this.#settle = undefined
		this.open = false
		this.phase = 'form'
		this.failure = undefined
		this.draft = undefined
		this.note = undefined
		this.fingerprint = undefined
	}
}

export const billCapture = new BillCapture()
