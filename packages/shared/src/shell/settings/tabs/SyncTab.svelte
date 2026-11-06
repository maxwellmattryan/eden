<script lang="ts">
	// Sync and data (product/substrate/settings-utilities.md, product/substrate/data.md): the export of the workspace
	// or of one domain, and the import of an archive by merge or by replace. An archive is read and checked before
	// the owner chooses how to import it; a replace asks first, and writes a backup before it clears anything. Sync,
	// devices, the backup schedule, the Vault and the wipe arrive with their substrate. Where an archive goes and where
	// one comes from is the app's (`files`, archive-files.ts): desktop's dialogs answer paths; the phone writes to
	// Eden's own folder and hands the file on, and copies a picked file in before it is read (D-161). An export may be
	// sealed under a passphrase (the export sheet), a sealed archive asks for its passphrase before it is read, and a
	// replace may seal its backup (docs/engineering/data-layer.md, "Sealed bundle"). A passphrase lives in this
	// component's state only, until the import ends or another archive is chosen.
	import { tick } from 'svelte'
	import { Button, ConfirmSheet, Field, FileButton, InlineError, Notice, Segmented, Select, toast } from '@eden/ui-kit'
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
	import BundleProtection from '../BundleProtection.svelte'
	import ExportSheet from '../ExportSheet.svelte'
	import SettingsRow from '../SettingsRow.svelte'

	type Props = {
		/** How this app gives the crate a path to write and a path to read. */
		files: ArchiveFiles
	}
	let { files }: Props = $props()

	// `.eden` is a sealed archive; a picker may only know it as bytes
	const ACCEPT = ['.zip', 'application/zip', '.eden', 'application/octet-stream']
	const MODES: readonly ImportMode[] = ['merge', 'replace']
	const ERRORS: Partial<Record<string, string>> = {
		'bundle:unreadable': 'unreadable',
		'bundle:version': 'version',
		'bundle:hash-mismatch': 'hash',
		'bundle:backup': 'backup',
		'bundle:passphrase': 'passphrase',
		'bundle:passphrase-short': 'passphraseShort',
	}

	const uid = $props.id()
	const inApp = isTauri()
	// the domains that own rows: each says so by declaring what it adds to its bundle
	const exportable = logic.filter((entry) => entry.extras)

	let busy = $state<'export' | 'read' | 'import'>()
	let domain = $state(0)
	/** The scope the export sheet is open for. */
	let exporting = $state<BundleScope>({ kind: 'full' })
	let sheetOpen = $state(false)
	/**
	 * The chosen archive. A sealed one has no manifest until its passphrase opens it; the passphrase that did is kept
	 * here for the import, and nowhere else.
	 */
	let archive = $state<{ path: string; staged: boolean; manifest?: BundleManifest; passphrase?: string }>()
	let unlockWith = $state('')
	/** The Replace backup's passphrase, and whether Replace may go ahead (off, or on with a valid passphrase). */
	let backupPassphrase = $state<string>()
	let backupReady = $state(true)
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

	const exportTitle = $derived(
		exporting.kind === 'full'
			? $t('settings.sync.exportSheet.titleFull')
			: $t('settings.sync.exportSheet.titleDomain', { values: { domain: domainName(exporting.domain) } })
	)

	function askExport(scope: BundleScope) {
		exporting = scope
		sheetOpen = true
	}

	async function exportScope(scope: BundleScope, passphrase?: string) {
		failure = undefined
		kept = undefined
		// with no target the crate writes to its own `exports/`, under a name of its own
		const path = files.target ? await files.target(archiveName(scope, undefined, !!passphrase)) : undefined
		if (files.target && !path) return
		busy = 'export'
		try {
			const owner = scope.kind === 'domain' ? logic.find((entry) => entry.id === scope.domain) : undefined
			const result = await exportBundle({
				scope,
				path: path ?? undefined,
				settings: scope.kind === 'full' ? settings.snapshot() : undefined,
				extras: await owner?.extras?.(),
				passphrase,
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
		unlockWith = ''
		setMode('merge')
		try {
			if (picked && files.stage) path = await files.stage(picked)
			if (typeof path !== 'string') return
			if (archive?.staged && archive.path !== path) drop(archive.path)
			archive = undefined
			try {
				archive = { path, staged, manifest: await inspectBundle(path) }
			} catch (error) {
				// a sealed archive is not a failure: it is the cue to ask for its passphrase
				if (dataErrorCode(error) !== 'bundle:locked') throw error
				archive = { path, staged }
			}
		} catch (error) {
			if (staged && typeof path === 'string') drop(path)
			archive = undefined
			fail(error, 'unreadable')
		} finally {
			busy = undefined
		}
	}

	/** Opens a sealed archive with the passphrase typed for it; a wrong one keeps the field and its value. */
	async function unlock() {
		const locked = archive
		if (!locked || locked.manifest || !unlockWith || busy) return
		failure = undefined
		busy = 'read'
		let refused = false
		try {
			const passphrase = unlockWith
			const manifest = await inspectBundle(locked.path, passphrase)
			archive = { ...locked, manifest, passphrase }
			unlockWith = ''
		} catch (error) {
			refused = true
			fail(error, 'unreadable')
		} finally {
			busy = undefined
		}
		if (refused) {
			await tick()
			document.getElementById(`${uid}-unlock`)?.focus()
		}
	}

	/** Leaving Replace takes the backup's protection away, and what was typed in it. */
	function setMode(next: ImportMode) {
		if (next !== mode) {
			backupPassphrase = undefined
			backupReady = true
		}
		mode = next
	}

	async function run() {
		if (!archive) return
		failure = undefined
		busy = 'import'
		try {
			const result = await importBundle(archive.path, mode, {
				passphrase: archive.passphrase,
				backupPassphrase: mode === 'replace' ? backupPassphrase : undefined,
			})
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
			setMode('merge')
		} catch (error) {
			fail(error, 'import')
		} finally {
			busy = undefined
		}
	}

	const replaceTitle = $derived.by(() => {
		const scope = archive?.manifest?.scope
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
			onclick={() => askExport({ kind: 'full' })}
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
				onclick={() => askExport({ kind: 'domain', domain: exportable[domain]?.id ?? '' })}
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

	{#if archive && !archive.manifest}
		<div class="archive">
			<div class="unlock">
				<div class="unlock-field">
					<Field
						id="{uid}-unlock"
						type="password"
						autocomplete="current-password"
						label={$t('settings.sync.unlock.field')}
						bind:value={unlockWith}
						onkeydown={(event) => {
							if (event.key !== 'Enter') return
							event.preventDefault()
							void unlock()
						}}
					/>
				</div>
				<Button
					variant="primary"
					size="auto"
					label={busy === 'read' ? $t('settings.sync.unlock.unlocking') : $t('settings.sync.unlock.action')}
					disabled={!!busy || !unlockWith}
					onclick={unlock}
				/>
			</div>
		</div>
	{:else if archive?.manifest}
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
					onchange={(index) => setMode(MODES[index] ?? 'merge')}
				/>
				<Button
					variant={mode === 'replace' ? 'danger' : 'primary'}
					label={busy === 'import' ? $t('settings.sync.importing') : $t(`settings.sync.modes.${mode}`)}
					disabled={!!busy || (mode === 'replace' && !backupReady)}
					onclick={() => (mode === 'replace' ? (confirming = true) : run())}
				/>
			</SettingsRow>
			{#if mode === 'replace'}
				<BundleProtection
					label={$t('settings.sync.protect.backupLabel')}
					warning={$t('settings.sync.protect.backupWarning')}
					bind:passphrase={backupPassphrase}
					bind:ready={backupReady}
				/>
			{/if}
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
		resource={archive?.manifest ? scopeName(archive.manifest.scope) : ''}
		verb={$t('settings.sync.modes.replace')}
		danger
		onconfirm={run}
	/>

	<ExportSheet
		bind:open={sheetOpen}
		title={exportTitle}
		onexport={(passphrase) => void exportScope(exporting, passphrase)}
	/>
{/if}

<style>
	.archive {
		display: grid;
		gap: var(--space-4);
	}
	.unlock {
		display: flex;
		align-items: end;
		gap: var(--space-3);
	}
	.unlock-field {
		flex: 1;
		min-width: 0;
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
		.unlock {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
