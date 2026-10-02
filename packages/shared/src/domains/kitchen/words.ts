// The words Hearth's sheets share: who would read what the owner staged and what it costs, why a read did not
// answer, and why a file was not taken. Each takes the translator, so the caller's `$t` keeps them reactive.
import type { IconName } from '@eden/ui-kit'
import { formatCost } from '../../gardener/index.js'
import type { DirectPreview } from '../../shell/gardener/types.js'
import { modelLabel } from './staging.svelte.js'

/** The glyph that stands for an item with no picture of its own, by its category (D-90). */
const CATEGORY_GLYPHS: Record<string, IconName> = {
	produce: 'carrot',
	'meat-and-fish': 'beef',
	'dairy-and-eggs': 'milk',
	bakery: 'croissant',
	'grains-and-pasta': 'wheat',
	'canned-and-jarred': 'soup',
	frozen: 'snowflake',
	snacks: 'popcorn',
	drinks: 'cup-soda',
	'condiments-and-spices': 'flask-conical',
	'supplements-and-mixes': 'pill',
	'cleaning-and-laundry': 'sparkles',
	'personal-care': 'droplets',
	health: 'thermometer',
	other: 'package',
}

export const categoryGlyph = (category: string | undefined): IconName => CATEGORY_GLYPHS[category ?? ''] ?? 'package'

type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string

/** The provider line of a sheet: who reads, on which model, at about what cost; or why nothing can be read. */
export function readerOf(
	translate: Translate,
	preview: DirectPreview | undefined
): { provider: string; model?: string; cost?: string; blocked?: string } {
	if (!preview) return { provider: '' }
	if ('unavailable' in preview) {
		return { provider: '', blocked: translate(`domains.kitchen.failure.${preview.unavailable}`) }
	}
	const key = `settings.privacy.destinations.${preview.provider}`
	const provider = translate(key)
	return {
		provider: provider === key ? preview.provider : provider,
		model: modelLabel(preview.model),
		// the estimate is a ceiling (the whole answer the request may take), and the sheets say "up to"
		cost: formatCost(preview.estimateUsd),
	}
}

/** Why a read did not answer, in the owner's words. */
export function failureOf(translate: Translate, failure: string | undefined, fallback = 'network'): string {
	const key = `domains.kitchen.failure.${failure ?? fallback}`
	const text = translate(key)
	return text === key ? translate(`domains.kitchen.failure.${fallback}`) : text
}

/** Why files were not taken, one line for the lot. */
export function refusalOf(translate: Translate, refused: readonly { name: string; reason: string }[]): string {
	const [first] = refused
	if (!first) return ''
	return translate(`domains.kitchen.refused.${first.reason}`, {
		values: { name: first.name, more: refused.length - 1 },
	})
}
