// The context pack with the owner's files (D-82): beside pack.test.ts, on a request with no declared reads so what
// is asserted is the files alone.
import { describe, expect, it } from 'vitest'
import { REQUEST_MAX_BYTES } from './attachment-limits.js'
import { buildPack, type PackAttachment, type PackReaders, type PackRequest } from './pack.js'
import { ANTHROPIC_SEED } from './providers.js'
import type { AttachmentBlock, Message } from './runtime-types.js'

const ULID = '01J9ZQ4M3T8R5V2X7Y6W1B0CD'
const id = (n: number) => `${ULID}${'0123456789ABCDEFGHJKMNPQRS'[n]}`
const stamp = (n: number) => `${n.toString(16).padStart(16, '0')}-00000000-000000ab`

const file = (n: number, name: string, mime: string, over: Partial<AttachmentBlock> = {}): AttachmentBlock => ({
	kind: 'attachment',
	id: id(n),
	name,
	mime,
	size: 1000,
	hash: `hash-${n}`,
	...over,
})

const message = (n: number, role: Message['role'], blocks: unknown[]): Message => ({
	uri: `eden://message/${id(n)}`,
	id: id(n),
	threadId: id(20),
	role,
	blocks,
	requestId: null,
	createdAt: stamp(n),
	updatedAt: stamp(n),
	deletedAt: null,
})

/** Readers with nothing to read but the files: each is sent by its form, unless it is named as missing. */
function readers(missing: string[] = []): PackReaders & { read: string[] } {
	const read: string[] = []
	return {
		read,
		facts: async () => [],
		entities: async () => [],
		primitives: async () => [],
		check: async () => ({ allowed: false, reason: 'no-grant' }),
		async attachment(block): Promise<PackAttachment | undefined> {
			read.push(block.id)
			if (missing.includes(block.id)) return undefined
			if (block.mime === 'application/pdf') return { kind: 'pdf', data: `pdf:${block.name}` }
			if (block.mime.startsWith('image/')) return { kind: 'image', mediaType: block.mime, data: `img:${block.name}` }
			return { kind: 'text', text: `Call me at 512-555-0134 about ${block.name}` }
		},
	}
}

function request(over: Partial<PackRequest> = {}): PackRequest {
	return {
		reads: [],
		thread: [],
		message: 'What is this?',
		tools: [],
		model: ANTHROPIC_SEED.models[1]!,
		outputReserve: 1_000,
		tokenCap: null,
		subject: 'anthropic',
		now: Date.UTC(2026, 8, 30, 9, 40),
		zone: 'America/Chicago',
		lang: 'en',
		grade: 'standard',
		...over,
	}
}

const image = (name: string) => ({
	type: 'image',
	source: { type: 'base64', media_type: 'image/png', data: `img:${name}` },
})
const contentOf = (entry: unknown) => (entry as { content: unknown }).content

describe('buildPack with attachments', () => {
	it('leaves a message without files as it was', async () => {
		const pack = await buildPack(request(), readers())
		expect(pack.messages).toEqual([{ role: 'user', content: 'What is this?' }])
		expect(pack.attachments).toEqual([])
		expect(pack.attached).toEqual([])
		expect(pack.tier).toBe('T0')
	})

	it('sends the message’s files before its words, each by its form', async () => {
		const files = [
			file(1, 'basket.png', 'image/png', { width: 750, height: 100 }),
			file(2, 'manual.pdf', 'application/pdf'),
			file(3, 'notes.md', 'text/markdown'),
		]
		const pack = await buildPack(request({ attachments: files }), readers())
		expect(contentOf(pack.messages.at(-1))).toEqual([
			image('basket.png'),
			{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'pdf:manual.pdf' } },
			// a text file is sent as text, scrubbed like the message
			{ type: 'text', text: '<file name="notes.md">\nCall me at [phone] about notes.md\n</file>' },
			{ type: 'text', text: 'What is this?' },
		])
		expect(pack.attached).toEqual(['basket.png', 'manual.pdf', 'notes.md'])
		expect(pack.attachments).toEqual([
			{ hash: 'hash-1', mime: 'image/png', size: 1000, width: 750, height: 100 },
			{ hash: 'hash-2', mime: 'application/pdf', size: 1000 },
			{ hash: 'hash-3', mime: 'text/markdown', size: 1000 },
		])
		// a document is T2, so the conversation is
		expect(pack.tier).toBe('T2')
	})

	it('sends files alone when there are no words, and raises the tier to T1 for a photo', async () => {
		const pack = await buildPack(request({ message: '', attachments: [file(1, 'basket.png', 'image/png')] }), readers())
		expect(contentOf(pack.messages.at(-1))).toEqual([image('basket.png')])
		expect(pack.tier).toBe('T1')
	})

	it('counts a file in the estimate by what its block says', async () => {
		const bare = await buildPack(request(), readers())
		const withImage = await buildPack(
			request({ attachments: [file(1, 'basket.png', 'image/png', { width: 750, height: 100 })] }),
			readers()
		)
		expect(withImage.estimatedInputTokens - bare.estimatedInputTokens).toBe(100)
		const withText = await buildPack(
			request({ attachments: [file(3, 'notes.md', 'text/markdown', { size: 4000 })] }),
			readers()
		)
		expect(withText.estimatedInputTokens - bare.estimatedInputTokens).toBe(1000)
	})

	it('resends an earlier turn’s files with that turn, and a message of files alone is a turn', async () => {
		const thread = [
			message(4, 'owner', [file(1, 'basket.png', 'image/png'), { kind: 'text', text: 'What is in it?' }]),
			message(5, 'gardener', [{ kind: 'text', text: 'Leeks.' }]),
			message(6, 'owner', [file(2, 'manual.pdf', 'application/pdf')]),
			message(7, 'gardener', [{ kind: 'text', text: 'A manual.' }]),
		]
		const source = readers()
		const pack = await buildPack(request({ thread, message: 'And the first one again?' }), source)
		expect(pack.messages).toEqual([
			{ role: 'user', content: [image('basket.png'), { type: 'text', text: 'What is in it?' }] },
			{ role: 'assistant', content: 'Leeks.' },
			{
				role: 'user',
				content: [
					{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'pdf:manual.pdf' } },
				],
			},
			{ role: 'assistant', content: 'A manual.' },
			{ role: 'user', content: 'And the first one again?' },
		])
		expect(source.read).toEqual([id(1), id(2)])
		expect(pack.attached).toEqual(['basket.png', 'manual.pdf'])
	})

	it('says so in place of a file whose bytes are gone, and does not log it', async () => {
		const thread = [message(4, 'owner', [file(1, 'basket.png', 'image/png'), { kind: 'text', text: 'What is in it?' }])]
		const pack = await buildPack(
			request({ thread, attachments: [file(2, 'manual.pdf', 'application/pdf')] }),
			readers([id(1), id(2)])
		)
		expect(pack.messages).toEqual([
			{
				role: 'user',
				content: [
					{ type: 'text', text: '[attachment unavailable: basket.png]' },
					{ type: 'text', text: 'What is in it?' },
				],
			},
			{
				role: 'user',
				content: [
					{ type: 'text', text: '[attachment unavailable: manual.pdf]' },
					{ type: 'text', text: 'What is this?' },
				],
			},
		])
		expect(pack.attachments).toEqual([])
		expect(pack.tier).toBe('T0')
	})

	it('lets go of the oldest turns’ files before any turn, and never the message’s own', async () => {
		const big = { width: 1568, height: 1568 }
		const thread = [
			message(4, 'owner', [file(1, 'first.png', 'image/png', big), { kind: 'text', text: 'One.' }]),
			message(5, 'gardener', [{ kind: 'text', text: 'Seen.' }]),
			message(6, 'owner', [file(2, 'second.png', 'image/png', big), { kind: 'text', text: 'Two.' }]),
			message(7, 'gardener', [{ kind: 'text', text: 'Seen too.' }]),
		]
		const attachments = [file(3, 'third.png', 'image/png', big)]
		const full = await buildPack(request({ thread, attachments }), readers())
		expect(full.trimmed).toEqual([])

		// one image too many for the budget: the oldest turn's goes, its words stay
		const source = readers()
		const tight = await buildPack(
			request({ thread, attachments, tokenCap: full.estimatedInputTokens - 1, outputReserve: 0 }),
			source
		)
		expect(tight.trimmed).toEqual(['thread'])
		expect(tight.messages).toHaveLength(5)
		expect(contentOf(tight.messages[0])).toEqual([
			{ type: 'text', text: '[attachment no longer sent: first.png]' },
			{ type: 'text', text: 'One.' },
		])
		expect(contentOf(tight.messages[2])).toEqual([image('second.png'), { type: 'text', text: 'Two.' }])
		// a file that is let go is never read
		expect(source.read).toEqual([id(2), id(3)])
		expect(tight.attached).toEqual(['second.png', 'third.png'])

		// no room for anything: the turns go, the message keeps its file
		const bare = await buildPack(request({ thread, attachments, tokenCap: 1, outputReserve: 0 }), readers())
		expect(bare.messages).toHaveLength(1)
		expect(contentOf(bare.messages[0])).toEqual([image('third.png'), { type: 'text', text: 'What is this?' }])
		expect(bare.attached).toEqual(['third.png'])
	})

	it('holds the request to its size as well as its budget', async () => {
		const heavy = Math.floor(REQUEST_MAX_BYTES * 0.6)
		const thread = [
			message(4, 'owner', [file(1, 'old.pdf', 'application/pdf', { size: heavy }), { kind: 'text', text: 'One.' }]),
			message(5, 'gardener', [{ kind: 'text', text: 'Seen.' }]),
		]
		const pack = await buildPack(
			request({ thread, attachments: [file(2, 'new.pdf', 'application/pdf', { size: heavy })] }),
			readers()
		)
		expect(pack.trimmed).toEqual(['thread'])
		expect(contentOf(pack.messages[0])).toEqual([
			{ type: 'text', text: '[attachment no longer sent: old.pdf]' },
			{ type: 'text', text: 'One.' },
		])
		expect(pack.attached).toEqual(['new.pdf'])
	})
})
