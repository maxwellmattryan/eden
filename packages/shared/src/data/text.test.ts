import { describe, expect, it } from 'vitest'
import { inline, toCsv, toMarkdown } from './text.js'

describe('toCsv', () => {
	it('writes a header and its rows', () => {
		expect(toCsv(['name', 'qty'], [['Rice', 2]])).toBe('name,qty\r\nRice,2\r\n')
		expect(toCsv(['name'], [])).toBe('name\r\n')
	})

	it('quotes what holds a comma, a quote or a line break, and leaves the rest', () => {
		expect(toCsv(['a', 'b', 'c', 'd'], [['1, 2', 'say "hi"', 'two\nlines', 'plain']])).toBe(
			'a,b,c,d\r\n"1, 2","say ""hi""","two\nlines",plain\r\n'
		)
	})

	it('writes nothing for what has no value, and the word for true and false', () => {
		expect(toCsv(['a', 'b', 'c', 'd'], [[undefined, null, true, false]])).toBe('a,b,c,d\r\n,,true,false\r\n')
	})
})

describe('toMarkdown', () => {
	it('writes a title and a section for each entry', () => {
		expect(
			toMarkdown('Recipes', [
				{ heading: 'Dal', lines: ['- Serves 2', undefined, '- 35 minutes'] },
				{ heading: 'Rice', lines: [] },
			])
		).toBe('# Recipes\n\n## Dal\n\n- Serves 2\n- 35 minutes\n\n## Rice\n')
		expect(toMarkdown('Recipes', [])).toBe('# Recipes\n')
	})

	it('keeps text from being read as markup', () => {
		expect(inline('# not a heading')).toBe('\\# not a heading')
		expect(inline('  two\n lines  ')).toBe('two lines')
		expect(inline('*bold* _em_ `code` [x](y) <b> a|b')).toBe('\\*bold\\* \\_em\\_ \\`code\\` \\[x\\](y) \\<b\\> a\\|b')
		expect(toMarkdown('T', [{ heading: '## Sneaky', lines: [] }])).toBe('# T\n\n## \\#\\# Sneaky\n')
	})
})
