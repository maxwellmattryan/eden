<script lang="ts">
	// The mobile shell (product/substrate/shell.md, Mobile): the page, the bottom tab bar pinned to the viewport
	// (Garden, Today, the two pinned domains, More), composed from the manifests, and the overlays (toast, the
	// settings sheet, crash). It mounts the shared
	// pieces once: settings, i18n, the global error handler. No updater: mobile updates through the stores. The splash
	// covers it until they are ready, then fades out as the shell fades in.
	import '../app.css'
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import { env } from '$env/dynamic/public'
	import { BottomTabBar, ToastHost, UiKitProvider, domainGlyph, type BottomTab, type GlyphId } from '@eden/ui-kit'
	import { initializeI18n, locale, t, uiKitStrings } from '@eden/shared/i18n'
	import { shell, tabBar } from '@eden/shared/manifest'
	import { settings } from '@eden/shared/settings'
	import { weather } from '@eden/shared/weather'
	import { dismissSplash, splashVisible } from '@eden/shared/stores'
	import CrashScreen from '$lib/components/CrashScreen.svelte'
	import { declarations, manifestFor } from '$lib/domains'
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
	const current = $derived(page.route.id?.split('/')[1] || 'garden')

	function onselect(id: string) {
		openOf(id)?.()
	}

	onMount(() => {
		const cleanupErrors = useGlobalErrorHandler()
		settings.load()
		void initializeI18n(settings.language)
			.catch(() => null)
			.then(dismissSplash)
		void weather.load().catch(() => null)
		const skyTimer = setInterval(() => void weather.load().catch(() => null), WEATHER_INTERVAL)
		return () => {
			clearInterval(skyTimer)
			cleanupErrors()
			settings.dispose()
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
