<script lang="ts">
	// The mobile shell (product/substrate/shell.md, Mobile): the page, the bottom tab bar pinned to the viewport
	// (Garden, Today, Hearth, Sky, More), and the overlays (toast, the settings sheet, crash). It mounts the shared
	// pieces once: settings, i18n, the global error handler. No updater: mobile updates through the stores. The splash
	// covers it until they are ready, then fades out as the shell fades in.
	import '../app.css'
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import { env } from '$env/dynamic/public'
	import { BottomTabBar, ToastHost, UiKitProvider, domainGlyph, iconFor, type BottomTab } from '@eden/ui-kit'
	import { initializeI18n, locale, t, uiKitStrings } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { weather } from '@eden/shared/weather'
	import { dismissSplash, splashVisible } from '@eden/shared/stores'
	import CrashScreen from '$lib/components/CrashScreen.svelte'
	import SplashScreen from '$lib/components/SplashScreen.svelte'
	import { useGlobalErrorHandler } from '$lib/hooks/useGlobalErrorHandler'
	import SettingsSheet from '$lib/settings/SettingsSheet.svelte'

	let { children } = $props()

	/** How often the shell asks the weather store whether its forecast is stale, so the tab glyph keeps up. */
	const WEATHER_INTERVAL = 10 * 60 * 1000

	const hrefs = {
		garden: resolve('/garden'),
		today: resolve('/today'),
		kitchen: resolve('/kitchen'),
		weather: resolve('/weather'),
		more: resolve('/more'),
	} as const
	type TabId = keyof typeof hrefs

	const tabs = $derived<BottomTab[]>([
		{ id: 'garden', label: $t('shell.garden'), icon: domainGlyph('garden') },
		{ id: 'today', label: $t('shell.today'), icon: domainGlyph('today') },
		{ id: 'kitchen', label: $t('domains.kitchen.name'), icon: domainGlyph('kitchen') },
		{
			id: 'weather',
			label: $t('domains.weather.name'),
			// Sky's glyph is live: it follows the current conditions (weather.md).
			icon: weather.now ? iconFor(weather.now.condition, weather.now.night) : domainGlyph('weather'),
		},
		{ id: 'more', label: $t('shell.more'), icon: 'menu' },
	])
	const current = $derived(page.route.id?.split('/')[1] || 'garden')

	function onselect(id: string) {
		const href = hrefs[id as TabId]
		if (href) goto(href)
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
