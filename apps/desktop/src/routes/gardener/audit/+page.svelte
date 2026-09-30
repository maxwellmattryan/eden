<script lang="ts">
	// The audit log (product/substrate/ai.md, "Audit log"; docs/design/screens.md, `audit-log`): one row per request,
	// this device's, ninety days, the outcome coloured. A row opens a popover with the request in a few rows (model,
	// grade, tokens, cost, outcome), what it read as the same ReadList the "can see" chip shows (the rows named as a
	// read opens), the tools it ran with their confirm and the grants that allowed it when there were any, and the
	// thread it belongs to. Linked from the Gardener tab, from every "can see" chip, and from the profile page.
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import {
		Button,
		DataTable,
		DetailPopover,
		DetailSection,
		EmptyState,
		InlineError,
		PageHeader,
		ReadList,
		domainGlyph,
		type DataTableCell,
		type DataTableColumn,
		type DetailRow,
		type IconName,
		type ReadItem,
	} from '@eden/ui-kit'
	import { formatMoment } from '@eden/shared/dates'
	import { formatCost, queryAudit, type AuditEntry, type AuditOutcome } from '@eden/shared/gardener'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { manifestFor } from '$lib/domains'
	import { labelRows, registryLabel, type RowLabel } from '$lib/shell/gardener/labels'
	import { gardenerUi } from '$lib/shell/gardener/panel-ui.svelte'
	import { threads } from '$lib/shell/gardener/threads.svelte'
	import { grants } from '$lib/shell/grants.svelte'

	let entries = $state<AuditEntry[]>([])
	let failed = $state(false)
	// the row opened, its anchor, and the labels of what it read as a read opens
	let open = $state(false)
	let detail = $state<{ entry: AuditEntry; anchor: HTMLElement } | undefined>()
	let labels = $state<Record<string, RowLabel[] | undefined>>({})

	const format = $derived({ lang: $locale ?? 'en', clock: settings.clock })
	/** `?fact=<id>` narrows the log to the requests that read that row. */
	const fact = $derived(page.url.searchParams.get('fact') ?? undefined)
	const shown = $derived(
		fact ? entries.filter((entry) => entry.reads.some((read) => read.rows.includes(fact))) : entries
	)

	const OUTCOME: Record<AuditOutcome, { icon: IconName; tone: DataTableCell['tone'] }> = {
		ok: { icon: 'check', tone: 'positive' },
		refusal: { icon: 'triangle-alert', tone: 'danger' },
		error: { icon: 'triangle-alert', tone: 'danger' },
		'max-tokens': { icon: 'clock', tone: 'warning' },
		interrupted: { icon: 'clock', tone: 'warning' },
		budget: { icon: 'lock', tone: 'warning' },
		cancelled: { icon: 'x', tone: 'neutral' },
		declined: { icon: 'x', tone: 'neutral' },
	}

	/** A grade as the settings name it, or a dash. */
	const gradeLabel = (grade: AuditEntry['grade']) => (grade ? $t(`settings.gardener.grades.${grade}`) : '—')

	/** The surface as the owner knows it: the conversation, a domain's conversation, a tool run on its own. */
	function surfaceLabel(surface: string): string {
		if (surface === 'global-chat') return $t('audit.surfaces.chat')
		if (surface === 'delegated') return $t('audit.surfaces.delegated')
		const manifest = surface.endsWith('-chat') ? manifestFor(surface.slice(0, -5)) : undefined
		return manifest ? $t('audit.surfaces.domainChat', { values: { domain: $t(manifest.name) } }) : surface
	}

	const columns = $derived<DataTableColumn[]>([
		{ label: $t('audit.columns.when'), muted: true },
		{ label: $t('audit.columns.surface') },
		{ label: $t('audit.columns.tool') },
		{ label: $t('audit.columns.grade') },
		{ label: $t('audit.columns.model') },
		{ label: $t('audit.columns.tokens'), numeric: true },
		{ label: $t('audit.columns.cost'), numeric: true },
		{ label: $t('audit.columns.outcome') },
	])
	const rows = $derived<(string | DataTableCell)[][]>(
		shown.map((item) => [
			formatMoment(item.at, format),
			surfaceLabel(item.surface),
			{ text: item.tool ?? '—', mono: !!item.tool },
			gradeLabel(item.grade),
			{ text: item.model, code: true },
			`${item.tokensIn} / ${item.tokensOut}`,
			formatCost(item.costUsd),
			{ text: $t(`audit.outcomes.${item.outcome}`), ...OUTCOME[item.outcome] },
		])
	)

	async function read() {
		failed = false
		try {
			entries = await queryAudit({ limit: 500 })
		} catch {
			failed = true
		}
	}

	onMount(() => {
		void read()
		void grants.load()
	})

	function show(index: number, anchor: HTMLElement) {
		const entry = shown[index]
		if (!entry) return
		labels = {}
		detail = { entry, anchor }
		open = true
	}
	function showParent(id: string) {
		const index = shown.findIndex((entry) => entry.id === id)
		if (index !== -1 && detail) show(index, detail.anchor)
	}
	function openThread(id: string) {
		open = false
		gardenerUi.show()
		void threads.open(id)
	}
	const grantOf = (id: string) => grants.grants.find((grant) => grant.id === id)

	// the reads as the ReadList takes them, named as the owner knows them; the rows behind one are read when it opens
	const readItems = $derived<ReadItem[]>(
		(detail?.entry.reads ?? []).map((read) => ({ id: read.id, label: registryLabel(read.id), count: read.count }))
	)
	const readRows = $derived<Record<string, string[]>>(
		Object.fromEntries((detail?.entry.reads ?? []).map((read) => [read.id, read.rows]))
	)
	async function expand(item: ReadItem) {
		if (labels[item.id]) return
		labels = { ...labels, [item.id]: await labelRows(item.id, readRows[item.id] ?? []) }
	}

	// the popover's rows, from the entry it shows: the grade as it was declared and as it ran, when those differ
	const requestRows = $derived<DetailRow[]>(
		detail
			? [
					{ label: $t('audit.detail.model'), value: detail.entry.model, mono: true },
					{
						label: $t('audit.detail.grade'),
						value:
							detail.entry.declaredGrade && detail.entry.declaredGrade !== detail.entry.grade
								? `${gradeLabel(detail.entry.declaredGrade)} → ${gradeLabel(detail.entry.grade)}`
								: gradeLabel(detail.entry.grade),
					},
					{
						label: $t('audit.detail.tokens'),
						value: `${detail.entry.tokensIn} / ${detail.entry.tokensOut}`,
						mono: true,
					},
					...(detail.entry.cacheRead
						? [{ label: $t('audit.detail.cached'), value: String(detail.entry.cacheRead), mono: true }]
						: []),
					{ label: $t('audit.columns.cost'), value: formatCost(detail.entry.costUsd), mono: true },
					{
						label: $t('audit.detail.outcome'),
						value:
							$t(`audit.outcomes.${detail.entry.outcome}`) +
							(detail.entry.confirmOutcome ? ` · ${detail.entry.confirmOutcome}` : ''),
						...OUTCOME[detail.entry.outcome],
					},
					...(detail.entry.image
						? [
								{
									label: $t('audit.detail.image'),
									value: `${detail.entry.image.width}×${detail.entry.image.height} · ${detail.entry.image.hash.slice(0, 12)}…`,
									mono: true,
								},
							]
						: []),
				]
			: []
	)
</script>

<div class="page">
	<PageHeader name={$t('audit.title')} subtitle={$t('audit.subtitle')} icon={domainGlyph('gardener')} />
	{#if failed}
		<div class="body"><InlineError message={$t('audit.error')} onretry={read} live /></div>
	{:else if !shown.length}
		<EmptyState title={$t('audit.empty.title')} text={$t('audit.empty.text')} />
	{:else}
		<div class="body">
			{#if fact}
				<p class="quiet">{$t('audit.filteredByFact')}</p>
			{/if}
			<DataTable {columns} {rows} label={$t('audit.title')} onrow={show} />
			<p class="quiet">{$t('audit.retention')}</p>
		</div>
	{/if}
</div>

{#if detail}
	{@const entry = detail.entry}
	<DetailPopover
		anchor={detail.anchor}
		bind:open
		tone="ai"
		icon={domainGlyph('gardener')}
		title={entry.tool ?? surfaceLabel(entry.surface)}
		subtitle={entry.tool
			? `${surfaceLabel(entry.surface)} · ${formatMoment(entry.at, format)}`
			: formatMoment(entry.at, format)}
		width="md"
		label={$t('audit.detailLabel')}
		onclose={() => (detail = undefined)}
	>
		<DetailSection label={$t('audit.detail.request')} rows={requestRows} />
		<DetailSection label={$t('audit.detail.reads')}>
			{#if readItems.length}
				<ReadList items={readItems} onexpand={(item) => void expand(item)}>
					{#snippet expanded(item)}
						{@const named = labels[item.id]}
						{#if !(readRows[item.id] ?? []).length}
							<p class="none">{$t('gardener.noRows')}</p>
						{:else if !named}
							<p class="none">…</p>
						{:else}
							<ul class="names">
								{#each named as row (row.id)}<li>{row.label}</li>{/each}
							</ul>
						{/if}
					{/snippet}
				</ReadList>
			{:else}
				<p class="none">—</p>
			{/if}
		</DetailSection>
		{#if entry.tools.length}
			<DetailSection label={$t('audit.detail.tools')}>
				<ul class="list">
					{#each entry.tools as tool, i (i)}
						<li><code>{tool.id}</code> · {tool.access}{tool.confirm ? ` · ${tool.confirm}` : ''}</li>
					{/each}
				</ul>
			</DetailSection>
		{/if}
		{#if entry.grants.length}
			<DetailSection label={$t('audit.detail.grants')}>
				<ul class="list">
					{#each entry.grants as id (id)}
						{@const grant = grantOf(id)}
						<li>{grant ? `${grant.resource} · ${grant.access} · ${grant.lifetime} · ${grant.origin}` : id}</li>
					{/each}
				</ul>
			</DetailSection>
		{/if}
		{#snippet footer()}
			{#if entry.parentRequestId}
				<Button
					variant="quiet"
					label={$t('audit.detail.parentOpen')}
					onclick={() => showParent(entry.parentRequestId ?? '')}
				/>
			{/if}
			{#if entry.threadId}
				<Button
					variant="secondary"
					icon="sparkles"
					label={$t('audit.openThread')}
					onclick={() => entry.threadId && openThread(entry.threadId)}
				/>
			{/if}
		{/snippet}
	</DetailPopover>
{/if}

<style>
	.page {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.body {
		display: grid;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.list,
	.names {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--space-1);
	}
	.list code {
		font: var(--ed-t-data-sm);
		color: var(--text-secondary);
	}
	.names {
		font: var(--ed-t-body-sm);
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.list {
		font: var(--ed-t-body-sm);
		color: var(--text-primary);
	}
	.none,
	.quiet {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
</style>
