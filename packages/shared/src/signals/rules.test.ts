import { describe, expect, it } from 'vitest'
import { newId } from '../data/ulid.js'
import { toUri } from '../data/uri.js'
import {
	deliveriesFor,
	mayShowContent,
	messageValues,
	notificationKeys,
	rulesOf,
	signalCutoff,
	signalTier,
	validateSignal,
	type RuleSource,
} from './rules.js'
import { MAX_PAYLOAD_BYTES, type SignalInput } from './types.js'

const declarations: Record<string, RuleSource> = {
	weather: {
		notificationKinds: [
			{
				id: 'severe-alert',
				channel: 'os',
				default: true,
				signal: 'weather.alert',
				when: { severity: ['severe', 'extreme'] },
			},
			{ id: 'frost-warning', channel: 'in-app', default: true, signal: null, when: null },
		],
	},
	kitchen: {
		notificationKinds: [
			{ id: 'expiring-digest', channel: 'in-app', default: true, signal: 'stock.expiring' },
			{ id: 'low-stock', channel: 'in-app', default: true },
		],
	},
	toolbench: {
		notificationKinds: [{ id: 'stale-idea-nudge', channel: 'in-app', default: false, signal: 'idea.stale' }],
	},
}

describe('signal rules', () => {
	it('makes a rule of each notification kind that answers a signal and is on', () => {
		expect(rulesOf(declarations)).toEqual([
			{
				id: 'weather.severe-alert',
				domain: 'weather',
				kind: 'severe-alert',
				signal: 'weather.alert',
				channel: 'os',
				when: { severity: ['severe', 'extreme'] },
			},
			{
				id: 'kitchen.expiring-digest',
				domain: 'kitchen',
				kind: 'expiring-digest',
				signal: 'stock.expiring',
				channel: 'in-app',
				when: null,
			},
		])
	})

	it('delivers a signal to the rules it triggers whose condition holds', () => {
		const rules = rulesOf(declarations)
		expect(deliveriesFor(rules, 'weather.alert', { severity: 'severe' })).toEqual([
			{ rule: 'weather.severe-alert', channel: 'os' },
		])
		// A field that is missing, of another value or not a word does not hold.
		expect(deliveriesFor(rules, 'weather.alert', { severity: 'moderate' })).toEqual([])
		expect(deliveriesFor(rules, 'weather.alert', {})).toEqual([])
		expect(deliveriesFor(rules, 'weather.alert', { severity: ['severe'] })).toEqual([])
		// No condition always holds; no rule is no card.
		expect(deliveriesFor(rules, 'stock.expiring')).toEqual([{ rule: 'kitchen.expiring-digest', channel: 'in-app' }])
		expect(deliveriesFor(rules, 'idea.stale', {})).toEqual([])
	})

	it('takes the highest tier of what a payload names', () => {
		const uri = (type: string) => toUri(type, newId())
		expect(signalTier(undefined)).toBe('T0')
		expect(signalTier({ uris: [] })).toBe('T0')
		expect(signalTier({ uris: [uri('stock-item'), uri('grocery-list')] })).toBe('T0')
		expect(signalTier({ uris: [uri('stock-item'), uri('idea')] })).toBe('T1')
		expect(signalTier({ uris: [uri('idea'), uri('device'), uri('stock-item')] })).toBe('T2')
		// An Event's tier is its kind's, which the URI does not say; and what is not known is not told either.
		expect(signalTier({ uris: [uri('stock-item'), uri('event')] })).toBe('T2')
		expect(signalTier({ uris: [uri('spaceship')] })).toBe('T2')
		expect(signalTier({ uris: ['not a uri', 7] })).toBe('T2')
	})

	it('refuses what the store would refuse', () => {
		const good: SignalInput = { name: 'stock.expiring', tier: 'T1', payload: { count: 2 }, dedupeKey: '2026-09-30' }
		expect(validateSignal(good)).toBeUndefined()
		expect(validateSignal({ name: 'idea.stale', tier: 'T0' })).toBeUndefined()
		for (const bad of [
			{ ...good, name: 'expiring' },
			{ ...good, name: 'Stock.Expiring' },
			{ ...good, tier: 'by-kind' as never },
			{ ...good, payload: ['eden://stock-item/1'] as never },
			{ ...good, payload: { note: 'x'.repeat(MAX_PAYLOAD_BYTES) } },
			{ ...good, dedupeKey: '' },
			{ ...good, deliveries: [{ rule: 'expiring-digest', channel: 'in-app' as const }] },
			{
				...good,
				deliveries: [
					{ rule: 'kitchen.shop-day-reminder', channel: 'os' as const },
					{ rule: 'kitchen.shop-day-reminder', channel: 'in-app' as const },
				],
			},
		]) {
			expect(validateSignal(bad)?.[0]).toBe('signal:invalid')
		}
	})

	it("finds a rule's words, and what a payload gives them to write with", () => {
		expect(notificationKeys('kitchen.shop-day-reminder')).toEqual({
			domain: 'kitchen',
			kind: 'shop-day-reminder',
			line: 'domains.kitchen.notifications.shopDayReminder.line',
			title: 'domains.kitchen.notifications.shopDayReminder.title',
		})
		expect(notificationKeys('weather.severe-alert').line).toBe('domains.weather.notifications.severeAlert.line')
		expect(
			messageValues({ uris: ['eden://stock-item/1'], count: 2, first: 'Spinach', fresh: true, more: null })
		).toEqual({
			count: 2,
			first: 'Spinach',
		})
		// From T2 up an OS notification does not say what it is about.
		expect(['T0', 'T1', 'T2', 'T3'].map((tier) => mayShowContent(tier as never))).toEqual([true, true, false, false])
	})

	it('keeps a signal thirty days', () => {
		const now = 1_790_000_000_000
		const cutoff = signalCutoff(now)
		expect(parseInt(cutoff.slice(0, 16), 16)).toBe(now - 30 * 24 * 60 * 60 * 1000)
		expect(signalCutoff(0)).toBe('0000000000000000-00000000-00000000')
	})
})
