// The domain manifest as code (docs/engineering/domain-module.md). What a domain declares is data, written in its
// manifest.json in `@eden/shared` and checked by the registry builder; what it binds to that here is this app's:
// the route, the widgets' components, the store. `defineDomain` joins the two, and the shell composes the sidebar,
// the Garden and the palette's index from the result and nothing else.
import type { Component } from 'svelte'
import type { ResolvedPathname } from '$app/types'
import type { BundleExtra, Entity } from '@eden/shared/data'
import {
	declarationOf,
	type BuiltDomainId,
	type BuiltWidgetId,
	type DomainDeclaration,
	type QuickActionDeclaration,
	type TabId,
	type WidgetDeclaration as DeclaredWidget,
} from '@eden/shared/manifest'
import { domainGlyph, type IconName } from '@eden/ui-kit'
import type { DraftCard } from '@eden/shared/gardener'
import type { ToolHandler } from '../shell/gardener/types.js'

/** The route ids a domain may own; a page with tabs takes the tab as an optional parameter. */
export type DomainRoute = '/kitchen/[[tab]]' | '/toolbench/[[tab]]' | '/weather'

/** What the app binds to a declared widget; the tile computes locally from the domain's store, never from a model. */
export interface WidgetBinding {
	/** The body, rendered while `hasData()` is true; without one the tile always shows its prompt. */
	body?: Component
	hasData?: () => boolean
	/** The quiet footer action: its locale key and what it opens. */
	action?: { label: string; open: () => void }
}

/** A Garden tile the domain contributes: what it declares, and what is bound to it. */
export interface WidgetDeclaration extends DeclaredWidget, WidgetBinding {}

/** A Quick Log entry the domain registers (D-12). */
export interface QuickAction extends QuickActionDeclaration {
	icon: IconName
}

export interface DomainRoutes<Tab extends string = string> {
	path: DomainRoute
	/** The href through `resolve()`, for the sidebar. */
	href: ResolvedPathname
	/** For a button: a `goto` with the `resolve()` call inline, which is what the navigation lint accepts. */
	open: () => void
	/** Opens one of the declared tabs; a domain with tabs binds it, for the palette. */
	openTab?: (tab: Tab) => void
}

export interface DomainBindings<D extends BuiltDomainId> {
	routes: DomainRoutes<TabId<D>>
	/** One binding for each widget the domain declares and has built; a missing one does not compile. */
	widgets: Record<BuiltWidgetId<D>, WidgetBinding>
	/** A glyph that follows the domain's state, in place of its own, while there is one. */
	liveGlyph?: () => IconName | undefined
	/** Loads the domain's store; the Garden calls it for every domain, the domain's own page for itself. */
	load?: () => Promise<void>
	/** Seeds the store from the kit's sample dataset and returns the undo; behind the empty states' "Add sample data". */
	seed?: () => () => void
	/** Reads the store again from its rows, after an import changed them under it. */
	reload?: () => Promise<void>
	/**
	 * Binds what the domain hears: its schedules and the signals it answers (`@eden/shared/signals`). The shell calls
	 * it once when it starts, before anything is loaded, and the answer unbinds.
	 */
	subscribe?: () => () => void
	/**
	 * The domain's data in formats made for reading, for its export bundle. A domain that declares this owns rows and
	 * can be exported on its own.
	 */
	extras?: () => Promise<BundleExtra[]>
	/**
	 * A handler for each tool the domain declares (`engineering/gardener.md`, "Tools"): `run` for a plain or a write
	 * tool, `delegate` for a model-backed one. A declared tool with no handler is unavailable, and a test says so.
	 */
	tools?: Partial<Record<string, ToolHandler>>
	/**
	 * What the Gardener's context pack carries of a row of one of the domain's entity types, by type, where the row
	 * itself is more than a request should pay for (D-85); `null` leaves the row out. A type with no entry is sent whole.
	 */
	pack?: Partial<Record<string, (row: Entity<object>) => Entity<object> | null>>
	/** What each quick action writes, by its id; `log-quick` dispatches here and the Quick Log sheet (#27) reuses it. */
	quickActionHandlers?: Partial<Record<string, QuickActionHandler>>
	/** The domain's part of committing a draft its tool left; the substrate's parts (tasks, events) are the shell's. */
	commitDraft?: (card: DraftCard) => Promise<{ undo: () => void } | undefined>
	/**
	 * Opens a draft on a surface of the domain's own, where the owner checks it before anything is stored (Hearth's
	 * capture sheet, its Recipes pane), and answers whether it took the draft. `settle` is told when the owner keeps
	 * or discards it there; until then the card stays as it was.
	 */
	openDraft?: (card: DraftCard, settle: (state: 'committed' | 'discarded') => void) => boolean
	/**
	 * A surface the domain shows over whatever page is open: the shell mounts it once, beside its own sheets. Hearth's
	 * capture sheet is one, since a haul is captured from its page, from a drop and from a card in the Gardener's panel.
	 */
	overlay?: Component
}

/** A quick action's write: the value as typed, the undo back. */
export type QuickActionHandler = (value: string) => { undo: () => void } | Promise<{ undo: () => void }>

export interface DomainManifest extends Omit<DomainBindings<BuiltDomainId>, 'routes' | 'widgets'> {
	/** Everything the domain declares: its resources and reads, its tools, its intents, its palette entries. */
	declaration: DomainDeclaration
	/** The plain, permanent id (`kitchen`), never the display name. */
	id: BuiltDomainId
	/** The locale keys of the themed name and its plain subtitle (D-2). */
	name: string
	subtitle: string
	/** `domainGlyph(id)`. */
	glyph: IconName
	routes: DomainRoutes
	/** The ids of the page's tabs, in order. */
	tabs: readonly string[]
	/** The widgets that are built, each with its binding. */
	widgets: WidgetDeclaration[]
	quickActions: QuickAction[]
}

export function defineDomain<D extends BuiltDomainId>(id: D, bindings: DomainBindings<D>): DomainManifest {
	const declaration: DomainDeclaration = declarationOf(id)
	const { routes, widgets, ...rest } = bindings
	const bound: Partial<Record<string, WidgetBinding>> = widgets
	return {
		...rest,
		declaration,
		id,
		name: declaration.name,
		subtitle: declaration.subtitle,
		glyph: domainGlyph(id),
		routes: routes as DomainRoutes,
		tabs: declaration.tabs.map((tab) => tab.id),
		widgets: declaration.widgets
			.filter((widget) => !widget.planned)
			.map((widget) => ({ ...widget, ...bound[widget.id] })),
		// the registry builder checked each icon against the kit's list
		quickActions: declaration.quickActions.map((action) => ({ ...action, icon: action.icon as IconName })),
	}
}
