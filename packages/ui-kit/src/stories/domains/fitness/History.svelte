<script lang="ts">
	// Vigor's History view (product/domains/fitness.md, "Surfaces"): the sessions still to come under Planned, then the
	// logged workouts newest first, grouped under week headings that start on the week-start setting (Monday in the
	// sample, D-58). A row reads the template, the day, the exercise count, RPE, duration and gym; the open one shows
	// its sets in the detail pane on desktop, pushed on a narrow page (D-112). Story-only.
	import {
		BackButton,
		DataTable,
		EmptyState,
		IconButton,
		List,
		Menu,
		type ListRowData,
		type MenuItem,
		type PageHeaderAction,
	} from '$lib/index.js'
	import VigorPage, { dayLabel } from './VigorPage.svelte'
	import { gyms, plannedSessions, workoutLogs, type SampleWorkoutLog } from '../../sample-data.js'

	type Props = {
		empty?: boolean
		/** The log open in the pane. */
		selected?: string
		/** The phone with the open log pushed over the list. */
		pushed?: boolean
		onlog?: () => void
		ondelete?: (id: string) => void
		onsample?: () => void
		onnavigate?: (id: string) => void
	}
	let { empty = false, selected = 'wl-06', pushed = false, onlog, ondelete, onsample, onnavigate }: Props = $props()

	const uid = $props.id()
	const logs = $derived(empty ? [] : workoutLogs)
	const planned = $derived(empty ? [] : plannedSessions)
	// svelte-ignore state_referenced_locally
	let current = $state(selected)
	const detail = $derived(logs.find((log) => log.id === current))

	/** The Monday of a sample day's week, as `MM-DD`. */
	function weekOf(day: string): string {
		const [month, date] = day.split('-').map(Number) as [number, number]
		const weekday = new Date(2026, month - 1, date).getDay()
		const at = new Date(2026, month - 1, date - ((weekday + 6) % 7))
		return `${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
	}
	const weekHeading = (monday: string) => `Week of ${dayLabel(monday).slice(4)}`
	const weeks = $derived.by(() => {
		const groups: { id: string; logs: SampleWorkoutLog[] }[] = []
		for (const log of logs) {
			const id = weekOf(log.day)
			const group = groups.find((entry) => entry.id === id)
			if (group) group.logs.push(log)
			else groups.push({ id, logs: [log] })
		}
		return groups
	})
	const gymName = (id: string) => gyms.find((gym) => gym.id === id)?.name
	const DELETE: MenuItem[] = [{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true }]
	const toRow = (log: SampleWorkoutLog): ListRowData => ({
		id: log.id,
		primary: log.title,
		secondary: [`${log.exercises.length} exercises`, `RPE ${log.rpe}`, `${log.minutes} min`, gymName(log.gymId)]
			.filter(Boolean)
			.join(' · '),
		icon: 'dumbbell',
		meta: dayLabel(log.day),
		actions: DELETE,
	})
	const plannedRows = $derived<ListRowData[]>(
		planned.map((session) => ({
			id: session.id,
			primary: session.title,
			icon: 'calendar',
			meta: `${dayLabel(session.day)} · ${session.time}`,
			actions: DELETE,
		}))
	)
	const setRows = (log: SampleWorkoutLog) =>
		log.exercises.flatMap((exercise) =>
			exercise.sets.map((set, i) => [
				i === 0 ? exercise.name : '',
				String(i + 1),
				String(set.reps),
				set.load === undefined ? 'bodyweight' : `${set.load} kg`,
			])
		)
	let menuAnchor = $state<HTMLElement>()
	let menuOpen = $state(false)

	const actions = $derived<PageHeaderAction[]>([
		{ label: 'Log a workout', icon: 'check', variant: empty ? 'secondary' : undefined, onclick: onlog },
	])
</script>

{#snippet pane(log: SampleWorkoutLog)}
	<div class="detail-head">
		<div class="detail-name">
			<h2 class="detail-title" id="{uid}-detail">{log.title}</h2>
			<p class="detail-meta">{dayLabel(log.day)} · RPE {log.rpe} · {log.minutes} min · {gymName(log.gymId)}</p>
		</div>
		<span class="anchor" bind:this={menuAnchor}>
			<IconButton
				icon="ellipsis"
				size="sm"
				label="Actions for {log.title}"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				onclick={() => (menuOpen = !menuOpen)}
			/>
		</span>
		<Menu
			bind:open={menuOpen}
			anchor={menuAnchor}
			align="end"
			label="Actions for {log.title}"
			items={DELETE}
			onselect={() => ondelete?.(log.id)}
		/>
	</div>
	<DataTable
		label="Sets in {log.title}"
		columns={[
			{ label: 'Exercise' },
			{ label: 'Set', numeric: true },
			{ label: 'Reps', numeric: true },
			{ label: 'Load', numeric: true },
		]}
		rows={setRows(log)}
	/>
{/snippet}

<VigorPage tab="History" {actions} {onnavigate}>
	{#snippet children(platform)}
		{#if empty}
			<EmptyState
				title="Nothing logged yet"
				text="Log a workout after a session, or start one from a template, and it lands here by week."
				action={{ label: 'Log a workout', icon: 'check', onclick: onlog }}
				sample={{ onclick: onsample }}
			/>
		{:else if platform === 'mobile' && pushed && detail}
			<div class="body">
				<BackButton breadcrumb="History" onback={() => (pushed = false)} />
				<section class="detail" aria-labelledby="{uid}-detail">{@render pane(detail)}</section>
			</div>
		{:else}
			<div class={['body', { 'body-wide': platform === 'desktop' && detail }]}>
				<div class="lists">
					{#if plannedRows.length}
						<List
							header="Planned"
							count={plannedRows.length}
							rows={plannedRows}
							onaction={(_, row) => ondelete?.(row.id)}
						/>
					{/if}
					{#each weeks as week (week.id)}
						<List
							header={weekHeading(week.id)}
							count={week.logs.length}
							rows={week.logs.map(toRow)}
							current={platform === 'desktop' ? current : undefined}
							onpick={(row) => {
								current = row.id
								if (platform === 'mobile') pushed = true
							}}
							onaction={(_, row) => ondelete?.(row.id)}
						/>
					{/each}
				</div>
				{#if platform === 'desktop' && detail}
					<aside class="detail" aria-labelledby="{uid}-detail">{@render pane(detail)}</aside>
				{/if}
			</div>
		{/if}
	{/snippet}
</VigorPage>

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
</style>
