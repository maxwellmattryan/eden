<script lang="ts">
	// Today on the phone (product/substrate/tasks.md, "Today view"; D-75, D-166), after the phone canvas
	// of the Domains/Today/Today story: the Quick Log strip, the quick-add line with its parsed chips under the
	// field, then Overdue (closed until opened), Due today, Routines and Habits, one list each. A row swipes: to the
	// right is its main action (Done, Not done for a routine already done, Log one for a habit), to the left Delete.
	// A tap does nothing; the ⋯ button and a held press open the row's menu as a bottom sheet, which holds the
	// rest (the snoozes, Skip today). Every write shows an undo toast. The store, the rows and what each action
	// writes are shared with the desktop's page (`@eden/shared/shell/today`).
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
		type IconName,
		type ListRowData,
		type MenuItem,
		type ParsedChip,
		type SwipeLeading,
		type SwipeTrailing,
	} from '@eden/ui-kit'
	import { addDays, formatDate } from '@eden/shared/dates'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { undoToast } from '@eden/shared/shell'
	import { quickLogActions, quickLogKey, runQuickLog } from '@eden/shared/shell/quick-log'
	import {
		parsedChips,
		primaryAction,
		rowOf,
		runRowAction,
		seedTasks,
		settle,
		tasks,
		type RowAction,
		type RowWords,
	} from '@eden/shared/shell/today'
	import { parseTask, TODAY_SECTIONS, type Language, type TodayItem, type TodaySection } from '@eden/shared/tasks'

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

	/** How a row's main action looks behind it: Not done takes nothing forward, so it sits on the neutral ground. */
	const LEADING: Record<string, { icon: IconName; tone?: 'neutral' }> = {
		done: { icon: 'check' },
		log: { icon: 'plus' },
		reopen: { icon: 'rotate-ccw', tone: 'neutral' },
	}
	/** The swipe to the right: the row's main action, which on desktop is Enter and a double-click. */
	function leading(section: TodaySection, row: ListRowData): SwipeLeading | undefined {
		const item = itemOf(section, row)
		if (!item) return undefined
		const action = primaryAction(item)
		return {
			label: $t(`today.actions.${action}`),
			...LEADING[action],
			onaction: () => runRowAction(action, item, $t),
		}
	}
	/** The swipe to the left: Delete, with no confirm; the toast takes it back (D-12). */
	function trailing(section: TodaySection, row: ListRowData): SwipeTrailing | undefined {
		const item = itemOf(section, row)
		if (!item) return undefined
		return { label: $t('today.actions.delete'), icon: 'trash', onaction: () => runRowAction('delete', item, $t) }
	}
	function onaction(section: TodaySection, menuItem: MenuItem, row: ListRowData) {
		const item = itemOf(section, row)
		if (item) runRowAction(menuItem.id as RowAction, item, $t)
	}
	function seed() {
		undoToast($t('common.sampleAdded'), seedTasks($t('shell.today')))
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

		<!-- at the top of the page, so the keyboard never covers the chips the kit puts under the field -->
		<QuickAdd id="{uid}-add" placeholder={$t('today.addPlaceholder')} {parse} onadd={add} />

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
									aria-expanded={overdueOpen}
									aria-controls="{uid}-overdue-list"
									onclick={() => (overdueOpen = !overdueOpen)}
								/>
							{/if}
						</header>
						{#if shown}
							<!-- the rows swipe; a tap does nothing, and the ⋯ menu holds every action -->
							<List
								id={overdue ? `${uid}-overdue-list` : undefined}
								labelledby="{uid}-{section.id}"
								rows={section.rows}
								leading={(row) => leading(section.id, row)}
								trailing={(row) => trailing(section.id, row)}
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
	/* The strip: the quick actions as a row of chips, wrapping */
	.strip {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
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
