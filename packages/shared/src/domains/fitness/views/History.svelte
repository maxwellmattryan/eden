<script lang="ts">
	// Vigor's History tab, ported from Domains/Vigor/History: the sessions still to come under Planned, then the logged
	// workouts newest first under week headings from the week-start setting (D-58). A row reads the template, the
	// exercise count, RPE, duration and gym, with the day; the open log shows its sets in the pane (pushed in a narrow
	// page, D-112). Each row's menu deletes it, with undo.
	import {
		BackButton,
		DataTable,
		EmptyState,
		IconButton,
		List,
		Menu,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { formatDateOf, formatTime, weekStartOf } from '../../../dates/index.js'
	import { locale, t } from '../../../i18n/index.js'
	import { holdBack } from '../../../navigation/index.js'
	import { settings } from '../../../settings/index.js'
	import { showPushed, undoToast } from '../../../shell/index.js'
	import { dayOf } from '../progress.js'
	import { fitness } from '../store.svelte.js'
	import type { PlannedSession, WorkoutLog } from '../types.js'
	import { toDisplay, unitOf } from '../units.js'
	import { dayLine } from '../words.js'

	type Props = {
		onlog: () => void
		onsample: () => void
	}
	let { onlog, onsample }: Props = $props()

	const uid = $props.id()
	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })
	const unit = $derived(unitOf('weight', settings.measurement))
	const DELETE = $derived<MenuItem[]>([
		{ id: 'delete', label: $t('domains.fitness.delete'), icon: 'trash', destructive: true },
	])

	const metaOf = (log: WorkoutLog) =>
		[
			$t('domains.fitness.exercises', { values: { count: log.exercises.length } }),
			log.rpe ? $t('domains.fitness.rpe', { values: { rpe: log.rpe } }) : undefined,
			$t('domains.fitness.minutes', { values: { minutes: log.minutes } }),
			fitness.gymById(log.gymId)?.name,
		]
			.filter(Boolean)
			.join(' · ')
	const toRow = (log: WorkoutLog): ListRowData => ({
		id: log.id,
		primary: log.title,
		secondary: metaOf(log),
		icon: 'dumbbell',
		meta: dayLine(log.date, lang),
		actions: DELETE,
	})
	const plannedRow = (session: PlannedSession): ListRowData => ({
		id: session.id,
		primary: session.title,
		icon: 'calendar',
		meta: `${dayLine(dayOf(session.startAt), lang)} · ${formatTime(session.startAt, format)}`,
		actions: DELETE,
	})
	const planned = $derived(fitness.upcoming.map(plannedRow))
	const weeks = $derived.by(() => {
		const groups: { id: string; logs: WorkoutLog[] }[] = []
		for (const log of fitness.logs) {
			const id = weekStartOf(log.date, settings.weekStart)
			const group = groups.find((entry) => entry.id === id)
			if (group) group.logs.push(log)
			else groups.push({ id, logs: [log] })
		}
		return groups
	})

	let selected = $state<string>()
	const detail = $derived(fitness.logs.find((log) => log.id === selected) ?? fitness.logs[0])
	const picked = $derived(fitness.logs.some((log) => log.id === selected))
	let back = $state<HTMLElement>()
	function open(id: string) {
		selected = id
		void showPushed(() => back)
	}
	$effect(() => (picked ? holdBack(() => ((selected = undefined), true)) : undefined))
	let menuAnchor = $state<HTMLElement>()
	let menuOpen = $state(false)

	function removeLog(id: string) {
		const log = fitness.logs.find((entry) => entry.id === id)
		if (!log) return
		if (selected === id) selected = undefined
		undoToast($t('garden.feed.workoutRemoved', { values: { title: log.title } }), fitness.removeLog(id))
	}
	function removeSession(id: string) {
		const session = fitness.sessions.find((entry) => entry.id === id)
		if (!session) return
		undoToast($t('garden.feed.sessionRemoved', { values: { title: session.title } }), fitness.removeSession(id))
	}
	const setRows = (log: WorkoutLog) =>
		log.exercises.flatMap((exercise) =>
			exercise.sets.map((set, i) => [
				i === 0 ? exercise.name : '',
				String(i + 1),
				String(set.reps),
				set.load === undefined
					? $t('domains.fitness.history.bodyweight')
					: `${toDisplay('weight', set.load, settings.measurement)} ${unit}`,
			])
		)
</script>

{#if !fitness.logs.length && !planned.length}
	<EmptyState
		title={$t('domains.fitness.history.empty.title')}
		text={$t('domains.fitness.history.empty.text')}
		action={{ label: $t('domains.fitness.workouts.log'), icon: 'check', onclick: onlog }}
		sample={{ onclick: onsample }}
	/>
{:else}
	<div class={['body', { 'body-wide': detail, 'body-open': picked }]}>
		<div class="lists">
			{#if planned.length}
				<List
					header={$t('domains.fitness.history.planned')}
					count={planned.length}
					rows={planned}
					onaction={(_, row) => removeSession(row.id)}
				/>
			{/if}
			{#each weeks as week (week.id)}
				<List
					header={$t('domains.fitness.history.weekOf', { values: { date: formatDateOf(week.id, lang) } })}
					count={week.logs.length}
					rows={week.logs.map(toRow)}
					current={detail?.id}
					onpick={(row) => open(row.id)}
					onopen={(row) => open(row.id)}
					onaction={(_, row) => removeLog(row.id)}
				/>
			{/each}
		</div>
		{#if detail}
			<aside class="detail" aria-labelledby="{uid}-detail">
				<div class="back" bind:this={back}><BackButton onback={() => (selected = undefined)} /></div>
				<div class="detail-head">
					<div class="detail-name">
						<h2 class="detail-title" id="{uid}-detail">{detail.title}</h2>
						<p class="detail-meta">{[dayLine(detail.date, lang), metaOf(detail)].join(' · ')}</p>
					</div>
					<span class="anchor" bind:this={menuAnchor}>
						<IconButton
							icon="ellipsis"
							size="sm"
							label={$t('domains.fitness.actionsFor', { values: { name: detail.title } })}
							aria-haspopup="menu"
							aria-expanded={menuOpen}
							onclick={() => (menuOpen = !menuOpen)}
						/>
					</span>
					<Menu
						bind:open={menuOpen}
						anchor={menuAnchor}
						align="end"
						label={$t('domains.fitness.actionsFor', { values: { name: detail.title } })}
						items={DELETE}
						onselect={() => removeLog(detail.id)}
					/>
				</div>
				{#if detail.exercises.some((exercise) => exercise.sets.length)}
					<DataTable
						label={$t('domains.fitness.history.setsIn', { values: { title: detail.title } })}
						columns={[
							{ label: $t('domains.fitness.history.exercise') },
							{ label: $t('domains.fitness.history.set'), numeric: true },
							{ label: $t('domains.fitness.history.reps'), numeric: true },
							{ label: $t('domains.fitness.history.load'), numeric: true },
						]}
						rows={setRows(detail)}
					/>
				{:else}
					<p class="quiet">{$t('domains.fitness.history.noSets')}</p>
				{/if}
			</aside>
		{/if}
	</div>
{/if}

<style>
	.body {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.body-wide {
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
	}
	.back {
		display: none;
	}
	@container page (max-width: 48rem) {
		.body-wide {
			grid-template-columns: minmax(0, 1fr);
		}
		.body:not(.body-open) .detail,
		.body-open .lists {
			display: none;
		}
		.back {
			display: block;
		}
	}
	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.anchor {
		display: inline-flex;
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		box-sizing: border-box;
		min-width: 0;
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.detail-head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
	}
	.detail-name {
		flex: 1;
		min-width: 0;
	}
	.detail-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
	}
	.detail-meta {
		margin: var(--space-1) 0 0;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
	.quiet {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
</style>
