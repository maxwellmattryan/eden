import { describe, expect, it } from 'vitest'
import { parseMarkdown, safeHref } from './parse.js'

describe('parseMarkdown', () => {
	it('reads paragraphs with emphasis, code and links', () => {
		expect(parseMarkdown('A **bold** and *soft* `x<y` [site](https://eden.test).')).toEqual([
			{
				t: 'p',
				kids: [
					{ t: 'text', text: 'A ' },
					{ t: 'strong', kids: [{ t: 'text', text: 'bold' }] },
					{ t: 'text', text: ' and ' },
					{ t: 'em', kids: [{ t: 'text', text: 'soft' }] },
					{ t: 'text', text: ' ' },
					{ t: 'code', text: 'x<y' },
					{ t: 'text', text: ' ' },
					{ t: 'link', href: 'https://eden.test', kids: [{ t: 'text', text: 'site' }] },
					{ t: 'text', text: '.' },
				],
			},
		])
	})

	it('keeps raw HTML as text and never as markup', () => {
		const [inline, block] = parseMarkdown('Hi <img src=x onerror=alert(1)> there\n\n<script>alert(1)</script>\n')
		expect(JSON.stringify(inline)).toContain('<img src=x onerror=alert(1)>')
		expect(inline).toMatchObject({ t: 'p' })
		expect(block).toEqual({ t: 'p', kids: [{ t: 'text', text: '<script>alert(1)</script>' }] })
	})

	it('drops a link it will not follow and keeps its words', () => {
		expect(parseMarkdown('[run](javascript:alert(1))')).toEqual([{ t: 'p', kids: [{ t: 'text', text: 'run' }] }])
		expect(safeHref('mailto:a@b.test')).toBe('mailto:a@b.test')
		expect(safeHref('file:///etc/passwd')).toBeUndefined()
	})

	it('turns an image into a link on its alt text', () => {
		expect(parseMarkdown('![a fern](https://eden.test/fern.png)')).toEqual([
			{ t: 'p', kids: [{ t: 'link', href: 'https://eden.test/fern.png', kids: [{ t: 'text', text: 'a fern' }] }] },
		])
	})

	it('reads lists, nested and with tasks', () => {
		const [list] = parseMarkdown('- [ ] one\n- [x] two\n  1. inner\n')
		expect(list).toMatchObject({ t: 'list', ordered: false })
		const items = (list as Extract<typeof list, { t: 'list' }>).items
		expect(items[0]).toEqual({ checked: false, kids: [{ t: 'p', kids: [{ t: 'text', text: 'one' }] }] })
		expect(items[1]!.checked).toBe(true)
		expect(items[1]!.kids[1]).toMatchObject({ t: 'list', ordered: true, start: 1 })
	})

	it('reads headings, fences, quotes, rules and tables', () => {
		const tree = parseMarkdown(
			'## Plan\n\n```ts\nlet x = 1\n```\n\n> quoted\n\n---\n\n| a | b |\n| - | :-: |\n| 1 | 2 |\n'
		)
		expect(tree.map((block) => block.t)).toEqual(['h', 'code', 'quote', 'hr', 'table'])
		expect(tree[1]).toEqual({ t: 'code', lang: 'ts', text: 'let x = 1' })
		expect(tree[4]).toMatchObject({ head: [{ align: null }, { align: 'center' }], rows: [[{}, {}]] })
	})

	it('reads a fence that has not closed yet as code, for a reply still streaming', () => {
		expect(parseMarkdown('```js\nconst a')).toEqual([{ t: 'code', lang: 'js', text: 'const a' }])
	})

	it('decodes the few entities a model writes', () => {
		expect(parseMarkdown('salt &amp; pepper')).toEqual([{ t: 'p', kids: [{ t: 'text', text: 'salt & pepper' }] }])
	})
})
