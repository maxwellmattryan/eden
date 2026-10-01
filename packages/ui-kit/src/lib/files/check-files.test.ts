import { describe, expect, it } from 'vitest'
import { checkFiles, formatBytes, groupOf, hoverRefusal, matchesType, summarize, type FileLike } from './check-files.js'

const file = (name: string, type: string, size = 100): FileLike => ({ name, type, size })

describe('matchesType', () => {
	it('matches a wildcard, an exact type and an extension', () => {
		expect(matchesType(file('a.png', 'image/png'), ['image/*'])).toBe(true)
		expect(matchesType(file('a.pdf', 'application/pdf'), ['application/pdf'])).toBe(true)
		expect(matchesType(file('NOTES.MD', ''), ['.md'])).toBe(true)
		expect(matchesType(file('a.png', 'image/png'), ['application/pdf', '.md'])).toBe(false)
	})

	it('never matches an empty type against a MIME pattern', () => {
		expect(matchesType(file('notes', ''), ['image/*', ''])).toBe(false)
	})
})

describe('checkFiles', () => {
	it('takes everything when there are no rules', () => {
		const files = [file('a.png', 'image/png'), file('b.bin', '')]
		expect(checkFiles(files)).toEqual({ accepted: files, rejected: [] })
	})

	it('falls back to the extension when the browser gave no type', () => {
		const md = file('notes.md', '')
		expect(checkFiles([md], { accept: ['text/plain', '.md'] }).accepted).toEqual([md])
	})

	it('lets exclude win over accept', () => {
		const gif = file('a.gif', 'image/gif')
		const png = file('a.png', 'image/png')
		const check = checkFiles([gif, png], { accept: ['image/*'], exclude: ['image/gif'] })
		expect(check.accepted).toEqual([png])
		expect(check.rejected).toEqual([{ file: gif, reason: 'type' }])
	})

	it('names the first rule a file breaks: type, then size, then count, then total', () => {
		const wrong = file('a.exe', 'application/x-msdownload', 999)
		const large = file('b.png', 'image/png', 999)
		const first = file('c.png', 'image/png', 60)
		const heavy = file('d.png', 'image/png', 60)
		const second = file('e.png', 'image/png', 10)
		const extra = file('f.png', 'image/png', 1)
		const check = checkFiles([wrong, large, first, heavy, second, extra], {
			accept: ['image/*'],
			maxSize: 500,
			maxFiles: 2,
			maxTotalSize: 100,
		})
		expect(check.accepted).toEqual([first, second])
		expect(check.rejected).toEqual([
			{ file: wrong, reason: 'type' },
			{ file: large, reason: 'size' },
			{ file: heavy, reason: 'total' },
			{ file: extra, reason: 'count' },
		])
	})

	it('counts what is already held', () => {
		const a = file('a.png', 'image/png', 40)
		const b = file('b.png', 'image/png', 40)
		expect(checkFiles([a, b], { maxFiles: 3, count: 2 }).rejected).toEqual([{ file: b, reason: 'count' }])
		expect(checkFiles([a, b], { maxTotalSize: 100, totalSize: 50 }).rejected).toEqual([{ file: b, reason: 'total' }])
	})
})

describe('hoverRefusal', () => {
	const rules = { accept: ['image/*', 'application/pdf', '.md'], maxFiles: 3 }

	it('refuses a drag of too many, counting what is held', () => {
		const items = [{ type: 'image/png' }, { type: 'image/png' }]
		expect(hoverRefusal(items, rules)).toBeUndefined()
		expect(hoverRefusal(items, { ...rules, count: 2 })).toBe('count')
	})

	it('refuses by type only when every type is known and none fits', () => {
		expect(hoverRefusal([{ type: 'video/mp4' }], rules)).toBe('type')
		expect(hoverRefusal([{ type: 'video/mp4' }, { type: 'image/png' }], rules)).toBeUndefined()
		expect(hoverRefusal([{ type: '' }], rules)).toBeUndefined()
	})

	it('says nothing when the rules name extensions alone, or nothing is dragged', () => {
		expect(hoverRefusal([{ type: 'video/mp4' }], { accept: ['.md'] })).toBeUndefined()
		expect(hoverRefusal([], rules)).toBeUndefined()
	})

	it('refuses a drag of excluded types', () => {
		expect(hoverRefusal([{ type: 'image/gif' }], { exclude: ['image/gif'] })).toBe('type')
	})
})

describe('groupOf and summarize', () => {
	it('groups by type, and by extension when there is no type', () => {
		expect(groupOf(file('a.webp', 'image/webp'))).toBe('image')
		expect(groupOf(file('a.pdf', ''))).toBe('pdf')
		expect(groupOf(file('a.json', 'application/json'))).toBe('text')
		expect(groupOf(file('notes.md', ''))).toBe('text')
		expect(groupOf({ type: '' })).toBe('other')
	})

	it('counts each group in a fixed order', () => {
		const items = [{ type: 'application/pdf' }, { type: 'image/png' }, { type: 'image/jpeg' }, { type: 'video/mp4' }]
		expect(summarize(items)).toEqual([
			{ group: 'image', count: 2 },
			{ group: 'pdf', count: 1 },
			{ group: 'other', count: 1 },
		])
	})
})

describe('formatBytes', () => {
	it('uses one decimal under ten of a unit', () => {
		expect(formatBytes(0)).toBe('0 B')
		expect(formatBytes(812)).toBe('812 B')
		expect(formatBytes(1536)).toBe('1.5 KB')
		expect(formatBytes(14 * 1024)).toBe('14 KB')
		expect(formatBytes(1.2 * 1024 * 1024)).toBe('1.2 MB')
	})
})
