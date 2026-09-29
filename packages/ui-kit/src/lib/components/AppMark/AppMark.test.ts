import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The drawing lives twice: in the component, where Svelte scopes its classes, and in app-mark.svg, which the desktop
// splash inlines before any script runs. Formatting aside, the two must be the same drawing.
const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')
const drawing = (source: string) =>
	(source.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1] ?? '')
		// the mask's id is fixed in the file and unique per instance in the component
		.replace(/id=(?:"[^"]*"|\{[^}]*\})/g, 'id')
		.replace(/url\(#[^)]*\)/g, 'url()')
		.replace(/\s+/g, ' ')
		.replace(/ ?\/?> ?/g, '>')
		.replace(/ ?< ?/g, '<')
		.trim()

describe('AppMark', () => {
	it('draws what app-mark.svg draws', () => {
		const svg = drawing(read('./app-mark.svg'))
		expect(svg).not.toBe('')
		expect(drawing(read('./AppMark.svelte'))).toBe(svg)
	})
})
