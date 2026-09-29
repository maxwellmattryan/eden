<script lang="ts">
	// The Sky view (product/domains/weather.md, "Surfaces"), ported from Domains/Sky/Sky: now, the next hours as a
	// strip that scrolls sideways, the details, the calendar week from the owner's week start (D-58), the air quality
	// and the allergens (D-59), sun and moon, the active alerts, the sources' attribution, and the location chip over
	// home. The header's glyph is live. Every time is the place's, on the owner's clock. The page is the same whatever
	// the provider (D-56): the attribution follows it, and a note says so when the chosen one could not answer.
	// Offline, an InlineError names the last good forecast and the status bar carries the banner; the numbers stay,
	// since a mirror is still worth reading.
	import {
		Badge,
		Banner,
		Button,
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
		type BadgeKind,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { formatHour, formatTime, formatWeekdayOf } from '@eden/shared/dates'
	import {
		airCategory,
		compass,
		conditionLabel,
		distance,
		pressure,
		providerFor,
		rainfall,
		speed,
		uvCategory,
		weather,
		type AirCategory,
		type AllergenLevel,
		type Measure,
	} from '@eden/shared/weather'

	const uid = $props.id()
	const s = useStrings()
	const lang = $derived($locale ?? 'en')
	/** Sky's times are the place's, on the owner's clock (D-58). */
	const format = $derived({ lang, clock: settings.clock, timeZone: weather.timeZone })

	const places = $derived<MenuItem[]>([
		{ id: 'home', label: $t('domains.weather.home', { values: { label: settings.home.label } }), icon: 'house' },
	])
	let anchor = $state<HTMLElement>()
	let open = $state(false)

	/** The kinds that say "take care" in words and colour; the others stay quiet. */
	const AIR_KIND: Record<AirCategory, BadgeKind> = {
		good: 'neutral',
		moderate: 'neutral',
		sensitive: 'danger',
		unhealthy: 'danger',
		'very-unhealthy': 'danger',
		hazardous: 'danger',
	}
	const LEVEL_KIND: Record<AllergenLevel, BadgeKind> = {
		none: 'neutral',
		low: 'neutral',
		moderate: 'neutral',
		high: 'danger',
		'very-high': 'danger',
	}

	const degrees = (celsius: number) =>
		$t('domains.weather.value.degrees', { values: { value: weather.temperature(celsius) } })
	const percent = (value: number) => $t('domains.weather.value.percent', { values: { value: Math.round(value) } })
	const measure = ({ value, unit }: Measure) =>
		$t('domains.weather.value.measure', { values: { value, unit: $t(`domains.weather.units.${unit}`) } })

	const now = $derived(weather.now)
	const today = $derived(weather.today)
	const headerIcon = $derived(now ? iconFor(now.condition, now.night) : iconFor('partly-cloudy'))
	const lastGood = $derived(weather.lastGood ? formatTime(weather.lastGood, format) : undefined)
	const week = $derived<ListRowData[]>(
		weather.week.map(({ date, today, day }) => {
			const weekday = formatWeekdayOf(date, lang)
			return {
				id: date,
				primary: today ? $t('domains.weather.today', { values: { day: weekday } }) : weekday,
				secondary: day ? conditionLabel(s, day.condition, false) : $t('domains.weather.noData'),
				badges: day?.observed ? [{ kind: 'neutral' as const, label: $t('domains.weather.observed') }] : undefined,
				icon: day ? iconFor(day.condition) : undefined,
				meta: day ? `${weather.temperature(day.hi)}° / ${weather.temperature(day.lo)}°` : undefined,
				metaWarn: today,
			}
		})
	)
	const details = $derived.by(() => {
		if (!now) return []
		const wind = speed(now.windSpeed, settings.measurement)
		const uv = today?.uvMax ?? now.uv
		return [
			{ id: 'feels', label: $t('domains.weather.details.feelsLike'), value: degrees(now.feelsLike) },
			{ id: 'humidity', label: $t('domains.weather.details.humidity'), value: percent(now.humidity) },
			{ id: 'dew', label: $t('domains.weather.details.dewPoint'), value: degrees(now.dewPoint) },
			{
				id: 'wind',
				label: $t('domains.weather.details.wind'),
				value: $t('domains.weather.value.wind', {
					values: {
						value: wind.value,
						unit: $t(`domains.weather.units.${wind.unit}`),
						direction: $t(`domains.weather.compass.${compass(now.windDirection)}`),
					},
				}),
			},
			{
				id: 'gust',
				label: $t('domains.weather.details.gusts'),
				value: measure(speed(now.windGust, settings.measurement)),
			},
			{
				id: 'uv',
				label: $t('domains.weather.details.uv'),
				value: String(Math.round(uv)),
				note: $t(`domains.weather.uvCategory.${uvCategory(uv)}`),
			},
			{
				id: 'rain',
				label: $t('domains.weather.details.rainfall'),
				value: measure(rainfall(today?.precipAmount ?? now.precipitation, settings.measurement)),
			},
			{ id: 'cloud', label: $t('domains.weather.details.cloudCover'), value: percent(now.cloudCover) },
			{
				id: 'pressure',
				label: $t('domains.weather.details.pressure'),
				value: measure(pressure(now.pressure, settings.measurement)),
			},
			{
				id: 'visibility',
				label: $t('domains.weather.details.visibility'),
				value: measure(distance(now.visibility, settings.measurement)),
			},
		]
	})

	const air = $derived(weather.airQuality)
	/** The US index where there is one, the European otherwise. */
	const airIndex = $derived(
		air.data?.usAqi != null
			? { value: air.data.usAqi, unit: $t('domains.weather.airQuality.usAqi'), category: airCategory(air.data.usAqi) }
			: air.data?.europeanAqi != null
				? { value: air.data.europeanAqi, unit: $t('domains.weather.airQuality.europeanAqi'), category: undefined }
				: undefined
	)
	const pollutants = $derived(
		(['pm25', 'pm10', 'ozone', 'no2'] as const).flatMap((id) => {
			const value = air.data?.[id]
			return value == null ? [] : [{ id, label: $t(`domains.weather.airQuality.${id}`), value }]
		})
	)
	const allergens = $derived(weather.allergens)
	const attribution = $derived(weather.attribution)
	const mark = $derived(attribution?.mark?.[settings.resolvedTheme])
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
					message={$t('domains.weather.offline.message', { values: { provider: weather.providerName } })}
					lastGood={lastGood ? $t('domains.weather.offline.lastGood', { values: { time: lastGood } }) : undefined}
					onretry={() => weather.refresh()}
				/>
			</div>
		{/if}
		{#if weather.fallbackFrom && attribution}
			<div class="area-fallback">
				<Banner
					tone="info"
					message={$t('domains.weather.fallback', {
						values: { provider: providerFor(weather.fallbackFrom).name, fallback: attribution.name },
					})}
					action={{ label: s.retry, onclick: () => void weather.refresh() }}
				/>
			</div>
		{/if}

		{#if now}
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
					{#each weather.hours as hour (hour.time)}
						<li class="hour" class:hour-wet={hour.precipChance >= 50}>
							<span class="hour-time">{formatHour(hour.time, format)}</span>
							<SkyGlyph condition={hour.condition} night={hour.night} size="md" class="hour-glyph" />
							<span class="mono">{weather.temperature(hour.temp)}°</span>
							<span class="hour-precip">{$t('domains.weather.precip', { values: { value: hour.precipChance } })}</span>
						</li>
					{/each}
				</ol>
			</section>

			<section class="details card" aria-labelledby="{uid}-details">
				<h2 class="section-title" id="{uid}-details">{$t('domains.weather.details.title')}</h2>
				<dl class="tiles">
					{#each details as detail (detail.id)}
						<div class="tile">
							<dt>{detail.label}</dt>
							<dd>
								<span class="mono">{detail.value}</span>
								{#if detail.note}<span class="tile-note">{detail.note}</span>{/if}
							</dd>
						</div>
					{/each}
				</dl>
			</section>

			<div class="week">
				<List header={$t('domains.weather.week')} rows={week} />
			</div>

			<section class="air card" aria-labelledby="{uid}-air">
				<h2 class="section-title" id="{uid}-air">{$t('domains.weather.airQuality.title')}</h2>
				{#if airIndex}
					<div class="air-row">
						<Stat value={String(Math.round(airIndex.value))} unit={airIndex.unit} />
						{#if airIndex.category}
							<Badge
								kind={AIR_KIND[airIndex.category]}
								label={$t(`domains.weather.airQuality.category.${airIndex.category}`)}
							/>
						{/if}
					</div>
					<dl class="fields">
						{#each pollutants as pollutant (pollutant.id)}
							<dt>{pollutant.label}</dt>
							<dd class="mono">
								{$t('domains.weather.value.concentration', { values: { value: pollutant.value } })}
							</dd>
						{/each}
					</dl>
				{:else if air.status === 'failed'}
					<p class="quiet">{$t('domains.weather.airQuality.failed', { values: { source: air.source ?? '' } })}</p>
				{:else}
					<p class="quiet">{$t('domains.weather.airQuality.unavailable')}</p>
				{/if}
			</section>

			<section class="allergens card" aria-labelledby="{uid}-allergens">
				<h2 class="section-title" id="{uid}-allergens">{$t('domains.weather.allergens.title')}</h2>
				{#if allergens.data}
					<dl class="fields">
						{#each allergens.data.items as allergen (allergen.kind)}
							<dt>{$t(`domains.weather.allergens.kind.${allergen.kind}`)}</dt>
							<dd>
								<Badge
									kind={LEVEL_KIND[allergen.level]}
									label={$t(`domains.weather.allergens.level.${allergen.level}`)}
								/>
							</dd>
						{/each}
					</dl>
				{:else if allergens.status === 'failed'}
					<p class="quiet">
						{$t('domains.weather.allergens.failed', { values: { source: allergens.source ?? '' } })}
					</p>
				{:else}
					<p class="quiet">{$t('domains.weather.allergens.unavailable')}</p>
				{/if}
			</section>

			{#if weather.sun}
				<section class="sun card" aria-labelledby="{uid}-sun">
					<h2 class="section-title" id="{uid}-sun">{$t('domains.weather.sunAndMoon')}</h2>
					<dl class="fields">
						<dt>{$t('domains.weather.sunrise')}</dt>
						<dd class="mono">{formatTime(weather.sun.sunrise, format)}</dd>
						<dt>{$t('domains.weather.sunset')}</dt>
						<dd class="mono">{formatTime(weather.sun.sunset, format)}</dd>
						<dt>{$t('domains.weather.goldenHour')}</dt>
						<dd class="mono">{formatTime(weather.sun.goldenHour, format)}</dd>
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
			{/if}

			{#if attribution}
				<footer class="sources" aria-label={$t('domains.weather.sources.label')}>
					{#if mark}
						<!-- a provider's own mark and legal link, where its terms require them (Apple's, D-57) -->
						<img class="sources-mark" src={mark} alt={attribution.name} />
					{:else}
						<p class="sources-line">{$t('domains.weather.sources.forecast', { values: { name: attribution.name } })}</p>
					{/if}
					{#if mark && attribution.legalUrl}
						{@const legal = attribution.legalUrl}
						<Button
							variant="quiet"
							size="md"
							label={$t('domains.weather.sources.legal')}
							iconRight="external-link"
							onclick={() => void openExternal(legal)}
						/>
					{/if}
					{#if air.status === 'ok' && air.source}
						<p class="sources-line">{$t('domains.weather.sources.airQuality', { values: { name: air.source } })}</p>
					{/if}
					{#if allergens.status === 'ok' && allergens.source}
						<p class="sources-line">
							{$t('domains.weather.sources.allergens', { values: { name: allergens.source } })}
						</p>
					{/if}
					{#if weather.alerts.length}
						<p class="sources-line">{$t('domains.weather.sources.alerts')}</p>
					{/if}
				</footer>
			{/if}
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
	/* The forecast on the left; the alerts, the light, the air and the allergens on the right */
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		grid-template-areas:
			'error error'
			'fallback fallback'
			'now alert'
			'hours sun'
			'details air'
			'week allergens'
			'sources sources';
		gap: var(--space-6);
		align-items: start;
		padding: 0 var(--ed-gutter);
	}
	.area-error {
		grid-area: error;
	}
	.area-fallback {
		grid-area: fallback;
		min-width: 0;
	}
	.details {
		grid-area: details;
	}
	.air {
		grid-area: air;
	}
	.allergens {
		grid-area: allergens;
	}
	.sources {
		grid-area: sources;
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
	/* An alert and the note read whole: the strip wraps its sentence rather than trimming it */
	.alert :global(.ed-banner-inline),
	.area-fallback :global(.ed-banner-inline) {
		display: flex;
		width: 100%;
		padding-block: var(--space-1);
	}
	.alert :global(.ed-banner-message),
	.area-fallback :global(.ed-banner-message) {
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

	/* Details: tiles that fill the row, a label over its figure */
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-8) * 3), 1fr));
		gap: var(--space-4);
		margin: 0;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.tile dt {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.tile dd {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
	}
	.tile-note,
	.quiet,
	.sources-line {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.air-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.sources {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
	}
	.sources-mark {
		height: var(--space-4);
		width: auto;
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
