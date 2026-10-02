// The domain manifest as code (docs/engineering/domain-module.md). What a domain declares is data, written in its
// manifest.json beside this folder and checked by the registry builder. What is bound to that comes in two halves:
// the domain's logic (its store, its tools, what it hears and writes), written once in `<id>/logic.ts` and read by
// the shared shell through `./registry`, and its surface (the route, the widgets' components, the overlay), which is
// each app's and is bound in its `src/lib/domains/<id>/manifest.ts`. `defineDomain` joins the declaration and the
// two halves, and each app's shell composes its navigation, the Garden and the palette's index from the result.
import type { Component } from 'svelte'
import type { BundleExtra, Entity } from '../data/index.js'
import {
	declarationOf,
	type BuiltDomainId,
	type BuiltWidgetId,
	type DomainDeclaration,
	type QuickActionDeclaration,
	type TabId,
	type WidgetDeclaration as DeclaredWidget,
} from '../manifest/index.js'
import { domainGlyph, type IconName, type QuickLog } from '@eden/ui-kit'
import type { DraftCard } from '../gardener/index.js'
import type { ToolHandler } from '../shell/gardener/types.js'
import { logicFor } from './registry.js'

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
	/** The app's route id; a page with tabs takes the tab as an optional parameter. */
	path: string
	/** The href through the app's `resolve()`, for its navigation. */
	href: string
	/** For a button: a `goto` with the `resolve()` call inline, which is what the navigation lint accepts. */
	open: () => void
	/** Opens one of the declared tabs; a domain with tabs binds it, for the palette. */
	openTab?: (tab: Tab) => void
}

/** What an app binds to a domain: where it lives in the app's routes and what draws it. */
export interface DomainSurface<D extends BuiltDomainId = BuiltDomainId> {
	routes: DomainRoutes<TabId<D>>
	/** One binding for each widget the domain declares and has built; a missing one does not compile. */
	widgets: Record<BuiltWidgetId<D>, WidgetBinding>
	/**
	 * A surface the domain shows over whatever page is open: the shell mounts it once, beside its own sheets. Hearth's
	 * capture sheet is one, since a haul is captured from its page, from a drop and from a card in the Gardener's panel.
	 */
	overlay?: Component
}

/** What a domain does, the same in both apps: written once, in the domain's `logic.ts`. */
export interface DomainLogic<D extends BuiltDomainId = BuiltDomainId> {
	/** The plain, permanent id (`kitchen`): what the registry finds the logic by. */
	id: D
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
	/**
	 * What a row of one of the domain's entity types is called where the Gardener lists what it read (the "can see"
	 * chip, the audit log), by type, for a type whose rows hold no name of their own. A type with no entry is called
	 * by its `name`, `title` or `label`.
	 */
	labels?: Partial<Record<string, (row: Entity<object>) => Promise<string | undefined> | string | undefined>>
	/** What each quick action writes, by its id; the Quick Log sheet and `log-quick` both dispatch here. */
	quickActionHandlers?: Partial<Record<string, QuickActionHandler>>
	/** What each `launch` quick action opens, by its id: a surface of the domain's own (Hearth's capture, D-13). */
	quickActionLaunchers?: Partial<Record<string, () => void>>
	/**
	 * What the Quick Log sheet shows beside a quick action's field, by its id, read from the domain's store: the last
	 * value and the recent ones of a number, the options of a check. The Garden's quick-log tile draws the same series.
	 */
	quickActionReadouts?: Partial<Record<string, () => QuickLogReadout>>
	/** The domain's part of committing a draft its tool left; the substrate's parts (tasks, events) are the shell's. */
	commitDraft?: (card: DraftCard) => Promise<{ undo: () => void } | undefined>
	/**
	 * Opens a draft on a surface of the domain's own, where the owner checks it before anything is stored (Hearth's
	 * capture sheet, its Recipes pane), and answers whether it took the draft. `settle` is told when the owner keeps
	 * or discards it there; until then the card stays as it was.
	 */
	openDraft?: (card: DraftCard, settle: (state: 'committed' | 'discarded') => void) => boolean
}

/** What a store knows of a quick action's log, in the words the sheet shows. */
export type QuickLogReadout = Pick<QuickLog, 'last' | 'series' | 'reference' | 'options' | 'value'>

/** A quick action's write: the value as typed, the undo back. */
export type QuickActionHandler = (value: string) => { undo: () => void } | Promise<{ undo: () => void }>

export interface DomainManifest extends Omit<DomainLogic, 'id'>, Pick<DomainSurface, 'overlay'> {
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

/** Joins what the domain declares, its logic from the registry and the surface the app binds. */
export function defineDomain<D extends BuiltDomainId>(id: D, surface: DomainSurface<D>): DomainManifest {
	const declaration: DomainDeclaration = declarationOf(id)
	const { routes, widgets, ...rest } = surface
	const bound: Partial<Record<string, WidgetBinding>> = widgets
	return {
		...logicFor(id),
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
