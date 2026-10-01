<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import Segmented, { type SegmentedItem } from './Segmented.svelte'
	import { quickLogs, sidebar } from '../../../stories/sample-data.js'

	// Hearth's tabs under its page header; the Quick Log sheet's quick actions with their glyphs.
	const hearthTabs = ['Stock', 'Recipes', 'Grocery']
	const quickLogTabs: SegmentedItem[] = quickLogs.map((log) => ({
		id: log.id,
		label: log.label,
		icon: log.kind === 'number' ? 'leaf' : log.kind === 'check' ? 'pill' : 'pencil',
	}))
	const calendarTabs: SegmentedItem[] = [
		{ label: 'Month', icon: 'calendar' },
		{ label: 'Week', icon: 'sunrise' },
		{ label: 'Agenda', icon: 'book-open' },
	]
	const hearth = sidebar.items.find((item) => item.id === 'kitchen')!

	const { Story } = defineMeta({
		title: 'Components/Inputs/Segmented',
		component: Segmented,
		tags: ['autodocs'],
		args: { items: hearthTabs, selected: 0, iconPosition: 'left', onchange: fn() },
		argTypes: {
			iconPosition: { control: 'inline-radio', options: ['left', 'right'] },
		},
	})
</script>

<Story
	name="Text"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const tabs = canvas.getAllByRole('tab')
		await userEvent.click(tabs[0]!)
		await userEvent.keyboard('{ArrowRight}')
		await expect(tabs[1]).toHaveFocus()
		await expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
		await expect(args.onchange).toHaveBeenLastCalledWith(1)
		// The pill measured itself through the attachment and follows the selection.
		const pill = canvasElement.querySelector<HTMLElement>('.ed-seg-pill')!
		await waitFor(() => expect(pill.style.transform).toBe(`translateX(${tabs[1]!.offsetLeft}px)`))
		await expect(pill.style.width).toBe(`${tabs[1]!.offsetWidth}px`)
		await userEvent.keyboard('{End}')
		await expect(tabs[2]).toHaveFocus()
		await expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
		await expect(args.onchange).toHaveBeenLastCalledWith(2)
		await userEvent.keyboard('{Home}')
		await expect(tabs[0]).toHaveFocus()
		await expect(args.onchange).toHaveBeenLastCalledWith(0)
		await userEvent.keyboard('{ArrowLeft}')
		await expect(tabs[2]).toHaveFocus()
		await expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
		await expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
		await expect(args.onchange).toHaveBeenLastCalledWith(2)
	}}
/>

<Story name="With icons" args={{ items: quickLogTabs, selected: 1 }}>
	{#snippet template(args)}
		<div style="display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start">
			<Segmented {...args} />
			<Segmented {...args} items={calendarTabs} selected={0} iconPosition="right" />
		</div>
	{/snippet}
</Story>

<Story name="In a header">
	{#snippet template(args)}
		<header style="display: flex; align-items: center; justify-content: space-between; gap: var(--space-4)">
			<h2
				style="margin: 0; font: var(--ed-t-title); letter-spacing: var(--ed-t-title-tracking); font-variation-settings: var(--ed-t-title-opsz); color: var(--text-primary)"
			>
				{hearth.name}
			</h2>
			<Segmented {...args} />
		</header>
	{/snippet}
</Story>
