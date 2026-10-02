<script lang="ts">
	// Sync and data (product/substrate/settings-utilities.md, product/substrate/data.md): the export of the workspace
	// or of one domain, and the import of an archive by merge or by replace. An archive is read and checked before
	// the owner chooses how to import it; a replace asks first, and writes a backup before it clears anything. Sync,
	// devices, the backup schedule, the Vault and the wipe arrive with their substrate. Where an archive goes and where
	// one comes from is the app's (`files`, archive-files.ts): desktop's dialogs answer paths; the phone writes to
	// Eden's own folder and hands the file on, and copies a picked file in before it is read (D-TBD(phone-archive)).
	import { Button, ConfirmSheet, FileButton, InlineError, Notice, Segmented, Select, toast } from '@eden/ui-kit'
	import { isTauri, logError } from '../../../api/index.js'
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
	} from '../../../data/index.js'
	import { formatDate } from '../../../dates/index.js'
	import { home } from '../../../home/index.js'
	import { t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { declarations, logic } from '../../../domains/index.js'
	import { grants } from '../../grants.svelte.js'
	import { profile } from '../../profile/index.js'
	import { tasks } from '../../today/index.js'
	import { archiveName, fileName, type ArchiveFiles } from '../archive-files.js'
	import SettingsRow from '../SettingsRow.svelte'

	type Props = {
		/** How this app gives the crate a path to write and a path to read. */
		files: ArchiveFiles
	}
	let { files }: Props = $props()

	const ACCEPT = ['.zip', 'application/zip']
	const MODES: readonly ImportMode[] = ['merge', 'replace']
	const ERRORS: Partial<Record<string, string>> = {
		'bundle:unreadable': 'unreadable',
		'bundle:version': 'version',
		'bundle:hash-mismatch': 'hash',
		'bundle:backup': 'backup',
	}

	const inApp = isTauri()
	// the domains that own rows: each says so by declaring what it adds to its bundle
	const exportable = logic.filter((entry) => entry.extras)

	let busy = $state<'export' | 'read' | 'import'>()
	let domain = $state(0)
	let archive = $state<{ path: string; manifest: BundleManifest; staged: boolean }>()
	/** An export the system would not take: it stays in Eden's own folder, and the page says where. */
	let kept = $state<{ count: number; path: string }>()
	let mode = $state<ImportMode>('merge')
	let confirming = $state(false)
	let summary = $state<ImportSummary>()
	let failure = $state<string>()

	const domainName = (id: string) => $t(declarations.find((declaration) => declaration.id === id)?.name ?? id)
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
		kept = undefined
		// with no target the crate writes to its own `exports/`, under a name of its own
		const path = files.target ? await files.target(archiveName(scope)) : undefined
		if (files.target && !path) return
		busy = 'export'
		try {
			const owner = scope.kind === 'domain' ? logic.find((entry) => entry.id === scope.domain) : undefined
			const result = await exportBundle({
				scope,
				path: path ?? undefined,
				settings: scope.kind === 'full' ? settings.snapshot() : undefined,
				extras: await owner?.extras?.(),
			})
			const count = totalRows(result.counts)
			const outcome = (await files.deliver?.(result.path, fileName(result.path))) ?? 'saved'
			if (outcome === 'kept') kept = { count, path: result.path }
			else toast({ message: $t('settings.sync.exported', { values: { count, file: fileName(result.path) } }) })
		} catch (error) {
			fail(error, 'export')
		} finally {
			busy = undefined
		}
	}

	/** A staged copy is Eden's to clear: once imported, refused, or passed over for another choice. */
	function drop(path: string | undefined) {
		if (path) void files.discard?.(path).catch(() => null)
	}

	/** Reads an archive before anything is imported; `picked` is the file itself where the app has no path to give. */
	async function choose(picked?: File) {
		failure = undefined
		summary = undefined
		const staged = !!picked && !!files.stage
		let path: string | null | undefined
		if (!staged) {
			path = await files.choose?.()
			if (typeof path !== 'string') return
		}
		busy = 'read'
		try {
			if (picked && files.stage) path = await files.stage(picked)
			if (typeof path !== 'string') return
			const manifest = await inspectBundle(path)
			if (archive?.staged && archive.path !== path) drop(archive.path)
			archive = { path, manifest, staged }
			mode = 'merge'
		} catch (error) {
			if (staged && typeof path === 'string') drop(path)
			if (archive?.staged && archive.path !== path) drop(archive.path)
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
			// the home first: Sky and Meadow read theirs from it
			await home.reload()
			await Promise.all([...logic.map((entry) => entry.reload?.()), grants.reload(), profile.reload(), tasks.reload()])
			summary = result
			if (archive.staged) drop(archive.path)
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
			<!-- every domain's name in a row is wider than a phone: there the same choice is a select -->
			<div class="wide">
				<Segmented
					items={exportable.map((entry) => domainName(entry.id))}
					selected={domain}
					label={$t('settings.sync.exportDomain')}
					onchange={(index) => (domain = index)}
				/>
			</div>
			<div class="narrow">
				<Select
					aria-label={$t('settings.sync.exportDomain')}
					options={exportable.map((entry) => ({ value: entry.id, label: domainName(entry.id) }))}
					value={exportable[domain]?.id}
					onchange={(id) =>
						(domain = Math.max(
							0,
							exportable.findIndex((entry) => entry.id === id)
						))}
				/>
			</div>
			<Button
				variant="secondary"
				label={$t('settings.sync.exportAction')}
				disabled={!!busy}
				onclick={() => exportScope({ kind: 'domain', domain: exportable[domain]?.id ?? '' })}
			/>
		</SettingsRow>
	{/if}

	<SettingsRow label={$t('settings.sync.import')} help={$t('settings.sync.importHelp')}>
		{#if files.choose}
			<Button
				variant="secondary"
				label={busy === 'read' ? $t('settings.sync.reading') : $t('settings.sync.choose')}
				disabled={!!busy}
				onclick={() => choose()}
			/>
		{:else}
			<FileButton
				icon="file"
				label={busy === 'read' ? $t('settings.sync.reading') : $t('settings.sync.choose')}
				accept={ACCEPT}
				multiple={false}
				disabled={!!busy}
				onfiles={(picked) => void choose(picked[0])}
			/>
		{/if}
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

	{#if kept}
		<Notice
			tone="info"
			title={$t('settings.sync.kept', { values: { count: kept.count, file: fileName(kept.path) } })}
			meta={kept.path}
			ondismiss={() => {}}
			ondismissed={() => (kept = undefined)}
		/>
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
	.narrow {
		display: none;
	}
	/* narrow page */
	@container page (max-width: 48rem) {
		.wide {
			display: none;
		}
		.narrow {
			display: block;
		}
	}
</style>
