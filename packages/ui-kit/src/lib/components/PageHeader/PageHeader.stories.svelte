<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { domainGlyph } from '$lib/icons/domain-glyphs.js'
	import PageHeader, { type PageHeaderAction } from './PageHeader.svelte'
	import Chip from '../Chip/Chip.svelte'
	import Segmented from '../Segmented/Segmented.svelte'
	import { sidebar, sidebarJa } from '../../../stories/sample-data.js'

	const hearth = sidebar.items.find((item) => item.id === 'kitchen')!
	const garden = sidebar.items.find((item) => item.id === 'garden')!
	const hearthJa = sidebarJa.items.find((item) => item.id === 'kitchen')!
	const actions: PageHeaderAction[] = [
		{ label: 'Capture a haul', icon: 'camera', onclick: fn() },
		{ label: 'Add', onclick: fn() },
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

<Story
	name="Japanese"
	args={{ name: hearthJa.name, subtitle: hearthJa.subtitle, actions: [{ label: '追加' }], lang: 'ja' }}
/>

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
