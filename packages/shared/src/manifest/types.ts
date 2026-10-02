// The domain manifest as data (product/substrate/domain-manifest.md): what a domain declares to the shell, as the
// registry builder writes it from the domain's manifest.json with the defaults filled in and the locale keys derived.
// An app binds its components, routes and stores to a declaration (`defineDomain`); nothing here knows them.
import type { DECLARATIONS, SHELL } from '../registry/generated.js'
import type { Phase, ResourceId } from '../registry/index.js'

/** The domains that are built, which are the ones with a manifest. */
export type BuiltDomainId = keyof typeof DECLARATIONS
/** One domain's declaration with its literal ids, which is what types an app's bindings. */
export type DeclarationOf<D extends BuiltDomainId> = (typeof DECLARATIONS)[D]
/** The widgets of a domain that are built; a planned one has no component to bind. */
export type BuiltWidgetId<D extends BuiltDomainId> = Extract<
	DeclarationOf<D>['widgets'][number],
	{ planned: false }
>['id']
export type TabId<D extends BuiltDomainId> = DeclarationOf<D>['tabs'][number]['id']
/** The tiles the shell declares for itself. */
export type ShellTileId = (typeof SHELL)['tiles'][number]['id']

export type WidgetSize = 's' | 'm' | 'l'
export type SidebarGroupId = 'today' | 'shell' | 'domains'
export type ToolAccess = 'read' | 'write-draft' | 'write'
/** What a model-backed tool asks of a model, lowest first (D-74). Never "tier", which is sensitivity. */
export type ModelGrade = 'light' | 'standard' | 'deep'
/** What a tool may need of a model beyond text: to call plain tools, to see an image, or to search the web through
 * a tool the provider runs on its own side (D-132). */
export type ModelFlag = 'tools' | 'vision' | 'search'
export type CaptureSource = 'photo' | 'receipt' | 'barcode' | 'share-sheet'
export type DeviceCapability = 'camera' | 'location-precise' | 'os-notifications' | 'healthkit'
export type NotificationChannel = 'in-app' | 'os'
/** The command palette's verb grammar (product/substrate/shell.md). */
export type PaletteVerb = 'go' | 'create' | 'ask' | 'log' | 'run'

export interface SidebarDeclaration {
	/** `shell` sits the domain beside the Garden and the Gardener (D-64); `domains` is the owner's list. */
	group: Exclude<SidebarGroupId, 'today'>
	/** The order hint within the group, until the owner sets their own. */
	order: number
	/** Whether the domain shows before the owner chooses; hiding is not disabling. */
	visible: boolean
}

export interface TabDeclaration {
	id: string
	/** The locale key of the tab's label. */
	label: string
}

export interface WidgetDeclaration {
	id: string
	/** The sizes the tile may take, the default first. */
	sizes: readonly WidgetSize[]
	/** Whether the tile is in the Garden's default layout; the shell places it. */
	default: boolean
	/** Declared by the domain's doc and not built: it has no component and appears in no catalog. */
	planned: boolean
	/** The registry ids the tile computes from (D-31). */
	reads: readonly ResourceId[]
	/** The locale keys of the title and of the one-line prompt shown until there is data. */
	title: string
	empty: string
}

/** A Quick Log entry (D-12). */
export interface QuickActionDeclaration {
	id: string
	label: string
	icon: string
}

/**
 * A Gardener tool: what it may read and what it may do (product/substrate/grants.md), and, when a model runs it, the
 * grade it asks for and what it needs of the model (D-74). A tool never names a model.
 */
export interface ToolDeclaration {
	id: string
	access: ToolAccess
	/** Whether a write asks first with a confirm sheet. */
	confirm: boolean
	reads: readonly ResourceId[]
	/** `null` for a plain tool: a function, no model. */
	grade: ModelGrade | null
	/** What the model must have beyond text; empty for a plain tool. */
	needs: readonly ModelFlag[]
	/** The tokens the model's context must hold, when the tool says. */
	minContext: number | null
}

/**
 * A notification the domain can send. With a `signal` it is a rule (substrate/signals-notifications.md): the signal
 * triggers it, `when` is its condition and the channel its action. Its words are the locale keys
 * `domains.<id>.notifications.<kind>.line` and, for the OS, `.title`.
 */
export interface NotificationKindDeclaration {
	id: string
	channel: NotificationChannel
	cadence: string
	/** Whether it is on before the owner chooses. */
	default: boolean
	/** The signal of the domain's own that it answers; `null` for a kind that is declared and answers nothing yet. */
	signal: string | null
	/** What the signal's payload must say: each field named is one of the words listed. */
	when: Readonly<Record<string, readonly string[]>> | null
}

/** A repeating schedule the shell declares to the scheduler: `daily` at a local `HH:MM`, or `every` so many seconds. */
export interface ScheduleDeclaration {
	id: string
	/** The name the scheduler knows it by: `<domain>.<id>`. */
	name: string
	daily: string | null
	every: number | null
}

export interface PaletteEntryDeclaration {
	/** Unique across the palette: `<domain>.<quick action>`, or the intent. */
	id: string
	verb: PaletteVerb
	label: string
	icon?: string
	quickAction?: string
	intent?: string
}

export interface DomainDeclaration {
	/** The plain, permanent id (`kitchen`), never the display name. */
	id: BuiltDomainId
	phase: Phase
	/** The locale keys of the themed name and its plain subtitle (D-2). */
	name: string
	subtitle: string
	sidebar: SidebarDeclaration
	tabs: readonly TabDeclaration[]
	/** The registry rows the domain owns. */
	resources: readonly ResourceId[]
	/** What it consumes of other owners. */
	reads: readonly ResourceId[]
	widgets: readonly WidgetDeclaration[]
	quickActions: readonly QuickActionDeclaration[]
	captureSources: readonly CaptureSource[]
	tools: readonly ToolDeclaration[]
	/** The signals it emits. */
	signals: readonly string[]
	notificationKinds: readonly NotificationKindDeclaration[]
	/** The repeating schedules it subscribes to. */
	schedules: readonly ScheduleDeclaration[]
	/** The intents it handles, each `<id>.<action>` (D-33). */
	intents: readonly string[]
	deviceCapabilities: readonly DeviceCapability[]
	palette: {
		entries: readonly PaletteEntryDeclaration[]
		/** The types of its own the palette searches. */
		search: readonly ResourceId[]
	}
	/** The sections of its export. */
	export: readonly ResourceId[]

	// Planned: the manifest doc names these and no Phase 1 domain consumes them, so the builder refuses them in a
	// manifest.json until one does.
	/** Planned. An optional grouping under another domain. */
	parent?: never
	/** Planned, Phase 2. The connectors it uses. */
	integrations?: never
	/** Planned, Phase 2. Almanac's annotation providers. */
	dayAnnotations?: never
	/** Planned, Phase 2. Whether it can provide the daily line. */
	dailyLine?: never
	/** Planned, Phase 2. Which surfaces exist on the phone. */
	mobile?: never
	/** Planned. Its settings page, which arrives with the Domains tab. */
	settings?: never
}

/** A place or an action of the sidebar that is the shell's own. */
export interface ShellEntryDeclaration {
	id: string
	name: string
	subtitle: string
	group: SidebarGroupId
	order: number
	/** A place has a route and takes a ⌘ position. */
	place: boolean
	key: string | null
}

export interface ShellTileDeclaration {
	id: string
	/** The glyph id of the surface the tile belongs to. */
	glyph: string
	sizes: readonly WidgetSize[]
	reads: readonly ResourceId[]
	title: string
	empty: string
}

export interface ShellDeclaration {
	/** The built domains, in the Phase 1 order. */
	domains: readonly BuiltDomainId[]
	sidebar: {
		groups: readonly SidebarGroupId[]
		entries: readonly ShellEntryDeclaration[]
		/**
		 * Pinned at the foot, each with a key of its own (D-77). Settings is an action and never the current item; the
		 * Gardener is a place on the desktop, where the app gives it its route (D-113), and its key opens its panel.
		 */
		pinned: readonly { id: string; name: string; subtitle: string; key: string | null }[]
	}
	/** The phone's tab bar (product/substrate/shell.md, "Mobile"). */
	tabs: {
		/** The places of the shell that lead the bar. */
		places: readonly string[]
		/** The domains pinned after them until the owner chooses their own two. */
		pinned: readonly BuiltDomainId[]
		/** The last tab, which holds what the bar has no room for. */
		more: { id: string; name: string }
	}
	tiles: readonly ShellTileDeclaration[]
	/** The Garden's default layout, as widget and tile ids in order. */
	gardenDefault: readonly string[]
}
