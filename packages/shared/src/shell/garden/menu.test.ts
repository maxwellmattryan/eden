import { describe, expect, it, vi } from 'vitest'
import type { MenuItem } from '@eden/ui-kit'
import type { LayoutTile } from '../../manifest/index.js'
import { tileMenu, type TileEdits } from './menu.js'

const tr = (key: string) => key
const tile = {
	id: 'expiring-soon',
	owner: 'kitchen',
	glyph: 'kitchen',
	size: 'm',
	title: 't',
	empty: 'e',
} as LayoutTile
const edits = (): TileEdits => ({ step: vi.fn(), resize: vi.fn(), remove: vi.fn() })

describe('tileMenu', () => {
	it('offers earlier, later, the declared sizes and remove, with the current size checked', () => {
		const menu = tileMenu(tile, 1, 3, ['s', 'm'], tr, edits())
		expect(menu.map((item) => item.id)).toEqual(['earlier', 'later', 'size', 'remove'])
		expect(menu.every((item) => !item.disabled)).toBe(true)
		const sizes = menu.find((item) => item.id === 'size')?.children ?? []
		expect(sizes.map((item) => [item.id, item.checked])).toEqual([
			['s', false],
			['m', true],
		])
		expect(menu.at(-1)?.destructive).toBe(true)
	})

	it('cannot move the first tile earlier or the last one later', () => {
		expect(tileMenu(tile, 0, 3, ['m'], tr, edits())[0]?.disabled).toBe(true)
		expect(tileMenu(tile, 2, 3, ['m'], tr, edits())[1]?.disabled).toBe(true)
	})

	it('has no Size for a tile that declares one size', () => {
		expect(tileMenu(tile, 1, 3, ['m'], tr, edits()).map((item) => item.id)).toEqual(['earlier', 'later', 'remove'])
	})

	it('writes through the edits it is given', () => {
		const given = edits()
		const menu = tileMenu(tile, 1, 3, ['s', 'm'], tr, given)
		const pick = (item: MenuItem | undefined) => item?.onselect?.(item)
		pick(menu[0])
		pick(menu[1])
		pick(menu[2]?.children?.[0])
		pick(menu[3])
		expect(given.step).toHaveBeenNthCalledWith(1, 'expiring-soon', -1)
		expect(given.step).toHaveBeenNthCalledWith(2, 'expiring-soon', 1)
		expect(given.resize).toHaveBeenCalledWith('expiring-soon', 's')
		expect(given.remove).toHaveBeenCalledWith(tile)
	})
})
