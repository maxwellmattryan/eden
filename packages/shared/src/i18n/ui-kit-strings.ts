// The kit's own strings, translated: UiKitProvider takes an override object per locale, and English is the kit's
// default, so `en` gets an empty override. Where the kit's string is a function (a count, a name), the locale file
// holds a template with positional {0}, {1} slots that this module turns back into a function. Each call returns a
// new object, which is what the provider needs to notice a locale change.
import { defaultStrings, type UiStrings, type UiStringsOverride } from '@eden/ui-kit'
import ja from './locales/ja.json'
import type { Language } from '../types/index.js'

type Tree = { [key: string]: string | Tree }

const overrides: Partial<Record<Language, Tree>> = { ja: (ja as { uiKit?: Tree }).uiKit ?? {} }

function fill(template: string, args: unknown[]): string {
	return template.replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)] ?? ''))
}

function build(base: Record<string, unknown>, tree: Tree): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(tree)) {
		const original = base[key]
		if (typeof value === 'string') {
			if (typeof original === 'function') out[key] = (...args: unknown[]) => fill(value, args)
			else if (typeof original === 'string') out[key] = value
		} else if (value && typeof original === 'object' && original !== null) {
			out[key] = build(original as Record<string, unknown>, value)
		}
	}
	return out
}

/** The override for `UiKitProvider strings`: a new object each call, empty for English. */
export function uiKitStrings(language: string | null | undefined): UiStringsOverride {
	const tree = overrides[language as Language]
	if (!tree) return {}
	return build(defaultStrings as unknown as Record<string, unknown>, tree) as UiStringsOverride
}

export type { UiStrings }
