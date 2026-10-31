// The words Meadow's pages share: a vibe's name, bundled or the owner's own, and a category's.
import { categoryKey, isCategory } from './categories.js'
import { isBundledVibe, vibeKey } from './vibes.js'
import { type CustomVibe } from './types.js'

type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string

/** A vibe's name: a bundled one's from the locale, a custom one's as its row says it, the id for one nobody knows. */
export const vibeNamer =
	(translate: Translate, custom: readonly CustomVibe[]) =>
	(id: string): string =>
		isBundledVibe(id) ? translate(vibeKey(id)) : (custom.find((vibe) => vibe.id === id)?.label ?? id)

/** A category's name; one Meadow does not know is written as it is. */
export const categoryNamer =
	(translate: Translate) =>
	(category: string | undefined): string =>
		!category ? '' : isCategory(category) ? translate(categoryKey(category)) : category
