// What the Gardener's views show of a domain: the locale key of its themed name and its glyph, from what the domain
// declares. The views are shared by both apps, so they never read an app's manifests (routes, widgets); a domain the
// shell does not list has no face, and the views fall back to the plain id or the global words.
import { domainGlyph, type GlyphId, type IconName } from '@eden/ui-kit'
import { declarations } from '../../manifest/index.js'

export interface DomainFace {
	/** The locale key of the themed name (D-2). */
	name: string
	glyph: IconName
}

export function domainFace(id: string): DomainFace | undefined {
	const declaration = declarations.find((entry) => entry.id === id)
	// the registry builder checked each id against the kit's glyphs
	return declaration ? { name: declaration.name, glyph: domainGlyph(id as GlyphId) } : undefined
}
