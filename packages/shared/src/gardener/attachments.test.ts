import { describe, expect, it } from 'vitest'
import { ACCEPT, attachmentForm, attachmentMime, IMAGE_SENT_MAX_BYTES, maxBytesFor } from './attachment-limits.js'
import {
	attachmentKind,
	attachmentsOf,
	attachmentTokens,
	auditOf,
	hasVisual,
	imageTokens,
	sentBytes,
	sentSize,
} from './attachments.js'
import type { AttachmentBlock, Message } from './runtime-types.js'

const block = (over: Partial<AttachmentBlock> = {}): AttachmentBlock => ({
	kind: 'attachment',
	id: '01J9ZQ4M3T8R5V2X7Y6W1B0CD0',
	name: 'basket.png',
	mime: 'image/png',
	size: 840_000,
	hash: 'abc',
	width: 4032,
	height: 3024,
	...over,
})

const owner = (blocks: unknown[]): Message => ({ role: 'owner', blocks }) as Message

describe('attachment limits', () => {
	it('names a type by the extension first, as the crate does', () => {
		expect(attachmentMime('notes.md', '')).toBe('text/markdown')
		expect(attachmentMime('Photo.JPG', 'image/pjpeg')).toBe('image/jpeg')
		expect(attachmentMime('Pasted text.txt', 'text/plain')).toBe('text/plain')
		expect(attachmentMime('clip', 'video/mp4')).toBe('video/mp4')
		expect(attachmentMime('clip', '')).toBe('application/octet-stream')
	})

	it('accepts by type and by extension', () => {
		expect(ACCEPT).toContain('image/png')
		expect(ACCEPT).toContain('.md')
		expect(new Set(ACCEPT).size).toBe(ACCEPT.length)
	})

	it('sends an image as an image, a PDF as a PDF and the rest as text', () => {
		expect(attachmentForm('image/webp')).toBe('image')
		expect(attachmentForm('application/pdf')).toBe('pdf')
		expect(attachmentForm('text/csv')).toBe('text')
		expect(maxBytesFor('text/csv')).toBeLessThan(maxBytesFor('application/pdf'))
		expect(maxBytesFor('application/pdf')).toBeLessThan(maxBytesFor('image/png'))
	})
})

describe('attachment estimates', () => {
	it('scales an image down to the sent edge, never up', () => {
		expect(sentSize(4032, 3024)).toEqual({ width: 1568, height: 1176 })
		expect(sentSize(800, 600)).toEqual({ width: 800, height: 600 })
		expect(sentSize(3000, 1)).toEqual({ width: 1568, height: 1 })
	})

	it('counts an image by its sent pixels, and an unmeasured one as the largest', () => {
		expect(imageTokens(750, 100)).toBe(100)
		expect(imageTokens(4032, 3024)).toBe(Math.ceil((1568 * 1176) / 750))
		expect(imageTokens(undefined, undefined)).toBe(Math.ceil((1568 * 1568) / 750))
	})

	it('counts text by its bytes and a PDF by its bytes with a floor', () => {
		expect(attachmentTokens(block({ mime: 'text/plain', size: 4000 }))).toBe(1000)
		expect(attachmentTokens(block({ mime: 'application/pdf', size: 400 }))).toBe(1500)
		expect(attachmentTokens(block({ mime: 'application/pdf', size: 400_000 }))).toBe(10_000)
		expect(attachmentTokens(block())).toBe(imageTokens(4032, 3024))
	})

	it('weighs an image at its cap at most, and the rest whole', () => {
		expect(sentBytes(block({ size: IMAGE_SENT_MAX_BYTES * 3 }))).toBe(IMAGE_SENT_MAX_BYTES)
		expect(sentBytes(block({ size: 10 }))).toBe(10)
		expect(sentBytes(block({ mime: 'application/pdf', size: IMAGE_SENT_MAX_BYTES * 2 }))).toBe(IMAGE_SENT_MAX_BYTES * 2)
	})
})

describe('attachment blocks', () => {
	it('stores an image as a photo and anything else as a document', () => {
		expect(attachmentKind('image/gif')).toBe('photo')
		expect(attachmentKind('application/pdf')).toBe('document')
		expect(attachmentKind('text/markdown')).toBe('document')
	})

	it('finds the attachment blocks of a message', () => {
		const file = block()
		expect(attachmentsOf([file, { kind: 'text', text: 'What is this?' }, null])).toEqual([file])
		expect(attachmentsOf('nothing')).toEqual([])
	})

	it('needs vision for an image or a PDF, in the message or before it', () => {
		const text = block({ mime: 'text/plain' })
		expect(hasVisual([], [text])).toBe(false)
		expect(hasVisual([], [block()])).toBe(true)
		expect(hasVisual([owner([block({ mime: 'application/pdf' })])], [])).toBe(true)
		expect(hasVisual([owner([text, { kind: 'text', text: 'hm' }])], [text])).toBe(false)
	})

	it('keeps the hash, type, size and dimensions for the audit, never the name', () => {
		expect(auditOf(block())).toEqual({ hash: 'abc', mime: 'image/png', size: 840_000, width: 4032, height: 3024 })
		expect(auditOf(block({ mime: 'application/pdf', width: undefined, height: undefined }))).toEqual({
			hash: 'abc',
			mime: 'application/pdf',
			size: 840_000,
		})
	})
})
