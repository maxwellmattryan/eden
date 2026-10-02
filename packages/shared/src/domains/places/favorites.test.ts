import { describe, expect, it } from 'vitest'
import { favouriteChanges, favouriteVibes } from './favorites.js'
import type { SavedPlace } from './types.js'

const place = (id: string, vibes: string[], favourite = false): SavedPlace => ({
	id,
	name: id,
	vibes,
	favourite,
	providerIds: {},
})

describe('favouriteVibes', () => {
	it('is nothing while nothing is saved', () => {
		expect(favouriteVibes([], [])).toEqual([])
		expect(favouriteVibes([place('a', [])], [])).toEqual([])
	})

	it('counts a saved place once, a favourite three times, against the strongest', () => {
		const vibes = favouriteVibes(
			[place('a', ['cozy', 'outdoors'], true), place('b', ['cozy']), place('c', ['lively'])],
			[]
		)
		expect(vibes).toEqual([
			{ name: 'cozy', weight: 1 },
			{ name: 'outdoors', weight: 0.75 },
			{ name: 'lively', weight: 0.25 },
		])
	})

	it('counts a visit, more for a good one, and takes back a bad one', () => {
		const places = [place('a', ['calm']), place('b', ['lively'])]
		const loved = favouriteVibes(places, [
			{ id: '1', placeId: 'a', day: '2026-09-20', rating: 5 },
			{ id: '2', placeId: 'b', day: '2026-09-21', rating: 1 },
			{ id: '3', placeId: 'gone', day: '2026-09-21', rating: 5 },
		])
		expect(loved).toEqual([
			{ name: 'calm', weight: 1 },
			{ name: 'lively', weight: 0.33 },
		])
	})

	it('leaves out what is faint, and says eight at most', () => {
		const many = Array.from({ length: 12 }, (_, i) => place(`p${i}`, [`v${i}`], i < 9))
		const vibes = favouriteVibes(
			[...many, place('strong', ['v0'], true), place('strong2', ['v0'], true), place('s3', ['v0'], true)],
			[]
		)
		expect(vibes).toHaveLength(8)
		expect(vibes[0]).toEqual({ name: 'v0', weight: 1 })
		// one saved place among a vibe carried by four favourites is a twelfth: too faint to say
		expect(vibes.some((vibe) => vibe.name === 'v11')).toBe(false)
	})
})

describe('favouriteChanges', () => {
	it('asserts what is new, moves a weight that changed, and removes what is no longer leaned to', () => {
		const changes = favouriteChanges(
			[
				{ name: 'cozy', weight: 1 },
				{ name: 'calm', weight: 0.5 },
				{ name: 'quiet', weight: 0.4 },
			],
			[
				{ id: 'f1', value: { name: 'cozy', weight: 0.98 } },
				{ id: 'f2', value: { name: 'calm', weight: 0.9 } },
				{ id: 'f3', value: { name: 'lively', weight: 0.6 } },
				{ id: 'f4', value: { name: 'cozy', weight: 1 } },
				{ id: 'f5', value: 'not a weight' },
			]
		)
		expect(changes.assert).toEqual([{ name: 'quiet', weight: 0.4 }])
		expect(changes.update).toEqual([{ id: 'f2', value: { name: 'calm', weight: 0.5 } }])
		// the vibe that went, the second fact of one vibe, and the fact that is not a weight
		expect(changes.remove).toEqual(['f3', 'f4', 'f5'])
	})
})
