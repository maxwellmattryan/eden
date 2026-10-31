import { describe, expect, it } from 'vitest'
import { archiveName, fileName } from './archive-files.js'

describe('archiveName', () => {
	const day = new Date('2026-10-02T15:04:05Z')
	it('names the whole workspace', () => {
		expect(archiveName({ kind: 'full' }, day)).toBe('eden-full-2026-10-02.zip')
	})
	it('names one domain by its id', () => {
		expect(archiveName({ kind: 'domain', domain: 'kitchen' }, day)).toBe('eden-kitchen-2026-10-02.zip')
	})
})

describe('fileName', () => {
	it('takes the last segment on either separator', () => {
		expect(fileName('/data/exports/eden-full.zip')).toBe('eden-full.zip')
		expect(fileName('C:\\Users\\me\\eden-full.zip')).toBe('eden-full.zip')
		expect(fileName('eden-full.zip')).toBe('eden-full.zip')
	})
})
