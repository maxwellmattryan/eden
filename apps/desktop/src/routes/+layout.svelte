<script lang="ts">
	// The desktop shell (product/substrate/shell.md): the sidebar on the left, the content with its back affordance,
	// the status bar along the bottom, and the overlays (toast, settings, crash) on top. It mounts the shared pieces
	// once: settings, i18n, the global error handler, the hourly update check. The splash covers it until they are
	// ready, then fades out as the shell fades in.
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
		type GlyphId,
		type SidebarEntry,
	} from '@eden/ui-kit'
	import { checkForUpdate } from '@eden/shared/api/updater'
	import { initializeI18n, locale, t, uiKitStrings } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { dismissSplash, splashVisible } from '@eden/shared/stores'
	import CrashScreen from '$lib/components/CrashScreen.svelte'
	import SplashScreen from '$lib/components/SplashScreen.svelte'
	import { shell, shortcutPositions, sidebarGroups, type SidebarItem } from '@eden/shared/manifest'
	import { rememberPlace, rememberScroll, scrollOf, tabOf } from '@eden/shared/navigation'
	import { declarations, manifestFor } from '$lib/domains'
	import { weather } from '@eden/shared/weather'
	import { formatTime } from '@eden/shared/dates'
	import { detectOs, formatShortcut } from '@eden/shared/shortcuts'
	import { useGlobalErrorHandler } from '$lib/hooks/useGlobalErrorHandler'
	import SettingsSheet from '$lib/settings/SettingsSheet.svelte'
	import { settingsUi } from '$lib/settings/settings-ui.svelte'

	let { children } = $props()

	// Shortcuts are written for the OS the window runs on, and not at all on mobile.
	const os = detectOs(navigator.userAgent)
	const keys = (key: string) => formatShortcut(key, { os, platform: 'desktop' })

	const UPDATE_INTERVAL = 60 * 60 * 1000
	/** How often the shell asks the weather store whether its forecast is stale, so the sidebar glyph keeps up. */
	const WEATHER_INTERVAL = 10 * 60 * 1000
	const format = $derived({ lang: $locale ?? 'en', clock: settings.clock })
	/** Sky's times are the place's (D-58). */
	const skyFormat = $derived({ ...format, timeZone: weather.timeZone })

	// The groups come from the manifests and from what the shell declares for itself: Today; Garden, Gardener and
	// Toolbench; then the domains, each group under a rule (D-64). The owner's order and what they hid arrive with
	// the Domains tab. The ⌘ positions count the places only: the Gardener has its own key.
	const composed = sidebarGroups(declarations, shell)
	const position = shortcutPositions(composed)
	/** Where the places that are the shell's own lead. */
	const places: Partial<Record<string, ReturnType<typeof resolve>>> = {
		today: resolve('/today'),
		garden: resolve('/garden'),
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
			action: true,
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

	// How far the in-app history goes: the back arrow shows only when there is somewhere to go (shell.md).
	let depth = $state(0)
	// The content scrolls in `main`, not the window, so the router's own restoration never reaches it: each sidebar
	// tab's position is kept as it is left and put back when it is returned to, and the place itself is remembered
	// for the next launch (`@eden/shared/navigation`). A move within a tab (Hearth's tabs) keeps its own position.
	let main = $state<HTMLElement>()
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

	function onselect(id: string) {
		if (id === 'settings') settingsUi.show()
	}

	// ⌘, opens Settings; ⌘1 to ⌘9 go to the sidebar positions (shell.md, keyboard model).
	function onkeydown(e: KeyboardEvent) {
		if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
		if (e.key === ',') {
			e.preventDefault()
			settingsUi.show()
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
		const cleanupErrors = useGlobalErrorHandler()
		let timer: ReturnType<typeof setInterval> | undefined
		;(async () => {
			settings.load()
			await initializeI18n(settings.language)
			void dismissSplash()
			checkForUpdate().catch(() => null)
			timer = setInterval(() => checkForUpdate().catch(() => null), UPDATE_INTERVAL)
			void weather.load().catch(() => null)
		})()
		const skyTimer = setInterval(() => void weather.load().catch(() => null), WEATHER_INTERVAL)
		return () => {
			clearInterval(skyTimer)
			cleanupErrors()
			settings.dispose()
			weather.dispose()
			if (timer) clearInterval(timer)
		}
	})
</script>

<svelte:window {onkeydown} />

<SplashScreen show={$splashVisible} version={env.PUBLIC_APP_VERSION ?? ''} />

<UiKitProvider strings={uiKitStrings($locale)}>
	<div class={['shell', $splashVisible && 'shell-waiting']}>
		<Sidebar {groups} {pinned} brand={$t('app.name')} subtitles={settings.subtitles} {current} {onselect} />
		<main class="content" bind:this={main}>
			<div class="content-back"><BackButton {onback} /></div>
			{@render children()}
		</main>
		<StatusBar
			class="bar"
			sync={$t('shell.sync.local')}
			{banner}
			integrations={[]}
			gardener={{ label: $t('shell.gardener'), noKey: true }}
			inbox={[]}
			logs={[]}
		/>
	</div>
	<ToastHost />
	<SettingsSheet />
	<CrashScreen />
</UiKitProvider>

<style>
	.shell {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) auto;
		height: 100dvh;
		background: var(--surface-0);
		transition: opacity var(--ed-duration-settle) var(--ed-ease-out);
	}
	/* Under the splash the shell is laid out but neither seen nor reachable */
	.shell-waiting {
		opacity: 0;
		pointer-events: none;
	}
	.content {
		grid-row: 1;
		grid-column: 2;
		overflow: auto;
		display: flex;
		flex-direction: column;
		padding: var(--ed-gutter) var(--space-4);
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
