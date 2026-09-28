<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { domainGlyph } from '$lib/icons/domain-glyphs.js'
	import WidgetGrid from './WidgetGrid.svelte'
	import Widget from '../Widget/Widget.svelte'
	import Stat from '../Stat/Stat.svelte'
	import DailyLine from '../DailyLine/DailyLine.svelte'
	import {
		dailyLines,
		feed,
		ideas,
		projects,
		recipes,
		sidebar,
		skyToday,
		skyWeek,
		stock,
	} from '../../../stories/sample-data.js'

	// The Phase-1 default layout (docs/product/substrate/shell.md): weather-now, today, expiring-soon, cook-tonight,
	// resurfaced-idea, active-projects, sun-and-moon, the daily line (neutral until Sanctuary), the activity feed.
	const sky = sidebar.items.find((item) => item.id === 'weather')!
	const today = sidebar.items.find((item) => item.id === 'today')!
	const hearth = sidebar.items.find((item) => item.id === 'kitchen')!
	const toolbench = sidebar.items.find((item) => item.id === 'toolbench')!
	const now = skyWeek[2]!
	const expiring = stock.filter((item) => item.expiry === '10-01')
	const idle = ideas[3]!
	const daily = dailyLines[1]!
	const open = fn()

	const { Story } = defineMeta({
		title: 'Components/Garden/WidgetGrid',
		component: WidgetGrid,
		tags: ['autodocs'],
		args: {},
		argTypes: { columns: { control: { type: 'number', min: 2, max: 6 } } },
	})
</script>

{#snippet garden()}
	<Widget title="Now" icon={domainGlyph('weather')} domain={sky.name} size="s">
		<Stat value="{now.hi}°" unit={now.note} />
	</Widget>
	<Widget title={today.name} icon={domainGlyph('today')} size="m" action={{ label: 'Open Today', onclick: open }}>
		<ul class="sb-list">
			<li><span>Renew library card</span><span class="sb-meta">due today</span></li>
			<li><span>Push A</span><span class="sb-meta">17:30</span></li>
			<li><span>Dinner at Mom's</span><span class="sb-meta">19:00</span></li>
		</ul>
	</Widget>
	<Widget title="Expiring soon" icon={domainGlyph('kitchen')} domain={hearth.name} size="s">
		<ul class="sb-list">
			{#each expiring as item (item.id)}
				<li><span>{item.name}</span><span class="sb-meta">tomorrow</span></li>
			{/each}
		</ul>
	</Widget>
	<Widget
		title="Cook tonight"
		icon={domainGlyph('kitchen')}
		domain={hearth.name}
		size="m"
		action={{ label: 'Open recipes', onclick: open }}
	>
		<ul class="sb-list">
			{#each recipes as recipe (recipe.id)}
				<li><span>{recipe.name}</span><span class="sb-meta">{recipe.minutes} min</span></li>
			{/each}
		</ul>
	</Widget>
	<Widget title="Resurfaced idea" icon={domainGlyph('toolbench')} domain={toolbench.name} size="s">
		<p class="sb-line">{idle.title}</p>
		<p class="sb-line sb-meta">{idle.untouchedDays} days untouched</p>
	</Widget>
	<Widget title="Active projects" icon={domainGlyph('toolbench')} domain={toolbench.name} size="m">
		<ul class="sb-list">
			{#each projects as project (project.id)}
				<li><span class="sb-mono">{project.name}</span><span class="sb-meta">{project.kind}</span></li>
			{/each}
		</ul>
	</Widget>
	<Widget title="Sun and moon" icon={domainGlyph('weather')} domain={sky.name} size="s">
		<ul class="sb-list">
			<li><span>Sunrise</span><span class="sb-meta">{skyToday.sunrise}</span></li>
			<li><span>Sunset</span><span class="sb-meta">{skyToday.sunset}</span></li>
			<li><span>Moon</span><span class="sb-meta">{skyToday.moon}</span></li>
		</ul>
	</Widget>
	<Widget title="Daily line" size="m">
		<DailyLine line={daily.line} source={daily.source} />
	</Widget>
	<Widget title="Activity" icon={domainGlyph('garden')} size="l">
		<ul class="sb-list">
			{#each feed as entry (entry.id)}
				<li><span>{entry.line}</span><span class="sb-meta">{entry.when}</span></li>
			{/each}
		</ul>
	</Widget>
{/snippet}

<Story
	name="Phase-1 layout"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByRole('region')).toHaveLength(9)
	}}
>
	{#snippet template(args)}
		<WidgetGrid {...args}>{@render garden()}</WidgetGrid>
	{/snippet}
</Story>

<Story name="Mobile" parameters={{ platforms: ['mobile'] }}>
	{#snippet template(args)}
		<WidgetGrid {...args}>{@render garden()}</WidgetGrid>
	{/snippet}
</Story>

<style>
	.sb-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		font: var(--ed-t-body);
	}
	.sb-list li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
		min-width: 0;
	}
	.sb-line {
		margin: 0;
		font: var(--ed-t-body);
	}
	.sb-meta {
		font: var(--ed-t-data-sm);
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.sb-mono {
		font: var(--ed-t-data);
	}
</style>
