<script lang="ts">
	// The mobile shell (product/substrate/shell.md, Mobile): the page, the bottom tab bar pinned to the viewport
	// (Garden, Today, the two pinned domains, More), composed from the manifests, and the overlays (toast, the
	// settings sheet, crash). It mounts the shared
	// pieces once: settings, i18n, the global error handler, signals and the scheduler. No updater: mobile updates
	// through the stores. The splash covers it until they are ready, then fades out as the shell fades in.
	import '$lib/navigation'
	import '../app.css'
	import { onMount, tick } from 'svelte'
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import { env } from '$env/dynamic/public'
	import { BottomTabBar, ToastHost, UiKitProvider, domainGlyph, type BottomTab, type GlyphId } from '@eden/ui-kit'
	import { fileDropGuard, logError } from '@eden/shared/api'
	import { home } from '@eden/shared/home'
	import { initializeI18n, locale, t, uiKitStrings } from '@eden/shared/i18n'
	import { shell, tabBar } from '@eden/shared/manifest'
	import { rememberPlace, rememberScroll, scrollOf, tabOf } from '@eden/shared/navigation'
	import { coordinator } from '@eden/shared/refresh'
	import { settings } from '@eden/shared/settings'
	import { grants } from '@eden/shared/shell'
	import { gardenerSetup, gardenerUi, missingHandlers } from '@eden/shared/shell/gardener'
	import { inbox } from '@eden/shared/shell/inbox'
	import { profile } from '@eden/shared/shell/profile'
	import { startSignals } from '@eden/shared/signals'
	import { FORECAST_RESOURCE, weather } from '@eden/shared/weather'
	import { dismissSplash, splashVisible } from '@eden/shared/stores'
	import CrashScreen from '@eden/shared/components/CrashScreen.svelte'
	import { declarations, manifestFor, manifests } from '$lib/domains'
	import SplashScreen from '@eden/shared/components/SplashScreen.svelte'
	import { useGlobalErrorHandler } from '@eden/shared/errors/global-handler'
	import { markSvelteKitReady } from '../hooks.client'
	import SettingsSheet from '$lib/settings/SettingsSheet.svelte'

	let { children } = $props()

	// Garden and Today, then the domains pinned until the owner chooses their own two (Hearth and Sky), then More,
	// which holds the rest.
	const bar = tabBar(declarations, shell)
	/** Where the tabs that are the shell's own lead. */
	const places: Partial<Record<string, () => void>> = {
		garden: () => void goto(resolve('/garden')),
		today: () => void goto(resolve('/today')),
		[shell.tabs.more.id]: () => void goto(resolve('/more')),
	}
	const openOf = (id: string) => manifestFor(id)?.routes.open ?? places[id]

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
		const cleanupErrors = useGlobalErrorHandler(markSvelteKitReady)
		settings.load()
		// what follows the home (D-141): the area a model may know, and the forecast when it has moved
		home.bind({
			changed: (place, moved) => {
				void profile.syncHomeArea(place)
				if (moved) void weather.load()
			},
		})
		void home.load()
		// the Gardener comes back on the domain it was left on, while that domain is still one of the app's
		if (gardenerUi.domain && !manifestFor(gardenerUi.domain)) gardenerUi.domain = undefined
		void initializeI18n(settings.language)
			.catch(() => null)
			.then(() => {
				void dismissSplash()
				void grants.load()
				void gardenerSetup.load()
				// every declared tool has a handler, or the log says which does not (engineering/gardener.md, "Tools")
				const unhandled = missingHandlers()
				if (unhandled.length)
					void logError('gardener', 'Declared tools without a handler', unhandled.join(', ')).catch(() => null)
			})
		// The inbox hears what is delivered before signals start, so a card made by the first take is not missed.
		void inbox.load()
		// Signals and the scheduler (substrate/signals-notifications.md): the domains bind what they hear, their
		// schedules are declared, and what came due while Eden was closed or in the background is taken.
		const stopSignals = startSignals({
			declarations,
			bind: manifests.flatMap((manifest) => (manifest.subscribe ? [manifest.subscribe] : [])),
		})
		// Sky's tab glyph reads the forecast for as long as the shell is up, which is what keeps it fresh while the
		// app is in front (the refresh coordinator; D-73).
		const releaseSky = coordinator.watch(FORECAST_RESOURCE)
		return () => {
			releaseSky()
			stopSignals()
			cleanupErrors()
			settings.dispose()
			weather.dispose()
		}
	})
</script>

<!-- a file dropped on the app (an iPad's drag) does nothing, instead of opening in place of it (D-84) -->
<svelte:window ondragover={fileDropGuard.over} ondrop={fileDropGuard.drop} />

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
		/* A page adapts to this column, never to the window: every shared view asks `@container page` how much room
		   it has (D-112). A size container may hold what is fixed inside it, so the tab bar and anything else pinned
		   to the viewport stay siblings of this element, never children */
		container: page / inline-size;
	}
	/* narrow page */
	@container page (max-width: 48rem) {
		/* every page insets itself by the gutter, which tightens here once for all of them */
		.content > :global(*) {
			--ed-gutter: var(--space-4);
		}
	}
	:global(.tabs) {
		position: fixed;
		inset-inline: 0;
		bottom: 0;
	}
</style>
