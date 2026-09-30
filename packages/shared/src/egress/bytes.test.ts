import { describe, expect, it } from 'vitest'
import { formatBytes, requestBytes } from './bytes.js'

describe('requestBytes', () => {
	it('counts the encoded URL and the body bytes, not the headers', () => {
		expect(requestBytes('https://api.weather.gov/alerts/active?point=30.31,-97.74')).toBe(56)
		expect(requestBytes('https://a.test/?q=日本')).toBe(24)
		expect(requestBytes('https://a.test/', '{"a":1}')).toBe(22)
		expect(requestBytes('https://a.test/', new Uint8Array(10))).toBe(25)
	})
})

describe('formatBytes', () => {
	it('formats bytes', () => {
		expect(formatBytes(0)).toBe('0 B')
		expect(formatBytes(812)).toBe('812 B')
		expect(formatBytes(1_234)).toBe('1.2 kB')
		expect(formatBytes(3_400_000)).toBe('3.4 MB')
		expect(formatBytes(-5)).toBe('0 B')
	})
})
