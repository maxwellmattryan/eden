<script lang="ts">
	// About: the app mark and the wordmark, version and channel from the Rust side, the data directory, and a manual
	// update check whose result arrives as a toast (product/substrate/settings-utilities.md). The check is the app's to
	// give: the phone updates through its store and passes none, so the tab says that in a line instead.
	import { AppMark, Button, Wordmark, toast } from '@eden/ui-kit'
	import { getAppInfo, isTauri } from '../../../api/index.js'
	import { t } from '../../../i18n/index.js'
	import type { AppInfo } from '../../../types/index.js'
	import { onMount } from 'svelte'
	import { get } from 'svelte/store'

	type Props = {
		/** Asks for a pending update and answers it, or null when this build is current. Absent where a store updates the app. */
		check?: () => Promise<{ version: string } | null>
	}
	let { check }: Props = $props()

	let info = $state<AppInfo | null>(null)
	let checking = $state(false)

	onMount(() => {
		getAppInfo().then((value) => (info = value))
	})

	async function run() {
		if (!check) return
		const tr = get(t)
		if (!isTauri()) {
			toast({ message: tr('settings.about.updatesNotAvailable') })
			return
		}
		checking = true
		try {
			const update = await check()
			toast({
				message: update
					? tr('settings.about.updateAvailable', { values: { version: update.version } })
					: tr('settings.about.upToDate', { values: { name: tr('app.name') } }),
			})
		} catch {
			toast({ message: tr('settings.about.updateFailed'), error: true })
		} finally {
			checking = false
		}
	}
</script>

<div class="about">
	<div class="about-brand">
		<AppMark class="about-mark" />
		<Wordmark name={$t('app.name')} />
	</div>
	<dl class="about-facts">
		<dt>{$t('settings.about.version')}</dt>
		<dd>{info?.version ?? '…'}</dd>
		<dt>{$t('settings.about.channel')}</dt>
		<dd>{info?.environment ?? '…'}</dd>
		<dt>{$t('settings.about.dataDir')}</dt>
		<dd>{info?.dataDir || $t('settings.about.notInApp')}</dd>
	</dl>
	{#if check}
		<div>
			<Button
				label={checking ? $t('settings.about.checking') : $t('settings.about.checkForUpdates')}
				icon="refresh-cw"
				disabled={checking}
				onclick={run}
			/>
		</div>
	{:else}
		<p class="about-line">{$t('settings.about.storeUpdates')}</p>
	{/if}
</div>

<style>
	.about {
		display: grid;
		gap: 20px;
		justify-items: start;
	}
	.about-brand {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.about-brand :global(.about-mark) {
		width: 64px;
		height: 64px;
	}
	.about-facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 6px 20px;
		margin: 0;
	}
	.about-line {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.about-facts dt {
		font: var(--ed-t-label);
		color: var(--text-secondary);
	}
	.about-facts dd {
		margin: 0;
		font: var(--ed-t-data);
		color: var(--text-primary);
		word-break: break-all;
	}
</style>
