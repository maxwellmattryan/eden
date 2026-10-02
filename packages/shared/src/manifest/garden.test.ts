import { describe, expect, it } from 'vitest'
import {
	addTile,
	catalogGroups,
	declarations,
	defaultLayout,
	gardenCatalog,
	gardenLayout,
	moveTile,
	parseLayout,
	removeTile,
	resizeTile,
	shell,
	stepTile,
	type StoredLayout,
} from './index.js'

const without = (id: string) => declarations.filter((declaration) => declaration.id !== id)
const ids = (stored?: StoredLayout, enabled = declarations) =>
	gardenLayout(enabled, shell, stored).map((tile) => tile.id)
const DEFAULT = defaultLayout(declarations, shell).map((tile) => tile.id)

describe('gardenLayout', () => {
	it('is the default until the owner edits it', () => {
		expect(gardenLayout(declarations, shell)).toEqual(defaultLayout(declarations, shell))
	})

	it("follows the owner's order and sizes", () => {
		const stored: StoredLayout = {
			v: 1,
			tiles: [
				{ id: 'sun-and-moon', size: 's' },
				{ id: 'weather-now', size: 'm' },
			],
			seen: DEFAULT,
		}
		expect(gardenLayout(declarations, shell, stored).map((tile) => [tile.id, tile.size])).toEqual([
			['sun-and-moon', 's'],
			['weather-now', 'm'],
		])
	})

	it('gives a size the tile does not declare its first, and places a tile once', () => {
		const stored: StoredLayout = {
			v: 1,
			tiles: [
				{ id: 'cook-tonight', size: 'l' },
				{ id: 'cook-tonight', size: 'm' },
				{ id: 'no-such-tile', size: 's' },
			],
			seen: DEFAULT,
		}
		expect(gardenLayout(declarations, shell, stored).map((tile) => [tile.id, tile.size])).toEqual([
			['cook-tonight', 'm'],
		])
	})

	it("leaves out a disabled domain's tiles and has them back in place when it is enabled", () => {
		const stored = moveTile(undefined, declarations, shell, 'expiring-soon', 'weather-now')
		expect(ids(stored, without('kitchen'))).not.toContain('expiring-soon')
		const edited = removeTile(stored, without('kitchen'), shell, 'today')
		expect(ids(edited).slice(0, 2)).toEqual(['expiring-soon', 'weather-now'])
		expect(ids(edited)).not.toContain('today')
	})

	it('adds a default tile it has never seen at the end, once', () => {
		const stored: StoredLayout = { v: 1, tiles: [{ id: 'weather-now', size: 's' }], seen: ['weather-now', 'today'] }
		const shown = ids(stored)
		expect(shown[0]).toBe('weather-now')
		expect(shown).not.toContain('today')
		expect(shown).toContain('cook-tonight')
		expect(shown).not.toContain('grocery-quick-add')
		// once the owner edits, everything in the catalog is seen, so what they remove stays removed
		const edited = removeTile(stored, declarations, shell, 'cook-tonight')
		expect(ids(edited)).not.toContain('cook-tonight')
		expect(edited?.seen).toEqual(expect.arrayContaining(gardenCatalog(declarations, shell).map((w) => w.id)))
	})
})

describe('the edits', () => {
	it('moves a tile before another, or to the end', () => {
		expect(ids(moveTile(undefined, declarations, shell, 'sun-and-moon', 'weather-now')).slice(0, 2)).toEqual([
			'sun-and-moon',
			'weather-now',
		])
		expect(ids(moveTile(undefined, declarations, shell, 'weather-now', null)).at(-1)).toBe('weather-now')
	})

	it('leaves the layout as it was when a move names nothing placed', () => {
		expect(moveTile(undefined, declarations, shell, 'no-such-tile', null)).toBeUndefined()
		expect(moveTile(undefined, declarations, shell, 'weather-now', 'no-such-tile')).toBeUndefined()
		expect(moveTile(undefined, declarations, shell, 'weather-now', 'weather-now')).toBeUndefined()
	})

	it('steps a tile earlier and later, and stops at the ends', () => {
		expect(ids(stepTile(undefined, declarations, shell, 'today', -1)).slice(0, 2)).toEqual(['today', 'weather-now'])
		expect(ids(stepTile(undefined, declarations, shell, 'weather-now', 1)).slice(0, 2)).toEqual([
			'today',
			'weather-now',
		])
		expect(stepTile(undefined, declarations, shell, 'weather-now', -1)).toBeUndefined()
		expect(stepTile(undefined, declarations, shell, DEFAULT.at(-1) ?? '', 1)).toBeUndefined()
	})

	it('steps over a tile that is not shown', () => {
		// weather-now, today, expiring-soon: with Hearth off, today's next shown neighbour is past Hearth's two
		const stepped = stepTile(undefined, without('kitchen'), shell, 'today', 1)
		expect(ids(stepped, without('kitchen')).slice(0, 3)).toEqual(['weather-now', 'resurfaced-idea', 'today'])
	})

	it('resizes among the declared sizes only', () => {
		const wide = resizeTile(undefined, declarations, shell, 'weather-now', 'm')
		expect(gardenLayout(declarations, shell, wide)[0]).toMatchObject({ id: 'weather-now', size: 'm' })
		expect(resizeTile(undefined, declarations, shell, 'weather-now', 'l')).toBeUndefined()
		expect(resizeTile(undefined, declarations, shell, 'weather-now', 's')).toBeUndefined()
	})

	it('removes a tile and adds one from the catalog, once', () => {
		const removed = removeTile(undefined, declarations, shell, 'today')
		expect(ids(removed)).toEqual(DEFAULT.filter((id) => id !== 'today'))
		const added = addTile(removed, declarations, shell, 'grocery-quick-add')
		expect(gardenLayout(declarations, shell, added).at(-1)).toMatchObject({ id: 'grocery-quick-add', size: 's' })
		expect(addTile(added, declarations, shell, 'grocery-quick-add')).toBe(added)
		expect(addTile(added, declarations, shell, 'no-such-tile')).toBe(added)
		expect(ids(addTile(added, declarations, shell, 'today')).at(-1)).toBe('today')
	})
})

describe('parseLayout', () => {
	it('reads what an edit stores', () => {
		const stored = removeTile(undefined, declarations, shell, 'today')
		expect(parseLayout(JSON.stringify(stored))).toEqual(stored)
	})

	it('takes anything else as no layout', () => {
		for (const raw of [null, '', 'nope', '[]', '{"v":2,"tiles":[],"seen":[]}', '{"v":1,"tiles":[{"id":1}],"seen":[]}'])
			expect(parseLayout(raw)).toBeUndefined()
		expect(parseLayout('{"v":1,"tiles":[{"id":"today","size":"xl"}],"seen":[]}')).toBeUndefined()
		expect(parseLayout('{"v":1,"tiles":[],"seen":[1]}')).toBeUndefined()
	})
})

describe('catalogGroups', () => {
	it('groups by owner in the declared order, the shell last, and marks what is placed', () => {
		const groups = catalogGroups(gardenCatalog(declarations, shell), DEFAULT)
		expect(groups.map((group) => group.owner)).toEqual(['kitchen', 'toolbench', 'weather', 'places', 'shell'])
		expect(groups[0]?.entries.map((entry) => [entry.id, entry.placed])).toEqual([
			['expiring-soon', true],
			['cook-tonight', true],
			['grocery-quick-add', false],
		])
	})
})
