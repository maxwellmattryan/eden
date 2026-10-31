<script lang="ts">
	// The this-week-training tile (Domains/Vigor/Widgets): this calendar week's sessions from the week start, each with
	// its day, its title and whether it is done or planned, and how many of them are done.
	import { WidgetRows } from '@eden/ui-kit'
	import { formatWeekdayOf } from '../../../dates/index.js'
	import { locale, t } from '../../../i18n/index.js'
	import { fitness } from '../store.svelte.js'

	const lang = $derived($locale ?? 'en')
	const rows = $derived(
		fitness.thisWeek.sessions.map((session) => ({
			id: session.id,
			text: session.title,
			note: formatWeekdayOf(session.day, lang, 'short'),
			meta: session.done ? $t('domains.fitness.widgets.done') : $t('domains.fitness.widgets.planned'),
		}))
	)
</script>

<WidgetRows {rows} />
<p class="foot">
	{$t('domains.fitness.widgets.weekDone', {
		values: { done: fitness.thisWeek.done, total: fitness.thisWeek.total },
	})}
</p>

<style>
	.foot {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
