<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { ideaLog, ideas, sidebar } from '../../sample-data.js'
	import Ideas from './Ideas.svelte'

	const toolbench = sidebar.items.find((entry) => entry.id === 'toolbench')!
	const active = ideas.filter((idea) => idea.status !== 'archived')
	const plain = ideas.filter((idea) => idea.status === 'idea')
	const flowField = ideas.find((idea) => idea.id === ideaLog.ideaId)!

	const { Story } = defineMeta({
		title: 'Domains/Toolbench/Ideas',
		component: Ideas,
		tags: ['autodocs'],
		parameters: {
			platforms: ['desktop'],
			docs: {
				description: {
					component:
						'Toolbench’s Ideas view (product/domains/toolbench.md), mocked from kit components under D-54; desktop only in Phase 1. Capture an idea is the primary action; the domain’s tabs and the status chips with their counts sit beneath the name, a quick-add line above the List. Each row names its area and status, and the solar logger carries its 41 untouched days. The detail pane shows the flow-field idea’s status, area, linked project, dated log and the brainstorm Thread of two GardenerMessages in the Gardener’s green (D-40).',
				},
			},
		},
		args: {
			oncapture: fn(),
			onadd: fn(),
			onopen: fn(),
			onaction: fn(),
			onfilter: fn(),
			onbrainstorm: fn(),
			onsample: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Ideas>)}
	<Ideas {...args} />
{/snippet}

<!-- Every idea but the archived one; the flow field open with its log and brainstorm -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('main')).toBeVisible()
		await expect(canvas.getByRole('heading', { level: 1, name: toolbench.name })).toBeVisible()
		await expect(canvas.getByRole('tab', { name: 'Ideas' })).toHaveAttribute('aria-selected', 'true')
		await expect(canvas.getByRole('button', { name: 'Capture an idea' })).toBeVisible()
		await expect(canvas.getByRole('textbox', { name: 'Capture an idea' })).toBeVisible()
		await expect(canvas.getByRole('grid', { name: 'Ideas' })).toBeVisible()
		await expect(canvas.getAllByRole('row')).toHaveLength(active.length)
		await expect(canvas.getByText('41 days')).toBeVisible()
		const pane = canvas.getByRole('complementary', { name: flowField.title })
		await expect(pane).toBeVisible()
		await expect(canvas.getByRole('log', { name: 'Brainstorm with the Gardener' })).toBeVisible()
		await expect(canvas.getAllByRole('article')).toHaveLength(ideaLog.brainstorm.length)
		await expect(canvas.getByText(ideaLog.entries[0]!.line)).toBeVisible()
	}}
/>

<!-- The Idea chip on: the three plain ideas, the bike light in the pane with no log yet -->
<Story
	name="Filtered"
	{template}
	args={{ status: 'idea' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('button', { name: /^Idea/ })).toHaveAttribute('aria-pressed', 'true')
		await expect(canvas.getAllByRole('row')).toHaveLength(plain.length)
		await expect(canvas.getByRole('complementary', { name: plain[0]!.title })).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Brainstorm with the Gardener' })).toBeVisible()
		await expect(canvas.queryByRole('log')).toBeNull()
	}}
/>

<!-- No ideas: the EmptyState with Capture an idea and the sample-data link -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'No ideas yet' })).toBeVisible()
		await expect(canvas.queryByRole('grid')).toBeNull()
		await expect(canvas.queryByRole('complementary')).toBeNull()
	}}
/>
