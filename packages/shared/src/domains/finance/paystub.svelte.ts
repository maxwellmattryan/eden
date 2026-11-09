// Read a pay stub (product/domains/finance.md §6, #85, D-202): the session behind the pay stub sheet. It opens the
// document reader with the provider line and the file's earlier import (shared with Capture a bill, so a document is
// read once), and on the owner's confirm (the consent, D-86) runs `finance.read-pay-stub` from the page with the
// checked text and the source's currency, or with the picture passed in memory and read once. The answer opens the
// sheet on Review; Edit deductions opens it on the stored ones. Nothing is written until the owner saves there.
import { get } from 'svelte/store'
import { logError } from '../../api/index.js'
import { todayIso } from '../../dates/index.js'
import { t } from '../../i18n/index.js'
import type { DirectPreview, ToolFailure } from '../../shell/gardener/types.js'
import { knownDocument, pictureFiles } from './capture.svelte.js'
import { payStubFromAnswer } from './paystub.js'
import { documentRead } from './reader.svelte.js'
import { finance } from './store.svelte.js'
import type { PayStub } from './types.js'

const TOOL = 'finance.read-pay-stub'

class PayStubReadSession {
	/** The pay stub sheet is open. */
	open = $state(false)
	/** The document reader is open for a pay stub, so its provider line speaks of pay stubs. */
	asking = $state(false)
	phase = $state<'reading' | 'review' | 'failed'>('review')
	/** The income source the deductions are for. */
	sourceId = $state('')
	/** What fills Review; none for one empty row. */
	draft = $state<PayStub | undefined>()
	failure = $state<ToolFailure | undefined>()
	/** The fingerprint of the stub the sheet came from; none for an edit. */
	fingerprint = $state<string | undefined>()
	/** Bumped when the sheet opens again or is let go, so its form starts afresh and a late run is dropped. */
	opened = $state(0)

	#turn = 0

	/** Opens the reader for the source, then reads the deductions from what the owner confirms. Cancel writes nothing. */
	async start(sourceId: string): Promise<void> {
		const source = finance.incomeById(sourceId)
		if (!source) return
		const currency = source.expected.currency
		const { runtime } = await import('../../shell/gardener/runtime.svelte.js')
		const preview = await runtime
			.previewDirect(TOOL, { text: 'pay stub', currency })
			.catch((): DirectPreview => ({ unavailable: 'unavailable' }))
		const tr = get(t)
		this.asking = true
		const choice = await documentRead
			.read({
				confirmLabel: tr('domains.finance.payStub.confirm'),
				next: tr('domains.finance.payStub.next'),
				preview,
				known: knownDocument,
			})
			.finally(() => (this.asking = false))
		if (!choice) return
		this.#begin(sourceId)
		this.fingerprint = choice.fingerprint
		this.phase = 'reading'
		const turn = this.#turn
		try {
			const result = await runtime.runDirect(
				TOOL,
				{ text: choice.kind === 'text' ? choice.text : '', currency },
				choice.kind === 'picture' ? { files: pictureFiles(choice), confirmed: true } : { confirmed: true }
			)
			if (turn !== this.#turn || !this.open) return
			if (result.failure) return this.#fail(result.failure)
			const read = payStubFromAnswer(result.output, currency)
			if ('failure' in read) return this.#fail(read.failure)
			this.draft = { ...read, day: read.day || todayIso() }
			this.phase = 'review'
			this.opened += 1
		} catch (error) {
			if (turn !== this.#turn) return
			void logError('gardener', 'A pay stub could not be read', String(error)).catch(() => null)
			this.#fail('network')
		}
	}

	/** Edit deductions: the sheet on the stored ones. */
	edit(sourceId: string): void {
		const stored = finance.incomeById(sourceId)?.payStub
		if (!stored) return
		this.#begin(sourceId)
		this.draft = $state.snapshot(stored) as PayStub
		this.phase = 'review'
	}

	/** "Enter them by hand": Review with one empty row, the stub still the one it came from. */
	byHand(): void {
		this.#turn += 1
		this.draft = undefined
		this.failure = undefined
		this.phase = 'review'
		this.opened += 1
	}

	/** Cancel, Close: nothing is written. A run still going is stopped. */
	async cancel(): Promise<void> {
		const reading = this.phase === 'reading'
		this.#reset()
		if (reading) {
			const { runtime } = await import('../../shell/gardener/runtime.svelte.js')
			await runtime.cancel()
		}
	}

	/** The deductions were saved from the sheet. */
	saved(): void {
		this.#reset()
	}

	#begin(sourceId: string) {
		this.#reset()
		this.sourceId = sourceId
		this.open = true
		this.opened += 1
	}

	#fail(failure: ToolFailure) {
		// a failure is logged by its code only
		void logError('finance', 'A pay stub read failed', failure).catch(() => null)
		this.failure = failure
		this.phase = 'failed'
	}

	#reset() {
		this.#turn += 1
		this.open = false
		this.phase = 'review'
		this.sourceId = ''
		this.draft = undefined
		this.failure = undefined
		this.fingerprint = undefined
	}
}

/** The one session Orchard's page binds `PayStubSheet` to. */
export const payStubRead = new PayStubReadSession()
