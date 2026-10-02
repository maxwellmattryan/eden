// The Garden's layout as the owner arranged it (D-155): an ordered list of tiles, each at one of its declared sizes,
// laid over the default the shell declares. Pure: the app keeps the stored layout as a per-device setting (D-156) and
// hands it in. A tile whose domain is not enabled stays in the stored list and is left out of what is shown, so it is
// back in its place when the domain is; a default tile the stored layout has never seen is added at the end once.
import { defaultLayout, gardenCatalog, type CatalogWidget, type LayoutTile } from './compose.js'
import type { DomainDeclaration, ShellDeclaration, WidgetSize } from './types.js'

export interface StoredTile {
	id: string
	size: WidgetSize
}

export interface StoredLayout {
	v: 1
	/** The tiles in the owner's order, a disabled domain's among them. */
	tiles: StoredTile[]
	/** Every catalog id the layout has met, placed or not: a default tile outside it is new, and is added once. */
	seen: string[]
}

const SIZES: readonly string[] = ['s', 'm', 'l'] satisfies WidgetSize[]

/** Reads a stored layout; anything that is not one is no layout, and the Garden shows its default. */
export function parseLayout(raw: string | null | undefined): StoredLayout | undefined {
	if (!raw) return undefined
	let value: unknown
	try {
		value = JSON.parse(raw)
	} catch {
		return undefined
	}
	if (typeof value !== 'object' || value === null) return undefined
	const { v, tiles, seen } = value as Record<string, unknown>
	if (v !== 1 || !Array.isArray(tiles) || !Array.isArray(seen)) return undefined
	const kept: StoredTile[] = []
	for (const tile of tiles as unknown[]) {
		if (typeof tile !== 'object' || tile === null) return undefined
		const { id, size } = tile as Record<string, unknown>
		if (typeof id !== 'string' || typeof size !== 'string' || !SIZES.includes(size)) return undefined
		kept.push({ id, size: size as WidgetSize })
	}
	if (!seen.every((id) => typeof id === 'string')) return undefined
	return { v: 1, tiles: kept, seen: seen as string[] }
}

/** The stored tiles with the default ones the layout has never seen after them, each id once. */
function base(
	stored: StoredLayout | undefined,
	declarations: readonly DomainDeclaration[],
	shell: ShellDeclaration
): StoredTile[] {
	const defaults = defaultLayout(declarations, shell).map(({ id, size }) => ({ id, size }))
	if (!stored) return defaults
	const ids = new Set<string>()
	const tiles = stored.tiles.filter((tile) => !ids.has(tile.id) && ids.add(tile.id))
	return [...tiles, ...defaults.filter((tile) => !ids.has(tile.id) && !stored.seen.includes(tile.id))]
}

/** The Garden as it is shown: the owner's layout, or the default until they edit it. */
export function gardenLayout(
	declarations: readonly DomainDeclaration[],
	shell: ShellDeclaration,
	stored?: StoredLayout
): LayoutTile[] {
	const catalog = gardenCatalog(declarations, shell)
	return base(stored, declarations, shell).flatMap((tile) => {
		const widget = catalog.find((entry) => entry.id === tile.id)
		const first = widget?.sizes[0]
		if (!widget || !first) return []
		const { sizes, default: _default, ...rest } = widget
		// a size the tile no longer declares falls to its first
		return [{ ...rest, size: sizes.includes(tile.size) ? tile.size : first }]
	})
}

/** What an edit works on: the tiles to change, and what to store them with. */
function edit(
	stored: StoredLayout | undefined,
	declarations: readonly DomainDeclaration[],
	shell: ShellDeclaration,
	change: (tiles: StoredTile[], catalog: CatalogWidget[]) => StoredTile[] | undefined
): StoredLayout | undefined {
	const catalog = gardenCatalog(declarations, shell)
	const tiles = change(base(stored, declarations, shell), catalog)
	if (!tiles) return stored
	const seen = new Set([...(stored?.seen ?? []), ...catalog.map((widget) => widget.id)])
	return { v: 1, tiles, seen: [...seen] }
}

/** Puts a tile before another, or at the end. Answers the layout as it was when either is not placed. */
export function moveTile(
	stored: StoredLayout | undefined,
	declarations: readonly DomainDeclaration[],
	shell: ShellDeclaration,
	id: string,
	before: string | null
): StoredLayout | undefined {
	return edit(stored, declarations, shell, (tiles) => {
		const tile = tiles.find((entry) => entry.id === id)
		if (!tile || before === id) return undefined
		const rest = tiles.filter((entry) => entry.id !== id)
		if (before === null) return [...rest, tile]
		const at = rest.findIndex((entry) => entry.id === before)
		return at < 0 ? undefined : [...rest.slice(0, at), tile, ...rest.slice(at)]
	})
}

/** Moves a tile one place earlier or later among the tiles that are shown. */
export function stepTile(
	stored: StoredLayout | undefined,
	declarations: readonly DomainDeclaration[],
	shell: ShellDeclaration,
	id: string,
	delta: -1 | 1
): StoredLayout | undefined {
	return edit(stored, declarations, shell, (tiles, catalog) => {
		const shown = tiles.filter((tile) => catalog.some((widget) => widget.id === tile.id))
		const neighbour = shown[shown.findIndex((tile) => tile.id === id) + delta]
		const from = tiles.findIndex((tile) => tile.id === id)
		if (from < 0 || !neighbour) return undefined
		const to = tiles.indexOf(neighbour)
		const next = [...tiles]
		next.splice(to, 0, ...next.splice(from, 1))
		return next
	})
}

/** Gives a tile another of the sizes it declares. */
export function resizeTile(
	stored: StoredLayout | undefined,
	declarations: readonly DomainDeclaration[],
	shell: ShellDeclaration,
	id: string,
	size: WidgetSize
): StoredLayout | undefined {
	return edit(stored, declarations, shell, (tiles, catalog) => {
		const declared = catalog.find((widget) => widget.id === id)?.sizes.includes(size)
		const tile = tiles.find((entry) => entry.id === id)
		if (!declared || !tile || tile.size === size) return undefined
		return tiles.map((entry) => (entry.id === id ? { id, size } : entry))
	})
}

/** Takes a tile off the Garden; it stays in the catalog. */
export function removeTile(
	stored: StoredLayout | undefined,
	declarations: readonly DomainDeclaration[],
	shell: ShellDeclaration,
	id: string
): StoredLayout | undefined {
	return edit(stored, declarations, shell, (tiles) =>
		tiles.some((tile) => tile.id === id) ? tiles.filter((tile) => tile.id !== id) : undefined
	)
}

/** Places a catalog tile at the end, at its first size. A tile is placed once. */
export function addTile(
	stored: StoredLayout | undefined,
	declarations: readonly DomainDeclaration[],
	shell: ShellDeclaration,
	id: string
): StoredLayout | undefined {
	return edit(stored, declarations, shell, (tiles, catalog) => {
		const size = catalog.find((widget) => widget.id === id)?.sizes[0]
		if (!size || tiles.some((tile) => tile.id === id)) return undefined
		return [...tiles, { id, size }]
	})
}

export interface CatalogEntry extends CatalogWidget {
	/** Already on the Garden, so it cannot be added again. */
	placed: boolean
}

export interface CatalogGroup {
	/** The domain that declares the tiles, or `shell`. */
	owner: string
	entries: CatalogEntry[]
}

/** The catalog as its sheet shows it: grouped by owner in the declared order, the shell's own tiles last. */
export function catalogGroups(catalog: readonly CatalogWidget[], placed: readonly string[]): CatalogGroup[] {
	const groups: CatalogGroup[] = []
	for (const widget of catalog) {
		const entry = { ...widget, placed: placed.includes(widget.id) }
		const group = groups.find((candidate) => candidate.owner === widget.owner)
		if (group) group.entries.push(entry)
		else groups.push({ owner: widget.owner, entries: [entry] })
	}
	return groups
}
