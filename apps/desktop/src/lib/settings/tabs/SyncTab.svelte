<script lang="ts">
	// Sync and data (product/substrate/settings-utilities.md, product/substrate/data.md): the export of the workspace
	// or of one domain, and the import of an archive by merge or by replace. An archive is read and checked before
	// the owner chooses how to import it; a replace asks first, and writes a backup before it clears anything. Sync,
	// devices, the backup schedule, the Vault and the wipe arrive with their substrate.
	import { open, save } from '@tauri-apps/plugin-dialog'
	import { Button, ConfirmSheet, InlineError, Notice, Segmented, toast } from '@eden/ui-kit'
	import { isTauri, logError } from '@eden/shared/api'
	import {
		dataErrorCode,
		exportBundle,
		importBundle,
		inspectBundle,
		totalRows,
		type BundleManifest,
		type BundleScope,
		type ImportMode,
		type ImportSummary,
	} from '@eden/shared/data'
	import { formatDate } from '@eden/shared/dates'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { manifests } from '$lib/domains'
	import { grants } from '$lib/shell/grants.svelte'
	import { profile } from '$lib/shell/profile/store.svelte'
	import { tasks } from '$lib/shell/today/store.svelte'
	import SettingsRow from './SettingsRow.svelte'

	const ARCHIVE = [{ name: 'Eden', extensions: ['zip'] }]
	const MODES: readonly ImportMode[] = ['merge', 'replace']
	const ERRORS: Partial<Record<string, string>> = {
		'bundle:unreadable': 'unreadable',
		'bundle:version': 'version',
		'bundle:hash-mismatch': 'hash',
		'bundle:backup': 'backup',
	}

	const inApp = isTauri()
	// the domains that own rows: each says so by declaring what it adds to its bundle
	const exportable = manifests.filter((manifest) => manifest.extras)

	let busy = $state<'export' | 'read' | 'import'>()
	let domain = $state(0)
	let archive = $state<{ path: string; manifest: BundleManifest }>()
	let mode = $state<ImportMode>('merge')
	let confirming = $state(false)
	let summary = $state<ImportSummary>()
	let failure = $state<string>()

	const fileName = (path: string) => path.split(/[\\/]/).at(-1) ?? path
	const domainName = (id: string) => $t(manifests.find((manifest) => manifest.id === id)?.name ?? id)
	const scopeName = (scope: BundleScope) =>
		scope.kind === 'full'
			? $t('settings.sync.scope.full')
			: $t('settings.sync.scope.domain', { values: { domain: domainName(scope.domain) } })

	function fail(error: unknown, fallback: string) {
		const known = ERRORS[dataErrorCode(error) ?? '']
		failure = $t(`settings.sync.errors.${known ?? fallback}`)
		void logError('data', 'A bundle could not be written or read', String(error)).catch(() => null)
	}

	async function exportScope(scope: BundleScope) {
		failure = undefined
		const stamp = new Date().toISOString().slice(0, 10)
		const name = scope.kind === 'full' ? 'full' : scope.domain
		const path = await save({ defaultPath: `eden-${name}-${stamp}.zip`, filters: ARCHIVE })
		if (!path) return
		busy = 'export'
		try {
			const owner = scope.kind === 'domain' ? manifests.find((manifest) => manifest.id === scope.domain) : undefined
			const result = await exportBundle({
				scope,
				path,
				settings: scope.kind === 'full' ? settings.snapshot() : undefined,
				extras: await owner?.extras?.(),
			})
			toast({
				message: $t('settings.sync.exported', {
					values: { count: totalRows(result.counts), file: fileName(result.path) },
				}),
			})
		} catch (error) {
			fail(error, 'export')
		} finally {
			busy = undefined
		}
	}

	async function choose() {
		failure = undefined
		summary = undefined
		const path = await open({ multiple: false, directory: false, filters: ARCHIVE })
		if (typeof path !== 'string') return
		busy = 'read'
		try {
			archive = { path, manifest: await inspectBundle(path) }
			mode = 'merge'
		} catch (error) {
			archive = undefined
			fail(error, 'unreadable')
		} finally {
			busy = undefined
		}
	}

	async function run() {
		if (!archive) return
		failure = undefined
		busy = 'import'
		try {
			const result = await importBundle(archive.path, mode)
			// a replace from a whole workspace brings its settings; a merge leaves the ones here alone
			if (mode === 'replace' && result.scope.kind === 'full' && result.settings) {
				await settings.restore(result.settings)
			}
			await Promise.all([
				...manifests.map((manifest) => manifest.reload?.()),
				grants.reload(),
				profile.reload(),
				tasks.reload(),
			])
			summary = result
			archive = undefined
		} catch (error) {
			fail(error, 'import')
		} finally {
			busy = undefined
		}
	}

	const replaceTitle = $derived.by(() => {
		const scope = archive?.manifest.scope
		if (!scope || scope.kind === 'full') return $t('settings.sync.replaceConfirm.titleFull')
		return $t('settings.sync.replaceConfirm.titleDomain', { values: { domain: domainName(scope.domain) } })
	})
</script>

{#if !inApp}
	<Notice tone="info" title={$t('settings.sync.notAvailable')} />
{:else}
	<SettingsRow label={$t('settings.sync.exportAll')} help={$t('settings.sync.exportAllHelp')}>
		<Button
			label={busy === 'export' ? $t('settings.sync.exporting') : $t('settings.sync.exportAction')}
			disabled={!!busy}
			onclick={() => exportScope({ kind: 'full' })}
		/>
	</SettingsRow>

	{#if exportable.length}
		<SettingsRow label={$t('settings.sync.exportDomain')} help={$t('settings.sync.exportDomainHelp')}>
			<Segmented
				items={exportable.map((manifest) => $t(manifest.name))}
				selected={domain}
				label={$t('settings.sync.exportDomain')}
				onchange={(index) => (domain = index)}
			/>
			<Button
				variant="secondary"
				label={$t('settings.sync.exportAction')}
				disabled={!!busy}
				onclick={() => exportScope({ kind: 'domain', domain: exportable[domain]?.id ?? '' })}
			/>
		</SettingsRow>
	{/if}

	<SettingsRow label={$t('settings.sync.import')} help={$t('settings.sync.importHelp')}>
		<Button
			variant="secondary"
			label={busy === 'read' ? $t('settings.sync.reading') : $t('settings.sync.choose')}
			disabled={!!busy}
			onclick={choose}
		/>
	</SettingsRow>

	{#if archive}
		<div class="archive">
			<Notice
				tone="info"
				title={scopeName(archive.manifest.scope)}
				detail={$t('settings.sync.archive', {
					values: {
						file: fileName(archive.path),
						count: totalRows(archive.manifest.counts),
						date: formatDate(archive.manifest.createdAt, settings.language),
					},
				})}
			/>
			<SettingsRow label={$t('settings.sync.mode')} help={$t(`settings.sync.modeHelp.${mode}`)}>
				<Segmented
					items={MODES.map((entry) => $t(`settings.sync.modes.${entry}`))}
					selected={MODES.indexOf(mode)}
					label={$t('settings.sync.mode')}
					onchange={(index) => (mode = MODES[index] ?? 'merge')}
				/>
				<Button
					variant={mode === 'replace' ? 'danger' : 'primary'}
					label={busy === 'import' ? $t('settings.sync.importing') : $t(`settings.sync.modes.${mode}`)}
					disabled={!!busy}
					onclick={() => (mode === 'replace' ? (confirming = true) : run())}
				/>
			</SettingsRow>
		</div>
	{/if}

	{#if failure}
		<InlineError message={failure} live />
	{/if}

	{#if summary}
		<Notice
			tone="info"
			icon="circle-check"
			title={$t('settings.sync.imported', {
				values: { inserted: summary.inserted, updated: summary.updated, skipped: summary.skipped },
			})}
			detail={summary.backupPath
				? $t('settings.sync.backupSaved', { values: { file: fileName(summary.backupPath) } })
				: undefined}
			meta={summary.backupPath ?? undefined}
			ondismiss={() => {}}
			ondismissed={() => (summary = undefined)}
		/>
	{/if}

	<ConfirmSheet
		bind:open={confirming}
		title={replaceTitle}
		text={$t('settings.sync.replaceConfirm.text')}
		subject={$t('settings.sync.replaceConfirm.subject')}
		resource={archive ? scopeName(archive.manifest.scope) : ''}
		verb={$t('settings.sync.modes.replace')}
		danger
		onconfirm={run}
	/>
{/if}

<style>
	.archive {
		display: grid;
		gap: var(--space-4);
	}
</style>
