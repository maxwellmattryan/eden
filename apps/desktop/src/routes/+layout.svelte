<script lang="ts">
	// The desktop shell (product/substrate/shell.md): the sidebar on the left, the content with its back affordance,
	// the status bar along the bottom, and the overlays (toast, settings, crash) on top. It mounts the shared pieces
	// once: settings, i18n, the global error handler, the hourly update check.
	import '../app.css'
	import { onMount } from 'svelte'
	import { afterNavigate, goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import {
		BackButton,
		Sidebar,
		StatusBar,
		ToastHost,
		UiKitProvider,
		domainGlyph,
		type SidebarEntry,
	} from '@eden/ui-kit'
	import { checkForUpdate } from '@eden/shared/api/updater'
	import { initializeI18n, locale, t, uiKitStrings } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import CrashScreen from '$lib/components/CrashScreen.svelte'
	import { manifests } from '$lib/domains'
	import { weather } from '$lib/domains/weather/store.svelte'
	import { formatTime } from '$lib/domains/dates'
	import { useGlobalErrorHandler } from '$lib/hooks/useGlobalErrorHandler'
	import SettingsSheet from '$lib/settings/SettingsSheet.svelte'
	import { settingsUi } from '$lib/settings/settings-ui.svelte'

	let { children } = $props()

	const UPDATE_INTERVAL = 60 * 60 * 1000

	// Today, Garden, then the enabled domains from their manifests, each its own group under a rule (D-55); the owner's
	// order arrives with the Domains tab.
	const hrefs = {
		today: resolve('/today'),
		garden: resolve('/garden'),
	} as const

	const groups = $derived<SidebarEntry[][]>([
		[
			{
				id: 'today',
				name: $t('shell.today'),
				subtitle: $t('shell.todaySubtitle'),
				icon: domainGlyph('today'),
				shortcut: '⌘1',
				href: hrefs.today,
			},
		],
		[
			{
				id: 'garden',
				name: $t('shell.garden'),
				subtitle: $t('shell.gardenSubtitle'),
				icon: domainGlyph('garden'),
				shortcut: '⌘2',
				href: hrefs.garden,
			},
		],
		manifests.map((manifest, index) => ({
			id: manifest.id,
			name: $t(manifest.name),
			subtitle: $t(manifest.subtitle),
			icon: manifest.glyph,
			shortcut: `⌘${index + 3}`,
			href: manifest.routes.href,
		})),
	])
	const items = $derived(groups.flat())
	const pinned = $derived<SidebarEntry[]>([
		{
			id: 'gardener',
			name: $t('shell.gardener'),
			subtitle: $t('shell.gardenerSubtitle'),
			icon: domainGlyph('gardener'),
		},
		{
			id: 'settings',
			name: $t('shell.settings'),
			subtitle: $t('shell.settingsSubtitle'),
			icon: domainGlyph('settings'),
		},
	])
	const current = $derived(page.route.id?.split('/')[1] || 'garden')

	// Offline: the banner takes the sync line's place while the forecast is a mirror from an earlier fetch
	// (product/substrate/shell.md, "Global states").
	const banner = $derived(
		weather.offline && weather.lastGood
			? {
					message: $t('domains.weather.offline.banner', {
						values: { time: formatTime(weather.lastGood, $locale ?? 'en') },
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
			document.getElementById('splash')?.remove()
			checkForUpdate().catch(() => null)
			timer = setInterval(() => checkForUpdate().catch(() => null), UPDATE_INTERVAL)
		})()
		return () => {
			cleanupErrors()
			settings.dispose()
			if (timer) clearInterval(timer)
		}
	})
</script>

<svelte:window {onkeydown} />

<UiKitProvider strings={uiKitStrings($locale)}>
	<div class="shell">
		<Sidebar
			{groups}
			{pinned}
			brand={$t('app.name').toLowerCase()}
			subtitles={settings.subtitles}
			{current}
			{onselect}
		/>
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
	}
	.content {
		grid-row: 1;
		grid-column: 2;
		overflow: auto;
		padding: var(--ed-gutter);
	}
	.content-back {
		min-height: var(--ed-control);
	}
	:global(.bar) {
		grid-row: 2;
		grid-column: 1 / -1;
	}
</style>
