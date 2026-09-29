<script lang="ts">
	// The desktop shell (product/substrate/shell.md): the sidebar on the left, the content with its back affordance,
	// the status bar along the bottom, and the overlays (toast, settings, crash) on top. It mounts the shared pieces
	// once: settings, i18n, the global error handler, the hourly update check. The splash covers it until they are
	// ready, then fades out as the shell fades in.
	import '../app.css'
	import { onMount } from 'svelte'
	import { afterNavigate, goto } from '$app/navigation'
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
		iconFor,
		type SidebarEntry,
	} from '@eden/ui-kit'
	import { checkForUpdate } from '@eden/shared/api/updater'
	import { initializeI18n, locale, t, uiKitStrings } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { dismissSplash, splashVisible } from '@eden/shared/stores'
	import CrashScreen from '$lib/components/CrashScreen.svelte'
	import SplashScreen from '$lib/components/SplashScreen.svelte'
	import { manifests } from '$lib/domains'
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

	// Today; Garden, Gardener and Toolbench; then the enabled domains from their manifests, each group under a rule
	// (D-64); the owner's order arrives with the Domains tab. The ⌘ positions count the places only: the Gardener has
	// its own key.
	const domains = $derived(manifests.filter((m) => m.id !== 'toolbench'))
	const toolbench = $derived(manifests.filter((m) => m.id === 'toolbench'))
	const hrefs = {
		today: resolve('/today'),
		garden: resolve('/garden'),
	} as const

	const position = $derived(
		new Map(['today', 'garden', ...[...toolbench, ...domains].map((m) => m.id)].map((id, i) => [id, i + 1]))
	)
	const entry = (manifest: (typeof manifests)[number]): SidebarEntry => ({
		id: manifest.id,
		name: $t(manifest.name),
		subtitle: $t(manifest.subtitle),
		// Sky's glyph is live: it follows the current conditions (weather.md).
		icon: manifest.id === 'weather' && weather.now ? iconFor(weather.now.condition, weather.now.night) : manifest.glyph,
		shortcut: keys(String(position.get(manifest.id))),
		href: manifest.routes.href,
	})

	const groups = $derived<SidebarEntry[][]>([
		[
			{
				id: 'today',
				name: $t('shell.today'),
				subtitle: $t('shell.todaySubtitle'),
				icon: domainGlyph('today'),
				shortcut: keys('1'),
				href: hrefs.today,
			},
		],
		[
			{
				id: 'garden',
				name: $t('shell.garden'),
				subtitle: $t('shell.gardenSubtitle'),
				icon: domainGlyph('garden'),
				shortcut: keys('2'),
				href: hrefs.garden,
			},
			{
				id: 'gardener',
				name: $t('shell.gardener'),
				subtitle: $t('shell.gardenerSubtitle'),
				icon: domainGlyph('gardener'),
				shortcut: keys('G'),
			},
			...toolbench.map(entry),
		],
		...(domains.length ? [domains.map(entry)] : []),
	])
	/** The places, in ⌘ order. */
	const items = $derived(groups.flat().filter((item) => item.href))
	const pinned = $derived<SidebarEntry[]>([
		{
			id: 'settings',
			name: $t('shell.settings'),
			subtitle: $t('shell.settingsSubtitle'),
			icon: domainGlyph('settings'),
			shortcut: keys(','),
			action: true,
		},
	])
	const current = $derived(page.route.id?.split('/')[1] || 'garden')

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
	afterNavigate((navigation) => {
		if (navigation.type === 'link' || navigation.type === 'goto') depth += 1
		else if (navigation.type === 'popstate') depth = Math.max(0, depth - 1)
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
			if (timer) clearInterval(timer)
		}
	})
</script>

<svelte:window {onkeydown} />

<SplashScreen show={$splashVisible} version={env.PUBLIC_APP_VERSION ?? ''} />

<UiKitProvider strings={uiKitStrings($locale)}>
	<div class={['shell', $splashVisible && 'shell-waiting']}>
		<Sidebar {groups} {pinned} brand={$t('app.name')} subtitles={settings.subtitles} {current} {onselect} />
		<main class="content">
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
