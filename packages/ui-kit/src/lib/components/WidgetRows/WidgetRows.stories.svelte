<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { domainGlyph } from '$lib/icons/domain-glyphs.js'
	import Widget from '../Widget/Widget.svelte'
	import WidgetGrid from '../WidgetGrid/WidgetGrid.svelte'
	import WidgetRows, { type WidgetRow } from './WidgetRows.svelte'
	import { projects, sidebar, skyToday, stock } from '../../../stories/sample-data.js'

	const sky = sidebar.items.find((item) => item.id === 'weather')!
	const hearth = sidebar.items.find((item) => item.id === 'kitchen')!
	const toolbench = sidebar.items.find((item) => item.id === 'toolbench')!

	const light: WidgetRow[] = [
		{ id: 'sunrise', text: 'Sunrise', meta: skyToday.sunrise },
		{ id: 'sunset', text: 'Sunset', meta: skyToday.sunset },
		{ id: 'golden', text: 'Golden hour', meta: skyToday.goldenHour },
		{ id: 'moon', text: 'Moon', meta: skyToday.moon },
	]
	const expiring: WidgetRow[] = stock
		.filter((item) => item.expiry === '10-01' || item.expiry === '10-02')
		.map((item, index) => ({ id: item.id, text: item.name, meta: item.expiry, warn: index === 0, done: index === 1 }))
	const active: WidgetRow[] = projects
		.slice(0, 3)
		.map((project) => ({ id: project.id, text: project.name, note: project.kind, mono: true }))

	const { Story } = defineMeta({
		title: 'Components/Garden/WidgetRows',
		component: WidgetRows,
		tags: ['autodocs'],
		args: { rows: light },
	})
</script>

<Story
	name="Default"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('Sunrise')).toBeVisible()
		await expect(canvas.getByText(skyToday.moon)).toBeVisible()
	}}
>
	{#snippet template(args)}
		<WidgetGrid>
			<Widget title="Sun and moon" icon={domainGlyph('weather')} domain={sky.name} size="m">
				<WidgetRows {...args} />
			</Widget>
		</WidgetGrid>
	{/snippet}
</Story>

<!-- 1×1: a value too long for its row wraps under the text instead of running over it -->
<Story
	name="Narrow"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(skyToday.moon)).toBeVisible()
	}}
>
	{#snippet template(args)}
		<WidgetGrid>
			<Widget title="Sun and moon" icon={domainGlyph('weather')} domain={sky.name} size="s">
				<WidgetRows {...args} />
			</Widget>
		</WidgetGrid>
	{/snippet}
</Story>

<Story
	name="Warn and done"
	args={{ rows: expiring }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(expiring[0]!.text)).toBeVisible()
	}}
>
	{#snippet template(args)}
		<WidgetGrid>
			<Widget title="Expiring soon" icon={domainGlyph('kitchen')} domain={hearth.name} size="m">
				<WidgetRows {...args} />
			</Widget>
		</WidgetGrid>
	{/snippet}
</Story>

<Story
	name="With notes"
	args={{ rows: active }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(active[0]!.text)).toBeVisible()
	}}
>
	{#snippet template(args)}
		<WidgetGrid>
			<Widget title="Active projects" icon={domainGlyph('toolbench')} domain={toolbench.name} size="m">
				<WidgetRows {...args} />
			</Widget>
		</WidgetGrid>
	{/snippet}
</Story>
