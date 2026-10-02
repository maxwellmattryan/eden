<script lang="ts">
	// The Sky view (product/domains/weather.md, "Surfaces"), ported from Domains/Sky/Sky: now, the next hours as a
	// strip that scrolls sideways, the details, the calendar week from the owner's week start (D-58), the air quality
	// and the allergens (D-59), sun and moon, the active alerts behind a button in the header, the sources' attribution, and the location chip over
	// home. The header's glyph is live, behind the header the motif draws the wind (D-62), and in the now block the
	// sun stands on its wave where the minute puts it. Every time is the place's, on the owner's clock. The page is the same whatever
	// the provider (D-56): the attribution follows it, and a note says so when the chosen one could not answer. Home
	// is changed from the location menu, which opens the shell's change-home sheet (D-143).
	// Offline, an InlineError names the last good forecast and the status bar carries the banner; the numbers stay,
	// since a mirror is still worth reading.
	import {
		Badge,
		Banner,
		Breeze,
		Button,
		Chip,
		Compass,
		EmptyState,
		Icon,
		IconButton,
		InlineError,
		LevelScale,
		Menu,
		MoonGlyph,
		Notice,
		PageHeader,
		Popover,
		Sketch,
		SkyGlyph,
		Stat,
		SunArc,
		TrendChart,
		iconFor,
		skyField,
		useStrings,
		type BadgeLevel,
		type IconName,
		type MenuItem,
		type SkyFieldParams,
	} from '@eden/ui-kit'
	import { cubicOut } from 'svelte/easing'
	import { openExternal } from '@eden/shared/api'
	import { updatedLine } from '$lib/domains/weather/updated'
	import { homeUi } from '$lib/shell/home/home-ui.svelte'
	import { home } from '@eden/shared/home'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { dayOfMonth, formatHour, hourOfDay, formatMoment, formatTime, formatWeekdayOf } from '@eden/shared/dates'
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
		type UvCategory,
		type WeatherAlert,
	} from '@eden/shared/weather'

	const uid = $props.id()
	const s = useStrings()
	const lang = $derived($locale ?? 'en')
	/** Sky's times are the place's, on the owner's clock (D-58). */
	const format = $derived({ lang, clock: settings.clock, timeZone: weather.timeZone })

	/** Where the forecast is for, in a word: the home's town, or its name while its address names none. */
	const homeName = $derived(home.current.area?.city ?? home.current.label)
	const places = $derived<MenuItem[]>([
		{ id: 'home', label: $t('domains.weather.home', { values: { label: homeName } }), icon: 'house' },
		{ id: 'change', label: $t('domains.weather.place.change'), icon: 'search' },
	])
	let anchor = $state<HTMLElement>()
	let open = $state(false)
	let alertsAnchor = $state<HTMLElement>()
	let alertsOpen = $state(false)

	function onlocation(item: MenuItem) {
		if (item.id === 'change') homeUi.show()
	}

	/** Each category's step on the six-step scale: the dot's colour beside the word. */
	const AIR_LEVEL: Record<AirCategory, BadgeLevel> = {
		good: 1,
		moderate: 2,
		sensitive: 3,
		unhealthy: 4,
		'very-unhealthy': 5,
		hazardous: 6,
	}
	const ALLERGEN_LEVEL: Record<AllergenLevel, BadgeLevel> = {
		none: 1,
		low: 1,
		moderate: 2,
		high: 3,
		'very-high': 4,
	}
	const UV_LEVEL: Record<UvCategory, BadgeLevel> = { low: 1, moderate: 2, high: 3, 'very-high': 4, extreme: 5 }
	/** Where each band of the US air quality index ends. */
	const AQI_STOPS = [50, 100, 150, 200, 300, 500]
	/** The hours the sparkline beside the reading draws. */
	const TREND_HOURS = 24

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

	// A figure and its unit apart, the way a Stat sets them; `measure` is the two as one string, for a line of text.
	const degrees = (celsius: number) => ({
		value: $t('domains.weather.value.degrees', { values: { value: weather.temperature(celsius) } }),
	})
	const percent = (value: number) => ({ value: String(Math.round(value)), unit: '%' })
	const figure = ({ value, unit }: Measure) => ({ value: String(value), unit: $t(`domains.weather.units.${unit}`) })
	const measure = ({ value, unit }: Measure) =>
		$t('domains.weather.value.measure', { values: { value, unit: $t(`domains.weather.units.${unit}`) } })

	const now = $derived(weather.now)
	const today = $derived(weather.today)
	const headerIcon = $derived(now ? iconFor(now.condition, now.night) : iconFor('partly-cloudy'))
	/** What the header's motif draws: the wind, the cloud and the rain as they read now. */
	const field = $derived<SkyFieldParams | undefined>(
		now
			? {
					windFrom: now.windDirection,
					windSpeed: now.windSpeed,
					windGust: now.windGust,
					cloudCover: now.cloudCover,
					precipitation: now.precipitation,
				}
			: undefined
	)
	/** What the motif shows, for its compass: the way the wind blows to, and the reading in a sentence. */
	const wind = $derived.by(() => {
		if (!now) return undefined
		const { value, unit } = speed(now.windSpeed, settings.measurement)
		const values = {
			speed: value,
			unit: $t(`domains.weather.units.${unit}`),
			from: $t(`domains.weather.compass.${compass(now.windDirection)}`),
			place: homeName,
		}
		return {
			bearing: (now.windDirection + 180) % 360,
			label: $t('domains.weather.motif.wind', { values }),
			hint: $t('domains.weather.motif.hint', { values }),
		}
	})
	// The sun moves with the clock, not with the forecast: the store's minute is read here and the readings stay the
	// mirror's.
	const clock = $derived(weather.clock)
	/** The sun on its day: the two times as they are written, and the sentence that says where it stands. */
	const sun = $derived.by(() => {
		const latitude = weather.data?.place.latitude
		if (!weather.sun || latitude === undefined) return undefined
		const { sunrise, sunset } = weather.sun
		const values = { sunrise: formatTime(sunrise, format), sunset: formatTime(sunset, format) }
		const state = clock < sunrise ? 'before' : clock < sunset ? 'up' : 'after'
		return {
			sunrise,
			sunset,
			now: clock,
			// the wave is the place's own: its latitude says how high the sun climbs and how deep it sinks
			latitude,
			labels: values,
			label: $t(`domains.weather.sunArc.${state}`, { values }),
			// the wave read under the pointer says its time on the owner's clock
			format: (instant: number) => formatTime(instant, format),
		}
	})
	const lastGood = $derived(weather.lastGood ? formatTime(weather.lastGood, format) : undefined)
	/** How old the reading is, on the minute; it closes the sources at the foot of the page. */
	const updated = $derived(updatedLine($t, lang))
	/** Each day of the calendar week with everything the forecast says of it; a day without a reading has no facts. */
	const week = $derived(
		weather.week.map(({ date, today, day }) => {
			const facts: { id: string; icon: IconName; name: string; value: string }[] = []
			if (day) {
				const amount = measure(rainfall(day.precipAmount, settings.measurement))
				facts.push({
					id: 'rain',
					icon: 'umbrella',
					name: $t('domains.weather.fact.rain'),
					// a day that has passed has no chance left to give, only what fell
					value:
						day.precipChance == null
							? amount
							: $t('domains.weather.factValue.rain', { values: { chance: Math.round(day.precipChance), amount } }),
				})
				if (day.uvMax != null) {
					facts.push({
						id: 'uv',
						icon: 'sun',
						name: $t('domains.weather.fact.uv'),
						value: $t('domains.weather.factValue.uv', { values: { value: Math.round(day.uvMax) } }),
					})
				}
				if (day.windMax != null) {
					facts.push({
						id: 'wind',
						icon: 'wind',
						name: $t('domains.weather.fact.wind'),
						value: measure(speed(day.windMax, settings.measurement)),
					})
				}
				if (day.sunrise != null && day.sunset != null) {
					facts.push({
						id: 'light',
						icon: 'sunrise',
						name: $t('domains.weather.fact.light'),
						value: $t('domains.weather.factValue.light', {
							values: { from: formatTime(day.sunrise, format), to: formatTime(day.sunset, format) },
						}),
					})
				}
			}
			return {
				id: date,
				name: formatWeekdayOf(date, lang, 'short'),
				full: formatWeekdayOf(date, lang),
				date: dayOfMonth(date),
				today,
				day,
				facts,
			}
		})
	)
	const details = $derived.by<Detail[]>(() => {
		if (!now) return []
		const wind = speed(now.windSpeed, settings.measurement)
		// the reading now, not the day's peak: the week's facts carry the peak, and after sunset it reads zero
		const uv = now.uv
		return [
			{
				id: 'feels',
				label: $t('domains.weather.details.feelsLike'),
				icon: 'thermometer',
				...degrees(now.feelsLike),
				hint: $t('domains.weather.hint.feelsLike'),
			},
			{
				id: 'humidity',
				label: $t('domains.weather.details.humidity'),
				icon: 'droplets',
				...percent(now.humidity),
				hint: $t('domains.weather.hint.humidity'),
			},
			{
				id: 'dew',
				label: $t('domains.weather.details.dewPoint'),
				icon: 'droplet',
				...degrees(now.dewPoint),
				hint: $t('domains.weather.hint.dewPoint'),
			},
			{
				id: 'wind',
				label: $t('domains.weather.details.wind'),
				icon: 'wind',
				hint: $t('domains.weather.hint.wind'),
				value: String(wind.value),
				unit: `${$t(`domains.weather.units.${wind.unit}`)} ${$t(`domains.weather.compass.${compass(now.windDirection)}`)}`,
			},
			{
				id: 'gust',
				label: $t('domains.weather.details.gusts'),
				icon: 'wind',
				...figure(speed(now.windGust, settings.measurement)),
				hint: $t('domains.weather.hint.gusts'),
			},
			{
				id: 'uv',
				label: $t('domains.weather.details.uv'),
				icon: 'sun',
				value: String(Math.round(uv)),
				level: { label: $t(`domains.weather.uvCategory.${uvCategory(uv)}`), level: UV_LEVEL[uvCategory(uv)] },
				hint: $t('domains.weather.hint.uv'),
			},
			{
				id: 'rain',
				label: $t('domains.weather.details.rainfall'),
				icon: 'umbrella',
				...figure(rainfall(today?.precipAmount ?? now.precipitation, settings.measurement)),
				hint: $t('domains.weather.hint.rainfall'),
			},
			{
				id: 'cloud',
				label: $t('domains.weather.details.cloudCover'),
				icon: 'cloud',
				...percent(now.cloudCover),
				hint: $t('domains.weather.hint.cloudCover'),
			},
			{
				id: 'pressure',
				label: $t('domains.weather.details.pressure'),
				icon: 'gauge',
				...figure(pressure(now.pressure, settings.measurement)),
				hint: $t('domains.weather.hint.pressure'),
			},
			{
				id: 'visibility',
				label: $t('domains.weather.details.visibility'),
				icon: 'eye',
				...figure(distance(now.visibility, settings.measurement)),
				hint: $t('domains.weather.hint.visibility'),
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
			if (value == null) return []
			return [{ id, label: $t(`domains.weather.airQuality.${id}`), value, hint: $t(`domains.weather.hint.${id}`) }]
		})
	)
	/** An alert in three lines: what it is, when it holds, and who issued it when. */
	const notices = $derived(
		weather.alerts.map((alert: WeatherAlert) => {
			const start = alert.onset ? formatMoment(alert.onset, format) : undefined
			const end = alert.ends ? formatMoment(alert.ends, format) : undefined
			const issued = alert.issued ? formatMoment(alert.issued, format) : undefined
			return {
				id: alert.id,
				tone: alert.severity === 'extreme' || alert.severity === 'severe' ? ('danger' as const) : ('warning' as const),
				title: alert.event || alert.headline,
				detail:
					start && end
						? $t('domains.weather.alert.from', { values: { start, end } })
						: end
							? $t('domains.weather.alert.until', { values: { end } })
							: start
								? $t('domains.weather.alert.starts', { values: { start } })
								: alert.event
									? alert.headline
									: undefined,
				meta: !issued
					? undefined
					: alert.sender
						? $t('domains.weather.alert.issued', { values: { time: issued, sender: alert.sender } })
						: $t('domains.weather.alert.issuedAt', { values: { time: issued } }),
			}
		})
	)
	// Dismissing: an alert is taken from the page at the press, with no effect of its own. With the last one the panel
	// closes instead, and it is the button that leaves with the Breeze, taking the alerts with it.
	let going = $state<string[]>([])
	let buttonLeaving = $state(false)

	function ondismiss(id: string) {
		going = [...going, id]
		if (going.length < notices.length) return
		alertsOpen = false
		buttonLeaving = true
		// the button is about to leave the page, so the focus goes to the control beside it
		anchor?.querySelector('button')?.focus()
	}
	function ondismissed(id: string) {
		if (buttonLeaving) return
		going = going.filter((other) => other !== id)
		void weather.dismissAlert(id)
	}
	function onbuttongone() {
		for (const id of going) void weather.dismissAlert(id)
		going = []
		buttonLeaving = false
	}
	/**
	 * The alerts button's place closes and opens over the settle duration (zero under reduced motion), so the control
	 * beside it slides rather than jumps: its width and the gap after it go together, with its opacity.
	 */
	function collapse(node: HTMLElement) {
		const width = node.getBoundingClientRect().width
		const gap = parseFloat(getComputedStyle(node.parentElement ?? node).columnGap) || 0
		const duration = parseFloat(getComputedStyle(node).getPropertyValue('--ed-duration-settle')) || 0
		return {
			duration,
			easing: cubicOut,
			css: (t: number) =>
				`overflow: hidden; width: ${t * width}px; margin-inline-end: ${(t - 1) * gap}px; opacity: ${t}`,
		}
	}
	/** The button takes the colour of the gravest alert behind it. */
	const gravest = $derived(notices.some((notice) => notice.tone === 'danger') ? 'danger' : 'warning')
	const about = (name: string) => $t('domains.weather.hint.about', { values: { name } })
	/** The hours of the day the chart names: the rest are ticks without words, so the names never crowd. */
	const NAMED_EVERY = 6
	/**
	 * The temperature over the coming hours, in the owner's units and on their clock: the day's shape. `label` is the
	 * hour for the sentence; `tick` is what is written under the chart, the round hours only.
	 */
	const trend = $derived(
		(weather.forecast?.hours ?? []).slice(0, TREND_HOURS).map((hour) => {
			const label = formatHour(hour.time, format)
			return {
				temp: weather.temperature(hour.temp),
				label,
				tick: hourOfDay(hour.time, weather.timeZone) % NAMED_EVERY === 0 ? label : '',
			}
		})
	)
	const light = $derived<{ id: string; label: string; icon: IconName; value: string }[]>(
		weather.sun
			? [
					{
						id: 'sunrise',
						label: $t('domains.weather.sunrise'),
						icon: 'sunrise',
						value: formatTime(weather.sun.sunrise, format),
					},
					{
						id: 'sunset',
						label: $t('domains.weather.sunset'),
						icon: 'sunset',
						value: formatTime(weather.sun.sunset, format),
					},
					{
						id: 'golden',
						label: $t('domains.weather.goldenHour'),
						icon: 'sun-medium',
						value: formatTime(weather.sun.goldenHour, format),
					},
				]
			: []
	)
	const allergens = $derived(weather.allergens)
	const attribution = $derived(weather.attribution)
	const mark = $derived(attribution?.mark?.[settings.resolvedTheme])
	/** Each source with the glyph of what it gives; a provider's own mark takes the forecast's place when it has one. */
	const sources = $derived.by(() => {
		const list: { id: string; icon: IconName; text: string }[] = []
		if (attribution && !mark) {
			list.push({
				id: 'forecast',
				icon: 'cloud-sun',
				text: $t('domains.weather.sources.forecast', { values: { name: attribution.name } }),
			})
		}
		if (air.status === 'ok' && air.source) {
			list.push({
				id: 'air',
				icon: 'wind',
				text: $t('domains.weather.sources.airQuality', { values: { name: air.source } }),
			})
		}
		if (allergens.status === 'ok' && allergens.source) {
			list.push({
				id: 'allergens',
				icon: 'flower-2',
				text: $t('domains.weather.sources.allergens', { values: { name: allergens.source } }),
			})
		}
		if (weather.alerts.length) {
			list.push({ id: 'alerts', icon: 'triangle-alert', text: $t('domains.weather.sources.alerts') })
		}
		if (updated) list.push({ id: 'updated', icon: 'clock', text: updated })
		return list
	})
</script>

<div class="page">
	<PageHeader name={$t('domains.weather.name')} subtitle={$t('domains.weather.subtitle')} icon={headerIcon}>
		<!-- the page's one live thing: the wind as it reads now -->
		{#snippet motif()}
			{#if field}<Sketch sketch={skyField} params={field} />{/if}
		{/snippet}
		<!-- which way the streaks run, north up: a compass and nothing written -->
		{#snippet legend()}
			{#if wind}<Compass bearing={wind.bearing} label={wind.label} tooltip={wind.hint} />{/if}
		{/snippet}
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
			<Menu
				bind:open
				{anchor}
				align="start"
				label={$t('domains.weather.location')}
				items={places}
				onselect={onlocation}
			/>
			<!-- the alerts wait behind a button that is there only while one is active: each says what it is first,
			     when it holds beneath -->
			{#if notices.length}
				<span
					class={['anchor', 'alerts', `alerts-${gravest}`, { 'alerts-leaving': buttonLeaving }]}
					bind:this={alertsAnchor}
					transition:collapse
				>
					{#if buttonLeaving}<Breeze onend={onbuttongone} />{/if}
					<IconButton
						icon="triangle-alert"
						label={$t('domains.weather.alerts.label')}
						count={notices.length}
						tooltip
						active={alertsOpen}
						aria-haspopup="dialog"
						aria-expanded={alertsOpen}
						onclick={() => (alertsOpen = !alertsOpen)}
					/>
				</span>
				<Popover bind:open={alertsOpen} anchor={alertsAnchor} align="start" label={$t('domains.weather.alerts.label')}>
					<div class="alerts-list">
						{#each notices as notice (notice.id)}
							<Notice
								tone={notice.tone}
								title={notice.title}
								detail={notice.detail}
								meta={notice.meta}
								breeze={false}
								ondismiss={() => ondismiss(notice.id)}
								ondismissed={() => ondismissed(notice.id)}
							/>
						{/each}
					</div>
				</Popover>
			{/if}
			<!-- one control fetches everything the page polls again; the arrows turn while it does, and the tooltip says so -->
			<span class={['anchor', 'refresh', { 'refresh-busy': weather.loading }]}>
				<IconButton
					icon="refresh-cw"
					size="xs"
					label={weather.loading ? $t('domains.weather.updated.loading') : $t('domains.weather.refresh')}
					tooltip
					aria-busy={weather.loading}
					onclick={() => void weather.refresh({ force: true })}
				/>
			</span>
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
			<div class="cols cols-wide">
				<div class="col col-main">
					<section class="now card" aria-labelledby="{uid}-now">
						<h2 class="section-title" id="{uid}-now">{$t('domains.weather.now')}</h2>
						<div class="now-split">
							<div class="now-row">
								<SkyGlyph condition={now.condition} night={now.night} size="lg" class="now-glyph" />
								<div class="now-text">
									<Stat value="{weather.temperature(now.temp)}°" unit={conditionLabel(s, now.condition, now.night)} />
									<p class="now-line">
										<span class="mono">
											{$t('domains.weather.high', { values: { value: weather.temperature(now.hi) } })}
										</span>
										<span class="mono">
											{$t('domains.weather.low', { values: { value: weather.temperature(now.lo) } })}
										</span>
									</p>
								</div>
							</div>
							{#if trend.length > 1 || sun}
								<div class="now-charts">
									{#if trend.length > 1}
										<!-- the day's shape beside the reading: where the temperature goes over the coming hours -->
										<div class="now-trend">
											<TrendChart
												step={10}
												height={144}
												values={trend.map((hour) => hour.temp)}
												labels={trend.map((hour) => hour.tick)}
												titles={trend.map((hour) => hour.label)}
												format={(value) => $t('domains.weather.value.degrees', { values: { value } })}
												label={$t('domains.weather.trend.label', {
													values: {
														from: trend[0]?.label,
														to: trend.at(-1)?.label,
														low: Math.min(...trend.map((hour) => hour.temp)),
														high: Math.max(...trend.map((hour) => hour.temp)),
													},
												})}
											/>
										</div>
									{/if}
									{#if sun}
										<!-- and the light's: the sun on its wave, where the day has reached -->
										<div class="now-sun">
											<SunArc {...sun} height={144} />
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</section>

					<section class="hours" aria-labelledby="{uid}-hours">
						<h2 class="section-title" id="{uid}-hours">
							{$t('domains.weather.hours')}
							<IconButton
								icon="info"
								size="xs"
								label={$t('domains.weather.hint.aboutHours')}
								tooltip={$t('domains.weather.hint.hours')}
							/>
						</h2>
						<!-- a scroll region is a tab stop so the keyboard reaches what it hides (axe scrollable-region-focusable) -->
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<ol class="hours-list" tabindex="0" aria-label={$t('domains.weather.hoursStrip')}>
							{#each weather.hours as hour (hour.time)}
								<li class="hour" class:hour-wet={hour.precipChance >= 50}>
									<span class="hour-time">{formatHour(hour.time, format)}</span>
									<!-- the glyph is the one thing in the row without words: its name on hover -->
									<SkyGlyph condition={hour.condition} night={hour.night} size="md" class="hour-glyph" tooltip />
									<span class="mono">{weather.temperature(hour.temp)}°</span>
									<span class="hour-precip"
										>{$t('domains.weather.precip', { values: { value: hour.precipChance } })}</span
									>
								</li>
							{/each}
						</ol>
					</section>

					<section class="details card" aria-labelledby="{uid}-details">
						<h2 class="section-title" id="{uid}-details">{$t('domains.weather.details.title')}</h2>
						<dl class="tiles">
							{#each details as detail (detail.id)}
								<div class="tile">
									<dt>
										<Icon name={detail.icon} size="sm" class="tile-icon" />
										{detail.label}
										{#if detail.hint}
											<IconButton icon="info" size="xs" label={about(detail.label)} tooltip={detail.hint} />
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
					{#if weather.sun}
						<section class="sun card" aria-labelledby="{uid}-sun">
							<h2 class="section-title" id="{uid}-sun">{$t('domains.weather.sunAndMoon')}</h2>
							<dl class="light">
								{#each light as row (row.id)}
									<div class="light-row">
										<dt><Icon name={row.icon} class="light-icon" />{row.label}</dt>
										<dd class="mono">{row.value}</dd>
									</div>
								{/each}
								<div class="light-row">
									<dt><MoonGlyph cycle={weather.sun.moon.cycle} size="md" />{$t('domains.weather.moon')}</dt>
									<dd>
										{$t(`domains.weather.moonPhase.${weather.sun.moon.phase}`)}
										<span class="quiet">
											{$t('domains.weather.moonLit', { values: { percent: weather.sun.moon.illumination } })}
										</span>
									</dd>
								</div>
							</dl>
						</section>
					{/if}

					<section class="air card" aria-labelledby="{uid}-air">
						<h2 class="section-title" id="{uid}-air">{$t('domains.weather.airQuality.title')}</h2>
						{#if airIndex}
							<div class="air-row">
								<Stat value={String(Math.round(airIndex.value))} unit={airIndex.unit} />
								{#if airIndex.category}
									<IconButton
										icon="info"
										size="xs"
										label={about(airIndex.unit)}
										tooltip={$t('domains.weather.hint.aqi')}
									/>
								{/if}
								{#if airIndex.category}
									<Badge
										kind="neutral"
										level={AIR_LEVEL[airIndex.category]}
										label={$t(`domains.weather.airQuality.category.${airIndex.category}`)}
									/>
								{/if}
							</div>
							{#if airIndex.category}
								<LevelScale
									value={airIndex.value}
									stops={AQI_STOPS}
									label={$t('domains.weather.scale', {
										values: {
											name: airIndex.unit,
											value: Math.round(airIndex.value),
											category: $t(`domains.weather.airQuality.category.${airIndex.category}`),
										},
									})}
								/>
							{/if}
							<dl class="fields pollutants">
								{#each pollutants as pollutant (pollutant.id)}
									<dt>
										{pollutant.label}
										<IconButton icon="info" size="xs" label={about(pollutant.label)} tooltip={pollutant.hint} />
									</dt>
									<dd><Stat size="sm" value={String(pollutant.value)} unit="µg/m³" /></dd>
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
											kind="neutral"
											level={ALLERGEN_LEVEL[allergen.level]}
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
				</div>
			</div>

			<section class="week" aria-labelledby="{uid}-week">
				<h2 class="section-title" id="{uid}-week">{$t('domains.weather.week')}</h2>
				<!-- a scroll region is a tab stop so the keyboard reaches what it hides (axe scrollable-region-focusable) -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<ol class="days" tabindex="0" aria-label={$t('domains.weather.weekStrip')}>
					{#each week as cell (cell.id)}
						<li class="day" class:day-today={cell.today} aria-current={cell.today ? 'date' : undefined}>
							<p class="day-head">
								<span class="day-name" title={cell.full}>{cell.name}</span>
								<span class="day-date">{cell.date}</span>
								{#if cell.today}
									<Badge kind="neutral" label={$t('domains.weather.todayMark')} />
								{:else if cell.day?.observed}
									<Badge kind="neutral" label={$t('domains.weather.observed')} />
								{/if}
							</p>
							{#if cell.day}
								<div class="day-sky">
									<SkyGlyph condition={cell.day.condition} size="md" class="day-glyph" />
									<span>{conditionLabel(s, cell.day.condition, false)}</span>
								</div>
								<Stat
									size="md"
									value="{weather.temperature(cell.day.hi)}°"
									unit={$t('domains.weather.factValue.low', { values: { value: weather.temperature(cell.day.lo) } })}
								/>
								<ul class="day-facts">
									{#each cell.facts as fact (fact.id)}
										<li><Icon name={fact.icon} size="sm" label={fact.name} class="day-icon" />{fact.value}</li>
									{/each}
								</ul>
							{:else}
								<p class="quiet">{$t('domains.weather.noData')}</p>
							{/if}
						</li>
					{/each}
				</ol>
			</section>

			{#if attribution}
				<footer class="sources" aria-label={$t('domains.weather.sources.label')}>
					{#if mark}
						<!-- a provider's own mark and legal link, where its terms require them (Apple's, D-57) -->
						<img class="sources-mark" src={mark} alt={attribution.name} />
						{#if attribution.legalUrl}
							{@const legal = attribution.legalUrl}
							<Button
								variant="quiet"
								size="md"
								label={$t('domains.weather.sources.legal')}
								iconRight="external-link"
								onclick={() => void openExternal(legal)}
							/>
						{/if}
					{/if}
					{#each sources as source (source.id)}
						<p class="source"><Icon name={source.icon} size="sm" class="source-icon" />{source.text}</p>
					{/each}
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
	/* The page fills its region, so the sources keep to its foot with the room above them, not beneath: the page
	   reaches down through the region's own bottom padding, leaving a breath above the status bar */
	.page {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		min-height: 100%;
		margin-bottom: calc(var(--space-3) - var(--ed-gutter));
	}
	.anchor {
		display: inline-flex;
	}
	/* The arrows turn clockwise while a refresh runs; under reduced motion the duration is zero and they stand still */
	/* The alerts button is taller than the xs refresh, so the refresh's place is as tall as the larger control and
	   the row keeps its height whether the button is there or not */
	.refresh {
		align-items: center;
		min-height: var(--ed-control);
	}
	.refresh-busy :global(.ed-icon) {
		animation: refresh-turn var(--ed-duration-spin) linear infinite;
	}
	@keyframes refresh-turn {
		to {
			transform: rotate(1turn);
		}
	}
	/* Leaving: the button fades and draws in a little where it stands, and the Breeze rises beside it */
	.alerts {
		position: relative;
	}
	.alerts :global(.ed-icon-btn) {
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
	.alerts-warning :global(.ed-icon-btn) {
		color: var(--warning);
	}
	.alerts-danger :global(.ed-icon-btn) {
		color: var(--danger);
	}
	.alerts-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
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
	   the allergens on the right. In a narrow page they are one column, in reading order. */
	.cols {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		min-width: 0;
	}
	.cols-wide {
		display: grid;
		grid-template-columns: minmax(0, 1fr) calc(var(--sheet-sm) - var(--space-3));
	}
	/* narrow page */
	@container page (max-width: 48rem) {
		.cols-wide {
			grid-template-columns: minmax(0, 1fr);
		}
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
	.area-empty {
		display: flex;
		flex: 1 0 auto;
		flex-direction: column;
		grid-column: 1 / -1;
	}
	/* An alert and the note read whole: the strip wraps its sentence rather than trimming it */
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
	/* Now: the reading and the day's two shapes on one row. The reading keeps its own width; the shapes share what is
	   left, equal in width and height. Only when a shape would be too narrow to read does the pair drop below. */
	.now-split {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4) var(--space-6);
	}
	.now-charts {
		flex: 1 1 calc(var(--space-8) * 7.5 + var(--space-4));
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		align-items: stretch;
		gap: var(--space-4);
		min-width: 0;
	}
	.now-trend,
	.now-sun {
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
		padding-inline-start: calc(var(--space-4) + var(--space-1));
	}
	.quiet,
	.source {
		margin: 0 0 var(--space-4);
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
		padding-block: var(--space-6) 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-6);
	}
	.sources-mark {
		height: var(--space-4);
		width: auto;
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
