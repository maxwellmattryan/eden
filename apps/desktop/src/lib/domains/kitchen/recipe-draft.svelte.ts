// Recipes on their way in (product/domains/kitchen.md, "Recipes"): the draft the owner is checking, and the import
// that makes one. A recipe arrives as pasted text, a link, or a photo of a page or a card, or the Gardener drafts
// one in a conversation; whichever it was, it opens in the Recipes view's detail pane in edit mode and is stored
// only when the owner saves it there. A link is fetched by the crate (`fetch_page`, D-88); a page that describes
// its recipe in schema.org JSON-LD is read here with no model asked.
import { logError } from '@eden/shared/api'
import { fetchPage, webErrorCode } from '@eden/shared/api'
import { pageText, recipeFromJsonLd, type RecipeDraft } from '@eden/shared/domains/kitchen'
import type { DirectPreview } from '$lib/shell/gardener/runtime.svelte'
import type { ToolFailure } from '$lib/shell/gardener/types'
import { StagedSources } from './staging.svelte.js'

class RecipeDrafts {
	/** The recipe being checked: unsaved, shown in the detail pane in edit mode. */
	current = $state<RecipeDraft | undefined>()
	#settle: ((state: 'committed' | 'discarded') => void) | undefined

	/** Opens a draft; `settle` hears whether it was saved, when it came from a card in a conversation. */
	open(recipe: RecipeDraft, settle?: (state: 'committed' | 'discarded') => void): void {
		this.current = recipe
		this.#settle = settle
	}

	saved(): void {
		this.#settle?.('committed')
		this.#clear()
	}

	discard(): void {
		this.#settle?.('discarded')
		this.#clear()
	}

	#clear(): void {
		this.current = undefined
		this.#settle = undefined
	}
}

export const recipeDrafts = new RecipeDrafts()

const TOOL = 'kitchen.import-recipe'
const LINK = /^https:\/\/\S+$/i

/** Why an import did not make a draft: the tool's reasons, and the page's. */
export type ImportFailure = ToolFailure | 'page-blocked' | 'page-failed' | 'page-unavailable' | 'not-https'

export class RecipeImport {
	open = $state(false)
	phase = $state<'collect' | 'reading' | 'failed'>('collect')
	/** What the owner pasted or typed: the recipe's text, or a link to it. */
	text = $state('')
	failure = $state<ImportFailure | undefined>()
	preview = $state<DirectPreview | undefined>()
	readonly staging = new StagedSources(() => void this.refresh())

	#previewing = 0

	/** The text is a link and nothing else. */
	readonly link = $derived(LINK.test(this.text.trim()) ? this.text.trim() : undefined)
	/** A link over plain http, which is not fetched. */
	readonly insecure = $derived(/^http:\/\/\S+$/i.test(this.text.trim()))
	readonly ready = $derived(
		(this.text.trim().length > 0 || this.staging.sources.length > 0) &&
			this.staging.settled &&
			!this.insecure &&
			!!this.preview &&
			'provider' in this.preview
	)

	start(files: File[] = []): void {
		this.#reset()
		this.open = true
		if (files.length) void this.staging.add(files)
		else void this.refresh()
	}

	/** Works out again who would read the recipe and what it would cost; the latest call wins. */
	async refresh(): Promise<void> {
		const turn = ++this.#previewing
		try {
			const { runtime } = await import('$lib/shell/gardener/runtime.svelte')
			// a link's page is not fetched for a preview: the estimate is of the words and the files in hand
			const text = this.link ? '' : this.text
			const preview = await runtime.previewDirect(TOOL, { text: text || 'recipe' }, { files: this.staging.files() })
			if (turn === this.#previewing) this.preview = preview
		} catch (error) {
			if (turn === this.#previewing) this.preview = { unavailable: 'unavailable' }
			void logError('gardener', 'The recipe preview failed', String(error)).catch(() => null)
		}
	}

	/**
	 * Reads the recipe and answers the draft, or nothing when it could not be read (`failure` says why). A link's
	 * page is fetched first; when the page describes its recipe, that is the draft and no model is asked.
	 */
	async read(): Promise<RecipeDraft | undefined> {
		if (!this.ready || this.phase === 'reading') return undefined
		this.phase = 'reading'
		this.failure = undefined
		let text = this.text.trim()
		const url = this.link
		if (url) {
			try {
				const page = await fetchPage(url)
				const described = recipeFromJsonLd(page.html, page.url)
				if (described) return this.#done(described)
				text = pageText(page.html)
			} catch (error) {
				const code = webErrorCode(error)
				return this.#failed(
					code === 'web:blocked-host' || code === 'web:not-html' || code === 'web:too-large'
						? 'page-blocked'
						: code === 'web:unavailable'
							? 'page-unavailable'
							: code === 'web:not-https'
								? 'not-https'
								: 'page-failed'
				)
			}
		}
		const { runtime } = await import('$lib/shell/gardener/runtime.svelte')
		const result = await runtime.runDirect(TOOL, { text }, { files: this.staging.files(), confirmed: true })
		if (!this.open) return undefined
		if (result.card?.kind === 'recipe') {
			const recipe = result.card.recipe as RecipeDraft
			return this.#done(url && !recipe.sourceUrl ? { ...recipe, sourceUrl: url } : recipe)
		}
		if (result.failure === 'cancelled') {
			this.phase = 'collect'
			return undefined
		}
		return this.#failed(result.failure ?? 'network')
	}

	async stop(): Promise<void> {
		const { runtime } = await import('$lib/shell/gardener/runtime.svelte')
		await runtime.cancel()
	}

	close(): void {
		if (this.phase === 'reading') void this.stop()
		this.open = false
		this.#reset()
	}

	#done(recipe: RecipeDraft): RecipeDraft {
		this.open = false
		this.#reset()
		recipeDrafts.open(recipe)
		return recipe
	}

	#failed(failure: ImportFailure): undefined {
		this.failure = failure
		this.phase = 'failed'
		return undefined
	}

	#reset(): void {
		this.#previewing += 1
		this.phase = 'collect'
		this.text = ''
		this.failure = undefined
		this.preview = undefined
		this.staging.clear()
	}
}

export const recipeImport = new RecipeImport()
