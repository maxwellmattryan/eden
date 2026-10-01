<script module lang="ts">
	/** Everything the page says, so the Japanese story can say it in Japanese. The kit's own strings come from UiKitProvider. */
	export interface GardenCopy {
		name: string
		subtitle: string
		edit: string
		quickNav: string
		activity: string
		lastUpdated: (time: string) => string
		widgets: Record<string, string>
		empty: Record<string, string>
		actions: Record<string, string>
		untouched: (days: number) => string
		minutes: (minutes: number) => string
		suggested: string
		sunrise: string
		sunset: string
		goldenHour: string
		moon: string
		weight: string
	}
	export const gardenCopy: GardenCopy = {
		name: 'Garden',
		subtitle: 'Wednesday 30 September',
		edit: 'Edit layout',
		quickNav: 'Quick navigation',
		activity: 'Activity',
		lastUpdated: (time) => `Last updated ${time}`,
		widgets: {
			'weather-now': 'Now',
			today: 'Today',
			'expiring-soon': 'Expiring soon',
			'cook-tonight': 'Cook tonight',
			'resurfaced-idea': 'Resurfaced idea',
			'active-projects': 'Active projects',
			'sun-and-moon': 'Sun and moon',
			'daily-line': 'Daily line',
			'quick-log': 'Weight',
		},
		empty: {
			'weather-now': 'Set a home place to see the sky.',
			today: 'Nothing due today.',
			'expiring-soon': 'Nothing expiring soon.',
			'cook-tonight': 'Add stock and a recipe or two.',
			'resurfaced-idea': 'Capture an idea and it will come back around.',
			'active-projects': 'No projects yet.',
			'sun-and-moon': 'Set a home place to see the light.',
			'daily-line': 'Tend what you can reach.',
			'quick-log': 'Log a weight to start the line.',
			feed: 'Nothing has happened yet.',
		},
		actions: {
			today: 'Open Today',
			'cook-tonight': 'Cook this',
			'resurfaced-idea': 'Open idea',
			'active-projects': 'Open projects',
			'quick-log': 'Log weight',
		},
		untouched: (days) => `${days} days untouched`,
		minutes: (minutes) => `${minutes} min`,
		suggested: 'Uses up spinach',
		sunrise: 'Sunrise',
		sunset: 'Sunset',
		goldenHour: 'Golden hour',
		moon: 'Moon',
		weight: 'kg',
	}
</script>

<script lang="ts">
	// The Garden (product/substrate/shell.md, "The Garden"): a quick-navigation row of domain tiles, the Phase 1 widget
	// grid read from `gardenLayout` so the mockup and the app share one list, and the activity feed in a column of its
	// own on desktop. Widgets compute from their declared reads and show a one-line prompt until data exists; on first
	// run every one of them is empty. Offline, the Sky widgets say when their forecast is from.
	import {
		DailyLine,
		Icon,
		PageHeader,
		SkyGlyph,
		Sparkline,
		Stat,
		Widget,
		WidgetGrid,
		domainGlyph,
		useStrings,
		type BottomTab,
		type GlyphId,
		type SkyCondition,
		type UiStrings,
	} from '$lib/index.js'
	import type { StatusBarBanner } from '$lib/components/StatusBar/StatusBar.svelte'
	import AppFrame, { type SidebarSample } from '../_frame/AppFrame.svelte'
	import {
		dailyLines,
		feed,
		gardenLayout,
		ideas,
		projects,
		recipes,
		sidebar,
		skyHours,
		skyToday,
		stock,
		todayTasks,
		weightAverage,
		weightSeries,
		type GardenTile,
	} from '../../sample-data.js'

	type Props = {
		/** First run: every widget shows its one-line prompt (shell.md, "Widgets render their empty state until data exists"). */
		firstRun?: boolean
		/** Offline: the status-bar banner, and the Sky widgets say when their forecast is from. */
		offline?: boolean
		/** The shell's nav entries, English or Japanese. */
		nav?: SidebarSample
		/** The shell's mobile tabs; the sample five unless set. */
		tabs?: BottomTab[]
		copy?: GardenCopy
		lang?: string
		onnavigate?: (id: string) => void
		onopen?: (widget: string) => void
		onedit?: () => void
	}
	let {
		firstRun = false,
		offline = false,
		nav = sidebar,
		tabs,
		copy = gardenCopy,
		lang,
		onnavigate,
		onopen,
		onedit,
	}: Props = $props()

	const banner = $derived<StatusBarBanner | undefined>(
		offline ? { message: `Offline. Showing the forecast from ${skyToday.lastGood}.` } : undefined
	)
	/** The themed names by id, for a widget's domain label and the quick-nav tiles. */
	const names = $derived(Object.fromEntries([...nav.items, ...nav.pinned].map((entry) => [entry.id, entry.name])))
	/** The tiles: every entry but the Garden itself. */
	const tiles = $derived(nav.items.filter((entry) => entry.id !== 'garden'))

	const s = useStrings()
	/** The condition names live in the kit's strings, the same ones SkyGlyph reads. */
	const LABEL: Record<SkyCondition, keyof UiStrings['sky']> = {
		sunny: 'sunny',
		'partly-cloudy': 'partlyCloudy',
		cloudy: 'cloudy',
		fog: 'fog',
		drizzle: 'drizzle',
		rain: 'rain',
		thunderstorm: 'thunderstorm',
		snow: 'snow',
		hail: 'hail',
		wind: 'wind',
		tornado: 'tornado',
	}
	/** Now: the current hour's reading, the same one the Sky page's Now block shows, never the day's high. */
	const now = skyHours[0]!
	/** Anything dated on or before Friday 10-02: today is Wednesday 09-30. */
	const expiring = stock.filter((item) => item.expiry && item.expiry <= '10-02')
	const suggested = recipes[0]!
	const idle = ideas[3]!
	const neutral = dailyLines[1]!
	const latest = weightSeries[weightSeries.length - 1]!

	const widgetProps = (tile: GardenTile) => ({
		title: copy.widgets[tile.id] ?? tile.id,
		icon: domainGlyph(tile.domain as GlyphId),
		domain: tile.domain === 'garden' ? undefined : names[tile.domain],
		size: tile.size,
		action: copy.actions[tile.id] ? { label: copy.actions[tile.id]!, onclick: () => onopen?.(tile.id) } : undefined,
	})
</script>

{#snippet body(tile: GardenTile)}
	{#if tile.id === 'weather-now'}
		<div class="now">
			<SkyGlyph condition={now.condition} size="lg" class="now-glyph" />
			<Stat value="{now.temp}°" unit={s.sky[LABEL[now.condition]]} />
		</div>
		{#if offline}<p class="meta">{copy.lastUpdated(skyToday.lastGood)}</p>{/if}
	{:else if tile.id === 'today'}
		<ul class="rows">
			{#each todayTasks as task (task.id)}
				<li class:done={task.state === 'done'}>
					<span class="row-text">{task.title}</span>
					<span class="row-meta" class:warn={task.state === 'overdue'}>{task.when}</span>
				</li>
			{/each}
		</ul>
	{:else if tile.id === 'expiring-soon'}
		<ul class="rows">
			{#each expiring as item (item.id)}
				<li><span class="row-text">{item.name}</span><span class="row-meta">{item.expiry}</span></li>
			{/each}
		</ul>
	{:else if tile.id === 'cook-tonight'}
		<ul class="rows">
			{#each recipes as recipe (recipe.id)}
				<li>
					<span class="row-text">
						{recipe.name}
						{#if recipe.id === suggested.id}<span class="row-note">{copy.suggested}</span>{/if}
					</span>
					<span class="row-meta">{copy.minutes(recipe.minutes)}</span>
				</li>
			{/each}
		</ul>
	{:else if tile.id === 'resurfaced-idea'}
		<p class="line">{idle.title}</p>
		<p class="meta">{copy.untouched(idle.untouchedDays)}</p>
	{:else if tile.id === 'active-projects'}
		<ul class="rows">
			{#each projects as project (project.id)}
				<li>
					<span class="row-text">
						<span class="mono">{project.name}</span>
						{#if 'next' in project}<span class="row-note">{project.next[0]}</span>{/if}
					</span>
					<span class="row-meta">{project.kind}</span>
				</li>
			{/each}
		</ul>
	{:else if tile.id === 'sun-and-moon'}
		<ul class="rows">
			<li><span class="row-text">{copy.sunrise}</span><span class="row-meta">{skyToday.sunrise}</span></li>
			<li><span class="row-text">{copy.sunset}</span><span class="row-meta">{skyToday.sunset}</span></li>
			<li><span class="row-text">{copy.goldenHour}</span><span class="row-meta">{skyToday.goldenHour}</span></li>
			<li><span class="row-text">{copy.moon}</span><span class="row-meta">{skyToday.moon}</span></li>
		</ul>
		{#if offline}<p class="meta">{copy.lastUpdated(skyToday.lastGood)}</p>{/if}
	{:else if tile.id === 'daily-line'}
		<DailyLine line={neutral.line} source={neutral.source} />
	{:else if tile.id === 'quick-log'}
		<Stat value={String(latest)} unit={copy.weight} />
		<Sparkline values={weightSeries} reference={weightAverage} width={220} height={40} />
	{/if}
{/snippet}

<AppFrame current="garden" {nav} {tabs} {banner} {onnavigate}>
	{#snippet children(platform)}
		<div class="page" {lang}>
			<PageHeader
				name={copy.name}
				subtitle={copy.subtitle}
				icon={domainGlyph('garden')}
				actions={[{ label: copy.edit, icon: 'grip-vertical', variant: 'secondary', disabled: true, onclick: onedit }]}
			/>
			<nav class="quick" aria-label={copy.quickNav}>
				<ul class="quick-list">
					{#each tiles as tile (tile.id)}
						<li>
							<button class="tile" type="button" onclick={() => onnavigate?.(tile.id)}>
								<Icon name={domainGlyph(tile.id as GlyphId)} size="md" />
								<span>{tile.name}</span>
							</button>
						</li>
					{/each}
				</ul>
			</nav>
			<div class={['content', { 'content-wide': platform === 'desktop' }]}>
				<WidgetGrid>
					{#each gardenLayout as tile (tile.id)}
						{#if firstRun}
							<Widget {...widgetProps(tile)} action={undefined} empty={copy.empty[tile.id]} />
						{:else}
							<Widget {...widgetProps(tile)}>{@render body(tile)}</Widget>
						{/if}
					{/each}
				</WidgetGrid>
				{#if platform === 'desktop'}
					<aside class="feed" aria-label={copy.activity}>
						<h2 class="feed-title">{copy.activity}</h2>
						{#if firstRun}
							<p class="meta">{copy.empty.feed}</p>
						{:else}
							<ol class="feed-list">
								{#each feed as entry (entry.id)}
									<li class="feed-row">
										<Icon name={domainGlyph(entry.domain)} size="sm" class="feed-glyph" />
										<span class="row-text">{entry.line}</span>
										<span class="row-meta">{entry.when}</span>
									</li>
								{/each}
							</ol>
						{/if}
					</aside>
				{/if}
			</div>
		</div>
	{/snippet}
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding-bottom: var(--space-8);
	}
	/* The quick-navigation row: one tile per domain, glyph over name, on the page ground */
	.quick {
		padding: 0 var(--ed-gutter);
	}
	.quick-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.tile {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		box-sizing: border-box;
		min-height: var(--ed-control);
		margin: 0;
		padding: 0 var(--space-3);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-control);
		background: var(--surface-1);
		color: var(--text-primary);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		cursor: pointer;
		transition:
			background-color var(--ed-duration-micro) var(--ed-ease-out),
			border-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.tile :global(.ed-icon) {
		color: var(--text-secondary);
	}
	.tile:hover {
		background: var(--surface-2);
		border-color: var(--stroke-hover);
	}
	.tile:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	/* The grid, and on desktop the feed in a column beside it */
	.content {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.content-wide {
		grid-template-columns: minmax(0, 1fr) calc(var(--sheet-sm) * 0.8);
		align-items: start;
	}
	.feed {
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
	.feed-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.feed-list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.feed-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--ed-row);
		border-bottom: 1px solid var(--stroke-subtle);
	}
	.feed-row:last-child {
		border-bottom: 0;
	}
	.feed-row :global(.feed-glyph) {
		flex: none;
		color: var(--text-secondary);
	}

	/* Widget bodies: short rows in the body style, meta in mono, a note beneath a name; a meta that does not fit beside
	   its text (the 1×1 tiles) wraps under it rather than overlapping */
	.now {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.now :global(.now-glyph) {
		color: var(--text-secondary);
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rows li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 0 var(--space-2);
		min-width: 0;
	}
	.row-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.row-note {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.row-meta {
		flex: none;
		margin-left: auto;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.warn {
		color: var(--text-primary);
	}
	.done .row-text {
		color: var(--text-secondary);
		text-decoration: line-through;
	}
	.mono {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
	}
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
