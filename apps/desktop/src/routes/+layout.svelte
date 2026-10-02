<script lang="ts">
	// The desktop shell (product/substrate/shell.md): the sidebar on the left, the content with its back affordance,
	// which drags wider and collapses to a rail (D-119), the Gardener's panel docked on the right while it is open, the status bar along the bottom, and the overlays
	// (toast, settings, crash) on top. It mounts the shared pieces
	// once: settings, i18n, the global error handler, the hourly update check, signals and the scheduler. The splash
	// covers it until they are ready, then fades out as the shell fades in.
	import '$lib/navigation'
	import '../app.css'
	import { onMount, tick } from 'svelte'
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import { env } from '$env/dynamic/public'
	import {
		BackButton,
		Sidebar,
		StatusBar,
		ToastHost,
		UiKitProvider,
		domainGlyph,
		sizes,
		type GlyphId,
		type InboxItem,
		type SidebarEntry,
	} from '@eden/ui-kit'
	import { checkForUpdate } from '@eden/shared/api/updater'
	import { home } from '@eden/shared/home'
	import { initializeI18n, locale, t, uiKitStrings } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { dismissSplash, splashVisible } from '@eden/shared/stores'
	import CrashScreen from '@eden/shared/components/CrashScreen.svelte'
	import SplashScreen from '@eden/shared/components/SplashScreen.svelte'
	import { shell, shortcutPositions, sidebarGroups, type SidebarItem } from '@eden/shared/manifest'
	import { rememberPlace, rememberScroll, scrollOf, tabOf } from '@eden/shared/navigation'
	import { coordinator } from '@eden/shared/refresh'
	import { messageValues, notificationKeys, startSignals } from '@eden/shared/signals'
	import { declarations, manifestFor, manifests } from '$lib/domains'
	import { grants } from '@eden/shared/shell'
	import { inbox } from '@eden/shared/shell/inbox'
	import { profile } from '@eden/shared/shell/profile'
	import { FORECAST_RESOURCE, weather } from '@eden/shared/weather'
	import { formatTime, formatWeekday, relativeDay } from '@eden/shared/dates'
	import { detectOs, formatShortcut } from '@eden/shared/shortcuts'
	import { useGlobalErrorHandler } from '@eden/shared/errors/global-handler'
	import { markSvelteKitReady } from '../hooks.client'
	import SettingsSheet from '$lib/settings/SettingsSheet.svelte'
	import ChangeHomeSheet from '$lib/shell/home/ChangeHomeSheet.svelte'
	import { homeUi } from '@eden/shared/shell/home'
	import { settingsUi } from '@eden/shared/shell/settings'
	import QuickLogHost from '@eden/shared/shell/quick-log/QuickLogHost.svelte'
	import { quickLogEntries, saveQuickLog } from '@eden/shared/shell/quick-log'
	import { quickLogUi } from '@eden/shared/shell/quick-log'
	import ResizeHandle from '$lib/shell/ResizeHandle.svelte'
	import GardenerDock from '$lib/shell/gardener/GardenerDock.svelte'
	import { gardenerUi } from '@eden/shared/shell/gardener'
	import { gardenerSetup } from '@eden/shared/shell/gardener'
	import { missingHandlers } from '@eden/shared/shell/gardener'
	import { fileDropGuard, isTauri, logError } from '@eden/shared/api'
	import { formatUsd, GRADES } from '@eden/shared/gardener'

	let { children } = $props()

	// Shortcuts are written for the OS the window runs on, and not at all on mobile.
	const os = detectOs(navigator.userAgent)
	const keys = (key: string) => formatShortcut(key, { os, platform: 'desktop' })

	const UPDATE_INTERVAL = 60 * 60 * 1000
	const format = $derived({ lang: $locale ?? 'en', clock: settings.clock })
	/** Sky's times are the place's (D-58). */
	const skyFormat = $derived({ ...format, timeZone: weather.timeZone })

	// The groups come from the manifests and from what the shell declares for itself: Today; Garden, Gardener and
	// Toolbench; then the domains, each group under a rule (D-64). The owner's order and what they hid arrive with
	// the Domains tab. The ⌘ positions count the places of the groups only: the Gardener, pinned at the foot, is a
	// place too (D-113), but its key is ⌘G, which opens its panel, not its page.
	const composed = sidebarGroups(declarations, shell)
	const position = shortcutPositions(composed)
	/** Where the places that are the shell's own lead. */
	const places: Partial<Record<string, ReturnType<typeof resolve>>> = {
		today: resolve('/today'),
		garden: resolve('/garden'),
		gardener: resolve('/gardener/[[tab]]', {}),
	}

	function entry(item: SidebarItem): SidebarEntry {
		const manifest = item.kind === 'domain' ? manifestFor(item.id) : undefined
		const at = position.get(item.id)
		return {
			id: item.id,
			name: $t(item.name),
			subtitle: $t(item.subtitle),
			// a domain's glyph may be live: Sky's follows the current conditions (weather.md)
			icon: manifest ? (manifest.liveGlyph?.() ?? manifest.glyph) : domainGlyph(item.id as GlyphId),
			shortcut: item.place ? (at ? keys(String(at)) : undefined) : item.key ? keys(item.key) : undefined,
			href: manifest ? manifest.routes.href : places[item.id],
		}
	}

	const groups = $derived<SidebarEntry[][]>(composed.map((group) => group.items.map(entry)))
	/** The places, in ⌘ order. */
	const items = $derived(groups.flat().filter((item) => item.href))
	const pinned = $derived<SidebarEntry[]>(
		shell.sidebar.pinned.map((item) => ({
			id: item.id,
			name: $t(item.name),
			subtitle: $t(item.subtitle),
			icon: domainGlyph(item.id as GlyphId),
			shortcut: item.key ? keys(item.key) : undefined,
			// the Gardener has a page and becomes the current item on it; Settings is an action
			href: places[item.id],
			action: !places[item.id],
		}))
	)
	const current = $derived(tabOf(page.route))

	// Offline: the banner takes the sync line's place while the forecast is a mirror from an earlier fetch
	// (product/substrate/shell.md, "Global states").
	const banner = $derived(
		weather.offline && weather.lastGood
			? {
					message: $t('domains.weather.offline.banner', {
						values: { time: formatTime(weather.lastGood, skyFormat) },
					}),
				}
			: undefined
	)

	// The inbox behind the bell (substrate/signals-notifications.md): each card's line is written here from its
	// rule's locale key and its signal's payload, so it reads in the current locale. A card opens its domain; the
	// latest card that would have been an OS notification offers to turn those on while they are off.
	function arrived(at: number): string {
		const iso = new Date(at).toISOString()
		const day = relativeDay(iso)
		if (day === 'today') return formatTime(at, format)
		return day === 'yesterday' ? $t('shell.inbox.yesterday') : formatWeekday(iso, format.lang)
	}
	const notices = $derived<InboxItem[]>(
		inbox.cards.map((card) => {
			const keys = notificationKeys(card.rule)
			const manifest = manifestFor(keys.domain)
			return {
				id: card.id,
				icon: manifest?.glyph,
				line: $t(keys.line, { values: messageValues(card.payload) }),
				when: arrived(card.at),
				domain: manifest ? $t(manifest.name) : undefined,
				unread: !card.read,
				actions: [
					...(manifest
						? [
								{
									id: 'open',
									label: $t('shell.inbox.open'),
									icon: 'arrow-right' as const,
									onclick: () => manifest.routes.open(),
								},
							]
						: []),
					...(inbox.asks === card.id
						? [
								{
									id: 'allow',
									label: $t('shell.inbox.allow'),
									icon: 'bell' as const,
									onclick: () => void inbox.allowNotifications(),
								},
							]
						: []),
				],
			}
		})
	)

	// How far the in-app history goes: the back arrow shows only when there is somewhere to go (shell.md).
	let depth = $state(0)
	// The content scrolls in `main`, not the window, so the router's own restoration never reaches it: each sidebar
	// tab's position is kept as it is left and put back when it is returned to, and the place itself is remembered
	// for the next launch (`@eden/shared/navigation`). A move within a tab (Hearth's tabs) keeps its own position.
	let main = $state<HTMLElement>()
	// the room beside the nav, which the Gardener's dock takes a quarter to a half of
	let innerWidth = $state(0)
	let navWidth = $state(0)
	const room = $derived(Math.max(0, innerWidth - navWidth))

	// The sidebar's edge drags as the Gardener's dock does (D-119): from three quarters of the kit's width to twice
	// it, less whatever the page's floor needs in a small window, and narrower than that it collapses to the rail.
	// The width and whether it is collapsed are kept per device; dragging turns the transition off so the edge
	// follows the pointer.
	const SIDEBAR_DEFAULT = Number.parseInt(sizes.sidebar, 10)
	const SIDEBAR_MIN = Math.round(SIDEBAR_DEFAULT * 0.75)
	const SIDEBAR_MAX = SIDEBAR_DEFAULT * 2
	const SIDEBAR_RAIL = Number.parseInt(sizes['sidebar-rail'], 10)
	// the least the page beside the sidebar keeps, in px
	const PAGE_FLOOR = 420
	const sidebarMax = $derived(
		innerWidth ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, innerWidth - PAGE_FLOOR)) : SIDEBAR_MAX
	)
	const clampSidebar = (value: number) => Math.min(sidebarMax, Math.max(SIDEBAR_MIN, value))
	const sidebarWidth = $derived(clampSidebar(settings.sidebarWidth ?? SIDEBAR_DEFAULT))
	let sidebarResizing = $state(false)
	// where the pointer has taken the edge during a drag, past either bound, and the width the drag began at
	let dragged: number | undefined
	let widthBefore: number | null = null
	function startSidebarResize() {
		sidebarResizing = true
		dragged = settings.sidebarCollapsed ? SIDEBAR_RAIL : sidebarWidth
		widthBefore = settings.sidebarWidth
	}
	function endSidebarResize() {
		sidebarResizing = false
		dragged = undefined
	}
	function resizeSidebar(delta: number) {
		if (dragged === undefined) {
			// the arrow keys: a step wider opens the rail, a step narrower than the least collapses to it
			if (settings.sidebarCollapsed) {
				if (delta > 0) settings.setSidebarCollapsed(false)
			} else if (sidebarWidth + delta < SIDEBAR_MIN) settings.setSidebarCollapsed(true)
			else settings.setSidebarWidth(clampSidebar(sidebarWidth + delta))
			return
		}
		dragged += delta
		if (dragged < SIDEBAR_MIN) {
			// collapsed by the drag, it opens again at the width it had before
			if (!settings.sidebarCollapsed) {
				settings.setSidebarCollapsed(true)
				settings.setSidebarWidth(widthBefore)
			}
			return
		}
		if (settings.sidebarCollapsed) settings.setSidebarCollapsed(false)
		settings.setSidebarWidth(clampSidebar(dragged))
	}
	const toggleSidebar = () => settings.setSidebarCollapsed(!settings.sidebarCollapsed)
	beforeNavigate((navigation) => {
		if (main && navigation.to) rememberScroll(tabOf(navigation.from?.route), main.scrollTop)
	})
	afterNavigate(async (navigation) => {
		if (navigation.type === 'link' || navigation.type === 'goto') depth += 1
		else if (navigation.type === 'popstate') depth = Math.max(0, depth - 1)
		if (navigation.to) rememberPlace(navigation.to.url.pathname)
		if (navigation.type === 'enter' || tabOf(navigation.from?.route) === tabOf(navigation.to?.route)) return
		const top = scrollOf(tabOf(navigation.to?.route))
		const restore = () => {
			if (main) main.scrollTop = top
		}
		await tick()
		restore()
		// once more a frame on, for a page whose content mounts after the navigation settles
		requestAnimationFrame(restore)
	})
	const onback = $derived(depth > 0 ? () => history.back() : undefined)

	// The Gardener's entry is a link to its page (D-113); its panel opens by ⌘G and from the status bar's chip.
	function onselect(id: string) {
		if (id === 'settings') settingsUi.show()
	}

	const GRADE_ICONS = { light: 'seed', standard: 'sprout', deep: 'tree-deciduous' } as const

	// The status bar's Gardener chip (shell.md, "Status bar"): the conversation's grade and model with the switch,
	// the budget meter, grey when this device has no key; it opens the panel.
	const gardenerChip = $derived({
		label: gardenerSetup.hasKey ? gardenerSetup.model : $t('shell.gardener'),
		noKey: !gardenerSetup.hasKey,
		budget: gardenerSetup.hasKey
			? {
					used: formatUsd(gardenerSetup.spentThisMonth),
					cap: formatUsd(gardenerSetup.capUsd),
					percent: gardenerSetup.percent,
				}
			: undefined,
		grade: gardenerSetup.grade,
		grades: GRADES.map((grade) => ({
			id: grade,
			label: $t(`settings.gardener.grades.${grade}`),
			icon: GRADE_ICONS[grade],
		})),
		onchangegrade: (id: string) => settings.setGardenerGrade(id as (typeof GRADES)[number]),
		onopen: () => gardenerUi.show(),
	})

	// The development clamp (D-81), said once: an info button just left of the grade switch whose tooltip names
	// the models, in the app, where a request can be sent.
	const clampNotice = $derived(
		gardenerSetup.clamped && isTauri()
			? {
					label: $t('gardener.devClamp', {
						values: { model: gardenerSetup.map.light.model, deep: gardenerSetup.map.deep.model },
					}),
				}
			: undefined
	)

	/** The status bar's + and the sheet show the same entries: the enabled domains' quick actions (D-12). */
	const quickLogs = $derived(quickLogEntries($t))

	// ⌘, opens Settings; ⌘G the Gardener; ⌘B collapses the sidebar; ⌘⇧L opens Quick Log; ⌘1 to ⌘9 go to the sidebar
	// positions (shell.md, keyboard model).
	function onkeydown(e: KeyboardEvent) {
		if (!(e.metaKey || e.ctrlKey) || e.altKey) return
		if (e.shiftKey) {
			if (e.key === 'l' || e.key === 'L') {
				e.preventDefault()
				quickLogUi.show()
			}
			return
		}
		if (e.key === ',') {
			e.preventDefault()
			settingsUi.show()
			return
		}
		if (e.key === 'g' || e.key === 'G') {
			e.preventDefault()
			gardenerUi.toggle()
			return
		}
		if (e.key === 'b' || e.key === 'B') {
			e.preventDefault()
			toggleSidebar()
			return
		}
		if (/^[1-9]$/.test(e.key)) {
			const item = items[Number(e.key) - 1]
			if (item?.href) {
				e.preventDefault()
				goto(item.href)
			}
		}
	}

	onMount(() => {
		const cleanupErrors = useGlobalErrorHandler(markSvelteKitReady)
		let timer: ReturnType<typeof setInterval> | undefined
		;(async () => {
			settings.load()
			// what follows the home (D-141): the area a model may know, and the forecast when it has moved
			home.bind({
				changed: (place, moved) => {
					void profile.syncHomeArea(place)
					if (moved) void weather.load()
				},
			})
			void home.load()
			// the panel comes back on the domain it was left on, while that domain is still one of the app's
			if (gardenerUi.domain && !manifestFor(gardenerUi.domain)) gardenerUi.domain = undefined
			await initializeI18n(settings.language)
			void dismissSplash()
			checkForUpdate().catch(() => null)
			timer = setInterval(() => checkForUpdate().catch(() => null), UPDATE_INTERVAL)
			void grants.load()
			void gardenerSetup.load()
			// every declared tool has a handler, or the log says which does not (engineering/gardener.md, "Tools")
			const unhandled = missingHandlers()
			if (unhandled.length)
				void logError('gardener', 'Declared tools without a handler', unhandled.join(', ')).catch(() => null)
		})()
		// The inbox hears what is delivered before signals start, so a card made by the first take is not missed.
		void inbox.load()
		// Signals and the scheduler (substrate/signals-notifications.md): the domains bind what they hear, their
		// schedules are declared, and what came due while Eden was closed is taken. The settings are read by now.
		const stopSignals = startSignals({
			declarations,
			bind: manifests.flatMap((manifest) => (manifest.subscribe ? [manifest.subscribe] : [])),
		})
		// The sidebar's glyph and the offline banner read the forecast for as long as the shell is up, which is what
		// keeps it fresh while the window is seen (the refresh coordinator; D-73).
		const releaseSky = coordinator.watch(FORECAST_RESOURCE)
		return () => {
			releaseSky()
			stopSignals()
			cleanupErrors()
			settings.dispose()
			weather.dispose()
			if (timer) clearInterval(timer)
		}
	})
</script>

<!-- a file dropped anywhere no drop zone takes it does nothing, instead of opening in place of the app (D-84) -->
<svelte:window {onkeydown} bind:innerWidth ondragover={fileDropGuard.over} ondrop={fileDropGuard.drop} />

<SplashScreen show={$splashVisible} version={env.PUBLIC_APP_VERSION ?? ''} />

<UiKitProvider strings={uiKitStrings($locale)}>
	<div class={['shell', $splashVisible && 'shell-waiting']}>
		<div
			class={['nav', !sidebarResizing && 'nav-sliding']}
			style:width="{settings.sidebarCollapsed ? SIDEBAR_RAIL : sidebarWidth}px"
			bind:clientWidth={navWidth}
		>
			<Sidebar
				{groups}
				{pinned}
				brand={$t('app.name')}
				subtitles={settings.subtitles}
				collapsed={settings.sidebarCollapsed}
				{current}
				{onselect}
				style="width: 100%"
			/>
			<ResizeHandle
				label={$t('shell.resizeSidebar')}
				edge="end"
				onresize={resizeSidebar}
				onstart={startSidebarResize}
				onend={endSidebarResize}
				ontoggle={toggleSidebar}
			/>
		</div>
		<main class="content" bind:this={main}>
			<div class="content-back"><BackButton {onback} /></div>
			{@render children()}
		</main>
		<GardenerDock {room} />
		<StatusBar
			class="bar"
			sync={$t('shell.sync.local')}
			{banner}
			integrations={[]}
			gardener={gardenerChip}
			notice={clampNotice}
			inbox={notices}
			logs={quickLogs}
			onlog={(log, value) => void saveQuickLog(log.id, value)}
			oninboxclose={() => void inbox.markRead()}
		/>
	</div>
	<ToastHost />
	<SettingsSheet />
	<QuickLogHost />
	{#key homeUi.opened}
		{#if homeUi.opened}<ChangeHomeSheet />{/if}
	{/key}
	{#each manifests as manifest (manifest.id)}
		{#if manifest.overlay}
			{@const Overlay = manifest.overlay}
			<Overlay />
		{/if}
	{/each}
	<CrashScreen />
</UiKitProvider>

<style>
	.shell {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) minmax(0, auto);
		grid-template-rows: minmax(0, 1fr) auto;
		height: 100dvh;
		/* The shell is the window and the document never scrolls: it holds what is positioned inside it, so nothing
		   absolute (a visually hidden label deep in a scroller) lays out against the body and lengthens the page */
		position: relative;
		overflow: clip;
		background: var(--surface-0);
		transition: opacity var(--ed-duration-settle) var(--ed-ease-out);
	}
	/* Under the splash the shell is laid out but neither seen nor reachable */
	.shell-waiting {
		opacity: 0;
		pointer-events: none;
	}
	.nav {
		grid-row: 1;
		grid-column: 1;
		min-height: 0;
		display: flex;
	}
	.nav-sliding {
		transition: width var(--ed-duration-panel) var(--ed-ease-out);
	}
	@media (prefers-reduced-motion: reduce) {
		.nav-sliding {
			transition: none;
		}
	}
	.content {
		grid-row: 1;
		grid-column: 2;
		/* positioned, so what is absolute inside scrolls with it */
		position: relative;
		overflow: auto;
		display: flex;
		flex-direction: column;
		padding: var(--ed-gutter) var(--space-4);
		/* A page adapts to this column, never to the window: the Gardener's dock narrows it, and every view asks
		   `@container page` how much room it has */
		container: page / inline-size;
	}
	/* narrow page */
	@container page (max-width: 48rem) {
		/* every page insets itself by the gutter, which tightens here once for all of them */
		.content > :global(*) {
			--ed-gutter: var(--space-4);
		}
	}
	/* The arrow is centred over the page header's glyph: each page insets itself by the gutter, and the arrow's box
	   is wider than that glyph by the ring around it */
	.content-back {
		min-height: var(--ed-control);
		padding-left: calc(var(--ed-gutter) - (var(--ed-control) - var(--icon-lg)) / 2);
	}
	:global(.bar) {
		grid-row: 2;
		grid-column: 1 / -1;
	}
</style>
