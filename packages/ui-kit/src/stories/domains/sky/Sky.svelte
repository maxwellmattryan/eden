<script lang="ts">
	// The Sky view (product/domains/weather.md, "Surfaces"): now, the next hours, the details, the calendar week, the
	// air and the allergens, sun and moon, the one active alert, and a location switcher over home and the saved
	// venues. The header's glyph is live: it follows the current condition and turns to a moon after sunset. Offline,
	// an InlineError names the last good forecast and the status bar carries the banner; the numbers stay, since a
	// mirror is still worth reading. The page is the same whatever the provider (D-56): only the attribution line and,
	// when the chosen provider failed, the fallback note differ.
	import {
		Badge,
		Banner,
		Breeze,
		Button,
		Chip,
		Field,
		Icon,
		IconButton,
		InlineError,
		LevelScale,
		Menu,
		MoonGlyph,
		Notice,
		PageHeader,
		Popover,
		Sheet,
		Sketch,
		SkyGlyph,
		Stat,
		SunArc,
		TrendChart,
		iconFor,
		skyField,
		type BadgeLevel,
		type IconName,
		type MenuItem,
		type SkyCondition,
	} from '$lib/index.js'
	import type { StatusBarBanner } from '$lib/components/StatusBar/StatusBar.svelte'
	import AppFrame from '../_frame/AppFrame.svelte'
	import {
		sidebar,
		skyAirQuality,
		skyAllergens,
		skyDetails,
		skyHours,
		skyMotif,
		skyPlaceResults,
		skySundayBefore,
		skyToday,
		skyWeek,
		skyWeekDetail,
		type SkyAirCategory,
		type SkyAllergenLevel,
	} from '../../sample-data.js'

	type Props = {
		/** No provider reachable: the InlineError and the status-bar banner, the last good forecast still shown. */
		offline?: boolean
		/** After sunset: the glyph turns to a moon and the now block reads the evening. */
		night?: boolean
		/** The day the week starts on (D-58): the rows run from it, seven of them, today marked wherever it falls. */
		weekStart?: 'monday' | 'sunday'
		/** The clock every time on the page is written on (D-58). */
		clock?: '24h' | '12h'
		/** The forecast provider (D-56): it changes the attribution line and nothing else. */
		provider?: 'open-meteo' | 'weatherkit'
		/** The chosen provider could not answer and Open-Meteo stood in (D-57): a note above the forecast. */
		fallback?: boolean
		/** No allergen source covers the place (D-59): the block says so rather than disappearing. */
		allergens?: 'available' | 'unavailable'
		/** The change-location sheet is open: a search, its results, and the choice that becomes home. */
		locating?: boolean
		/** The alerts' popover is open: the one active alert, behind its button in the header. */
		alerting?: boolean
		onplace?: (id: string) => void
		onsources?: () => void
		onretry?: () => void | Promise<unknown>
		onlocation?: (item: MenuItem) => void
		onopentoday?: () => void
		ondismiss?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		offline = false,
		night = false,
		weekStart = 'monday',
		clock = '24h',
		provider = 'open-meteo',
		fallback = false,
		allergens = 'available',
		locating = false,
		alerting = false,
		onplace,
		onsources,
		onretry,
		onlocation,
		onopentoday,
		ondismiss,
		onnavigate,
	}: Props = $props()

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
		{ id: 'change', label: 'Change home…', icon: 'search' },
	]
	const AQI_STOPS = [50, 100, 150, 200, 300, 500]
	const HOURS_HINT = 'The percentage is the chance of rain or snow falling here during that hour.'
	const AQI_HINT =
		'The US index runs from 0 to 500 and follows whichever pollutant is worst. Up to 50 is good; above 100, sensitive groups should take care.'
	const PROVIDER = { 'open-meteo': 'Open-Meteo', weatherkit: 'Apple Weather' } as const
	/** Each category's word and its step on the six-step scale: the dot's colour beside the word. */
	const AIR: Record<SkyAirCategory, { label: string; level: BadgeLevel }> = {
		good: { label: 'Good', level: 1 },
		moderate: { label: 'Moderate', level: 2 },
		sensitive: { label: 'Unhealthy for sensitive groups', level: 3 },
		unhealthy: { label: 'Unhealthy', level: 4 },
		'very-unhealthy': { label: 'Very unhealthy', level: 5 },
		hazardous: { label: 'Hazardous', level: 6 },
	}
	const LEVEL: Record<SkyAllergenLevel, { label: string; level: BadgeLevel }> = {
		none: { label: 'None', level: 1 },
		low: { label: 'Low', level: 1 },
		moderate: { label: 'Moderate', level: 2 },
		high: { label: 'High', level: 3 },
		'very-high': { label: 'Very high', level: 4 },
	}
	/** Wednesday, wherever the week start puts it. */
	const TODAY = 'Wed'
	const today = skyWeek.find((day) => day.day === TODAY)!
	/** The scrolling strip's name: a scroll region is a tab stop, and a tab stop needs a name. */
	const HOURS_STRIP = 'Hourly forecast'

	/** A sample time (`HH:MM`) on the owner's clock; a strip's hour drops its minutes on the 12-hour clock. */
	function onClock(time: string, short = false): string {
		if (clock === '24h') return time
		const [hour = 0, minute = 0] = time.split(':').map(Number)
		const suffix = hour < 12 ? 'AM' : 'PM'
		const h = hour % 12 === 0 ? 12 : hour % 12
		return short ? `${h} ${suffix}` : `${h}:${String(minute).padStart(2, '0')} ${suffix}`
	}

	const alert = $derived({
		title: `Showers from ${onClock('16:00', true)}`,
		detail: `Your ${onClock('17:30')} session may get wet.`,
	})
	/** Now: 07:40 reads the first hour of the strip; after sunset the evening's last one under a clear sky. */
	const condition = $derived<SkyCondition>(night ? 'sunny' : skyHours[0]!.condition)
	const temp = $derived(night ? skyHours[skyHours.length - 1]!.temp : skyHours[0]!.temp)
	const label = $derived(night ? 'Clear night' : CONDITION[condition])
	const banner = $derived<StatusBarBanner | undefined>(
		offline ? { message: `Offline. Showing the forecast from ${onClock(skyToday.lastGood)}.` } : undefined
	)
	/** The calendar week from the start day: Monday to Sunday, or the Sunday before to Saturday. */
	const days = $derived(weekStart === 'sunday' ? [skySundayBefore, ...skyWeek.slice(0, 6)] : skyWeek)
	const todayIndex = $derived(days.findIndex((day) => day.day === TODAY))
	/** Each day of the calendar week with everything the forecast says of it. */
	const week = $derived(
		days.map((day, i) => {
			const detail = skyWeekDetail[day === skySundayBefore ? 'SunBefore' : day.day]!
			return {
				id: `${i}-${day.day}`,
				name: day.day,
				full: DAYS[day.day]!,
				date: detail.date.slice(3),
				today: i === todayIndex,
				observed: i < todayIndex,
				condition: day.condition,
				label: CONDITION[day.condition],
				hi: day.hi,
				lo: day.lo,
				facts: [
					{
						id: 'rain',
						icon: 'umbrella' as const,
						name: 'Rain',
						// a day that has passed has no chance left to give, only what fell
						value: i < todayIndex ? `${detail.rain} mm` : `${detail.precip} % · ${detail.rain} mm`,
					},
					{ id: 'uv', icon: 'sun' as const, name: 'Highest UV index', value: `UV ${detail.uv}` },
					{ id: 'wind', icon: 'wind' as const, name: 'Strongest wind', value: `${detail.wind} km/h` },
					{
						id: 'light',
						icon: 'sunrise' as const,
						name: 'Sunrise and sunset',
						value: `${onClock(detail.sunrise)} – ${onClock(detail.sunset)}`,
					},
				],
			}
		})
	)
	interface Detail {
		id: string
		label: string
		icon: IconName
		value: string
		/** What the figure is measured in, beside it and quieter. */
		unit?: string
		/** A level's word and step beside the figure: the UV index's category. */
		level?: { label: string; level: BadgeLevel }
		/** What the figure is, in a sentence: the hint beside the label. */
		hint?: string
	}
	const details = $derived<Detail[]>([
		{
			id: 'feels',
			label: 'Feels like',
			icon: 'thermometer',
			value: `${skyDetails.feelsLike}°`,
			hint: 'What the air feels like on skin. Wind strips heat away and humid air slows sweat from evaporating, so it can differ from the thermometer.',
		},
		{
			id: 'humidity',
			label: 'Humidity',
			icon: 'droplets',
			value: `${skyDetails.humidity}`,
			unit: '%',
			hint: 'Relative humidity: the water vapour in the air as a percentage of the most it can hold at this temperature. Warm air can hold more, so the same percentage means more moisture on a hot day.',
		},
		{
			id: 'dew',
			label: 'Dew point',
			icon: 'droplet',
			value: `${skyDetails.dewPoint}°`,
			hint: 'A temperature, not a percentage: cool the air to this point and its moisture condenses into dew. It measures the moisture actually in the air. From about 18 °C (65 °F) the air feels muggy.',
		},
		{
			id: 'wind',
			label: 'Wind',
			icon: 'wind',
			value: `${skyDetails.wind}`,
			unit: `km/h ${skyDetails.windFrom}`,
			hint: 'The sustained speed, and the direction the wind blows from: a south wind comes from the south.',
		},
		{
			id: 'gust',
			label: 'Gusts',
			icon: 'wind',
			value: `${skyDetails.gust}`,
			unit: 'km/h',
			hint: 'Short bursts above the sustained speed, lasting a few seconds. They are often strongest around showers and thunderstorms.',
		},
		{
			id: 'uv',
			label: 'UV index',
			icon: 'sun',
			value: `${skyDetails.uv}`,
			level: { label: 'High', level: 3 },
			hint: 'The strength of the sun\u2019s skin-burning ultraviolet light at today\u2019s peak, on the World Health Organization\u2019s scale. From 3 up, protection is advised. Thin cloud lets most of it through.',
		},
		{
			id: 'rain',
			label: 'Rainfall today',
			icon: 'umbrella',
			value: `${skyDetails.rainfall}`,
			unit: 'mm',
			hint: 'The depth of rain over the whole day. One millimetre is one litre of water on every square metre.',
		},
		{
			id: 'cloud',
			label: 'Cloud cover',
			icon: 'cloud',
			value: `${skyDetails.cloudCover}`,
			unit: '%',
			hint: 'The share of the sky covered by cloud. Clear nights cool faster, because cloud holds in the ground\u2019s heat.',
		},
		{
			id: 'pressure',
			label: 'Pressure',
			icon: 'gauge',
			value: `${skyDetails.pressure}`,
			unit: 'hPa',
			hint: 'The weight of the air above, adjusted to sea level so places at different heights compare. The average is about 1013 hPa (29.92 inHg); falling pressure often brings wind and rain.',
		},
		{
			id: 'visibility',
			label: 'Visibility',
			icon: 'eye',
			value: `${skyDetails.visibility}`,
			unit: 'km',
			hint: 'The farthest distance at which a large dark object can be seen against the sky. Below 1 km (0.6 mi) it counts as fog.',
		},
	])
	const pollutants = [
		{
			id: 'pm25',
			label: 'PM2.5',
			value: skyAirQuality.pm25,
			hint: 'Fine particles under 2.5 micrometres, from smoke and exhaust. Small enough to reach deep into the lungs.',
		},
		{
			id: 'pm10',
			label: 'PM10',
			value: skyAirQuality.pm10,
			hint: 'Particles under 10 micrometres: dust, pollen and mold spores.',
		},
		{
			id: 'ozone',
			label: 'Ozone',
			value: skyAirQuality.ozone,
			hint: 'A gas sunlight makes from pollution. It irritates the airways, most on hot afternoons.',
		},
		{
			id: 'no2',
			label: 'NO₂',
			value: skyAirQuality.no2,
			hint: 'Nitrogen dioxide, mostly from traffic and burning fuel. It irritates the airways.',
		},
	]
	const light = $derived<{ id: string; label: string; icon: IconName; value: string }[]>([
		{ id: 'sunrise', label: 'Sunrise', icon: 'sunrise', value: onClock(skyToday.sunrise) },
		{ id: 'sunset', label: 'Sunset', icon: 'sunset', value: onClock(skyToday.sunset) },
		{ id: 'golden', label: 'Golden hour', icon: 'sun-medium', value: onClock(skyToday.goldenHour) },
	])
	/** Each source with the glyph of what it gives; a source's own mark takes the glyph's place when one is supplied. */
	const sources = $derived<{ id: string; icon: IconName; text: string }[]>([
		...(provider === 'weatherkit' && !fallback
			? []
			: [{ id: 'forecast', icon: 'cloud-sun' as const, text: 'Forecast by Open-Meteo' }]),
		{ id: 'air', icon: 'wind', text: 'Air quality by Open-Meteo and CAMS' },
		{ id: 'alerts', icon: 'triangle-alert', text: 'Alerts by the National Weather Service' },
	])
	/** What the header's motif draws: the morning's wind, or the evening's under a clear sky. */
	const motifParams = $derived(night ? { ...skyMotif, windSpeed: 6, windGust: 9, cloudCover: 0 } : skyMotif)
	/** A sample time (`HH:MM`) on the sample Wednesday, as an instant. */
	const at = (time: string) => {
		const [hour = 0, minute = 0] = time.split(':').map(Number)
		return Date.UTC(2026, 8, 30, hour, minute)
	}
	/** The sun on its day: at 07:40 a little over the horizon, and beneath it in the evening. */
	const sun = $derived({
		sunrise: at(skyToday.sunrise),
		sunset: at(skyToday.sunset),
		now: at(night ? '21:30' : skyToday.lastGood),
		labels: { sunrise: onClock(skyToday.sunrise), sunset: onClock(skyToday.sunset) },
		label: night
			? `The sun set at ${onClock(skyToday.sunset)}.`
			: `The sun is up. It rose at ${onClock(skyToday.sunrise)} and sets at ${onClock(skyToday.sunset)}.`,
	})
	const temps = skyHours.map((hour) => hour.temp)
	const trendLabel = $derived(
		`Temperature from ${onClock(skyHours[0]!.time, true)} to ${onClock(skyHours.at(-1)!.time, true)}, between ${Math.min(...temps)}° and ${Math.max(...temps)}°`
	)

	let anchor = $state<HTMLElement>()
	let open = $state(false)
	// svelte-ignore state_referenced_locally
	let finding = $state(locating)
	let alertsAnchor = $state<HTMLElement>()
	// svelte-ignore state_referenced_locally
	let alertsOpen = $state(alerting)
	// The owner has dismissed the one alert: the panel closes, and the button leaves with the Breeze beside it.
	let buttonLeaving = $state(false)
	let dismissed = $state(false)

	function dismiss() {
		alertsOpen = false
		buttonLeaving = true
		// the button is about to leave the page, so the focus goes to the control beside it
		anchor?.querySelector('button')?.focus()
		ondismiss?.()
	}
	let query = $state('Austin')

	function choose(item: MenuItem) {
		if (item.id === 'change') finding = true
		else onlocation?.(item)
	}
</script>

<AppFrame current="weather" {banner} {onnavigate}>
	{#snippet children(platform)}
		<div class="page">
			<PageHeader name={sky.name} subtitle={sky.subtitle} icon={iconFor(condition, night)}>
				<!-- the page's one live thing (D-62): the wind as it blows -->
				{#snippet motif()}
					<Sketch sketch={skyField} params={motifParams} />
				{/snippet}
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
					<Menu bind:open {anchor} align="start" label="Location" items={places} onselect={choose} />
					<!-- the alert waits behind a button that is there only while one is active and not dismissed -->
					{#if !dismissed}
						<span class={['anchor', 'alerts', { 'alerts-leaving': buttonLeaving }]} bind:this={alertsAnchor}>
							{#if buttonLeaving}<Breeze onend={() => (dismissed = true)} />{/if}
							<IconButton
								icon="triangle-alert"
								label="Weather alerts"
								count={1}
								tooltip
								active={alertsOpen}
								aria-haspopup="dialog"
								aria-expanded={alertsOpen}
								onclick={() => (alertsOpen = !alertsOpen)}
							/>
						</span>
						<Popover bind:open={alertsOpen} anchor={alertsAnchor} align="start" label="Weather alerts">
							<div class="alerts-list">
								<Notice
									tone="warning"
									title={alert.title}
									detail={alert.detail}
									action={{ label: 'Open Today', onclick: onopentoday }}
									ondismiss={dismiss}
								/>
							</div>
						</Popover>
					{/if}
				{/snippet}
			</PageHeader>

			<div class="body">
				{#if offline}
					<div class="area-error">
						<InlineError
							message="Couldn't reach {PROVIDER[provider]}."
							lastGood="Showing the forecast from {onClock(skyToday.lastGood)}."
							{onretry}
						/>
					</div>
				{/if}
				{#if fallback}
					<div class="area-fallback">
						<Banner
							tone="info"
							message="Couldn't reach Apple Weather. Showing Open-Meteo's forecast instead."
							action={{ label: 'Retry', onclick: onretry }}
						/>
					</div>
				{/if}

				<div class={['cols', { 'cols-wide': platform === 'desktop' }]}>
					<div class="col col-main">
						<section class="now card" aria-labelledby="{uid}-now">
							<h2 class="section-title" id="{uid}-now">Now</h2>
							<div class="now-split">
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
								<!-- the day's shape beside the reading: where the temperature goes over the hours the strip shows -->
								<div class="now-trend">
									<TrendChart
										step={10}
										height={144}
										values={temps}
										labels={skyHours.map((hour) =>
											Number(hour.time.slice(0, 2)) % 3 === 0 ? onClock(hour.time, true) : ''
										)}
										format={(value) => `${value}°`}
										label={trendLabel}
									/>
								</div>
								<!-- and the light's: the sun on its wave, where the day has reached -->
								<div class="now-sun">
									<SunArc {...sun} height={144} />
								</div>
							</div>
							<p class="voice">Good day for {skyToday.goodFor}.</p>
						</section>

						<section class="hours" aria-labelledby="{uid}-hours">
							<h2 class="section-title" id="{uid}-hours">
								Hours
								<IconButton icon="info" size="xs" label="About the hours" tooltip={HOURS_HINT} />
							</h2>
							<!-- a scroll region is a tab stop so the keyboard reaches what it hides (axe scrollable-region-focusable) -->
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<ol class="hours-list" tabindex="0" aria-label={HOURS_STRIP}>
								{#each skyHours as hour (hour.id)}
									<li class="hour" class:hour-wet={hour.precip >= 50}>
										<span class="hour-time">{onClock(hour.time, true)}</span>
										<SkyGlyph condition={hour.condition} size="md" class="hour-glyph" />
										<span class="mono">{hour.temp}°</span>
										<span class="hour-precip">{hour.precip} %</span>
									</li>
								{/each}
							</ol>
						</section>

						<section class="details card" aria-labelledby="{uid}-details">
							<h2 class="section-title" id="{uid}-details">Details</h2>
							<dl class="tiles">
								{#each details as detail (detail.id)}
									<div class="tile">
										<dt>
											<Icon name={detail.icon} size="sm" class="tile-icon" />
											{detail.label}
											{#if detail.hint}
												<IconButton icon="info" size="xs" label="About {detail.label}" tooltip={detail.hint} />
											{/if}
										</dt>
										<dd>
											<Stat size="md" value={detail.value} unit={detail.unit} />
											{#if detail.level}
												<Badge kind="neutral" level={detail.level.level} label={detail.level.label} />
											{/if}
										</dd>
									</div>
								{/each}
							</dl>
						</section>
					</div>

					<div class="col col-side">
						<section class="sun card" aria-labelledby="{uid}-sun">
							<h2 class="section-title" id="{uid}-sun">Sun and moon</h2>
							<dl class="light">
								{#each light as row (row.id)}
									<div class="light-row">
										<dt><Icon name={row.icon} class="light-icon" />{row.label}</dt>
										<dd class="mono">{row.value}</dd>
									</div>
								{/each}
								<div class="light-row">
									<dt><MoonGlyph cycle={skyToday.moonCycle} size="md" />Moon</dt>
									<dd>{skyToday.moonPhase} <span class="quiet">{skyToday.moonLit} % lit</span></dd>
								</div>
							</dl>
						</section>

						<section class="air card" aria-labelledby="{uid}-air">
							<h2 class="section-title" id="{uid}-air">Air quality</h2>
							<div class="air-row">
								<Stat value={String(skyAirQuality.index)} unit="US AQI" />
								<IconButton icon="info" size="xs" label="About the US AQI" tooltip={AQI_HINT} />
								<Badge
									kind="neutral"
									level={AIR[skyAirQuality.category].level}
									label={AIR[skyAirQuality.category].label}
								/>
							</div>
							<LevelScale
								value={skyAirQuality.index}
								stops={AQI_STOPS}
								label="US air quality index {skyAirQuality.index}, {AIR[skyAirQuality.category].label}"
							/>
							<dl class="fields pollutants">
								{#each pollutants as pollutant (pollutant.id)}
									<dt>
										{pollutant.label}
										<IconButton icon="info" size="xs" label="About {pollutant.label}" tooltip={pollutant.hint} />
									</dt>
									<dd><Stat size="sm" value={String(pollutant.value)} unit="µg/m³" /></dd>
								{/each}
							</dl>
						</section>

						<section class="allergens card" aria-labelledby="{uid}-allergens">
							<h2 class="section-title" id="{uid}-allergens">Pollen and mold</h2>
							{#if allergens === 'available'}
								<dl class="fields">
									{#each skyAllergens as allergen (allergen.id)}
										<dt>{allergen.name}</dt>
										<dd>
											<Badge kind="neutral" level={LEVEL[allergen.level].level} label={LEVEL[allergen.level].label} />
										</dd>
									{/each}
								</dl>
							{:else}
								<p class="quiet">No pollen or mold source covers this place yet.</p>
							{/if}
						</section>
					</div>
				</div>

				<section class="week" aria-labelledby="{uid}-week">
					<h2 class="section-title" id="{uid}-week">This week</h2>
					<!-- a scroll region is a tab stop so the keyboard reaches what it hides (axe scrollable-region-focusable) -->
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<ol class="days" tabindex="0" aria-label="Daily forecast">
						{#each week as day (day.id)}
							<li class="day" class:day-today={day.today} aria-current={day.today ? 'date' : undefined}>
								<p class="day-head">
									<span class="day-name" title={day.full}>{day.name}</span>
									<span class="day-date">{day.date}</span>
									{#if day.today}<Badge kind="neutral" label="Today" />{/if}
									{#if day.observed}<Badge kind="neutral" label="Observed" />{/if}
								</p>
								<div class="day-sky">
									<SkyGlyph condition={day.condition} size="md" class="day-glyph" />
									<span class="day-label">{day.label}</span>
								</div>
								<Stat size="md" value="{day.hi}°" unit="/ {day.lo}°" />
								<ul class="day-facts">
									{#each day.facts as fact (fact.id)}
										<li><Icon name={fact.icon} size="sm" label={fact.name} class="day-icon" />{fact.value}</li>
									{/each}
								</ul>
							</li>
						{/each}
					</ol>
				</section>

				<footer class="sources" aria-label="Sources">
					{#if provider === 'weatherkit' && !fallback}
						<!-- Apple's mark and its legal link, as WeatherKit requires; the app draws the mark Apple supplies -->
						<p class="source"><span class="sources-mark">Apple Weather</span></p>
						<Button variant="quiet" size="md" label="Data sources" iconRight="external-link" onclick={onsources} />
					{/if}
					{#each sources as source (source.id)}
						<p class="source"><Icon name={source.icon} size="sm" class="source-icon" />{source.text}</p>
					{/each}
				</footer>
			</div>
		</div>

		<Sheet bind:open={finding} size="sm" label="Change home">
			{#snippet header()}
				<h2 class="sheet-title">Change home</h2>
			{/snippet}
			<div class="finder">
				<Field
					label="Find a place"
					bind:value={query}
					icon="search"
					placeholder="A city or a town"
					helper="Only the name you type is sent, to Open-Meteo."
				/>
				<ul class="places" aria-label="Places">
					{#each skyPlaceResults as place (place.id)}
						<li>
							<Button
								variant="quiet"
								icon="map-pin"
								label="{place.name} · {place.region}"
								onclick={() => {
									finding = false
									onplace?.(place.id)
								}}
							/>
						</li>
					{/each}
				</ul>
			</div>
		</Sheet>
	{/snippet}
</AppFrame>

<style>
	/* The page fills its region, so the sources keep to its foot with the room above them, not beneath */
	.page {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		min-height: 100%;
	}
	.anchor {
		display: inline-flex;
	}
	/* Leaving: the button fades and draws in a little where it stands, and the Breeze rises beside it */
	.alerts {
		position: relative;
	}
	.alerts :global(.ed-icon-btn) {
		color: var(--warning);
		transition:
			opacity var(--ed-duration-settle) var(--ed-ease-out),
			scale var(--ed-duration-settle) var(--ed-ease-out);
	}
	.alerts-leaving {
		pointer-events: none;
	}
	.alerts-leaving :global(.ed-icon-btn) {
		opacity: 0;
		scale: 0.9;
	}
	.alerts-list {
		box-sizing: border-box;
		width: var(--sheet-sm);
		max-width: 100%;
		padding: var(--space-2);
	}
	.body {
		display: flex;
		flex: 1 0 auto;
		flex-direction: column;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	/* Two columns that fill on their own and end on one line: the forecast on the left, and the light, the air and
	   the allergens on the right. On a phone they are one column, in reading order. */
	.cols {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		min-width: 0;
	}
	.cols-wide {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		min-width: 0;
	}
	.cols-wide .col > :last-child {
		flex: 1 0 auto;
	}
	.area-fallback {
		min-width: 0;
	}
	.hours {
		min-width: 0;
	}
	/* The alert and the note read whole: the strip wraps its sentence rather than trimming it */
	.area-fallback :global(.ed-banner-inline) {
		display: flex;
		width: 100%;
		padding-block: var(--space-1);
	}
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
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
		color: var(--text-secondary);
	}
	/* Now: the reading on one side, the day's shape on the other; they stack when the card is narrow */
	.now-split {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4) var(--space-6);
	}
	.now-trend,
	.now-sun {
		flex: 1 1 calc(var(--space-8) * 8);
		min-width: 0;
	}
	.now-row {
		flex: 0 1 auto;
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
	/* One surface, the hours divided by hairlines: a strip to read along, not a row of separate tiles */
	.hours-list {
		display: flex;
		margin: 0;
		padding: 0;
		list-style: none;
		overflow-x: auto;
		scroll-snap-type: x proximity;
		scrollbar-width: thin;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.hours-list:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.hour {
		display: flex;
		flex: 1 0 calc(var(--space-8) + var(--space-6));
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		box-sizing: border-box;
		min-width: 0;
		padding: var(--space-3) var(--space-1);
		scroll-snap-align: start;
	}
	.hour + .hour {
		border-inline-start: 1px solid var(--stroke-subtle);
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
		grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-8) * 5), 1fr));
		gap: var(--space-4);
		margin: 0;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.tile :global(.tile-icon) {
		margin-inline-end: var(--space-1);
	}
	.tile :global(.tile-icon),
	.light :global(.light-icon) {
		flex: none;
		color: var(--text-secondary);
	}
	.tile dt,
	.fields dt {
		display: flex;
		align-items: center;
		gap: 2px;
		min-height: var(--space-6);
		white-space: nowrap;
	}
	.tile dd {
		padding-inline-start: calc(var(--space-4) + var(--space-1));
	}
	.tile dt {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.tile dd {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
	}
	.quiet,
	.source {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	/* Sun and moon: a glyph, its name, its time */
	.light {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
	}
	.light-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.light dt {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.light dd {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.source {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.source :global(.source-icon) {
		flex: none;
	}
	.sheet-title {
		margin: 0;
		font: var(--ed-t-title-lg);
		color: var(--text-primary);
	}
	.places {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.finder {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	/* The pollutants two abreast: a name and its figure, twice a row */
	.fields.pollutants {
		grid-template-columns: repeat(2, auto minmax(0, 1fr));
		gap: var(--space-1) var(--space-3);
	}
	.air-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	/* The sources close the page: pushed to its foot, a breath below the week */
	.sources {
		margin-top: auto;
		padding-block: var(--space-6) var(--space-4);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-6);
	}
	.sources-mark {
		font-weight: 600;
		color: var(--text-primary);
	}

	/* The week: one surface across the page, a day to a column, read along like the hours */
	.week {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.days {
		display: flex;
		margin: 0;
		padding: 0;
		list-style: none;
		overflow-x: auto;
		scroll-snap-type: x proximity;
		scrollbar-width: thin;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.days:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.day {
		display: flex;
		flex: 1 0 calc(var(--space-8) * 4.5);
		flex-direction: column;
		gap: var(--space-2);
		box-sizing: border-box;
		min-width: 0;
		padding: var(--space-3);
		scroll-snap-align: start;
	}
	.day + .day {
		border-inline-start: 1px solid var(--stroke-subtle);
	}
	.day-today {
		background: var(--surface-2);
	}
	.day-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		min-height: var(--space-6);
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.day-name {
		font-weight: 600;
	}
	.day-date {
		font: var(--ed-t-data-sm);
		color: var(--text-secondary);
	}
	/* The day's mark, today or observed, keeps to the end of the line so the names stay in one column */
	.day-head :global(.ed-badge) {
		margin-inline-start: auto;
	}
	.day-sky {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.day :global(.day-glyph),
	.day :global(.day-icon) {
		flex: none;
		color: var(--text-secondary);
	}
	.day-facts {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}
	.day-facts li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		white-space: nowrap;
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
