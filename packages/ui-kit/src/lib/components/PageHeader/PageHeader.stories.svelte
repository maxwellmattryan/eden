<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { domainGlyph } from '$lib/icons/domain-glyphs.js'
	import Compass from '../Compass/Compass.svelte'
	import PageHeader, { type PageHeaderAction } from './PageHeader.svelte'
	import Chip from '../Chip/Chip.svelte'
	import Segmented from '../Segmented/Segmented.svelte'
	import Sketch from '../Sketch/Sketch.svelte'
	import { skyField } from '../../sketches/sky-field.js'
	import { sidebar, sidebarJa, skyMotif } from '../../../stories/sample-data.js'

	const hearth = sidebar.items.find((item) => item.id === 'kitchen')!
	const garden = sidebar.items.find((item) => item.id === 'garden')!
	const sky = sidebar.items.find((item) => item.id === 'weather')!
	const hearthJa = sidebarJa.items.find((item) => item.id === 'kitchen')!
	const actions: PageHeaderAction[] = [
		{ label: 'Capture a haul', icon: 'camera', onclick: fn() },
		{ label: 'Add', icon: 'plus', onclick: fn() },
	]
	const tabs = ['Stock', 'Recipes', 'Grocery']

	const { Story } = defineMeta({
		title: 'Components/Shell/PageHeader',
		component: PageHeader,
		tags: ['autodocs'],
		args: { name: hearth.name, subtitle: hearth.subtitle, icon: domainGlyph('kitchen'), actions, onback: fn() },
	})
</script>

<Story
	name="Hearth with filters"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 1, name: hearth.name })).toBeVisible()
		await expect(canvas.getByRole('tablist')).toBeVisible()
		// the two actions and the two filter chips are buttons; the Segmented's tabs are tabs
		await expect(canvas.getAllByRole('button')).toHaveLength(4)
		await expect(canvas.getAllByRole('tab')).toHaveLength(tabs.length)
	}}
>
	{#snippet template(args)}
		<PageHeader {...args}>
			{#snippet filters()}
				<Segmented items={tabs} label="Hearth sections" />
				<Chip label="Expiry" tone="outline" icon="chevron-down" selectable />
				<Chip label="Low stock" tone="outline" selectable />
			{/snippet}
		</PageHeader>
	{/snippet}
</Story>

<Story
	name="With back and breadcrumb"
	args={{ back: garden.name }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.tab()
		const back = canvas.getByRole('button', { name: 'Back' })
		await expect(back).toHaveFocus()
		await userEvent.keyboard('{Enter}')
		await expect(args.onback).toHaveBeenCalledTimes(1)
	}}
/>

<Story name="No actions" args={{ actions: [] }} />

<!-- One Add that offers what can be added: the button opens a menu under itself, and a pick is the item's own -->
<Story
	name="Action with a menu"
	args={{
		actions: [
			{
				label: 'Add',
				icon: 'plus',
				menu: [
					{ id: 'item', label: 'Add item', icon: 'list', onselect: fn() },
					{ id: 'store', label: 'Add store', icon: 'map-pin', onselect: fn() },
				],
			},
		],
	}}
	parameters={{ platforms: ['desktop'], platformFrame: 'inline' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const add = canvas.getByRole('button', { name: 'Add' })
		await expect(add).toHaveAttribute('aria-expanded', 'false')
		await userEvent.click(add)
		const store = await canvas.findByRole('menuitem', { name: 'Add store' })
		await expect(add).toHaveAttribute('aria-expanded', 'true')
		await expect(canvas.getAllByRole('menuitem')).toHaveLength(2)
		await userEvent.click(store)
		await waitFor(() => expect(add).toHaveAttribute('aria-expanded', 'false'))
		await expect(args.actions?.[0]?.menu?.[1]?.onselect).toHaveBeenCalledTimes(1)
		await expect(args.actions?.[0]?.menu?.[0]?.onselect).not.toHaveBeenCalled()
	}}
/>

<Story
	name="Japanese"
	args={{ name: hearthJa.name, subtitle: hearthJa.subtitle, actions: [{ label: '追加' }], lang: 'ja' }}
/>

<!-- A domain's motif behind the header (D-62): Sky's, the wind as a flow field; the name reads over it -->
<Story
	name="With a motif"
	args={{ name: sky.name, subtitle: sky.subtitle, icon: domainGlyph('weather'), actions: [] }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 1, name: sky.name })).toBeVisible()
		await expect(canvasElement.querySelector('.ed-page-header-motif canvas')).not.toBeNull()
	}}
>
	{#snippet template(args)}
		<PageHeader {...args}>
			{#snippet motif()}
				<Sketch sketch={skyField} params={skyMotif} />
			{/snippet}
			{#snippet filters()}
				<Chip label="Home · Hyde Park" tone="outline" icon="map-pin" />
			{/snippet}
		</PageHeader>
	{/snippet}
</Story>

<!-- The legend says what the motif shows, at the foot of its room; it is left out where the room is narrow -->
<Story
	name="With a legend"
	args={{ name: sky.name, subtitle: sky.subtitle, icon: domainGlyph('weather'), actions: [] }}
	parameters={{ platforms: ['desktop'] }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		await expect(
			canvasOf(canvasElement).getByRole('img', { name: 'Wind from SSE at 14 km/h. North is up.' })
		).toBeVisible()
	}}
>
	{#snippet template(args)}
		<PageHeader {...args}>
			{#snippet motif()}
				<Sketch sketch={skyField} params={skyMotif} />
			{/snippet}
			{#snippet legend()}
				<Compass bearing={337.5} label="Wind from SSE at 14 km/h. North is up." />
			{/snippet}
			{#snippet filters()}
				<Chip label="Home · Hyde Park" tone="outline" icon="map-pin" />
			{/snippet}
		</PageHeader>
	{/snippet}
</Story>

<!-- A header too narrow for the name and the actions on one line (a panel open beside the page) stacks as mobile does -->
<Story
	name="Narrow"
	parameters={{ platforms: ['desktop'] }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const header = canvasElement.querySelector('.ed-page-header')!
		await expect(header).toHaveClass(/ed-page-header-stacked/)
	}}
>
	{#snippet template(args)}
		<div style="width: 420px">
			<PageHeader {...args}>
				{#snippet filters()}
					<Segmented items={tabs} label="Hearth sections" />
					<Chip label="Low stock" tone="outline" selectable />
				{/snippet}
			</PageHeader>
		</div>
	{/snippet}
</Story>

<Story name="Mobile" parameters={{ platforms: ['mobile'] }}>
	{#snippet template(args)}
		<PageHeader {...args}>
			{#snippet filters()}
				<Segmented items={tabs} label="Hearth sections" />
				<Chip label="Low stock" tone="outline" selectable />
			{/snippet}
		</PageHeader>
	{/snippet}
</Story>
