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

	it('turns an EOB into the provider’s estimate, and one that leaves nothing to pay into no bill (#85)', async () => {
		const eob = {
			isBill: false,
			eob: true,
			payee: 'Seton Medical',
			insurer: 'Aetna',
			serviceDay: '2026-08-14',
			due: '',
		}
		const result = await delegate.parse(answer({ ...eob, amount: '240.00', last4: '8823' }), {}, ctx(''))
		expect(result.failure).toBeUndefined()
		expect(result.card).toEqual({
			kind: 'bill',
			bill: {
				payee: 'Seton Medical',
				amount: { minor: 24000, currency: 'USD' },
				period: '2026-08',
				source: 'letter',
				estimate: true,
				insurance: 'medical',
				eob: true,
				insurer: 'Aetna',
				serviceDay: '2026-08-14',
			},
		})
		for (const amount of ['0', '$0.00']) {
			const none = await delegate.parse(answer({ ...eob, amount }), {}, ctx(''))
			expect(none.failure, amount).toBe('empty')
			expect((none.output as { status?: string }).status, amount).toBe('nothing-owed')
			expect(none.card).toBeUndefined()
		}
		// a bill of 0 is still no bill, not an EOB with nothing owed
		expect((await delegate.parse(answer({ amount: '0' }), {}, ctx(''))).output).not.toHaveProperty('status')
	})

	it('tells the model an EOB is not a bill and names the provider as payee', async () => {
		const prompt = await delegate.prompt({ text: 'EOB' }, ctx(''))
		expect(prompt).toContain('explanation of benefits (EOB) from an insurer is not a bill')
		expect(prompt).toContain('name the provider who will bill the owner as the payee')
	})
})
