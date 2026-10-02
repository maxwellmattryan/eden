<script lang="ts">
	// The mobile shell (product/substrate/shell.md, "Mobile"; D-TBD(phone-chrome)): the top bar pinned under the
	// notch (back, the Gardener, the bell), the page, the bottom tab bar pinned to the viewport (Garden, Today, the
	// two pinned domains, More), the floating + over it, and the overlays (toast, the settings drawer, Quick Log, the
	// inbox, each domain's own, crash). It mounts the shared pieces once: settings, i18n, the global error handler,
	// signals and the scheduler, the inbox, and Android's back press. No updater: mobile updates through the stores.
	// No sidebar, status bar or shortcuts: their work is the top bar's, the tab bar's and the sheets'. The splash
	// covers it until they are ready, then fades out as the shell fades in.
	import '$lib/navigation'
	import '../app.css'
	import { onMount, tick } from 'svelte'
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import { env } from '$env/dynamic/public'
	import {
		Banner,
		BottomTabBar,
		IconButton,
		ToastHost,
		UiKitProvider,
		domainGlyph,
		type BottomTab,
		type GlyphId,
	} from '@eden/ui-kit'
	import { fileDropGuard, logError } from '@eden/shared/api'
	import { formatTime } from '@eden/shared/dates'
	import { home } from '@eden/shared/home'
	import { initializeI18n, locale, t, uiKitStrings } from '@eden/shared/i18n'
	import { shell } from '@eden/shared/manifest'
	import {
		navigation,
		rememberPlace,
		rememberScroll,
		rememberTabPlace,
		scrollOf,
		tabOf,
		tabPlace,
		type PlaceId,
	} from '@eden/shared/navigation'
	import { coordinator } from '@eden/shared/refresh'
	import { settings } from '@eden/shared/settings'
	import { grants } from '@eden/shared/shell'
	import { gardenerSetup, gardenerUi, missingHandlers } from '@eden/shared/shell/gardener'
	import { homeUi } from '@eden/shared/shell/home'
	import ChangeHomeSheet from '@eden/shared/shell/home/ChangeHomeSheet.svelte'
	import { inbox } from '@eden/shared/shell/inbox'
	import { profile } from '@eden/shared/shell/profile'
	import { quickLogUi } from '@eden/shared/shell/quick-log'
	import QuickLogHost from '@eden/shared/shell/quick-log/QuickLogHost.svelte'
	import { startSignals } from '@eden/shared/signals'
	import { FORECAST_RESOURCE, weather } from '@eden/shared/weather'
	import { dismissSplash, splashVisible } from '@eden/shared/stores'
	import CrashScreen from '@eden/shared/components/CrashScreen.svelte'
	import { declarations, manifestFor, manifests, phoneTabBar } from '$lib/domains'
	import SplashScreen from '@eden/shared/components/SplashScreen.svelte'
	import { useGlobalErrorHandler } from '@eden/shared/errors/global-handler'
	import { markSvelteKitReady } from '../hooks.client'
	import * as map from '$lib/domains/places/map'
	import SettingsSheet from '$lib/settings/SettingsSheet.svelte'
	import { startBackHandler } from '$lib/shell/back'
	import { chrome } from '$lib/shell/chrome.svelte'
	import GardenerSheet from '$lib/shell/gardener/GardenerSheet.svelte'
	import { tap } from '$lib/shell/haptics'
	import InboxSheet from '$lib/shell/InboxSheet.svelte'
	import TopBar from '$lib/shell/TopBar.svelte'

	let { children } = $props()

	// The chat never opens by itself at launch on the phone, though the desktop's panel comes back as it was left:
	// a sheet over the page is not where a launch should land.
	if (gardenerUi.open) gardenerUi.hide()

	// Garden and Today, then the two domains pinned on this device (Hearth and Sky until the owner chooses, in
	// Settings → Domains), then More, which holds the rest.
	const bar = $derived(phoneTabBar())
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
	/** The bar's tab a route is under: its own when the bar has it, else More, which holds everything else. */
	const barTabOf = (route: { id: string | null } | null | undefined) => {
		const tab = tabOf(route)
		return bar.tabs.some((item) => item.id === tab) ? tab : shell.tabs.more.id
	}
	const current = $derived(barTabOf(page.route))

	// How far the in-app history goes, and the page that a page which is not a tab's root sits under: a page deeper
	// than its tab (the profile under the Garden), or a place the bar has no tab for (under More). The top bar's
	// arrow shows on those: it walks history while there is some, and otherwise goes to the parent.
	let depth = $state(0)
	const parent = $derived.by(() => {
		const tab = tabOf(page.route)
		const segments = (page.route.id ?? '').split('/').filter((part) => part && !part.startsWith('[['))
		if (segments.length > 1) return navigation.href({ place: tab as PlaceId })
		return tab === shell.tabs.more.id || bar.tabs.some((item) => item.id === tab) ? undefined : resolve('/more')
	})
	function goBack(): boolean {
		if (depth > 0) history.back()
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved where `parent` is derived
		else if (parent) void goto(parent)
		else return false
		return true
	}
	const onback = $derived(parent ? () => void goBack() : undefined)

	// Another tab comes back where it was left; the current one goes to its root, and at its root to the top.
	function onselect(id: string) {
		tap()
		const left = id === current ? undefined : tabPlace(id)
		const root = manifestFor(id)?.routes.href ?? navigation.href({ place: id as PlaceId })
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- a pathname the router itself was at
		if (left) void goto(left)
		else if (id !== current || page.url.pathname !== root) openOf(id)?.()
		else window.scrollTo(0, 0)
	}

	// Offline: a banner under the top bar while the forecast is a mirror from an earlier fetch (shell.md, "Global
	// states"); Sky's times are the place's (D-58).
	const offline = $derived(
		weather.offline && weather.lastGood
			? $t('domains.weather.offline.banner', {
					values: {
						time: formatTime(weather.lastGood, {
							lang: $locale ?? 'en',
							clock: settings.clock,
							timeZone: weather.timeZone,
						}),
					},
				})
			: undefined
	)

	// The floating + (Quick Log, with Capture as its launch tab, D-145). Sheets need no care: they are modal and it
	// is inert under their scrim. It stands down while a text control of the page has focus, since the keyboard
	// would lift it over the field, and while a view asks (`chrome.suppressFab()`).
	let typing = $state(false)
	const NOT_TEXT = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']
	function takesText(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement) || target.closest('dialog')) return false
		if (target instanceof HTMLInputElement) return !NOT_TEXT.includes(target.type)
		return target instanceof HTMLTextAreaElement || target.isContentEditable
	}
	const fabHidden = $derived(typing || chrome.fabSuppressed)
	function openQuickLog() {
		tap()
		quickLogUi.show()
	}

	// Each tab's scroll position is kept as it is left and put back when it is returned to, over the router's own
	// scroll to the top; the path each bar tab was last at is kept for the session, and the place itself is
	// remembered for the next launch (`@eden/shared/navigation`).
	beforeNavigate((navigation) => {
		if (navigation.to) rememberScroll(tabOf(navigation.from?.route), window.scrollY)
	})
	afterNavigate(async (navigation) => {
		if (navigation.type === 'link' || navigation.type === 'goto') depth += 1
		else if (navigation.type === 'popstate') depth = Math.max(0, depth + (navigation.delta ?? -1))
		if (navigation.to) {
			rememberPlace(navigation.to.url.pathname)
			rememberTabPlace(barTabOf(navigation.to.route), navigation.to.url.pathname)
		}
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
		// Sky's tab glyph and the offline banner read the forecast for as long as the shell is up, which is what
		// keeps it fresh while the app is in front (the refresh coordinator; D-73).
		const releaseSky = coordinator.watch(FORECAST_RESOURCE)
		// Android's back: what is on top closes first, then a pushed view, then the way back, then the app
		const stopBack = startBackHandler(goBack)
		return () => {
			stopBack()
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
<svelte:document
	onfocusin={(event) => (typing = takesText(event.target))}
	onfocusout={(event) => (typing = takesText(event.relatedTarget))}
/>

<SplashScreen show={$splashVisible} version={env.PUBLIC_APP_VERSION ?? ''} />

<UiKitProvider strings={uiKitStrings($locale)}>
	<div class={['shell', $splashVisible && 'shell-waiting']}>
		<TopBar {onback} />
		{#if offline}
			<div class="notice"><Banner tone="warning" placement="inline" message={offline} /></div>
		{/if}
		<main class="content">
			{@render children()}
		</main>
		<BottomTabBar class="tabs" items={tabs} {current} {onselect} />
		{#if !fabHidden}
			<!-- the dock is what is pinned: the kit's button keeps its own position, which its ring and count lean on -->
			<div class="fab">
				<IconButton fab icon="plus" label={$t('quickLog.title')} aria-haspopup="dialog" onclick={openQuickLog} />
			</div>
		{/if}
	</div>
	<ToastHost />
	<GardenerSheet />
	<SettingsSheet />
	<QuickLogHost />
	<InboxSheet />
	<!-- a fresh sheet each time it opens, as on desktop: its search and its pin start from the current home -->
	{#key homeUi.opened}
		{#if homeUi.opened}<ChangeHomeSheet {map} touch />{/if}
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
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		background: var(--surface-0);
		/* where the page begins: what a page pins of its own sits this far down, under the top bar */
		--shell-top: calc(var(--ed-safe-top) + var(--ed-control));
		transition: opacity var(--ed-duration-settle) var(--ed-ease-out);
	}
	/* Under the splash the shell is laid out but neither seen nor reachable */
	.shell-waiting {
		opacity: 0;
		pointer-events: none;
	}
	.notice {
		display: flex;
		padding: 0 calc(var(--ed-safe-right) + var(--ed-gutter)) var(--space-2) calc(var(--ed-safe-left) + var(--ed-gutter));
	}
	.content {
		display: flex;
		flex: 1;
		flex-direction: column;
		box-sizing: border-box;
		/* Every page insets itself by the gutter, as on desktop, so this pads only what the device takes: the safe
		   areas at the sides, and the tab bar below with a gutter of room over it. The top bar is above it */
		padding: 0 var(--ed-safe-right) calc(var(--ed-tab-bar) + var(--ed-safe-bottom) + var(--ed-gutter))
			var(--ed-safe-left);
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
	/* over the page at the tab bar's corner and under a toast, whose Undo must stay reachable */
	.fab {
		display: flex;
		position: fixed;
		right: calc(var(--ed-safe-right) + var(--space-4));
		bottom: calc(var(--ed-tab-bar) + var(--ed-safe-bottom) + var(--space-4));
		z-index: var(--ed-z-status);
	}
</style>
