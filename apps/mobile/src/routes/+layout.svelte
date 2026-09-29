<script lang="ts">
	// The mobile shell (product/substrate/shell.md, Mobile): the page, the bottom tab bar pinned to the viewport
	// (Garden, Today, Hearth, Sky, More), and the overlays (toast, the settings sheet, crash). It mounts the shared
	// pieces once: settings, i18n, the global error handler. No updater: mobile updates through the stores.
	import '../app.css'
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import { BottomTabBar, ToastHost, UiKitProvider, domainGlyph, type BottomTab } from '@eden/ui-kit'
	import { initializeI18n, locale, t, uiKitStrings } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import CrashScreen from '$lib/components/CrashScreen.svelte'
	import { useGlobalErrorHandler } from '$lib/hooks/useGlobalErrorHandler'
	import SettingsSheet from '$lib/settings/SettingsSheet.svelte'

	let { children } = $props()

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
		{ id: 'weather', label: $t('domains.weather.name'), icon: domainGlyph('weather') },
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
		initializeI18n(settings.language)
		return () => {
			cleanupErrors()
			settings.dispose()
		}
	})
</script>

<UiKitProvider strings={uiKitStrings($locale)}>
	<main class="content">
		{@render children()}
	</main>
	<BottomTabBar class="tabs" items={tabs} {current} {onselect} />
	<ToastHost />
	<SettingsSheet />
	<CrashScreen />
</UiKitProvider>

<style>
	.content {
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
