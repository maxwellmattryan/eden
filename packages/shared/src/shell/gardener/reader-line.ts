// The provider line of a sheet that runs a Gardener tool from a page (Hearth's capture and recipe import, Orchard's
// Capture a bill): who reads, on which model, at about what cost, or why nothing can be read. Moved here from Hearth's
// words (#78) so a domain's sheet can share it without importing another domain; it reads as it did.
import { formatCost } from '../../gardener/index.js'
import type { DirectPreview } from './types.js'

type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string

/** A model's name as the owner would say it, from its id: `claude-haiku-4-5-20251001` is "Haiku 4.5". */
export function modelLabel(id: string): string {
	const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id)
	if (!match) return id
	const [, family, major, minor] = match
	return `${family![0]!.toUpperCase()}${family!.slice(1)} ${major}${minor ? `.${minor}` : ''}`
}

/**
 * The provider line: the provider's name, the model and the cost; or, when none can read, why, under `failures`
 * (the caller's own words for each `DirectPreview` reason: Hearth's by default).
 */
export function readerOf(
	translate: Translate,
	preview: DirectPreview | undefined,
	failures = 'domains.kitchen.failure'
): { provider: string; model?: string; cost?: string; blocked?: string } {
	if (!preview) return { provider: '' }
	if ('unavailable' in preview) {
		return { provider: '', blocked: translate(`${failures}.${preview.unavailable}`) }
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
