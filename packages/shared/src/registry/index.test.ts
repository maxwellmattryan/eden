import { describe, expect, it } from 'vitest'
import { isResourceId } from '../data/uri.js'
import {
	RESOURCES,
	isEntityType,
	isKind,
	isResource,
	kindsOf,
	ownerOf,
	resource,
	resourcesOf,
	tierOf,
} from './index.js'

describe('the registry', () => {
	it('holds each id once, well formed', () => {
		const ids = RESOURCES.map((row) => row.id)
		expect(new Set(ids).size).toBe(ids.length)
		expect(ids.filter((id) => !isResourceId(id))).toEqual([])
	})

	it('answers the owner and the tier of a resource', () => {
		expect(ownerOf('stock-item')).toBe('kitchen')
		expect(ownerOf('home-area')).toBe('substrate')
		expect(tierOf('allergy')).toBe('T2')
		expect(tierOf('event')).toBe('by-kind')
		expect(resource('kitchen.recipe')).toBeUndefined()
		expect(isResource('recipe')).toBe(true)
	})

	it('keeps a primitive out of the entity types', () => {
		expect(isEntityType('recipe')).toBe(true)
		expect(isEntityType('task')).toBe(false)
		expect(isEntityType('shop-day')).toBe(false)
		expect(resource('task')?.category).toBe('primitive')
	})

	it('lets a write name a live resource only, and a read any', () => {
		// Sanctuary is Phase 2 and not built; Vigor is Phase 2 and built (D-177)
		expect(resource('reading-log')).toMatchObject({ owner: 'spirit', phase: 2, live: false })
		expect(isEntityType('reading-log')).toBe(false)
		expect(resource('workout-session')).toMatchObject({ owner: 'fitness', phase: 2, live: true })
		expect(isKind('event', 'workout-session')).toBe(true)
		expect(isEntityType('workout-log')).toBe(true)
		expect(isEntityType('account')).toBe(false)
		expect(isKind('event', 'shop-day')).toBe(true)
		expect(isKind('task', 'shop-day')).toBe(false)
	})

	it('lists the live kinds of a primitive, whoever owns them', () => {
		expect(kindsOf('task')).toEqual(['todo', 'checklist', 'routine', 'habit', 'reminder'])
		expect(kindsOf('event')).toEqual(['local-event', 'shop-day', 'outing', 'workout-session'])
		expect(kindsOf('place')).toEqual(['home', 'venue'])
		expect(kindsOf('attachment')).toEqual([
			'document',
			'photo',
			'haul-photo',
			'item-photo',
			'recipe-photo',
			'store-photo',
			'render',
			'place-photo',
		])
	})

	it('lists what an owner holds', () => {
		expect(resourcesOf('weather').map((row) => row.id)).toEqual([
			'forecast',
			'alert',
			'ephemeris',
			'air-quality',
			'allergens',
		])
		expect(resourcesOf('garden')).toEqual([])
	})
})
