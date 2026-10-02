<script lang="ts">
	// Today (product/substrate/tasks.md, "Today view"; D-75): the Quick Log strip with the enabled domains' quick
	// actions, the quick-add line that reads a todo, a routine or a habit from what is typed, then Overdue (closed
	// until opened), Due today, Routines and Habits, one list each. Done is Enter, a double-click or the first item
	// of a row's menu, and a done row leaves the list (there are no checkboxes, D-41); a done routine stays, struck
	// through with its time. Every write shows an undo toast. The story Domains/Today/Today mirrors this page.
	import {
		Chip,
		EmptyState,
		IconButton,
		InlineError,
		List,
		PageHeader,
		QuickAdd,
		Skeleton,
		domainGlyph,
		type ListRowData,
		type MenuItem,
		type ParsedChip,
	} from '@eden/ui-kit'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { quintOut } from 'svelte/easing'
	import { addDays, formatDate } from '@eden/shared/dates'
	import { parseTask, TODAY_SECTIONS, type Language, type TodayItem, type TodaySection } from '@eden/shared/tasks'
	import { undoToast } from '@eden/shared/shell'
	import { quickLogActions, quickLogKey } from '@eden/shared/shell/quick-log'
	import { runQuickLog } from '@eden/shared/shell/quick-log'
	import { parsedChips } from '@eden/shared/shell/today'
	import { rowOf, type RowAction, type RowWords } from '@eden/shared/shell/today'
	import { seedTasks } from '@eden/shared/shell/today'
	import { tasks } from '@eden/shared/shell/today'

	const uid = $props.id()
	const lang = $derived<Language>($locale === 'ja' ? 'ja' : 'en')
	const format = $derived({ lang: $locale ?? 'en', clock: settings.clock })
	const subtitle = $derived(formatDate(new Date(tasks.clock).toISOString(), format.lang))

	const words = $derived<RowWords>({
		t: $t,
		format,
		today: tasks.view.day,
		tomorrow: addDays(tasks.view.day, 1),
		snooze: (item) => tasks.snoozeTargetsFor(item.task),
	})

	/** The strip: one chip per quick action of the enabled domains, in the domains' order (D-12). */
	const strip = quickLogActions()

	/** Overdue is closed until the owner opens it; the count stays in view. */
	let overdueOpen = $state(false)
	const sections = $derived(
		TODAY_SECTIONS.map((id) => ({ id, rows: tasks.view.sections[id].map((item) => rowOf(item, words)) }))
	)
	const empty = $derived(tasks.ready && TODAY_SECTIONS.every((id) => tasks.view.sections[id].length === 0))

	function parse(text: string): ParsedChip[] {
		const parsed = parseTask(text, { now: tasks.clock, zone: tasks.zone, weekStart: settings.weekStart, lang })
		return parsedChips(parsed, tasks.zone, words)
	}
	function add(text: string) {
		const { task, undo } = tasks.add(text, lang)
		undoToast($t('today.toast.added', { values: { title: task.title } }), undo)
	}
	function itemOf(section: TodaySection, row: ListRowData): TodayItem | undefined {
		return tasks.view.sections[section].find((item) => item.task.id === row.id)
	}
	/** What Enter, a double-click and the first menu item do: done, or a habit's one more. */
	function open(section: TodaySection, row: ListRowData) {
		const item = itemOf(section, row)
		if (!item) return
		if (section === 'habits') act('log', item)
		else if (section === 'routines' && item.done) act('reopen', item)
		else act('done', item)
	}
	function act(action: RowAction, item: TodayItem) {
		const { task } = item
		const title = task.title
		if (action === 'done') {
			const { undo } = tasks.complete(task.id)
			undoToast($t('today.toast.done', { values: { title } }), undo)
		} else if (action === 'reopen') {
			const { undo } = tasks.reopen(task.id)
			undoToast($t('today.toast.reopened', { values: { title } }), undo)
		} else if (action === 'later' || action === 'tomorrow' || action === 'nextWeek') {
			const { undo } = tasks.snooze(task.id, action)
			const when = $t(`today.actions.${action}`)
			undoToast($t('today.toast.snoozed', { values: { title, when } }), undo)
		} else if (action === 'skip') {
			const { undo } = tasks.skip(task.id)
			undoToast($t('today.toast.skipped', { values: { title } }), undo)
		} else if (action === 'log') {
			const { undo } = tasks.tally(task.id)
			const tally = item.tally
			const values = { title, count: (tally?.count ?? 0) + 1, target: tally?.target.count ?? 0 }
			undoToast($t('today.toast.logged', { values }), undo)
		} else if (action === 'delete') {
			const { undo } = tasks.remove(task.id)
			undoToast($t('today.toast.deleted', { values: { title } }), undo)
		}
	}
	function onaction(section: TodaySection, menuItem: MenuItem, row: ListRowData) {
		const item = itemOf(section, row)
		if (item) act(menuItem.id as RowAction, item)
	}
	function seed() {
		undoToast($t('common.sampleAdded'), seedTasks($t('shell.today')))
	}
	/**
	 * A section whose last row has gone closes over the settle duration, as the row alone would have (the kit's rows
	 * collapse), with the gap after it; a zero settle duration, which is reduced motion, fades instead.
	 */
	function settle(node: HTMLElement) {
		const style = getComputedStyle(node)
		const duration = parseFloat(style.getPropertyValue('--ed-duration-settle')) || 0
		if (!duration) {
			return {
				duration: parseFloat(style.getPropertyValue('--ed-duration-micro')) || 0,
				css: (t: number) => `opacity: ${t}`,
			}
		}
		const height = node.getBoundingClientRect().height
		const gap = parseFloat(getComputedStyle(node.parentElement ?? node).rowGap) || 0
		return {
			duration,
			easing: quintOut,
			css: (t: number) =>
				`overflow: hidden; height: ${(t * height).toFixed(2)}px; margin-bottom: ${((t - 1) * gap).toFixed(2)}px; opacity: ${t}`,
		}
	}
</script>

<div class="page">
	<PageHeader name={$t('shell.today')} {subtitle} icon={domainGlyph('today')} />

	{#if tasks.saveFailed}
		<div class="notice">
			<InlineError message={$t('today.saveFailed')} onretry={() => tasks.flush()} live />
		</div>
	{/if}

	<div class="body">
		{#if strip.length}
			<!-- the Quick Log strip: a chip opens the sheet on its tab, and a launch opens its surface -->
			<nav class="strip" aria-label={$t('today.quickLog')}>
				{#each strip as entry (`${entry.domain}.${entry.id}`)}
					<Chip
						label={$t('today.quickLogChip', { values: { action: $t(entry.label), domain: $t(entry.context) } })}
						icon={entry.icon}
						tone="outline"
						onclick={() => runQuickLog(quickLogKey(entry))}
					/>
				{/each}
			</nav>
		{/if}

		<div class="add">
			<QuickAdd id="{uid}-add" placeholder={$t('today.addPlaceholder')} {parse} onadd={add} />
		</div>

		{#if !tasks.ready}
			<Skeleton rows={3} icon={false} />
		{:else if empty}
			<EmptyState title={$t('empty.today.title')} text={$t('empty.today.text')} sample={{ onclick: seed }} />
		{:else}
			{#each sections as section (section.id)}
				{#if section.rows.length}
					{@const overdue = section.id === 'overdue'}
					{@const shown = !overdue || overdueOpen}
					<section class="section" aria-labelledby="{uid}-{section.id}" out:settle>
						<header class="section-head">
							<h2 class="section-title" id="{uid}-{section.id}">{$t(`today.sections.${section.id}`)}</h2>
							<span class="section-count">{section.rows.length}</span>
							{#if overdue}
								<IconButton
									icon={overdueOpen ? 'chevron-up' : 'chevron-down'}
									size="xs"
									label={$t(overdueOpen ? 'today.hideOverdue' : 'today.showOverdue')}
									tooltip
									aria-expanded={overdueOpen}
									aria-controls="{uid}-overdue-list"
									onclick={() => (overdueOpen = !overdueOpen)}
								/>
							{/if}
						</header>
						{#if shown}
							<List
								id={overdue ? `${uid}-overdue-list` : undefined}
								rows={section.rows}
								onopen={(row) => open(section.id, row)}
								onaction={(menuItem, row) => onaction(section.id, menuItem, row)}
							/>
						{/if}
					</section>
				{/if}
			{/each}
		{/if}
	</div>
</div>

<style>
	.page {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.notice {
		padding: 0 var(--ed-gutter) var(--space-4);
	}
	.body {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	/* The strip: the quick actions as a row of chips, wrapping when the window is narrow */
	.strip {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	/* The quick-add line keeps a reading width while the lists below take the page */
	.add {
		max-width: calc(var(--sheet-max) * 0.8);
	}
	/* One section per list: its name, its count in mono, and for Overdue the chevron that opens it */
	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.section-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.section-title {
		margin: 0;
		font: var(--ed-t-title-lg);
		letter-spacing: var(--ed-t-title-lg-tracking);
		font-variation-settings: var(--ed-t-title-lg-opsz);
	}
	.section-count {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}
</style>
