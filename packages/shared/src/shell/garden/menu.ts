// A Garden tile's menu in edit mode (D-155), the same in both apps: on the phone it is the whole of edit mode, as a
// bottom sheet. Pure, and free of the kit's values, so it is tested in Node.
import type { MenuItem, WidgetSize } from '@eden/ui-kit'
import type { LayoutTile } from '../../manifest/index.js'

/** svelte-i18n's `t`, as a page reads it from the store. */
export type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string

/** What a tile's menu writes; `gardenEdits()` answers these. */
export interface TileEdits {
	step: (id: string, delta: -1 | 1) => void
	resize: (id: string, size: WidgetSize) => void
	remove: (tile: LayoutTile) => void
}

/** A tile's menu in edit mode: what dragging and the corner do, for the keyboard and for touch (D-106). */
export function tileMenu(
	tile: LayoutTile,
	index: number,
	count: number,
	sizes: readonly WidgetSize[],
	tr: Translate,
	edits: TileEdits
): MenuItem[] {
	return [
		{
			id: 'earlier',
			label: tr('garden.moveEarlier'),
			icon: 'arrow-left',
			disabled: index === 0,
			onselect: () => edits.step(tile.id, -1),
		},
		{
			id: 'later',
			label: tr('garden.moveLater'),
			icon: 'arrow-right',
			disabled: index === count - 1,
			onselect: () => edits.step(tile.id, 1),
		},
		...(sizes.length > 1
			? [
					{
						id: 'size',
						label: tr('garden.size'),
						icon: 'layout-grid' as const,
						children: sizes.map((size) => ({
							id: size,
							label: tr(`garden.sizes.${size}`),
							checked: size === tile.size,
							onselect: () => edits.resize(tile.id, size),
						})),
					},
				]
			: []),
		{ id: 'remove', label: tr('garden.remove'), icon: 'x', destructive: true, onselect: () => edits.remove(tile) },
	]
}
