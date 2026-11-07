import { describe, expect, it } from 'vitest'
import { IMAGE_MAX_BYTES, PDF_MAX_BYTES } from '../../gardener/attachment-limits.js'
import { canSendPicture, choiceOf, phaseOf, refuses, type DocumentOutcome, type HeldDocument } from './reader.js'

const file = (name: string, type: string, size = 1024) => ({ name, type, size })

describe('refuses', () => {
	it.each([
		['one PDF', [file('bill.pdf', 'application/pdf')], undefined],
		['one JPEG', [file('bill.jpg', 'image/jpeg')], undefined],
		['one PNG', [file('bill.png', 'image/png')], undefined],
		['one WebP', [file('bill.webp', 'image/webp')], undefined],
		['a type the engine left empty, known by its extension', [file('bill.PDF', '')], undefined],
		['nothing', [], undefined],
		['two files', [file('a.pdf', 'application/pdf'), file('b.pdf', 'application/pdf')], 'several'],
		['HEIC', [file('photo.heic', 'image/heic')], 'unsupported'],
		['a GIF', [file('scan.gif', 'image/gif')], 'unsupported'],
		['text', [file('notes.txt', 'text/plain')], 'unsupported'],
		['a PDF at the cap', [file('big.pdf', 'application/pdf', PDF_MAX_BYTES)], undefined],
		['a PDF over the cap', [file('big.pdf', 'application/pdf', PDF_MAX_BYTES + 1)], 'too-large'],
		['a picture over the PDF cap, under its own', [file('big.png', 'image/png', PDF_MAX_BYTES + 1)], undefined],
		['a picture over its cap', [file('big.png', 'image/png', IMAGE_MAX_BYTES + 1)], 'too-large'],
	] as const)('%s', (_, files, expected) => {
		expect(refuses(files)).toBe(expected)
	})
})

describe('phaseOf', () => {
	const read = (quality: 'good' | 'poor'): DocumentOutcome => ({
		outcome: 'read',
		text: 'Account number: ••••7781',
		masked: 1,
		source: 'text-layer',
		pages: 1,
		pagesRead: 1,
		quality,
	})
	const rows: [string, DocumentOutcome, ReturnType<typeof phaseOf>][] = [
		['a good read', read('good'), { phase: 'read', quality: 'good' }],
		['a poor read is read badly', read('poor'), { phase: 'read', quality: 'poor' }],
		...(['unsupported', 'too-large', 'locked', 'no-text', 'unavailable'] as const).map(
			(reason): [string, DocumentOutcome, ReturnType<typeof phaseOf>] => [
				reason,
				{ outcome: 'failed', reason },
				{ phase: 'failed', failure: reason },
			]
		),
	]
	it.each(rows)('%s', (_, outcome, expected) => {
		expect(phaseOf(outcome)).toEqual(expected)
	})
})

describe('canSendPicture', () => {
	it.each([
		['no-text', true],
		['unavailable', true],
		['locked', false],
		['unsupported', false],
		['too-large', false],
		['several', false],
		[undefined, false],
	] as const)('%s', (failure, expected) => {
		expect(canSendPicture(failure)).toBe(expected)
	})
})

describe('choiceOf', () => {
	const held: HeldDocument = {
		bytes: new Uint8Array([1, 2, 3]),
		fingerprint: 'ab'.repeat(32),
		name: 'austin-energy-2026-09.pdf',
		mime: 'application/pdf',
	}
	it('carries the edited text and the fingerprint on a confirm, and no bytes', () => {
		const choice = choiceOf('text', held, 'Account number: ••••7781\nChecked.')
		expect(choice).toEqual({
			kind: 'text',
			text: 'Account number: ••••7781\nChecked.',
			fingerprint: held.fingerprint,
			name: held.name,
			mime: held.mime,
		})
		expect(choice).not.toHaveProperty('bytes')
	})
	it('carries the bytes and the fingerprint for the picture', () => {
		expect(choiceOf('picture', held)).toEqual({
			kind: 'picture',
			bytes: held.bytes,
			fingerprint: held.fingerprint,
			name: held.name,
			mime: held.mime,
		})
	})
})
