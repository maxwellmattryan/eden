import { describe, expect, it } from 'vitest'
import { declarations, shell } from './index.js'
import { parsePinned, pinnedPair, withPinned } from './pinned.js'

const without = (id: string) => declarations.filter((declaration) => declaration.id !== id)

describe('pinnedPair', () => {
	it('is the declared pair until the owner chooses', () => {
		expect(pinnedPair(undefined, declarations, shell)).toEqual(['kitchen', 'weather'])
	})

	it("keeps the owner's two, in their order", () => {
		expect(pinnedPair(['places', 'toolbench'], declarations, shell)).toEqual(['places', 'toolbench'])
		expect(pinnedPair(['weather', 'kitchen'], declarations, shell)).toEqual(['weather', 'kitchen'])
	})

	it('fills the place of an unknown, a disabled or a repeated id from the declared pair', () => {
		expect(pinnedPair(['places', 'nowhere'], declarations, shell)).toEqual(['places', 'kitchen'])
		expect(pinnedPair(['kitchen', 'places'], without('kitchen'), shell)).toEqual(['places', 'weather'])
		expect(pinnedPair(['places', 'places'], declarations, shell)).toEqual(['places', 'kitchen'])
	})

	it('passes over a domain the app has no page for', () => {
		const routable = (id: string) => id !== 'kitchen'
		expect(pinnedPair(['kitchen', 'places'], declarations, shell, routable)).toEqual(['places', 'weather'])
		expect(pinnedPair(undefined, declarations, shell, routable)).toEqual(['weather', 'toolbench'])
	})

	it('never pins more than the shell declares, and fewer only when fewer qualify', () => {
		expect(pinnedPair(['places', 'toolbench', 'weather'], declarations, shell)).toEqual(['places', 'toolbench'])
		expect(pinnedPair(['places'], declarations, shell, (id) => id === 'places')).toEqual(['places'])
		expect(pinnedPair(['places'], [], shell)).toEqual([])
	})
})

describe('withPinned', () => {
	it('puts a domain in a slot', () => {
		expect(withPinned(['kitchen', 'weather'], 0, 'places')).toEqual(['places', 'weather'])
		expect(withPinned(['kitchen', 'weather'], 1, 'places')).toEqual(['kitchen', 'places'])
	})

	it('swaps the two when a slot takes what the other holds', () => {
		expect(withPinned(['kitchen', 'weather'], 0, 'weather')).toEqual(['weather', 'kitchen'])
		expect(withPinned(['kitchen', 'weather'], 1, 'kitchen')).toEqual(['weather', 'kitchen'])
	})

	it('leaves the pair alone when a slot takes what it holds', () => {
		expect(withPinned(['kitchen', 'weather'], 0, 'kitchen')).toEqual(['kitchen', 'weather'])
	})
})

describe('parsePinned', () => {
	it('reads the ids, and nothing as no choice', () => {
		expect(parsePinned('places,toolbench')).toEqual(['places', 'toolbench'])
		expect(parsePinned(' places , ,toolbench ')).toEqual(['places', 'toolbench'])
		expect(parsePinned(null)).toBeUndefined()
		expect(parsePinned(',')).toBeUndefined()
	})
})
