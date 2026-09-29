<script lang="ts">
	// The shell every domain mockup sits in, mirroring product/substrate/shell.md region by region. Desktop: the Sidebar
	// (subtitles on, as after onboarding), `<main>` with the quiet back arrow at its top left when a story hands it a
	// breadcrumb, and the StatusBar at the foot with the sample integrations, the Gardener chip at its budget, the
	// unread inbox and the quick logs. Mobile: the page scrolls above a BottomTabBar pinned to the bottom of the phone
	// over the safe-area inset. The platform is read the kit's way, from the nearest data-platform, so the two Storybook
	// canvases each get their own shell. apps/desktop's +layout.svelte follows this composition; nothing here is exported.
	import type { Snippet } from 'svelte'
	import {
		BackButton,
		BottomTabBar,
		Sidebar,
		StatusBar,
		domainGlyph,
		type BottomTab,
		type GlyphId,
		type Platform,
		type SidebarEntry,
		type StatusBarGardener,
		type StatusBarIntegration,
	} from '$lib/index.js'
	import type { InboxItem, StatusBarBanner } from '$lib/components/StatusBar/StatusBar.svelte'
	import type { QuickLog } from '$lib/components/QuickLogSheet/QuickLogSheet.svelte'
	import type { InboxAction } from '$lib/components/InboxCard/InboxCard.svelte'
	import { platformOf } from '$lib/internal/platform.js'
	import { bottomTabs, budget, inbox, integrations, quickLogs, sidebar } from '../../sample-data.js'

	/** A sidebar's entries without their glyphs, as sample-data.ts holds them. */
	export type SidebarSample = { items: Omit<SidebarEntry, 'icon'>[]; pinned: Omit<SidebarEntry, 'icon'>[] }

	type Props = {
		/** The current page's plain id: garden, kitchen, weather, toolbench. */
		current: string
		/** auto reads the nearest data-platform, as every kit component does. */
		platform?: Platform | 'auto'
		/** The sidebar's entries; the English sample unless a story passes the Japanese one. */
		nav?: SidebarSample
		/** The mobile tabs; the sample five unless a story passes its own. */
		tabs?: BottomTab[]
		/** The status bar's sync line. */
		sync?: string
		/** The status bar's banner, in the sync line's place: offline, a notice. */
		banner?: StatusBarBanner
		/** The previous screen's name; with it the back arrow shows at the top left of the content. */
		back?: string
		/** The integrations' chips; the sample three unless set. */
		integrations?: StatusBarIntegration[]
		/** The Gardener chip; the sample budget unless set. */
		gardener?: StatusBarGardener
		/** The notifications behind the bell; the unread sample two unless set. */
		notices?: InboxItem[]
		/** The quick logs behind +. */
		logs?: QuickLog[]
		onback?: () => void
		onnavigate?: (id: string) => void
		onlog?: (log: QuickLog, value: string) => void
		oninboxaction?: (action: InboxAction, item: InboxItem) => void
		onsync?: (integration: StatusBarIntegration) => void
		/** The page, told which platform it is rendering on. */
		children: Snippet<[Platform]>
	}
	let {
		current,
		platform = 'auto',
		nav = sidebar,
		tabs,
		sync = integrations[0]!.detail,
		banner,
		back,
		integrations: services = integrations,
		gardener = { label: budget.model, budget: { used: budget.used, cap: budget.cap, percent: budget.percent } },
		notices,
		logs = quickLogs,
		onback,
		onnavigate,
		onlog,
		oninboxaction,
		onsync,
		children,
	}: Props = $props()

	/** The themed names of the domains the sample notifications come from (product/domains/README.md). */
	const NAMES: Record<string, string> = { kitchen: 'Hearth', weather: 'Sky', fitness: 'Vigor' }
	const withGlyphs = (entries: Omit<SidebarEntry, 'icon'>[]): SidebarEntry[] =>
		entries.map((entry) => ({ ...entry, icon: domainGlyph(entry.id as GlyphId) }))

	// The root, for the platform, read once it exists.
	let root = $state<HTMLElement>()
	const mode = $derived<Platform>(platform === 'auto' ? (root ? platformOf(root) : 'desktop') : platform)

	const items = $derived(withGlyphs(nav.items))
	const pinned = $derived(withGlyphs(nav.pinned))
	const tabItems = $derived<BottomTab[]>(
		tabs ?? bottomTabs.map((tab) => ({ ...tab, icon: tab.id === 'more' ? 'menu' : domainGlyph(tab.id) }))
	)
	const unread = $derived<InboxItem[]>(
		notices ??
			inbox
				.filter((notice) => notice.unread)
				.map((notice) => ({
					id: notice.id,
					icon: domainGlyph(notice.domain),
					line: notice.line,
					when: notice.when,
					domain: NAMES[notice.domain],
					unread: notice.unread,
				}))
	)
	/** A pick in either nav reports through onnavigate. (The navs' `onselect` prop type also carries the DOM handler's
	 * signature, so the parameter admits an Event and ignores it.) */
	const select = (id: string | Event) => {
		if (typeof id === 'string') onnavigate?.(id)
	}
</script>

<div class={['app', `app-${mode}`]} bind:this={root}>
	{#if mode === 'desktop'}
		<Sidebar {items} {pinned} subtitles {current} onselect={select} />
		<main class="app-main">
			{#if back}
				<div class="app-back"><BackButton breadcrumb={back} onback={onback ?? (() => {})} /></div>
			{/if}
			{@render children(mode)}
		</main>
		<StatusBar
			class="app-status"
			{sync}
			{banner}
			integrations={services}
			{gardener}
			inbox={unread}
			{logs}
			{onlog}
			{oninboxaction}
			{onsync}
		/>
	{:else}
		<main class="app-main">
			{@render children(mode)}
		</main>
		<BottomTabBar class="app-tabs" items={tabItems} {current} onselect={select} />
	{/if}
</div>

<style>
	.app {
		box-sizing: border-box;
		background: var(--surface-0);
		color: var(--text-primary);
	}
	/* Desktop: the window's three regions; the frame fills the gallery's canvas edge to edge, as a window would */
	.app-desktop {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) auto;
		min-height: calc(var(--sheet-max) * 0.9);
		margin: calc(-1 * var(--space-6));
	}
	.app-desktop > :global(.ed-sidebar) {
		grid-row: 1;
		grid-column: 1;
	}
	.app-desktop .app-main {
		grid-row: 1;
		grid-column: 2;
		min-width: 0;
	}
	.app-desktop > :global(.app-status) {
		grid-row: 2;
		grid-column: 1 / -1;
	}
	.app-back {
		display: flex;
		padding: var(--space-3) var(--ed-gutter) 0;
	}
	/* Mobile: the page scrolls above the tab bar, which stays at the foot of the phone over the safe-area inset.
	   The gallery pads its phone by the insets and a breath; the frame pulls back over that so the bar reaches the edge. */
	.app-mobile {
		display: flex;
		flex-direction: column;
		min-height: calc(100% + var(--ed-safe-top) + var(--ed-safe-bottom) + 2 * var(--space-2));
		margin: calc(-1 * (var(--ed-safe-top) + var(--space-2))) calc(-1 * var(--space-4))
			calc(-1 * (var(--ed-safe-bottom) + var(--space-2)));
	}
	.app-mobile .app-main {
		flex: 1;
		min-width: 0;
		padding-top: var(--ed-safe-top);
	}
	.app-mobile > :global(.app-tabs) {
		position: sticky;
		bottom: 0;
		z-index: var(--ed-z-sidebar);
	}
</style>
