import { describe, expect, it } from 'vitest'
import { deviceStorage, storage } from './keys.js'

describe('settings keys', () => {
	it('keeps the Garden and the pinned tabs out of what a bundle carries (D-156, D-160)', () => {
		expect(Object.keys(storage)).not.toContain('gardenLayout')
		expect(Object.keys(storage)).not.toContain('pinnedTabs')
		expect(deviceStorage.gardenLayout).toBe('eden:garden-layout')
		expect(deviceStorage.pinnedTabs).toBe('eden:pinned-tabs')
	})

	it('carries the home currency in a bundle, as the week start is (D-188)', () => {
		expect(storage.homeCurrency).toBe('eden:home-currency')
		expect(Object.values(deviceStorage)).not.toContain('eden:home-currency')
	})

	it('never stores one key in both groups', () => {
		const carried = new Set<string>(Object.values(storage))
		for (const key of Object.values(deviceStorage)) expect(carried.has(key)).toBe(false)
	})
})
