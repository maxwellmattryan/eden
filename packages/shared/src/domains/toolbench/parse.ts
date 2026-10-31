// The quick-add parser for an idea: the line is the title, and a trailing `#area` or a bare area word at the end
// files it ("Solar logger for the balcony #hardware", "…balcony hardware"). Anything else is the title alone.
import type { ParsedChip } from '@eden/ui-kit'

/** The categories toolbench.md lists, plus the studio the sample data uses. */
export const AREAS = ['tool', 'app', 'homelab', 'hardware', 'art', 'studio', 'other'] as const
export type Area = (typeof AREAS)[number]

export interface ParsedIdea {
	title: string
	area: Area
}

export function parseIdea(text: string): ParsedIdea {
	const trimmed = text.trim()
	const tagged = /^(.*?)\s*#([a-z]+)$/i.exec(trimmed)
	if (tagged && (AREAS as readonly string[]).includes(tagged[2]!.toLowerCase())) {
		return { title: tagged[1]!.trim() || trimmed, area: tagged[2]!.toLowerCase() as Area }
	}
	const words = trimmed.split(/\s+/)
	const last = words[words.length - 1]?.toLowerCase()
	if (words.length > 1 && last && (AREAS as readonly string[]).includes(last)) {
		return { title: words.slice(0, -1).join(' '), area: last as Area }
	}
	return { title: trimmed, area: 'other' }
}

/** The chips the quick-add line shows: the title, then the area when one was named. */
export function ideaChips(text: string): ParsedChip[] {
	if (!text.trim()) return []
	const parsed = parseIdea(text)
	const named = parsed.area !== 'other' || /#other$/i.test(text.trim()) || /\bother$/i.test(text.trim())
	return named ? [{ label: parsed.title }, { label: parsed.area, mono: true }] : [{ label: parsed.title }]
}
