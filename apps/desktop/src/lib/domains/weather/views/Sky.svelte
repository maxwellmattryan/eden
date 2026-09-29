<script lang="ts">
	// The Sky view (product/domains/weather.md, "Surfaces"), ported from Domains/Sky/Sky: now, the next hours as a
	// strip that scrolls sideways, the week, sun and moon, the active alerts, and the location chip over home. The
	// header's glyph is live. Offline, an InlineError names the last good forecast and the status bar carries the
	// banner; the numbers stay, since a mirror is still worth reading.
	import {
		Banner,
		Chip,
		EmptyState,
		InlineError,
		List,
		Menu,
		PageHeader,
		SkyGlyph,
		Stat,
		iconFor,
		useStrings,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { formatTime, formatWeekday } from '../../dates'
	import { conditionLabel } from '../conditions'
	import { weather } from '../store.svelte'

	const uid = $props.id()
	const s = useStrings()
	const lang = $derived($locale ?? 'en')

	const places = $derived<MenuItem[]>([
		{ id: 'home', label: $t('domains.weather.home', { values: { label: settings.home.label } }), icon: 'house' },
	])
	let anchor = $state<HTMLElement>()
	let open = $state(false)

	const now = $derived(weather.now)
	const headerIcon = $derived(now ? iconFor(now.condition, now.night) : iconFor('partly-cloudy'))
	const lastGood = $derived(weather.lastGood ? formatTime(weather.lastGood, lang) : undefined)
	const week = $derived<ListRowData[]>(
		weather.week.map((day, i) => {
			const weekday = formatWeekday(`${day.date}T12:00:00`, lang)
			return {
				id: day.id,
				primary: i === 0 ? $t('domains.weather.today', { values: { day: weekday } }) : weekday,
				secondary: conditionLabel(s, day.condition, false),
				icon: iconFor(day.condition),
				meta: `${weather.temperature(day.hi)}° / ${weather.temperature(day.lo)}°`,
				metaWarn: i === 0,
			}
		})
	)
</script>

<div class="page">
	<PageHeader name={$t('domains.weather.name')} subtitle={$t('domains.weather.subtitle')} icon={headerIcon}>
		{#snippet filters()}
			<span class="anchor" bind:this={anchor}>
				<Chip
					label={places[0]?.label ?? ''}
					icon="map-pin"
					tone="outline"
					aria-haspopup="menu"
					aria-expanded={open}
					onclick={() => (open = !open)}
				/>
			</span>
			<Menu bind:open {anchor} align="start" label={$t('domains.weather.location')} items={places} />
		{/snippet}
	</PageHeader>

	<div class="body">
		{#if weather.offline}
			<div class="area-error">
				<InlineError
					message={$t('domains.weather.offline.message')}
					lastGood={lastGood ? $t('domains.weather.offline.lastGood', { values: { time: lastGood } }) : undefined}
					onretry={() => weather.refresh()}
				/>
			</div>
		{/if}

		{#if now && weather.sun}
			<section class="now card" aria-labelledby="{uid}-now">
				<h2 class="section-title" id="{uid}-now">{$t('domains.weather.now')}</h2>
				<div class="now-row">
					<SkyGlyph condition={now.condition} night={now.night} size="lg" class="now-glyph" />
					<div class="now-text">
						<Stat value="{weather.temperature(now.temp)}°" unit={conditionLabel(s, now.condition, now.night)} />
						<p class="now-line">
							<span class="mono">{$t('domains.weather.high', { values: { value: weather.temperature(now.hi) } })}</span>
							<span class="mono">{$t('domains.weather.low', { values: { value: weather.temperature(now.lo) } })}</span>
						</p>
					</div>
				</div>
			</section>

			{#if weather.alerts.length}
				<div class="alert">
					{#each weather.alerts as alert (alert.id)}
						<Banner
							tone={alert.severity === 'extreme' || alert.severity === 'severe' ? 'danger' : 'warning'}
							message={alert.headline}
						/>
					{/each}
				</div>
			{/if}

			<section class="hours" aria-labelledby="{uid}-hours">
				<h2 class="section-title" id="{uid}-hours">{$t('domains.weather.hours')}</h2>
				<!-- a scroll region is a tab stop so the keyboard reaches what it hides (axe scrollable-region-focusable) -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<ol class="hours-list" tabindex="0" aria-label={$t('domains.weather.hoursStrip')}>
					{#each weather.hours as hour (hour.id)}
						<li class="hour" class:hour-wet={hour.precip >= 50}>
							<span class="hour-time">{hour.time}</span>
							<SkyGlyph condition={hour.condition} night={hour.night} size="md" class="hour-glyph" />
							<span class="mono">{weather.temperature(hour.temp)}°</span>
							<span class="hour-precip">{$t('domains.weather.precip', { values: { value: hour.precip } })}</span>
						</li>
					{/each}
				</ol>
			</section>

			<div class="week">
				<List header={$t('domains.weather.week')} rows={week} />
			</div>

			<section class="sun card" aria-labelledby="{uid}-sun">
				<h2 class="section-title" id="{uid}-sun">{$t('domains.weather.sunAndMoon')}</h2>
				<dl class="fields">
					<dt>{$t('domains.weather.sunrise')}</dt>
					<dd class="mono">{weather.sun.sunrise}</dd>
					<dt>{$t('domains.weather.sunset')}</dt>
					<dd class="mono">{weather.sun.sunset}</dd>
					<dt>{$t('domains.weather.goldenHour')}</dt>
					<dd class="mono">{weather.sun.goldenHour}</dd>
					<dt>{$t('domains.weather.moon')}</dt>
					<dd>
						{$t('domains.weather.moonLine', {
							values: {
								phase: $t(`domains.weather.moonPhase.${weather.sun.moon.phase}`),
								percent: weather.sun.moon.illumination,
							},
						})}
					</dd>
				</dl>
			</section>
		{:else if weather.ready && !weather.loading}
			<div class="area-empty">
				<EmptyState title={$t('empty.weather.title')} text={$t('empty.weather.text')} />
			</div>
		{/if}
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.anchor {
		display: inline-flex;
	}
	/* The forecast on the left, the alerts and the light on the right */
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		grid-template-areas: 'error error' 'now alert' 'hours sun' 'week sun' 'week .';
		gap: var(--space-6);
		align-items: start;
		padding: 0 var(--ed-gutter);
	}
	.area-error {
		grid-area: error;
	}
	.area-empty {
		grid-column: 1 / -1;
	}
	.now {
		grid-area: now;
	}
	.alert {
		grid-area: alert;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.hours {
		grid-area: hours;
		min-width: 0;
	}
	.week {
		grid-area: week;
	}
	.sun {
		grid-area: sun;
	}
	/* An alert reads whole: the strip wraps its sentence rather than trimming it */
	.alert :global(.ed-banner-inline) {
		display: flex;
		width: 100%;
		padding-block: var(--space-1);
	}
	.alert :global(.ed-banner-message) {
		white-space: normal;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		box-sizing: border-box;
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.section-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
		color: var(--text-secondary);
	}
	/* Now: the glyph large beside the temperature, the day's range beneath it */
	.now-row {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}
	.now :global(.now-glyph) {
		width: calc(var(--space-8) * 2);
		height: calc(var(--space-8) * 2);
		flex: none;
		color: var(--text-secondary);
	}
	.now-text {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.now-line {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		color: var(--text-secondary);
	}
	.mono {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
	}

	/* Hours: one row that scrolls sideways, a tab stop with a name so the keyboard reaches it */
	.hours {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.hours-list {
		display: flex;
		gap: var(--space-2);
		margin: 0;
		padding: 0 0 var(--space-1);
		list-style: none;
		overflow-x: auto;
		scroll-snap-type: x proximity;
		scrollbar-width: thin;
	}
	.hours-list:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
		border-radius: var(--ed-radius-control);
	}
	.hour {
		display: flex;
		flex: 0 0 calc(var(--space-8) + var(--space-6));
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		box-sizing: border-box;
		min-width: 0;
		padding: var(--space-2) var(--space-1);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-control);
		background: var(--surface-1);
		scroll-snap-align: start;
	}
	.hour-wet {
		background: var(--surface-2);
	}
	.hour :global(.hour-glyph) {
		color: var(--text-secondary);
	}
	.hour-time,
	.hour-precip {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}

	.fields {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-2) var(--space-4);
		align-items: baseline;
		margin: 0;
	}
	.fields dt {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.fields dd {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
</style>
