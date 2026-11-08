// The statement import's session (#74, D-194; product/domains/finance.md, "Statement import"): the state behind
// Orchard's `ImportSheet`. The owner chooses an account and gives one file; the read starts on whichever comes second.
// A CSV or OFX is fingerprinted, checked against the files imported before and read on the device with no model. A PDF
// or a picture goes to the document reader (`documentRead`), whose sheet takes the same file; what the owner confirms
// there, or the picture, runs `finance.read-statement` as the page's own run, and the import sheet opens again on the
// rows found. Review matches them against the account's rows; nothing is written until the owner imports. The bytes
// are let go as soon as the parse or the reader settles, and only the fingerprint is kept (D-189).
import { get } from 'svelte/store'
import { logError } from '../../api/index.js'
import { t } from '../../i18n/index.js'
import { toSend } from '../../shell/gardener/files.js'
import type { DirectPreview, ToolFailure, ToolFiles } from '../../shell/gardener/types.js'
import { statementFromCsv } from './csv.js'
import { statementFromOfx } from './ofx.js'
import { fingerprint } from './read.js'
import type { DocumentChoice } from './reader.js'
import { documentRead } from './reader.svelte.js'
import {
	decodeText,
	defaultFlip,
	importKindOf,
	refusesImport,
	statementFromAnswer,
	type ImportFailure,
	type ParsedStatement,
	type StatementRead,
	type StatementRow,
} from './statement.js'
import { finance, type Undo } from './store.svelte.js'

/** collect: the account and the file. reading: the reader's text is with the model. review: the rows to import. */
export type ImportPhase = 'collect' | 'reading' | 'review' | 'imported' | 'failed'

/** Why the import stopped: a file's own failure, or why the Gardener could not read it. */
export type ImportStop = ImportFailure | Extract<ToolFailure, 'no-key' | 'unavailable' | 'budget' | 'limit' | 'busy'>

const TOOL = 'finance.read-statement'
const UNAVAILABLE: readonly ImportStop[] = ['no-key', 'unavailable', 'budget', 'limit', 'busy']

/** A run's failure as the import names it. */
function stopOf(failure: ToolFailure | undefined): ImportStop {
	if (failure === 'empty') return 'empty'
	return failure && (UNAVAILABLE as readonly string[]).includes(failure) ? (failure as ImportStop) : 'failed'
}

/** The picture the owner chose to send, as the tool is given it: one block, read and scaled when it is sent. */
function pictureFiles(choice: Extract<DocumentChoice, { kind: 'picture' }>): ToolFiles {
	const { bytes } = choice
	return {
		blocks: [
			{
				kind: 'attachment',
				id: choice.fingerprint,
				name: choice.name,
				mime: choice.mime,
				size: bytes.byteLength,
				hash: choice.fingerprint,
			},
		],
		read: (block) => toSend(bytes, block),
	}
}

export class StatementImport {
	open = $state(false)
	phase = $state<ImportPhase>('collect')
	/** The chosen account's id; empty until one is chosen. */
	accountId = $state('')
	/** The file given, as its chip shows it. */
	file = $state<{ name: string } | undefined>()
	/** Why the file given was not taken, in the collect step. */
	refusal = $state<'several' | 'unsupported' | 'too-large' | undefined>()
	// raw, not proxied: the rows go to the data layer as they are, and a proxy cannot be cloned on the way
	parsed = $state.raw<ParsedStatement | undefined>()
	/** Every amount is turned round: the file writes charges as positive. */
	flip = $state(false)
	fresh = $state.raw<StatementRow[]>([])
	matched = $state(0)
	failure = $state<ImportStop | undefined>()
	imported = $state<{ day: string; detail: string } | undefined>()
	/** The import is being written. */
	saving = $state(false)

	#file: File | undefined
	#fingerprint = ''
	/** Bumped whenever a read stops mattering, so an answer that comes after Cancel is dropped. */
	#generation = 0

	/** Opens the sheet on the collect step, with the account already chosen when it is given. */
	begin(accountId?: string): void {
		this.#reset()
		this.accountId = accountId ?? ''
		this.open = true
	}

	/** The account chosen: the read starts when the file is there too. */
	choose(accountId: string): void {
		if (this.phase !== 'collect') return
		this.accountId = accountId
		void this.#start()
	}

	/** The files given: one is taken; several, a refused type or size, say why under the zone. */
	take(files: File[]): void {
		if (!this.open || this.phase !== 'collect' || files.length === 0) return
		this.refusal = refusesImport(files)
		if (this.refusal) return
		const file = files[0]!
		this.#file = file
		this.file = { name: file.name }
		void this.#start()
	}

	/** The file taken back, before it is read. */
	drop(): void {
		if (this.phase !== 'collect') return
		this.#file = undefined
		this.file = undefined
		this.refusal = undefined
	}

	/** Turns every amount round and counts the matches again. */
	async setFlip(on: boolean): Promise<void> {
		if (this.phase !== 'review' || !this.parsed || this.parsed.kind === 'ofx') return
		this.flip = on
		const generation = this.#generation
		const { fresh, matched } = await finance.previewImport(this.accountId, this.parsed, on)
		if (generation !== this.#generation || this.flip !== on) return
		this.fresh = fresh
		this.matched = matched
	}

	/**
	 * Imports the rows and ends the session: the toast's words and the undo, or nothing when the write failed (the
	 * page's Retry sends it).
	 */
	async confirm(): Promise<{ message: string; undo: Undo } | undefined> {
		if (this.phase !== 'review' || !this.parsed || this.saving) return undefined
		this.saving = true
		const account = finance.accountById(this.accountId)
		const name = this.file?.name ?? ''
		const answer = await finance.importStatement({
			accountId: this.accountId,
			parsed: this.parsed,
			flip: this.flip,
			fingerprint: this.#fingerprint,
		})
		this.saving = false
		this.open = false
		this.#reset()
		if (!answer) return undefined
		const translate = get(t)
		const message = answer.created
			? translate('domains.finance.toasts.imported', {
					values: { count: answer.created, account: account?.name ?? '' },
				})
			: translate('domains.finance.toasts.nothingNew', { values: { name } })
		return { message, undo: answer.undo }
	}

	/** Cancel, Close, or the sheet dismissed: nothing is written. */
	cancel(): void {
		const reading = this.phase === 'reading'
		this.open = false
		this.#reset()
		if (reading) void import('../../shell/gardener/runtime.svelte.js').then(({ runtime }) => runtime.cancel())
	}

	async #start(): Promise<void> {
		const file = this.#file
		const account = finance.accountById(this.accountId)
		if (!this.open || this.phase !== 'collect' || !file || !account) return
		const generation = ++this.#generation
		const kind = importKindOf(file)
		if (kind === 'reader') return this.#reader(file, account.currency, generation)
		try {
			const bytes = new Uint8Array(await file.arrayBuffer())
			const print = await fingerprint(bytes)
			if (generation !== this.#generation) return
			this.#fingerprint = print
			this.#file = undefined
			const known = await finance.knownImport(print)
			if (generation !== this.#generation) return
			if (known) {
				this.imported = known
				this.phase = 'imported'
				return
			}
			const text = decodeText(bytes)
			if (typeof text !== 'string') return this.#fail(text.failure)
			await this.#review(
				kind === 'ofx' ? statementFromOfx(text, account.currency) : statementFromCsv(text, account.currency),
				generation
			)
		} catch {
			// nothing of the file is logged: `#fail` logs the code alone
			if (generation === this.#generation) this.#fail('unreadable')
		}
	}

	/** A PDF or a picture: the reader's sheet takes the file, and what the owner confirms there is read for rows. */
	async #reader(file: File, currency: string, generation: number): Promise<void> {
		const translate = get(t)
		const { runtime } = await import('../../shell/gardener/runtime.svelte.js')
		let preview: DirectPreview
		try {
			preview = await runtime.previewDirect(TOOL, { text: 'statement', currency })
		} catch {
			preview = { unavailable: 'unavailable' }
		}
		if (generation !== this.#generation) return
		this.#file = undefined
		// the import sheet closes while the reader's is open: the two never stack
		this.open = false
		const chosen = documentRead.read({
			confirmLabel: translate('domains.finance.import.findRows'),
			next: translate('domains.finance.import.next'),
			known: finance.knownImport,
			preview,
		})
		void documentRead.take([file])
		const choice = await chosen
		if (generation !== this.#generation) return
		if (!choice) return this.#reset()
		this.#fingerprint = choice.fingerprint
		this.file = { name: choice.name }
		this.phase = 'reading'
		this.open = true
		const kind = choice.mime === 'application/pdf' ? 'pdf' : 'picture'
		const result = await runtime.runDirect(
			TOOL,
			{ text: choice.kind === 'text' ? choice.text : '', currency },
			choice.kind === 'picture' ? { files: pictureFiles(choice), confirmed: true } : { confirmed: true }
		)
		if (generation !== this.#generation || !this.open) return
		if (result.failure) return this.#fail(stopOf(result.failure))
		await this.#review(statementFromAnswer(result.output, currency, kind), generation)
	}

	async #review(read: StatementRead, generation: number): Promise<void> {
		if ('failure' in read) return this.#fail(read.failure)
		const account = finance.accountById(this.accountId)
		const flip = read.kind !== 'ofx' && !!account && defaultFlip(account, read.rows)
		const { fresh, matched } = await finance.previewImport(this.accountId, read, flip)
		if (generation !== this.#generation) return
		this.parsed = read
		this.flip = flip
		this.fresh = fresh
		this.matched = matched
		this.phase = 'review'
	}

	#fail(failure: ImportStop): void {
		// a failure is logged by its code only
		void logError('finance', 'A statement import failed', failure).catch(() => null)
		this.failure = failure
		this.phase = 'failed'
	}

	#reset(): void {
		this.#generation++
		this.#file = undefined
		this.#fingerprint = ''
		this.phase = 'collect'
		this.accountId = ''
		this.file = undefined
		this.refusal = undefined
		this.parsed = undefined
		this.flip = false
		this.fresh = []
		this.matched = 0
		this.failure = undefined
		this.imported = undefined
		this.saving = false
	}
}

/** The one session Orchard's page binds `ImportSheet` to. */
export const statementImport = new StatementImport()
