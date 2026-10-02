<script lang="ts">
	// The audit log (product/substrate/ai.md, "Audit log"; docs/design/screens.md, `audit-log`; D-114): one row per
	// request, this device's, ninety days, the outcome coloured. The log is a table the crate sorts, filters and pages:
	// a header sorts by its column, the chips above narrow it (to a kind of request, a tool, a grade, a model, an
	// outcome, a stretch of time, one conversation, the requests that read one fact), and the pager under it walks the
	// rest. All of that lives in the address, so a conversation can link to its own requests and back and forward
	// walk the filters. A row unfolds beneath itself to the request in a few rows, what it read as the same ReadList
	// the "can see" chip shows, the tools it ran with their confirm, the grants that allowed it, and its conversation.
	import { onMount, tick } from 'svelte'
	import { navigation } from '../../../navigation/index.js'
	import {
		Button,
		Chip,
		DataTable,
		DetailSection,
		EmptyState,
		InlineError,
		Pagination,
		ReadList,
		formatBytes,
		type DataTableCell,
		type DataTableColumn,
		type DataTableSort,
		type DetailRow,
		type IconName,
		type MenuItem,
		type ReadItem,
	} from '@eden/ui-kit'
	import { formatMoment } from '../../../dates/index.js'
	import {
		AUDIT_GRADES,
		AUDIT_KINDS,
		AUDIT_OUTCOMES,
		AUDIT_PAGE_SIZE,
		AUDIT_RANGES,
		auditFacets,
		auditQueryOf,
		auditSearch,
		formatCost,
		hasAuditFilters,
		NO_AUDIT_PARAMS,
		parseAuditParams,
		queryAuditPage,
		type AuditEntry,
		type AuditFacets,
		type AuditOrder,
		type AuditOutcome,
		type AuditParams,
		type AuditRange,
	} from '../../../gardener/index.js'
	import { locale, t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { domainFace } from '../domain-face.js'
	import { grants } from '../../grants.svelte.js'
	import { labelRows, registryLabel, type RowLabel } from '../labels.js'
	import { gardenerUi } from '../panel-ui.svelte.js'
	import { gardenerSetup } from '../setup.svelte.js'
	import { threads } from '../threads.svelte.js'
	import { gotoAudit } from './audit-link.js'
	import FilterChip from '../../../components/FilterChip.svelte'
	import { compactPage } from './compact.js'

	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
	// The phone keeps four of the columns (when, tool, cost, outcome), by their place in the full list; the surface,
	// the grade, the model and the tokens are in the row's detail (D-164).
	const compact = compactPage()
	const PHONE_COLUMNS = [0, 2, 7, 8]
	const kept = <T,>(cells: T[]): T[] => (compact ? PHONE_COLUMNS.map((index) => cells[index]!) : cells)

	let entries = $state<AuditEntry[]>([])
	let total = $state(0)
	let facets = $state<AuditFacets>({ models: [], tools: [] })
	let ready = $state(false)
	let failed = $state(false)
	// the row that is unfolded, by its index on the page, and the labels of what an entry read, kept by entry and id
	// as a read opens
	let expanded = $state<number>()
	let labels = $state<Record<string, RowLabel[] | undefined>>({})
	let body = $state<HTMLElement>()

	const format = $derived({ lang: $locale ?? 'en', clock: settings.clock })
	/** What the address asks of the log: the address is the state. */
	const params = $derived(parseAuditParams(navigation.search))
	const filtered = $derived(hasAuditFilters(params))
	const search = $derived(auditSearch(params))

	/** Moves to the log as the patch changes it; a new filter or sort starts from the first page. */
	function update(patch: Partial<AuditParams>) {
		void gotoAudit({ ...params, page: 1, ...patch }, true)
	}
	const clear = () => update({ ...NO_AUDIT_PARAMS, thread: undefined, fact: undefined, sort: params.sort })

	// one read at a time counts: an answer that a later ask has overtaken is dropped
	let asked = 0
	async function read() {
		const mine = (asked += 1)
		try {
			const answer = await queryAuditPage(auditQueryOf(parseAuditParams(new URLSearchParams(search)), Date.now(), zone))
			if (mine !== asked) return
			entries = answer.rows
			total = answer.total
			failed = false
		} catch {
			if (mine !== asked) return
			failed = true
		} finally {
			if (mine === asked) ready = true
		}
		expanded = undefined
	}
	// the page is read again when the address asks for another, and when a request was just audited (which is what
	// moves this month's spend)
	$effect(() => {
		void search
		void gardenerSetup.spentThisMonth
		void read()
		void auditFacets()
			.then((answer) => (facets = answer))
			.catch(() => null)
	})

	onMount(() => {
		void grants.load()
		void threads.load()
	})

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
		const manifest = surface.endsWith('-chat') ? domainFace(surface.slice(0, -5)) : undefined
		return manifest ? $t('audit.surfaces.domainChat', { values: { domain: $t(manifest.name) } }) : surface
	}

	// The filters: each a chip that names what it is set to, and a menu of what it may be.
	const toggled = <T,>(list: readonly T[], value: T) =>
		list.includes(value) ? list.filter((held) => held !== value) : [...list, value]
	/** A filter's chip: its name alone, its one value, or how many it holds. */
	function chipLabel(name: string, held: readonly string[], word: (id: string) => string): string {
		if (!held.length) return name
		if (held.length === 1)
			return $t('gardenerPage.audit.filterValue', { values: { filter: name, value: word(held[0]!) } })
		return $t('gardenerPage.audit.filterCount', { values: { filter: name, count: held.length } })
	}
	const choices = (all: readonly string[], held: readonly string[], word: (id: string) => string): MenuItem[] =>
		all.map((id) => ({ id, label: word(id), checked: held.includes(id) }))

	const kindWord = (id: string) => $t(`gardenerPage.audit.kinds.${id}`)
	const gradeWord = (id: string) => $t(`settings.gardener.grades.${id}`)
	const outcomeWord = (id: string) => $t(`audit.outcomes.${id}`)
	const rangeWord = (id: string) => $t(`gardenerPage.audit.ranges.${id}`)
	const plain = (id: string) => id
	// a filter names what the address asks for even when the log no longer holds it
	const offered = (held: readonly string[], seen: readonly string[]) => [...new Set([...seen, ...held])].sort()

	const thread = $derived(params.thread ? threads.threads.find((entry) => entry.id === params.thread) : undefined)
	const threadLabel = $derived(
		thread ? $t('gardenerPage.audit.thread', { values: { title: thread.title } }) : $t('gardenerPage.audit.threadGone')
	)

	// The table: every column but the surface sorts, by the crate, and every column but the time says what it holds.
	const columns = $derived<DataTableColumn[]>(
		kept([
			{ id: 'at', label: $t('audit.columns.when'), muted: true, sortable: true },
			{ label: $t('audit.columns.surface'), hint: $t('audit.hints.surface') },
			{ id: 'tool', label: $t('audit.columns.tool'), hint: $t('audit.hints.tool'), sortable: true },
			{ id: 'grade', label: $t('audit.columns.grade'), hint: $t('audit.hints.grade'), sortable: true },
			{ id: 'model', label: $t('audit.columns.model'), hint: $t('audit.hints.model'), sortable: true },
			{
				id: 'tokens-in',
				label: $t('audit.columns.tokensIn'),
				hint: $t('audit.hints.tokensIn'),
				numeric: true,
				sortable: true,
			},
			{
				id: 'tokens-out',
				label: $t('audit.columns.tokensOut'),
				hint: $t('audit.hints.tokensOut'),
				numeric: true,
				sortable: true,
			},
			{ id: 'cost', label: $t('audit.columns.cost'), hint: $t('audit.hints.cost'), numeric: true, sortable: true },
			{ id: 'outcome', label: $t('audit.columns.outcome'), hint: $t('audit.hints.outcome'), sortable: true },
		])
	)
	const number = $derived(new Intl.NumberFormat($locale ?? 'en'))
	const rows = $derived<(string | DataTableCell)[][]>(
		entries.map((item) =>
			kept<string | DataTableCell>([
				formatMoment(item.at, format),
				surfaceLabel(item.surface),
				{ text: item.tool ?? '—', mono: !!item.tool },
				gradeLabel(item.grade),
				{ text: item.model, code: true },
				number.format(item.tokensIn),
				number.format(item.tokensOut),
				formatCost(item.costUsd),
				{ text: $t(`audit.outcomes.${item.outcome}`), ...OUTCOME[item.outcome] },
			])
		)
	)
	const sort = $derived<DataTableSort>({ column: params.sort, direction: params.descending ? 'desc' : 'asc' })
	const onsort = (next: DataTableSort) =>
		update({ sort: next.column as AuditOrder, descending: next.direction === 'desc' })

	/** Unfolds the request this one was delegated from, when it is on the page, and brings its row into view. */
	async function showParent(id: string) {
		const index = entries.findIndex((entry) => entry.id === id)
		if (index === -1) return
		expanded = index
		await tick()
		body?.querySelectorAll('tbody tr:not(.ed-table-detail)')[index]?.scrollIntoView({ block: 'nearest' })
	}
	const onPage = (id: string | null) => !!id && entries.some((entry) => entry.id === id)
	function openThread(id: string) {
		gardenerUi.show()
		void threads.open(id)
	}
	const grantOf = (id: string) => grants.grants.find((grant) => grant.id === id)

	// the reads as the ReadList takes them, named as the owner knows them; the rows behind one are read when it opens.
	// Each takes its entry, so a row that is folding away keeps showing its own while the next one opens.
	const readItems = (entry: AuditEntry): ReadItem[] =>
		entry.reads.map((read) => ({ id: read.id, label: registryLabel(read.id), count: read.count }))
	const readRows = (entry: AuditEntry, id: string) => entry.reads.find((read) => read.id === id)?.rows ?? []
	const labelKey = (entry: AuditEntry, id: string) => `${entry.id}:${id}`
	async function expand(entry: AuditEntry, item: ReadItem) {
		const key = labelKey(entry, item.id)
		if (labels[key]) return
		labels = { ...labels, [key]: await labelRows(item.id, readRows(entry, item.id)) }
	}

	// the detail's rows, from the entry it shows: the grade as it was declared and as it ran, when those differ
	const requestRows = (entry: AuditEntry): DetailRow[] => [
		// the phone's table has no surface column, so the detail says it
		...(compact ? [{ label: $t('audit.columns.surface'), value: surfaceLabel(entry.surface) }] : []),
		{ label: $t('audit.detail.model'), value: entry.model, mono: true },
		{
			label: $t('audit.detail.grade'),
			value:
				entry.declaredGrade && entry.declaredGrade !== entry.grade
					? `${gradeLabel(entry.declaredGrade)} → ${gradeLabel(entry.grade)}`
					: gradeLabel(entry.grade),
		},
		{
			label: $t('audit.detail.tokens'),
			value: `${number.format(entry.tokensIn)} / ${number.format(entry.tokensOut)}`,
			mono: true,
		},
		...(entry.cacheRead
			? [{ label: $t('audit.detail.cached'), value: number.format(entry.cacheRead), mono: true }]
			: []),
		...(entry.cacheWrite
			? [{ label: $t('audit.detail.cacheWritten'), value: number.format(entry.cacheWrite), mono: true }]
			: []),
		{ label: $t('audit.columns.cost'), value: formatCost(entry.costUsd), mono: true },
		{
			label: $t('audit.detail.outcome'),
			value: $t(`audit.outcomes.${entry.outcome}`) + (entry.confirmOutcome ? ` · ${entry.confirmOutcome}` : ''),
			...OUTCOME[entry.outcome],
		},
		...(entry.image
			? [
					{
						label: $t('audit.detail.image'),
						value: `${entry.image.width}×${entry.image.height} · ${entry.image.hash.slice(0, 12)}…`,
						mono: true,
					},
				]
			: []),
		// the owner's files: type, size, an image's pixels and the start of the hash, never a name (D-83)
		...(entry.attachments ?? []).map((file) => ({
			label: $t('audit.detail.attachment'),
			value: [
				file.mime,
				formatBytes(file.size),
				...(file.width && file.height ? [`${file.width}×${file.height}`] : []),
				`${file.hash.slice(0, 12)}…`,
			].join(' · '),
			mono: true,
		})),
	]
</script>

{#snippet removable(label: string, remove: () => void)}
	<Chip
		{label}
		tone="accent"
		icon="x"
		aria-label={$t('gardenerPage.audit.remove', { values: { filter: label } })}
		onclick={remove}
	/>
{/snippet}

<div class="body" bind:this={body}>
	{#if failed}
		<InlineError message={$t('audit.error')} onretry={read} live />
	{:else if ready && !total && !filtered}
		<EmptyState title={$t('audit.empty.title')} text={$t('audit.empty.text')} />
	{:else if ready}
		<div class="filters" role="group" aria-label={$t('gardenerPage.audit.filtersLabel')}>
			{#if params.thread}{@render removable(threadLabel, () => update({ thread: undefined }))}{/if}
			{#if params.fact}
				{@render removable($t('gardenerPage.audit.fact'), () => update({ fact: undefined }))}
			{/if}
			<FilterChip
				label={params.range === 'all'
					? $t('gardenerPage.audit.filters.range')
					: chipLabel($t('gardenerPage.audit.filters.range'), [params.range], rangeWord)}
				menuLabel={$t('gardenerPage.audit.filters.range')}
				active={params.range !== 'all'}
				items={choices(AUDIT_RANGES, [params.range], rangeWord)}
				onpick={(id) => update({ range: id as AuditRange })}
			/>
			<FilterChip
				label={chipLabel($t('gardenerPage.audit.filters.kind'), params.kinds, kindWord)}
				menuLabel={$t('gardenerPage.audit.filters.kind')}
				active={params.kinds.length > 0}
				items={choices(AUDIT_KINDS, params.kinds, kindWord)}
				onpick={(id) => update({ kinds: toggled(params.kinds, id as (typeof AUDIT_KINDS)[number]) })}
			/>
			{#if facets.tools.length || params.tools.length}
				<FilterChip
					label={chipLabel($t('audit.columns.tool'), params.tools, plain)}
					menuLabel={$t('audit.columns.tool')}
					active={params.tools.length > 0}
					items={choices(offered(params.tools, facets.tools), params.tools, plain)}
					onpick={(id) => update({ tools: toggled(params.tools, id) })}
				/>
			{/if}
			<FilterChip
				label={chipLabel($t('audit.columns.grade'), params.grades, gradeWord)}
				menuLabel={$t('audit.columns.grade')}
				active={params.grades.length > 0}
				items={choices(AUDIT_GRADES, params.grades, gradeWord)}
				onpick={(id) => update({ grades: toggled(params.grades, id as (typeof AUDIT_GRADES)[number]) })}
			/>
			{#if facets.models.length || params.models.length}
				<FilterChip
					label={chipLabel($t('audit.columns.model'), params.models, plain)}
					menuLabel={$t('audit.columns.model')}
					active={params.models.length > 0}
					items={choices(offered(params.models, facets.models), params.models, plain)}
					onpick={(id) => update({ models: toggled(params.models, id) })}
				/>
			{/if}
			<FilterChip
				label={chipLabel($t('audit.columns.outcome'), params.outcomes, outcomeWord)}
				menuLabel={$t('audit.columns.outcome')}
				active={params.outcomes.length > 0}
				items={choices(AUDIT_OUTCOMES, params.outcomes, outcomeWord)}
				onpick={(id) => update({ outcomes: toggled(params.outcomes, id as AuditOutcome) })}
			/>
			{#if filtered}
				<Button variant="quiet" label={$t('gardenerPage.audit.clear')} onclick={clear} />
			{/if}
		</div>

		{#if !total}
			<EmptyState
				inline
				title={$t('gardenerPage.audit.noMatch.title')}
				text={$t('gardenerPage.audit.noMatch.text')}
				action={{ label: $t('gardenerPage.audit.clear'), onclick: clear }}
			/>
		{:else}
			<DataTable {columns} {rows} label={$t('audit.title')} {sort} {onsort} bind:expanded>
				{#snippet detail(index)}
					{@const entry = entries[index]}
					{#if entry}
						<div class="detail">
							<DetailSection label={$t('audit.detail.request')} rows={requestRows(entry)} />
							<DetailSection label={$t('audit.detail.reads')}>
								{#if entry.reads.length}
									<ReadList items={readItems(entry)} onexpand={(item) => void expand(entry, item)}>
										{#snippet expanded(item)}
											{@const named = labels[labelKey(entry, item.id)]}
											{#if !readRows(entry, item.id).length}
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
											<li>
												{grant ? `${grant.resource} · ${grant.access} · ${grant.lifetime} · ${grant.origin}` : id}
											</li>
										{/each}
									</ul>
								</DetailSection>
							{/if}
						</div>
						{#if onPage(entry.parentRequestId) || entry.threadId}
							<div class="actions">
								{#if onPage(entry.parentRequestId)}
									<Button
										variant="quiet"
										label={$t('audit.detail.parentOpen')}
										onclick={() => void showParent(entry.parentRequestId ?? '')}
									/>
								{/if}
								{#if entry.threadId && entry.threadId !== params.thread}
									<Button
										variant="quiet"
										label={$t('gardenerPage.audit.onlyThread')}
										onclick={() => update({ thread: entry.threadId ?? undefined })}
									/>
								{/if}
								{#if entry.threadId}
									<Button
										variant="secondary"
										label={$t('audit.openThread')}
										onclick={() => entry.threadId && openThread(entry.threadId)}
									/>
								{/if}
							</div>
						{/if}
					{/if}
				{/snippet}
			</DataTable>
			<Pagination
				page={params.page}
				pageSize={AUDIT_PAGE_SIZE}
				{total}
				label={$t('gardenerPage.audit.pages')}
				onchange={(next) => update({ page: next })}
			/>
		{/if}
		<p class="quiet">{$t('audit.retention')}</p>
	{/if}
</div>

<style>
	.body {
		display: grid;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	/* the sections side by side where the table is wide, stacked where it is not */
	.detail {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(calc(var(--space-8) * 8), 1fr));
		align-items: start;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2);
		padding: 0 var(--space-3) var(--space-3);
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
