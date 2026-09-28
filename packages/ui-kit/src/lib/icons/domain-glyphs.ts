// The domain glyph family is not drawn yet (D-17). Until it is, every domain and shell surface maps to a Lucide stand-in
// here, keyed by the plain id from docs/product/domains/README.md and docs/product/glossary.md, never by the display name.
// When a glyph exists, swap it here and nowhere else. Never present a stand-in as the glyph family.
import type { IconName } from './icons.js'
import list from '../tokens/icon-list.json' with { type: 'json' }

export const domainIds = [
	'kitchen',
	'toolbench',
	'weather',
	'calendar',
	'fitness',
	'spirit',
	'places',
	'finance',
	'health',
	'people',
	'journal',
	'travel',
	'library',
] as const
export type DomainId = (typeof domainIds)[number]

export const shellIds = ['garden', 'today', 'gardener', 'council', 'vault', 'settings'] as const
export type ShellId = (typeof shellIds)[number]

export type GlyphId = DomainId | ShellId

export const GLYPHS: Readonly<Record<GlyphId, IconName>> = { ...list.domains, ...list.shell } as Record<
	GlyphId,
	IconName
>

/** The icon to draw for a domain or shell surface: a Lucide stand-in today, the bespoke glyph tomorrow. */
export function domainGlyph(id: GlyphId): IconName {
	return GLYPHS[id]
}
