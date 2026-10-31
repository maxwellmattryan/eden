<script lang="ts">
	// The next-session tile (Domains/Vigor/Widgets): the next planned session still to come, its title, day and time.
	import { formatTime, formatWeekdayOf } from '../../../dates/index.js'
	import { locale } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { dayOf } from '../progress.js'
	import { fitness } from '../store.svelte.js'

	const format = $derived({ lang: $locale ?? 'en', clock: settings.clock })
</script>

{#if fitness.next}
	<p class="line">{fitness.next.title}</p>
	<p class="meta">
		{formatWeekdayOf(dayOf(fitness.next.startAt), format.lang, 'short')} · {formatTime(fitness.next.startAt, format)}
	</p>
{/if}

<style>
	.line {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.meta {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
