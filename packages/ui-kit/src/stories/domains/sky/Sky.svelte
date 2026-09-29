<script lang="ts">
	// The Sky view (product/domains/weather.md, "Surfaces"): now, the next hours, the week, sun and moon, the one active
	// alert, and a location switcher over home and the saved venues. The header's glyph is live: it follows the
	// current condition and turns to a moon after sunset. Offline, an InlineError names the last good forecast and the
	// status bar carries the banner; the numbers stay, since a mirror is still worth reading.
	import {
		Banner,
		Chip,
		InlineError,
		List,
		Menu,
		PageHeader,
		SkyGlyph,
		Stat,
		iconFor,
		type ListRowData,
		type MenuItem,
		type SkyCondition,
	} from '$lib/index.js'
	import type { StatusBarBanner } from '$lib/components/StatusBar/StatusBar.svelte'
	import AppFrame from '../_frame/AppFrame.svelte'
	import { sidebar, skyHours, skyToday, skyWeek } from '../../sample-data.js'

	type Props = {
		/** No provider reachable: the InlineError and the status-bar banner, the last good forecast still shown. */
		offline?: boolean
		/** After sunset: the glyph turns to a moon and the now block reads the evening. */
		night?: boolean
		onretry?: () => void | Promise<unknown>
		onlocation?: (item: MenuItem) => void
		onopentoday?: () => void
		onnavigate?: (id: string) => void
	}
	let { offline = false, night = false, onretry, onlocation, onopentoday, onnavigate }: Props = $props()

	const uid = $props.id()
	const sky = sidebar.items.find((entry) => entry.id === 'weather')!
	const DAYS: Record<string, string> = {
		Mon: 'Monday',
		Tue: 'Tuesday',
		Wed: 'Wednesday',
		Thu: 'Thursday',
		Fri: 'Friday',
		Sat: 'Saturday',
		Sun: 'Sunday',
	}
	const CONDITION: Record<SkyCondition, string> = {
		sunny: 'Sunny',
		'partly-cloudy': 'Partly cloudy',
		cloudy: 'Cloudy',
		fog: 'Fog',
		drizzle: 'Drizzle',
		rain: 'Rain',
		thunderstorm: 'Thunderstorm',
		snow: 'Snow',
		hail: 'Hail',
		wind: 'Windy',
		tornado: 'Tornado',
	}
	const places: MenuItem[] = [
		{ id: 'home', label: 'Home · Hyde Park', icon: 'house' },
		{ id: 'gym', label: 'Castle Hill Fitness', icon: 'map-pin' },
		{ id: 'cosmic', label: 'Cosmic Coffee', icon: 'map-pin' },
		{ id: 'zilker', label: 'Zilker Park', icon: 'map-pin' },
	]
	const todayIndex = 2
	const today = skyWeek[todayIndex]!
	const alert = 'Showers from 16:00. Your 17:30 session may get wet.'
	/** The scrolling strip's name: a scroll region is a tab stop, and a tab stop needs a name. */
	const HOURS_STRIP = 'Hourly forecast'

	/** Now: 07:40 reads the first hour of the strip; after sunset the evening's last one under a clear sky. */
	const condition = $derived<SkyCondition>(night ? 'sunny' : skyHours[0]!.condition)
	const temp = $derived(night ? skyHours[skyHours.length - 1]!.temp : skyHours[0]!.temp)
	const label = $derived(night ? 'Clear night' : CONDITION[condition])
	const banner = $derived<StatusBarBanner | undefined>(
		offline ? { message: `Offline. Showing the forecast from ${skyToday.lastGood}.` } : undefined
	)
	const week = $derived<ListRowData[]>(
		skyWeek.map((day, i) => ({
			id: day.day,
			primary: i === todayIndex ? `${DAYS[day.day]}, today` : DAYS[day.day]!,
			secondary: day.note ? `${CONDITION[day.condition]}, ${day.note}` : CONDITION[day.condition],
			icon: iconFor(day.condition),
			meta: `${day.hi}° / ${day.lo}°`,
			metaWarn: i === todayIndex,
		}))
	)

	let anchor = $state<HTMLElement>()
	let open = $state(false)
</script>

<AppFrame current="weather" {banner} {onnavigate}>
	{#snippet children(platform)}
		<div class="page">
			<PageHeader name={sky.name} subtitle={sky.subtitle} icon={iconFor(condition, night)}>
				{#snippet filters()}
					<span class="anchor" bind:this={anchor}>
						<Chip
							label={places[0]!.label}
							icon="map-pin"
							tone="outline"
							aria-haspopup="menu"
							aria-expanded={open}
							onclick={() => (open = !open)}
						/>
					</span>
					<Menu bind:open {anchor} align="start" label="Location" items={places} onselect={onlocation} />
				{/snippet}
			</PageHeader>

			<div class={['body', { 'body-wide': platform === 'desktop' }]}>
				{#if offline}
					<div class="area-error">
						<InlineError
							message="Couldn't reach Open-Meteo."
							lastGood="Showing the forecast from {skyToday.lastGood}."
							{onretry}
						/>
					</div>
				{/if}

				<section class="now card" aria-labelledby="{uid}-now">
					<h2 class="section-title" id="{uid}-now">Now</h2>
					<div class="now-row">
						<SkyGlyph {condition} {night} size="lg" class="now-glyph" />
						<div class="now-text">
							<Stat value="{temp}°" unit={label} />
							<p class="now-line">
								<span class="mono">H {today.hi}°</span>
								<span class="mono">L {today.lo}°</span>
								{#if today.note}<span>{today.note}</span>{/if}
							</p>
						</div>
					</div>
					<p class="voice">Good day for {skyToday.goodFor}.</p>
				</section>

				<div class="alert">
					<Banner tone="warning" message={alert} action={{ label: 'Open Today', onclick: onopentoday }} />
				</div>

				<section class="hours" aria-labelledby="{uid}-hours">
					<h2 class="section-title" id="{uid}-hours">Hours</h2>
					<!-- a scroll region is a tab stop so the keyboard reaches what it hides (axe scrollable-region-focusable) -->
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<ol class="hours-list" tabindex="0" aria-label={HOURS_STRIP}>
						{#each skyHours as hour (hour.id)}
							<li class="hour" class:hour-wet={hour.precip >= 50}>
								<span class="hour-time">{hour.time}</span>
								<SkyGlyph condition={hour.condition} size="md" class="hour-glyph" />
								<span class="mono">{hour.temp}°</span>
								<span class="hour-precip">{hour.precip} %</span>
							</li>
						{/each}
					</ol>
				</section>

				<div class="week">
					<List header="This week" rows={week} />
				</div>

				<section class="sun card" aria-labelledby="{uid}-sun">
					<h2 class="section-title" id="{uid}-sun">Sun and moon</h2>
					<dl class="fields">
						<dt>Sunrise</dt>
						<dd class="mono">{skyToday.sunrise}</dd>
						<dt>Sunset</dt>
						<dd class="mono">{skyToday.sunset}</dd>
						<dt>Golden hour</dt>
						<dd class="mono">{skyToday.goldenHour}</dd>
						<dt>Moon</dt>
						<dd>{skyToday.moon}</dd>
					</dl>
				</section>
			</div>
		</div>
	{/snippet}
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.anchor {
		display: inline-flex;
	}
	/* One column on the phone; on desktop the forecast on the left, the alert and the light on the right */
	.body {
		display: grid;
		grid-template-areas: 'error' 'now' 'alert' 'hours' 'week' 'sun';
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.body-wide {
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		grid-template-areas: 'error error' 'now alert' 'hours sun' 'week sun' 'week .';
		gap: var(--space-6);
		align-items: start;
	}
	.area-error {
		grid-area: error;
	}
	.now {
		grid-area: now;
	}
	.alert {
		grid-area: alert;
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
	/* The alert reads whole: the strip wraps its sentence rather than trimming it */
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
	/* Now: the glyph large beside the temperature, the day's range and note beneath it */
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
	.voice {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
	}
	.mono {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
	}

	/* Hours: one row of cells that scrolls sideways, a tab stop with a name so the keyboard reaches what it hides */
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
