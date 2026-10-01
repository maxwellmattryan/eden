<script lang="ts">
	// The settings modal (product/substrate/settings-utilities.md): a centred kit Sheet with a tab rail on the left
	// and the tab's panel on the right. The rail is one tab stop (arrows, Home and End) and deep-linkable by tab id
	// through `settingsUi.show(tab)`. Seven tabs are real; the other four say they are not built yet. Focus lands on
	// the sheet, not the rail, so no tab wears a ring until Tab is pressed. The frame follows the measured height of
	// the content over the panel duration, so a taller tab grows the sheet instead of snapping it.
	import { Icon, Sheet } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { settingsTabIcons, settingsTabs, settingsUi, type SettingsTabId } from './settings-ui.svelte'
	import AboutTab from './tabs/AboutTab.svelte'
	import AppearanceTab from './tabs/AppearanceTab.svelte'
	import GardenerTab from './tabs/GardenerTab.svelte'
	import GeneralTab from './tabs/GeneralTab.svelte'
	import IntegrationsTab from './tabs/IntegrationsTab.svelte'
	import PlaceholderTab from './tabs/PlaceholderTab.svelte'
	import PrivacyTab from './tabs/PrivacyTab.svelte'
	import SyncTab from './tabs/SyncTab.svelte'

	const uid = $props.id()
	const titleId = `${uid}-title`
	let rail = $state<HTMLElement>()
	// 0 while the sheet is closed (the dialog is not rendered), which leaves the frame at its natural height
	let height = $state(0)

	function move(from: SettingsTabId, delta: number) {
		const index = settingsTabs.indexOf(from)
		const next = settingsTabs[(index + delta + settingsTabs.length) % settingsTabs.length] ?? from
		settingsUi.tab = next
		rail?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus()
	}

	function onkeydown(e: KeyboardEvent, tab: SettingsTabId) {
		if (e.key === 'ArrowDown') move(tab, 1)
		else if (e.key === 'ArrowUp') move(tab, -1)
		else if (e.key === 'Home') move(tab, -settingsTabs.indexOf(tab))
		else if (e.key === 'End') move(tab, settingsTabs.length - 1 - settingsTabs.indexOf(tab))
		else return
		e.preventDefault()
	}
</script>

<Sheet bind:open={settingsUi.open} placement="center" size="lg" labelledby={titleId} initialFocus="container">
	{#snippet header()}
		<h2 id={titleId} class="title">{$t('settings.title')}</h2>
	{/snippet}
	<div class="frame" style:height={height ? `${height}px` : undefined}>
		<div class="settings" bind:offsetHeight={height}>
			<nav class="rail" aria-label={$t('settings.title')} bind:this={rail}>
				{#each settingsTabs as tab (tab)}
					<button
						type="button"
						class="rail-item"
						data-tab={tab}
						aria-current={settingsUi.tab === tab ? 'page' : undefined}
						tabindex={settingsUi.tab === tab ? 0 : -1}
						onclick={() => (settingsUi.tab = tab)}
						onkeydown={(e) => onkeydown(e, tab)}
					>
						<Icon name={settingsTabIcons[tab]} size="sm" />
						<span>{$t(`settings.tabs.${tab}`)}</span>
					</button>
				{/each}
			</nav>
			<section class="panel" aria-labelledby="{uid}-{settingsUi.tab}">
				<h3 id="{uid}-{settingsUi.tab}" class="panel-title">{$t(`settings.tabs.${settingsUi.tab}`)}</h3>
				{#if settingsUi.tab === 'general'}
					<GeneralTab />
				{:else if settingsUi.tab === 'appearance'}
					<AppearanceTab />
				{:else if settingsUi.tab === 'gardener'}
					<GardenerTab />
				{:else if settingsUi.tab === 'privacy'}
					<PrivacyTab />
				{:else if settingsUi.tab === 'integrations'}
					<IntegrationsTab />
				{:else if settingsUi.tab === 'sync'}
					<SyncTab />
				{:else if settingsUi.tab === 'about'}
					<AboutTab />
				{:else}
					<PlaceholderTab tab={settingsUi.tab} />
				{/if}
			</section>
		</div>
	</div>
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title-lg);
		color: var(--text-primary);
	}
	/* Clipping the frame would cut the focus rings at its edge, so it takes the ring's reach as padding and gives it
	   back as margin, as the sheet's own body does. */
	.frame {
		--ring-room: calc(var(--focus-ring-offset) + var(--focus-ring-width));
		box-sizing: content-box;
		/* clip, not hidden: hidden would make the frame a scroll container and unstick the rail from the body */
		overflow: clip;
		padding: var(--ring-room);
		margin: calc(-1 * var(--ring-room));
		transition: height var(--ed-duration-panel) var(--ed-ease-out);
	}
	@media (prefers-reduced-motion: reduce) {
		.frame {
			transition: none;
		}
	}
	.settings {
		display: grid;
		grid-template-columns: 200px 1fr;
		gap: 24px;
		min-height: 420px;
	}
	/* The rail stays put while a tall tab scrolls under it: sticky to the sheet's body, the nearest scroll container. */
	.rail {
		position: sticky;
		top: 0;
		align-self: start;
		display: grid;
		align-content: start;
		gap: 2px;
		border-right: 1px solid var(--stroke-subtle);
		padding-right: 12px;
	}
	.rail-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		text-align: left;
		border: 0;
		border-radius: var(--ed-radius-control);
		background: transparent;
		padding: 0 12px;
		height: var(--ed-control);
		font: var(--ed-t-body);
		color: var(--text-secondary);
		cursor: pointer;
	}
	.rail-item:hover {
		background: color-mix(in srgb, var(--text-primary) 6%, transparent);
		color: var(--text-primary);
	}
	.rail-item[aria-current='page'] {
		background: var(--brand-muted);
		color: var(--text-primary);
	}
	.rail-item:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.panel {
		display: grid;
		align-content: start;
		gap: 20px;
		min-width: 0;
	}
	.panel-title {
		margin: 0;
		font: var(--ed-t-title);
		color: var(--text-primary);
	}
</style>
