// How the shell composes itself from the declarations (product/substrate/shell.md): the sidebar's groups and the ⌘
// positions, the Garden's catalog and its default layout, the command palette's index, the Quick Log's entries.
// Every function is pure and answers ids and locale keys; an app turns them into props with its own translations,
// routes and components. The declarations passed in are the enabled domains'.
import type { ResourceId } from '../registry/index.js'
import type {
	DomainDeclaration,
	PaletteVerb,
	QuickActionDeclaration,
	ShellDeclaration,
	SidebarGroupId,
	WidgetSize,
} from './types.js'

export interface SidebarPreferences {
	/** The owner's order of the domains; one that is not named keeps its declared place after the ones that are. */
	order?: readonly string[]
	/** The domains the owner hid; a hidden domain is still enabled. */
	hidden?: readonly string[]
}

export interface SidebarItem {
	id: string
	/** Whether the id is a domain's or the shell's own. */
	kind: 'domain' | 'shell'
	name: string
	subtitle: string
	/** A place takes a ⌘ position; what is not one has a key of its own. */
	place: boolean
	key: string | null
}

export interface SidebarGroup {
	id: SidebarGroupId
	items: SidebarItem[]
}

/** The sidebar's groups in order (D-64), each under its rule; a group with nothing to show is left out. */
export function sidebarGroups(
	declarations: readonly DomainDeclaration[],
	shell: ShellDeclaration,
	preferences: SidebarPreferences = {}
): SidebarGroup[] {
	const hidden = preferences.hidden ?? []
	const chosen = preferences.order ?? []
	const rank = (id: string) => (chosen.includes(id) ? chosen.indexOf(id) : chosen.length)

	return shell.sidebar.groups
		.map((group) => {
			const own = shell.sidebar.entries
				.filter((entry) => entry.group === group)
				.map((entry) => ({
					order: entry.order,
					item: {
						id: entry.id,
						kind: 'shell' as const,
						name: entry.name,
						subtitle: entry.subtitle,
						place: entry.place,
						key: entry.key,
					},
				}))
			const domains = declarations
				.filter((declaration) => declaration.sidebar.group === group)
				.filter((declaration) => declaration.sidebar.visible && !hidden.includes(declaration.id))
				.map((declaration) => ({
					order: declaration.sidebar.order,
					item: {
						id: declaration.id,
						kind: 'domain' as const,
						name: declaration.name,
						subtitle: declaration.subtitle,
						place: true,
						key: null,
					},
				}))
				// the owner orders the domains among themselves; the shell's own entries keep their place
				.sort((a, b) => rank(a.item.id) - rank(b.item.id) || a.order - b.order)
			const items = [...own.sort((a, b) => a.order - b.order), ...domains].map((entry) => entry.item)
			return { id: group, items }
		})
		.filter((group) => group.items.length > 0)
}

export interface TabBar {
	/** The bar, without its last tab: the shell's places, then the pinned domains. */
	tabs: SidebarItem[]
	/** Behind More: the domains that are not pinned, then what the shell has that is not a place. */
	more: SidebarItem[]
}

/**
 * The phone's tab bar (product/substrate/shell.md, "Mobile"): the shell's places, the owner's pinned domains or the
 * declared two, and the rest behind More. A pinned domain that is not enabled leaves its tab to nothing.
 */
export function tabBar(
	declarations: readonly DomainDeclaration[],
	shell: ShellDeclaration,
	pinned: readonly string[] = shell.tabs.pinned
): TabBar {
	const own = shell.sidebar.entries.map((entry): SidebarItem => ({
		id: entry.id,
		kind: 'shell',
		name: entry.name,
		subtitle: entry.subtitle,
		place: entry.place,
		key: entry.key,
	}))
	const domains = declarations.map((declaration): SidebarItem => ({
		id: declaration.id,
		kind: 'domain',
		name: declaration.name,
		subtitle: declaration.subtitle,
		place: true,
		key: null,
	}))
	const actions = shell.sidebar.pinned.map((entry): SidebarItem => ({
		...entry,
		kind: 'shell',
		// a pinned entry says whether it is a place (the Gardener's page, D-113) or an action (Settings)
		place: entry.place,
		key: entry.key,
	}))
	const places = shell.tabs.places.flatMap((id) => own.filter((item) => item.id === id))
	const chosen = pinned.slice(0, shell.tabs.pinned.length)
	return {
		tabs: [...places, ...chosen.flatMap((id) => domains.filter((item) => item.id === id))],
		more: [
			...domains.filter((item) => !chosen.includes(item.id)),
			...own.filter((item) => !shell.tabs.places.includes(item.id)),
			...actions,
		],
	}
}

/** The ⌘ position of each place, counted in order from 1; past 9 a place has none. */
export function shortcutPositions(groups: readonly SidebarGroup[]): Map<string, number> {
	const places = groups.flatMap((group) => group.items).filter((item) => item.place)
	return new Map(places.slice(0, 9).map((item, index) => [item.id, index + 1]))
}

export interface CatalogWidget {
	id: string
	/** The domain that declares it, or `shell` for a tile that is the shell's own. */
	owner: string
	/** The glyph id of the surface it belongs to: the domain's, or the one the shell's tile names. */
	glyph: string
	sizes: readonly WidgetSize[]
	reads: readonly ResourceId[]
	title: string
	empty: string
	default: boolean
}

/** Every tile the Garden can show: the enabled domains' built widgets, then the shell's own. */
export function gardenCatalog(declarations: readonly DomainDeclaration[], shell: ShellDeclaration): CatalogWidget[] {
	return [
		...declarations.flatMap((declaration) =>
			declaration.widgets
				.filter((widget) => !widget.planned)
				.map((widget) => ({
					id: widget.id,
					owner: declaration.id,
					glyph: declaration.id,
					sizes: widget.sizes,
					reads: widget.reads,
					title: widget.title,
					empty: widget.empty,
					default: widget.default,
				}))
		),
		...shell.tiles.map((tile) => ({
			id: tile.id,
			owner: 'shell',
			glyph: tile.glyph,
			sizes: tile.sizes,
			reads: tile.reads,
			title: tile.title,
			empty: tile.empty,
			default: shell.gardenDefault.includes(tile.id),
		})),
	]
}

export interface LayoutTile extends Omit<CatalogWidget, 'sizes' | 'default'> {
	size: WidgetSize
}

/** The Garden before the owner edits it: the shell's order, each tile at its first size; a disabled domain's drop out. */
export function defaultLayout(declarations: readonly DomainDeclaration[], shell: ShellDeclaration): LayoutTile[] {
	const catalog = gardenCatalog(declarations, shell)
	return shell.gardenDefault.flatMap((id) => {
		const widget = catalog.find((entry) => entry.id === id)
		const size = widget?.sizes[0]
		if (!widget || !size) return []
		const { sizes: _sizes, default: _default, ...tile } = widget
		return [{ ...tile, size }]
	})
}

export type PaletteTarget =
	| { kind: 'shell'; id: string }
	| { kind: 'domain'; domain: string }
	| { kind: 'tab'; domain: string; tab: string }
	| { kind: 'quick-action'; domain: string; action: string }
	| { kind: 'intent'; domain: string; intent: string }

export interface PaletteEntry {
	/** Unique across the index, and what a recent is kept by. */
	id: string
	verb: PaletteVerb
	/** The locale key of what the entry says. */
	label: string
	/** The locale key of the domain's name, for an entry that belongs to one. */
	context?: string
	/** The glyph id of its surface, unless the entry names an icon of its own. */
	glyph: string
	icon?: string
	target: PaletteTarget
}

export interface PaletteIndex {
	entries: PaletteEntry[]
	/** The types each domain lets the palette search, which are its own. */
	search: { domain: string; types: readonly ResourceId[] }[]
}

/**
 * What the palette can reach without a query to a store: the shell's places, each domain and its tabs (**go**), and
 * the quick actions and intents the domains offer (**run**).
 */
export function paletteIndex(declarations: readonly DomainDeclaration[], shell: ShellDeclaration): PaletteIndex {
	const places: PaletteEntry[] = shell.sidebar.entries
		.filter((entry) => entry.place)
		.map((entry) => ({
			id: `go.${entry.id}`,
			verb: 'go',
			label: entry.name,
			glyph: entry.id,
			target: { kind: 'shell', id: entry.id },
		}))
	const domains = declarations.flatMap((declaration): PaletteEntry[] => [
		{
			id: `go.${declaration.id}`,
			verb: 'go',
			label: declaration.name,
			glyph: declaration.id,
			target: { kind: 'domain', domain: declaration.id },
		},
		...declaration.tabs.map((tab): PaletteEntry => ({
			id: `go.${declaration.id}.${tab.id}`,
			verb: 'go',
			label: tab.label,
			context: declaration.name,
			glyph: declaration.id,
			target: { kind: 'tab', domain: declaration.id, tab: tab.id },
		})),
		...declaration.palette.entries.flatMap((entry): PaletteEntry[] => {
			const target: PaletteTarget | undefined = entry.quickAction
				? { kind: 'quick-action', domain: declaration.id, action: entry.quickAction }
				: entry.intent
					? { kind: 'intent', domain: declaration.id, intent: entry.intent }
					: undefined
			if (!target) return []
			return [
				{
					id: `${entry.verb}.${entry.id}`,
					verb: entry.verb,
					label: entry.label,
					context: declaration.name,
					glyph: declaration.id,
					icon: entry.icon,
					target,
				},
			]
		}),
	])
	return {
		entries: [...places, ...domains],
		search: declarations
			.filter((declaration) => declaration.palette.search.length > 0)
			.map((declaration) => ({ domain: declaration.id, types: declaration.palette.search })),
	}
}

export interface QuickAction extends QuickActionDeclaration {
	domain: string
	/** The locale key of the domain's name. */
	context: string
}

/** The Quick Log's entries (D-12): the enabled domains' quick actions, in the domains' order. */
export function quickActions(declarations: readonly DomainDeclaration[]): QuickAction[] {
	return declarations.flatMap((declaration) =>
		declaration.quickActions.map((action) => ({ ...action, domain: declaration.id, context: declaration.name }))
	)
}

/** The handler of an intent among the enabled domains; `undefined` is the caller's "not available". */
export function handlerOf(declarations: readonly DomainDeclaration[], intent: string): DomainDeclaration | undefined {
	return declarations.find((declaration) => declaration.intents.includes(intent))
}
