import { describe, expect, it } from 'vitest'
import type { Money } from '../../money/index.js'
import { answerDeductions, payStubFromAnswer, payStubOps, premiumsOf } from './paystub.js'
import type { IncomeSource, PayStub } from './types.js'
import { incomeLine } from './words.js'

const usd = (minor: number): Money => ({ minor, currency: 'USD' })

const SOURCE: IncomeSource = {
	id: 'acme',
	kind: 'income',
	name: 'Acme',
	accountId: 'chk',
	cadence: 'biweekly',
	expected: usd(250000),
	firstDay: '2026-01-02',
	lastDay: '2026-10-16',
}

describe('pay stub from the answer', () => {
	it('keeps the deductions that hold', () => {
		const answer = {
			isPayStub: true,
			payDay: '2026-10-16',
			deductions: [
				{ name: '  Medical PPO ', kind: 'medical', amount: '92.30' },
				{ name: 'Dental', kind: 'dental', amount: '-$8.10' },
				{ name: 'Pet insurance', kind: 'pets', amount: '12.00' },
				{ name: '', kind: 'vision', amount: '3.00' },
				{ name: 'Vision', kind: 'vision', amount: '0.00' },
				{ name: 'Life', kind: 'life', amount: 'a lot' },
				{ name: 'x'.repeat(80), kind: 'tax', amount: '310.00' },
				'not a row',
			],
		}
		const { kept, deductions, skipped } = answerDeductions(answer, 'USD')
		expect(deductions).toEqual([
			{ name: 'Medical PPO', kind: 'medical', amount: usd(9230) },
			{ name: 'Dental', kind: 'dental', amount: usd(810) },
			{ name: 'Pet insurance', kind: 'other', amount: usd(1200) },
			{ name: 'x'.repeat(60), kind: 'tax', amount: usd(31000) },
		])
		expect(kept[1]).toEqual({ name: 'Dental', kind: 'dental', amount: '8.10' })
		expect(skipped).toBe(4)
		expect(payStubFromAnswer({ payDay: '2026-10-16', deductions: kept, skipped }, 'USD')).toEqual({
			day: '2026-10-16',
			deductions,
		})
		// no pay day read: the sheet takes today's
		expect(payStubFromAnswer({ payDay: 'Oct 16', deductions: kept }, 'USD')).toMatchObject({ day: '' })
	})

	it('keeps at most thirty', () => {
		const deductions = Array.from({ length: 34 }, (_, at) => ({ name: `D${at}`, kind: 'other', amount: '1.00' }))
		const out = answerDeductions({ deductions }, 'USD')
		expect(out.deductions).toHaveLength(30)
		expect(out.skipped).toBe(4)
	})

	it('is empty when nothing holds', () => {
		expect(payStubFromAnswer({ deductions: [{ name: 'Medical', kind: 'medical', amount: '0' }] }, 'USD')).toEqual({
			failure: 'empty',
		})
		expect(payStubFromAnswer(undefined, 'USD')).toEqual({ failure: 'empty' })
		// an amount that does not read in the currency
		expect(payStubFromAnswer({ deductions: [{ name: 'Medical', kind: 'medical', amount: '1.5' }] }, 'JPY')).toEqual({
			failure: 'empty',
		})
	})
})

describe('premiums', () => {
	const stub: PayStub = {
		day: '2026-10-16',
		deductions: [
			{ name: 'Medical', kind: 'medical', amount: usd(9230) },
			{ name: 'Dental', kind: 'dental', amount: usd(810) },
			{ name: 'Vision', kind: 'vision', amount: usd(300) },
			{ name: 'Life', kind: 'life', amount: usd(150) },
			{ name: 'LTD', kind: 'disability', amount: usd(420) },
			{ name: 'HSA', kind: 'hsa', amount: usd(5000) },
			{ name: '401(k)', kind: 'retirement', amount: usd(20000) },
			{ name: 'Federal', kind: 'tax', amount: usd(31000) },
			{ name: 'Yen plan', kind: 'medical', amount: { minor: 1000, currency: 'JPY' } },
		],
	}

	it('sums the insurance kinds in the currency', () => {
		expect(premiumsOf(stub, 'USD')).toEqual(usd(10910))
		expect(premiumsOf(stub, 'JPY')).toEqual({ minor: 1000, currency: 'JPY' })
	})

	it('end the income row’s line', () => {
		const tr = (key: string, options?: { values?: Record<string, string | number> }) =>
			`${key.split('.').at(-1)}${options?.values ? `(${Object.values(options.values).join(',')})` : ''}`
		const line = (premiums?: string) =>
			incomeLine({ source: { ...SOURCE, nextDay: undefined }, thirdChecks: [], home: 'USD', premiums }, tr, 'en')
		expect(line('$109.10')).toBe('biweekly · premiums($109.10)')
		expect(line()).toBe('biweekly')
	})

	it('answers nothing with none', () => {
		expect(premiumsOf({ day: '2026-10-16', deductions: [stub.deductions[5]!] }, 'USD')).toBeUndefined()
		expect(premiumsOf(undefined, 'USD')).toBeUndefined()
	})
})

describe('ops', () => {
	const stub: PayStub = { day: '2026-10-16', deductions: [{ name: 'Medical', kind: 'medical', amount: usd(9230) }] }

	it('a capture keeps the deductions with the stub’s file import, and the inverse takes both back', () => {
		const out = payStubOps(SOURCE, stub, { id: 'fi', fingerprint: 'ab12', day: '2026-10-20' })
		expect(out.source.payStub).toEqual({ ...stub, importId: 'fi' })
		const { id: _id, ...payload } = out.source
		expect(out.ops).toEqual([
			{ op: 'updateEntity', id: 'acme', payload },
			{
				op: 'createEntity',
				input: {
					id: 'fi',
					type: 'file-import',
					source: 'document',
					externalId: 'ab12',
					payload: { kind: 'pay-stub', day: '2026-10-20', sourceId: 'acme', rows: 1 },
				},
			},
		])
		const { id: _was, ...before } = SOURCE
		expect(out.inverse).toEqual([
			{ op: 'updateEntity', id: 'acme', payload: before },
			{ op: 'delete', uri: 'eden://file-import/fi' },
		])
	})

	it('an edit keeps the stub’s file import', () => {
		const held = { ...SOURCE, payStub: { ...stub, importId: 'fi' } }
		const edited = payStubOps(held, { ...stub, deductions: [...stub.deductions, stub.deductions[0]!] })
		expect(edited.ops).toHaveLength(1)
		expect(edited.source.payStub?.importId).toBe('fi')
		expect(edited.source.payStub?.deductions).toHaveLength(2)
	})

	it('clearing drops the deductions and tombstones their file import, and the inverse restores both', () => {
		const held = { ...SOURCE, payStub: { ...stub, importId: 'fi' } }
		const out = payStubOps(held, { ...stub, deductions: [] })
		expect(out.source).not.toHaveProperty('payStub')
		const { id: _id, ...payload } = out.source
		const { id: _held, ...before } = held
		expect(out.ops).toEqual([
			{ op: 'updateEntity', id: 'acme', payload },
			{ op: 'delete', uri: 'eden://file-import/fi' },
		])
		expect(out.inverse).toEqual([
			{ op: 'updateEntity', id: 'acme', payload: before },
			{ op: 'restore', uri: 'eden://file-import/fi' },
		])
		expect(payStubOps(held, undefined).ops).toEqual(out.ops)
	})
})
