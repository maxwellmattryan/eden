import { describe, expect, it } from 'vitest'
import type { ToolContext, ToolFiles } from '../../shell/gardener/types.js'
import { financeTools } from './tools.js'
import { WHOLE, type Account } from './types.js'

const CARD: Account = {
	id: 'card',
	name: 'Sapphire',
	kind: 'credit-card',
	currency: 'USD',
	share: WHOLE,
	last4: '8823',
}
const tools = financeTools({ accounts: async () => [CARD], home: () => 'USD' })
const draft = tools.draft!
if (!('delegate' in draft)) throw new Error('finance.draft is a delegate')
const { delegate } = draft

const FILES: ToolFiles = {
	blocks: [{ kind: 'attachment', id: 'fp', name: 'letter.png', mime: 'image/png', size: 10, hash: 'fp' }],
}
const ctx = (threadId: string): ToolContext => ({
	threadId,
	requestId: 'r',
	grade: 'light',
	lang: 'en',
	zone: 'America/Chicago',
	today: '2026-09-30',
	undo: () => undefined,
	focus: [],
	files: FILES,
	links: [],
	reach: [],
})
const answer = (fields: Record<string, unknown>) =>
	JSON.stringify({
		isBill: true,
		payee: 'Austin Energy',
		amount: '142.37',
		currency: '',
		due: '2026-10-05',
		period: '2026-09',
		estimate: false,
		minimum: '',
		last4: '',
		repeats: 'none',
		url: '',
		...fields,
	})

describe('finance.draft', () => {
	it('reads the files only on a page run, never in a conversation (D-189)', async () => {
		expect(await delegate.files!({}, ctx(''))).toBe(FILES)
		expect(await delegate.files!({}, ctx('thread-1'))).toBeUndefined()
		expect(delegate.filesOptional!({})).toBe(true)
		expect(delegate.maxTokens).toBe(1500)
	})

	it('puts the confirmed text in the prompt as the owner’s document', async () => {
		const prompt = await delegate.prompt({ text: 'Amount due: $142.37' }, ctx(''))
		expect(prompt).toContain('<document>\nAmount due: $142.37\n</document>')
		expect(await delegate.prompt({}, ctx(''))).not.toContain('<document>')
	})

	it('turns the answer into a bill card', async () => {
		const result = await delegate.parse(answer({ last4: '8823', minimum: '35' }), {}, ctx('thread-1'))
		expect(result.failure).toBeUndefined()
		expect(result.card).toEqual({
			kind: 'bill',
			bill: {
				payee: 'Austin Energy',
				amount: { minor: 14237, currency: 'USD' },
				period: '2026-09',
				due: '2026-10-05',
				source: 'letter',
				accountId: 'card',
				minimum: { minor: 3500, currency: 'USD' },
			},
		})
		// the model reads no figure back
		expect(JSON.stringify(result.output)).not.toContain('142')
	})

	it('answers `empty` for what is not a bill, or an answer that does not parse', async () => {
		for (const text of [answer({ isBill: false }), answer({ amount: 'a lot' }), 'no JSON here'])
			expect(await delegate.parse(text, {}, ctx('')), text).toMatchObject({ failure: 'empty' })
	})
})
