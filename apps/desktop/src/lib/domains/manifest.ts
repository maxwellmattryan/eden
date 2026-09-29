// The seed of the domain manifest as code (docs/product/substrate/domain-manifest.md), deliberately small: only the
// fields the shell composes from today, which are the sidebar entry, the Garden's widgets, the quick-nav row and the
// quick actions. Resources, reads, tools, signals, intents and the palette arrive with the registry work, which will
// grow this type rather than replace it.
import type { Component } from 'svelte'
import type { DomainId, IconName, WidgetSize } from '@eden/ui-kit'

/** The routes a domain may own; the literal union is what `resolve()` accepts. */
export type DomainRoute = '/kitchen' | '/toolbench' | '/weather'

/** A Garden tile the domain contributes; it computes locally from the domain's store, never from a model. */
export interface WidgetDeclaration {
	/** The tile id in the Garden layout (`expiring-soon`). */
	id: string
	size: WidgetSize
	/** The locale key of the tile's title. */
	title: string
	/** The locale key of the one-line prompt shown until the domain has data for the tile. */
	empty: string
	/** The quiet footer action: its locale key and what it opens. */
	action?: { label: string; open: () => void }
	/** The body, rendered while `hasData()` is true; without one the tile always shows its prompt. */
	body?: Component
	hasData?: () => boolean
}

/** A Quick Log entry the domain registers (D-12). */
export interface QuickAction {
	id: string
	/** The locale key of the entry's label. */
	label: string
	icon: IconName
}

export interface DomainManifest {
	/** The plain, permanent id (`kitchen`), never the display name. */
	id: DomainId
	/** The locale keys of the themed name and its plain subtitle (D-2). */
	name: string
	subtitle: string
	/** `domainGlyph(id)`. */
	glyph: IconName
	/** The page, with its tab ids in order when the page has a segmented control. */
	routes: { path: DomainRoute; tabs?: readonly string[] }
	widgets: WidgetDeclaration[]
	quickActions: QuickAction[]
}
