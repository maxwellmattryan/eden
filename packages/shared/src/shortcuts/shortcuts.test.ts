import { describe, expect, it } from 'vitest'
import { detectOs, formatShortcut } from './index.js'

describe('formatShortcut', () => {
	it('writes the command glyph and a space on macOS', () => {
		expect(formatShortcut('G', { os: 'macos', platform: 'desktop' })).toBe('⌘ G')
	})
	it('writes "Cmd + key" on Windows', () => {
		expect(formatShortcut('G', { os: 'windows', platform: 'desktop' })).toBe('Cmd + G')
	})
	it('writes nothing on mobile', () => {
		expect(formatShortcut('G', { os: 'macos', platform: 'mobile' })).toBeUndefined()
		expect(formatShortcut('G', { os: 'windows', platform: 'mobile' })).toBeUndefined()
	})
})

describe('detectOs', () => {
	it('reads Windows from the user agent', () => {
		expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
		expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos')
	})
})
