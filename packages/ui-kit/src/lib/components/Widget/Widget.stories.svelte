<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { domainGlyph } from '$lib/icons/domain-glyphs.js'
	import Widget from './Widget.svelte'
	import WidgetGrid from '../WidgetGrid/WidgetGrid.svelte'
	import Stat from '../Stat/Stat.svelte'
	import Sparkline from '../Sparkline/Sparkline.svelte'
	import {
		ideas,
		quickLogs,
		sidebar,
		skyToday,
		skyWeek,
		stock,
		weightAverage,
		weightSeries,
	} from '../../../stories/sample-data.js'

	const sky = sidebar.items.find((item) => item.id === 'weather')!
	const hearth = sidebar.items.find((item) => item.id === 'kitchen')!
	const toolbench = sidebar.items.find((item) => item.id === 'toolbench')!
	const now = skyWeek[2]!
	const weight = quickLogs[0]!
	const latest = String(weightSeries.at(-1))
	const expiring = stock.filter((item) => item.expiry === '10-01' || item.expiry === '10-02')
	const idle = ideas[3]!

	const { Story } = defineMeta({
		title: 'Components/Garden/Widget',
		component: Widget,
		tags: ['autodocs'],
		args: { title: weight.label, icon: domainGlyph('fitness'), domain: 'Vigor', size: 's', editing: false },
		argTypes: { size: { control: 'inline-radio', options: ['s', 'm', 'l'] } },
	})
</script>

<Story
	name="Sizes"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('region', { name: 'Now' })).toBeVisible()
		await expect(canvas.getByRole('region', { name: weight.label })).toBeVisible()
		await expect(canvas.getByRole('region', { name: 'Expiring soon' })).toBeVisible()
	}}
>
	{#snippet template(args)}
		<WidgetGrid>
			<Widget {...args} title="Now" icon={domainGlyph('weather')} domain={sky.name} size="s">
				<Stat value="{now.hi}°" unit={now.note} />
			</Widget>
			<Widget {...args} size="m">
				<Stat value={latest} unit="{weight.unit} · 7-day {weightAverage}" />
				<Sparkline
					values={weightSeries}
					reference={weightAverage}
					width={360}
					height={48}
					legend={weight.label}
					referenceLabel="7-day average"
				/>
			</Widget>
			<Widget {...args} title="Expiring soon" icon={domainGlyph('kitchen')} domain={hearth.name} size="l">
				<ul class="sb-list">
					{#each expiring as item (item.id)}
						<li><span>{item.name}</span><span class="sb-meta">{item.expiry}</span></li>
					{/each}
				</ul>
			</Widget>
		</WidgetGrid>
	{/snippet}
</Story>

<!-- 1×1: the domain name is not drawn, the glyph stands for it, and a long value wraps under its label -->
<Story
	name="Small"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('region', { name: idle.title })).toBeVisible()
		await expect(canvas.getByRole('region', { name: 'Sun and moon' })).toBeVisible()
		await expect(canvas.getByText(toolbench.name)).not.toBeVisible()
		await expect(canvas.getByText(skyToday.moon)).toBeVisible()
	}}
>
	{#snippet template(args)}
		<WidgetGrid>
			<Widget {...args} title={idle.title} icon={domainGlyph('toolbench')} domain={toolbench.name} size="s">
				<p class="sb-line">{idle.title}</p>
			</Widget>
			<Widget {...args} title="Sun and moon" icon={domainGlyph('weather')} domain={sky.name} size="s">
				<ul class="sb-list">
					<li><span>Sunrise</span><span class="sb-meta">{skyToday.sunrise}</span></li>
					<li><span>Sunset</span><span class="sb-meta">{skyToday.sunset}</span></li>
					<li><span>Golden hour</span><span class="sb-meta">{skyToday.goldenHour}</span></li>
					<li><span>Moon</span><span class="sb-meta">{skyToday.moon}</span></li>
				</ul>
			</Widget>
		</WidgetGrid>
	{/snippet}
</Story>

<Story
	name="Empty"
	args={{
		title: 'Resurfaced idea',
		icon: domainGlyph('toolbench'),
		domain: toolbench.name,
		empty: 'Nothing has been idle for a month.',
	}}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('Nothing yet.')).toBeVisible()
		await expect(canvas.getByText('Nothing has been idle for a month.')).toBeVisible()
	}}
>
	{#snippet template(args)}
		<WidgetGrid>
			<Widget {...args} />
			<Widget {...args} title="Sun and moon" icon={domainGlyph('weather')} domain={sky.name} empty={undefined} />
		</WidgetGrid>
	{/snippet}
</Story>

<Story
	name="Editing"
	args={{ editing: true, action: { label: 'Log weight', onclick: fn() } }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('button', { name: `Move ${weight.label}` })).toBeVisible()
	}}
>
	{#snippet template(args)}
		<WidgetGrid>
			<Widget {...args}>
				<Stat value={latest} unit={weight.unit} />
			</Widget>
			<Widget {...args} title={idle.title} icon={domainGlyph('toolbench')} domain={toolbench.name} />
		</WidgetGrid>
	{/snippet}
</Story>

<Story
	name="With action"
	args={{ size: 'm', action: { label: 'Log weight', onclick: fn() } }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: 'Log weight' }))
		await expect(args.action?.onclick).toHaveBeenCalledTimes(1)
	}}
>
	{#snippet template(args)}
		<WidgetGrid>
			<Widget {...args}>
				<Stat value={latest} unit="{weight.unit} · 7-day {weightAverage}" />
			</Widget>
		</WidgetGrid>
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
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0 var(--space-2);
	}
	.sb-meta {
		margin-left: auto;
		font: var(--ed-t-data-sm);
		color: var(--text-secondary);
	}
	.sb-line {
		margin: 0;
		font: var(--ed-t-body);
	}
</style>
