import { describe, expect, it } from 'vitest'
import { OPEN_REQUESTS_KEY, openRequests } from './open-requests.js'
import type { AuditEntryInput } from './runtime-types.js'

const entry = (id: string): AuditEntryInput => ({
	id,
	at: 1,
	surface: 'global-chat',
	threadId: null,
	parentRequestId: null,
	tool: null,
	domain: null,
	declaredGrade: 'light',
	grade: 'light',
	source: 'map',
	provider: 'anthropic',
	model: 'm',
	reads: [],
	entities: [],
	tools: [],
	confirmOutcome: null,
	tokensIn: 100,
	tokensOut: 0,
	cacheRead: 0,
	costUsd: 0.001,
	outcome: 'ok',
	grants: [],
	image: null,
})

function memory() {
	const items = new Map<string, string>()
	return {
		items,
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => void items.set(key, value),
		removeItem: (key: string) => void items.delete(key),
	}
}

describe('openRequests', () => {
	it('keeps a sent request as interrupted until it settles', () => {
		const storage = memory()
		const open = openRequests(() => storage)
		open.open(entry('a'))
		open.open(entry('b'))
		open.count('a', { tokensIn: 120, tokensOut: 40, cacheRead: 0, costUsd: 0.002 })
		open.close('b')
		expect(open.take()).toEqual([
			{ ...entry('a'), tokensIn: 120, tokensOut: 40, costUsd: 0.002, outcome: 'interrupted' },
		])
		expect(open.take()).toEqual([])
		expect(storage.items.has(OPEN_REQUESTS_KEY)).toBe(false)
	})

	it('counts nothing for a request that is not open', () => {
		const storage = memory()
		const open = openRequests(() => storage)
		open.count('a', { tokensIn: 1, tokensOut: 1, cacheRead: 0, costUsd: 1 })
		open.close('a')
		expect(open.take()).toEqual([])
	})

	it('keeps nothing, and breaks nothing, without a storage or with one that throws or holds something else', () => {
		const none = openRequests(() => undefined)
		none.open(entry('a'))
		expect(none.take()).toEqual([])
		const throwing = openRequests(() => {
			throw new Error('denied')
		})
		throwing.open(entry('a'))
		throwing.close('a')
		expect(throwing.take()).toEqual([])
		const storage = memory()
		storage.items.set(OPEN_REQUESTS_KEY, '[1, 2]')
		expect(openRequests(() => storage).take()).toEqual([])
	})
})
