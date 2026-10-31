// What the Garden's edit mode writes (D-155), the same in both apps: every edit is kept as it is made, in the
// owner's layout on this device (`settings.gardenLayout`, D-156), and Remove and Reset can be undone from their
// toast. The sample data of the first run is seeded from here too.
import type { WidgetSize } from '@eden/ui-kit'
import type { DomainManifest } from '../../domains/define.js'
import {
	addTile,
	declarations,
	moveTile,
	removeTile,
	resizeTile,
	shell,
	stepTile,
	type LayoutTile,
	type StoredLayout,
} from '../../manifest/index.js'
import { settings } from '../../settings/index.js'
import { undoToast } from '../undo.js'
import type { TileEdits, Translate } from './menu.js'

export interface GardenEdits extends TileEdits {
	/** Places a tile before another, or at the end with `null`: the pointer's drop. */
	move: (id: string, before: string | null) => void
	/** Adds a tile from the catalog, at the end. */
	add: (id: string) => void
	/** Back to the default the shell declares. */
	reset: () => void
}

/** The edits over the stored layout; `tr` answers the locale's `t` as it is when a toast is shown. */
export function gardenEdits(tr: () => Translate): GardenEdits {
	/** Keeps an edit; one that changed nothing answers the layout it was given. */
	const keep = (next: StoredLayout | undefined) => {
		if (next !== settings.gardenLayout) settings.setGardenLayout(next)
	}
	return {
		step: (id, delta) => keep(stepTile(settings.gardenLayout, declarations, shell, id, delta)),
		resize: (id, size: WidgetSize) => keep(resizeTile(settings.gardenLayout, declarations, shell, id, size)),
		move: (id, before) => keep(moveTile(settings.gardenLayout, declarations, shell, id, before)),
		add: (id) => keep(addTile(settings.gardenLayout, declarations, shell, id)),
		remove: (tile: LayoutTile) => {
			const before = settings.gardenLayout
			keep(removeTile(before, declarations, shell, tile.id))
			undoToast(tr()('garden.removed', { values: { title: tr()(tile.title) } }), () => settings.setGardenLayout(before))
		},
		reset: () => {
			const before = settings.gardenLayout
			settings.setGardenLayout(undefined)
			undoToast(tr()('garden.resetDone'), () => settings.setGardenLayout(before))
		},
	}
}

/** Seeds every domain that has sample data, with one toast that takes it all back. */
export function seedAll(manifests: readonly DomainManifest[], tr: Translate) {
	const undos = manifests.flatMap((manifest) => (manifest.seed ? [manifest.seed()] : []))
	if (!undos.length) return
	undoToast(tr('common.sampleAdded'), () => undos.forEach((undo) => undo()))
}
