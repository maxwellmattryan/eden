<script lang="ts">
	// Vigor's four Garden tiles (product/domains/fitness.md, "Garden widgets"), none in the default Garden; the owner
	// adds them from the catalog (D-155). This week's sessions, done or planned; the streak; the next planned session;
	// and the weight with its fortnight as a sparkline over the seven-day average. Each says its prompt until there
	// is something to show. Story-only.
	import { Sparkline, Stat, Widget, WidgetGrid, WidgetRows, domainGlyph } from '$lib/index.js'
	import { dayLabel } from './VigorPage.svelte'
	import {
		plannedSessions,
		trainingStreak,
		weightAverage,
		weightDays,
		weightGoal,
		weightGoalBy,
		weightSeries,
		workoutLogs,
	} from '../../sample-data.js'

	type Props = {
		/** Nothing logged or planned: each tile says its prompt. */
		empty?: boolean
		onopen?: (widget: string) => void
	}
	let { empty = false, onopen }: Props = $props()

	/** The sample week runs from Monday 09-28. */
	const week = [
		...workoutLogs
			.filter((log) => log.day >= '09-28')
			.map((log) => ({ id: log.id, day: log.day, title: log.title, done: true })),
		...plannedSessions.map((session) => ({ id: session.id, day: session.day, title: session.title, done: false })),
	].sort((a, b) => a.day.localeCompare(b.day))
	const done = week.filter((session) => session.done).length
	const next = plannedSessions[0]!
	const latest = weightSeries.at(-1)!
	const one = (value: number) => value.toFixed(1)
</script>

{#snippet thisWeek()}
	<WidgetRows
		rows={week.map((session) => ({
			id: session.id,
			text: session.title,
			note: dayLabel(session.day).slice(0, 3),
			meta: session.done ? 'Done' : 'Planned',
		}))}
	/>
	<p class="foot">{done} of {week.length} done</p>
{/snippet}

{#snippet streak()}
	<Stat value={String(trainingStreak)} unit="sessions" />
{/snippet}

{#snippet nextSession()}
	<p class="line">{next.title}</p>
	<p class="meta">{dayLabel(next.day).slice(0, 3)} · {next.time}</p>
{/snippet}

{#snippet weightTrend()}
	<Stat value={one(latest)} unit="kg" />
	<Sparkline
		values={weightSeries}
		reference={weightAverage}
		labels={weightDays.map((day) => dayLabel(day).slice(4))}
		format={(value) => `${one(value)} kg`}
		width={360}
		height={48}
		label="Weight over 14 days, latest {one(latest)} kg, seven-day average {one(weightAverage)}"
		referenceLabel="7-day average"
	/>
	<p class="meta">Goal {one(weightGoal)} kg by {dayLabel(weightGoalBy).slice(4)}</p>
{/snippet}

<WidgetGrid>
	<Widget
		title="This week"
		icon={domainGlyph('fitness')}
		domain="Vigor"
		size="m"
		empty="Plan a session or log a workout to see your week."
		action={empty ? undefined : { label: 'Open history', onclick: () => onopen?.('this-week-training') }}
		children={empty ? undefined : thisWeek}
	/>
	<Widget
		title="Streak"
		icon={domainGlyph('fitness')}
		domain="Vigor"
		size="s"
		empty="Log a workout to start a streak."
		action={empty ? undefined : { label: 'Open history', onclick: () => onopen?.('streak') }}
		children={empty ? undefined : streak}
	/>
	<Widget
		title="Next session"
		icon={domainGlyph('fitness')}
		domain="Vigor"
		size="s"
		empty="Plan a session from a template."
		action={empty ? undefined : { label: 'Open workouts', onclick: () => onopen?.('next-session') }}
		children={empty ? undefined : nextSession}
	/>
	<Widget
		title="Weight trend"
		icon={domainGlyph('fitness')}
		domain="Vigor"
		size="m"
		empty="Log a weight to start the trend."
		action={empty ? undefined : { label: 'Open body', onclick: () => onopen?.('weight-trend') }}
		children={empty ? undefined : weightTrend}
	/>
</WidgetGrid>

<style>
	.foot,
	.meta {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.line {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
</style>
