import { describe, expect, it } from 'vitest'
import { deviceStorage, storage } from './keys.js'

describe('settings keys', () => {
	it('keeps the Garden and the pinned tabs out of what a bundle carries (D-156, D-160)', () => {
		expect(Object.keys(storage)).not.toContain('gardenLayout')
		expect(Object.keys(storage)).not.toContain('pinnedTabs')
		expect(deviceStorage.gardenLayout).toBe('eden:garden-layout')
		expect(deviceStorage.pinnedTabs).toBe('eden:pinned-tabs')
	})

	it('keeps the phone lock and hidden amounts on this device, out of what a bundle carries', () => {
		expect(Object.keys(storage)).not.toContain('lockAfter')
		expect(Object.keys(storage)).not.toContain('hideAmounts')
		expect(deviceStorage.lockAfter).toBe('eden:lock-after')
		expect(deviceStorage.hideAmounts).toBe('eden:hide-amounts')
	})

	it('never stores one key in both groups', () => {
		const carried = new Set<string>(Object.values(storage))
		for (const key of Object.values(deviceStorage)) expect(carried.has(key)).toBe(false)
	})
})
