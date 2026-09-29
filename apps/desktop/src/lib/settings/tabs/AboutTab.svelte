<script lang="ts">
	// About: the wordmark, version and channel from the Rust side, the data directory, and a manual update check
	// whose result arrives as a toast (product/substrate/settings-utilities.md).
	import { Button, Wordmark, toast } from '@eden/ui-kit'
	import { getAppInfo, isTauri } from '@eden/shared/api'
	import { checkForUpdate } from '@eden/shared/api/updater'
	import { t } from '@eden/shared/i18n'
	import type { AppInfo } from '@eden/shared/types'
	import { onMount } from 'svelte'
	import { get } from 'svelte/store'

	let info = $state<AppInfo | null>(null)
	let checking = $state(false)

	onMount(() => {
		getAppInfo().then((value) => (info = value))
	})

	async function check() {
		const tr = get(t)
		if (!isTauri()) {
			toast({ message: tr('settings.about.updatesNotAvailable') })
			return
		}
		checking = true
		try {
			const update = await checkForUpdate()
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
	<Wordmark name={$t('app.name').toLowerCase()} />
	<dl class="about-facts">
		<dt>{$t('settings.about.version')}</dt>
		<dd>{info?.version ?? '…'}</dd>
		<dt>{$t('settings.about.channel')}</dt>
		<dd>{info?.environment ?? '…'}</dd>
		<dt>{$t('settings.about.dataDir')}</dt>
		<dd>{info?.dataDir || $t('settings.about.notInApp')}</dd>
	</dl>
	<div>
		<Button
			label={checking ? $t('settings.about.checking') : $t('settings.about.checkForUpdates')}
			icon="refresh-cw"
			disabled={checking}
			onclick={check}
		/>
	</div>
</div>

<style>
	.about {
		display: grid;
		gap: 20px;
		justify-items: start;
	}
	.about-facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 6px 20px;
		margin: 0;
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
