// What both apps' Garden views say and compose, as pure functions over the layout, the manifests and the locale's
// `t` (product/substrate/shell.md, "The Garden"): the quick-navigation entries, a tile's menu in edit mode, the tiles
// as the grid draws them, the catalog's groups and the feed's rows. The desktop's view (the feed beside the grid,
// the pointer's drag) and the phone's (two columns, the feed beneath, the menu alone) are each app's own; what they
// write is `./edits.ts`, and a tile's menu `./menu.ts`.
import {
	domainGlyph,
	type GlyphId,
	type IconName,
	type MenuItem,
	type WidgetAction,
	type WidgetCatalogGroup,
	type WidgetSize,
} from '@eden/ui-kit'
import type { Component } from 'svelte'
import { formatTime, formatWeekday, relativeDay, type DateFormat } from '../../dates/index.js'
import type { DomainManifest, WidgetBinding } from '../../domains/define.js'
import { catalogGroups, type CatalogWidget, type LayoutTile } from '../../manifest/index.js'
import { tileMenu, type TileEdits, type Translate } from './menu.js'

/** The app's lookup of an enabled domain's manifest by id; the shell's own tiles have none. */
export type ManifestFor = (id: string) => DomainManifest | undefined

export interface QuickNavEntry {
	id: string
	name: string
	icon: IconName
	open: () => void
}

/** The quick-nav tiles: Today, then the enabled domains in order. */
export function quickNavEntries(
	manifests: readonly DomainManifest[],
	tr: Translate,
	openToday: () => void
): QuickNavEntry[] {
	return [
		{ id: 'today', name: tr('shell.today'), icon: domainGlyph('today'), open: openToday },
		...manifests.map((manifest) => ({
			id: manifest.id,
			name: tr(manifest.name),
			icon: manifest.glyph,
			open: manifest.routes.open,
		})),
	]
}

/** A tile as the grid draws it. */
export interface TileView {
	tile: LayoutTile
	icon: IconName
	title: string
	/** The one-line prompt, shown while there is no `body`. */
	empty: string
	/** The name under the tile's title: its domain's, or Today's for the shell's own tile of it. */
	domain: string | undefined
	/** The bound body, while its `hasData()` is true. */
	body: Component | undefined
	/** The footer action, only beside a body. */
	action: WidgetAction | undefined
	/** The sizes the tile declares. */
	sizes: readonly WidgetSize[]
	/** The tile's menu, while editing. */
	menu: MenuItem[] | undefined
}

/**
 * The layout's tiles with what is bound to each: a domain's from its manifest, the shell's own from `shellBindings`.
 * `edits` is given while the Garden is in edit mode, and every tile then carries its menu.
 */
export function tileViews(
	layout: readonly LayoutTile[],
	catalog: readonly CatalogWidget[],
	shellBindings: Partial<Record<string, WidgetBinding>>,
	manifestFor: ManifestFor,
	tr: Translate,
	edits?: TileEdits
): TileView[] {
	return layout.map((tile, index) => {
		const manifest = manifestFor(tile.owner)
		const bound = manifest?.widgets.find((w) => w.id === tile.id) ?? shellBindings[tile.id]
		const sizes = catalog.find((entry) => entry.id === tile.id)?.sizes ?? [tile.size]
		const body = bound?.hasData?.() ? bound.body : undefined
		const action: WidgetAction | undefined =
			body && bound?.action ? { label: tr(bound.action.label), onclick: bound.action.open } : undefined
		return {
			tile,
			// the registry builder checked each glyph against the kit's list
			icon: domainGlyph(tile.glyph as GlyphId),
			title: tr(tile.title),
			empty: tr(tile.empty),
			domain: tile.glyph === 'today' ? tr('shell.today') : manifest ? tr(manifest.name) : undefined,
			body,
			action,
			sizes,
			menu: edits ? tileMenu(tile, index, layout.length, sizes, tr, edits) : undefined,
		}
	})
}

/** The catalog: every tile by its domain, the shell's own under the Garden's name, with what is placed marked. */
export function catalogView(
	catalog: readonly CatalogWidget[],
	placed: readonly string[],
	manifestFor: ManifestFor,
	tr: Translate
): WidgetCatalogGroup[] {
	const sizesLine = (sizes: readonly WidgetSize[]): string =>
		sizes
			.map((size) => tr(`garden.sizes.${size}`))
			.reduce((first, second) => tr('garden.sizesOr', { values: { first, second } }))
	return catalogGroups(catalog, placed).map((group) => {
		const manifest = manifestFor(group.owner)
		return {
			id: group.owner,
			label: manifest ? tr(manifest.name) : tr('shell.garden'),
			icon: manifest?.glyph ?? domainGlyph('garden'),
			items: group.entries.map((entry) => ({
				id: entry.id,
				title: tr(entry.title),
				note: sizesLine(entry.sizes),
				placed: entry.placed,
			})),
		}
	})
}

/** A feed entry as the page needs it: only these fields of the store's are read. */
export interface FeedEntryLike {
	id: string
	domain: string
	key: string
	values?: Record<string, string | number>
	at: string
}

export interface FeedRow {
	id: string
	icon: IconName
	line: string
	when: string
}

/** The feed's rows: the glyph of where it happened, the line, and when (a time, yesterday and a time, a weekday). */
export function feedRows(
	entries: readonly FeedEntryLike[],
	manifestFor: ManifestFor,
	tr: Translate,
	format: DateFormat
): FeedRow[] {
	const whenOf = (at: string): string => {
		const time = formatTime(at, format)
		const day = relativeDay(at)
		if (day === 'today') return time
		if (day === 'yesterday') return tr('garden.feed.yesterday', { values: { time } })
		return formatWeekday(at, format.lang)
	}
	return entries.map((entry) => ({
		id: entry.id,
		icon: entry.domain === 'today' ? domainGlyph('today') : (manifestFor(entry.domain)?.glyph ?? domainGlyph('garden')),
		line: tr(entry.key, { values: entry.values }),
		when: whenOf(entry.at),
	}))
}

/** No domain has anything yet: the first run, when the Garden offers the sample data. */
export function isFirstRun(
	feed: { ready: boolean; entries: readonly unknown[] },
	manifests: readonly DomainManifest[]
): boolean {
	return feed.ready && feed.entries.length === 0 && manifests.every((m) => !m.widgets.some((w) => w.hasData?.()))
}
