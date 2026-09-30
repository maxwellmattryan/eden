<script lang="ts">
	// The mobile shell (product/substrate/shell.md, Mobile): the page, the bottom tab bar pinned to the viewport
	// (Garden, Today, the two pinned domains, More), composed from the manifests, and the overlays (toast, the
	// settings sheet, crash). It mounts the shared
	// pieces once: settings, i18n, the global error handler, signals and the scheduler. No updater: mobile updates
	// through the stores. The splash covers it until they are ready, then fades out as the shell fades in.
	import '../app.css'
	import { onMount, tick } from 'svelte'
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import { env } from '$env/dynamic/public'
	import { BottomTabBar, ToastHost, UiKitProvider, domainGlyph, type BottomTab, type GlyphId } from '@eden/ui-kit'
	import { initializeI18n, locale, t, uiKitStrings } from '@eden/shared/i18n'
	import { shell, tabBar } from '@eden/shared/manifest'
	import { rememberPlace, rememberScroll, scrollOf, tabOf } from '@eden/shared/navigation'
	import { settings } from '@eden/shared/settings'
	import { startSignals } from '@eden/shared/signals'
	import { weather } from '@eden/shared/weather'
	import { dismissSplash, splashVisible } from '@eden/shared/stores'
	import CrashScreen from '$lib/components/CrashScreen.svelte'
	import { declarations, manifestFor, manifests } from '$lib/domains'
	import SplashScreen from '$lib/components/SplashScreen.svelte'
	import { useGlobalErrorHandler } from '$lib/hooks/useGlobalErrorHandler'
	import SettingsSheet from '$lib/settings/SettingsSheet.svelte'

	let { children } = $props()

	/** How often the shell asks the weather store whether its forecast is stale, so the tab glyph keeps up. */
	const WEATHER_INTERVAL = 10 * 60 * 1000

	// Garden and Today, then the domains pinned until the owner chooses their own two (Hearth and Sky), then More,
	// which holds the rest.
	const bar = tabBar(declarations, shell)
	/** Where the tabs that are the shell's own lead. */
	const places: Partial<Record<string, () => void>> = {
		garden: () => void goto(resolve('/garden')),
		today: () => void goto(resolve('/today')),
		[shell.tabs.more.id]: () => void goto(resolve('/more')),
	}
	const openOf = (id: string) => manifestFor(id)?.routes?.open ?? places[id]

	const tabs = $derived<BottomTab[]>([
		...bar.tabs
			.filter((item) => openOf(item.id))
			.map((item) => {
				const manifest = item.kind === 'domain' ? manifestFor(item.id) : undefined
				return {
					id: item.id,
					label: $t(item.name),
					// a domain's glyph may be live: Sky's follows the current conditions (weather.md)
					icon: manifest ? (manifest.liveGlyph?.() ?? manifest.glyph) : domainGlyph(item.id as GlyphId),
				}
			}),
		{ id: shell.tabs.more.id, label: $t(shell.tabs.more.name), icon: 'menu' },
	])
	const current = $derived(tabOf(page.route))

	function onselect(id: string) {
		openOf(id)?.()
	}

	// Each tab's scroll position is kept as it is left and put back when it is returned to, over the router's own
	// scroll to the top, and the place itself is remembered for the next launch (`@eden/shared/navigation`).
	beforeNavigate((navigation) => {
		if (navigation.to) rememberScroll(tabOf(navigation.from?.route), window.scrollY)
	})
	afterNavigate(async (navigation) => {
		if (navigation.to) rememberPlace(navigation.to.url.pathname)
		if (navigation.type === 'enter' || tabOf(navigation.from?.route) === tabOf(navigation.to?.route)) return
		const top = scrollOf(tabOf(navigation.to?.route))
		const restore = () => window.scrollTo(0, top)
		await tick()
		restore()
		// once more a frame on, for a page whose content mounts after the navigation settles
		requestAnimationFrame(restore)
	})

	onMount(() => {
		const cleanupErrors = useGlobalErrorHandler()
		settings.load()
		void initializeI18n(settings.language)
			.catch(() => null)
			.then(dismissSplash)
		void weather.load().catch(() => null)
		const skyTimer = setInterval(() => void weather.load().catch(() => null), WEATHER_INTERVAL)
		// Signals and the scheduler (substrate/signals-notifications.md): the domains bind what they hear, their
		// schedules are declared, and what came due while Eden was closed or in the background is taken.
		const stopSignals = startSignals({
			declarations,
			bind: manifests.flatMap((manifest) => (manifest.subscribe ? [manifest.subscribe] : [])),
		})
		return () => {
			stopSignals()
			clearInterval(skyTimer)
			cleanupErrors()
			settings.dispose()
			weather.dispose()
		}
	})
</script>

<SplashScreen show={$splashVisible} version={env.PUBLIC_APP_VERSION ?? ''} />

<UiKitProvider strings={uiKitStrings($locale)}>
	<div class={['shell', $splashVisible && 'shell-waiting']}>
		<main class="content">
			{@render children()}
		</main>
		<BottomTabBar class="tabs" items={tabs} {current} {onselect} />
	</div>
	<ToastHost />
	<SettingsSheet />
	<CrashScreen />
</UiKitProvider>

<style>
	.shell {
		transition: opacity var(--ed-duration-settle) var(--ed-ease-out);
	}
	/* Under the splash the shell is laid out but neither seen nor reachable */
	.shell-waiting {
		opacity: 0;
		pointer-events: none;
	}
	.content {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		box-sizing: border-box;
		padding: calc(var(--ed-safe-top) + var(--ed-gutter)) calc(var(--ed-safe-right) + var(--ed-gutter))
			calc(var(--ed-tab-bar) + var(--ed-safe-bottom) + var(--ed-gutter)) calc(var(--ed-safe-left) + var(--ed-gutter));
		background: var(--surface-0);
	}
	:global(.tabs) {
		position: fixed;
		inset-inline: 0;
		bottom: 0;
	}
</style>
