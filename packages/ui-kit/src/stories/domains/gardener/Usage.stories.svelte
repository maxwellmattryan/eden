<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { usageTotals } from '../../sample-data.js'
	import Usage, { usageCopy } from './Usage.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Gardener/Usage',
		component: Usage,
		tags: ['autodocs'],
		parameters: {
			platforms: ['desktop'],
			docs: {
				description: {
					component:
						"The Gardener's page on its Usage tab (D-113, D-115), mocked from kit components under D-54: four figures (this month against the cap, the last thirty days, all time, the month's requests), the spend over time as a BarChart stacked by grade with a Segmented for the period, and two DataTables for where it went. Desktop only, as the Gardener is until its mobile chat arrives.",
				},
			},
		},
		args: { onnavigate: fn(), ontab: fn() },
	})
</script>

<!-- September's 2.84 of 10.00, the fourteen days to 09-30 by grade, and the month by model and by what ran -->
<Story
	name="Default"
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 1, name: usageCopy.name })).toBeVisible()
		await expect(canvas.getByRole('tab', { name: usageCopy.tabs[0], selected: true })).toBeVisible()
		for (const title of Object.values(usageCopy.tiles))
			await expect(canvas.getByRole('region', { name: title })).toBeVisible()
		await expect(canvas.getByRole('region', { name: usageCopy.tiles.requests })).toHaveTextContent(
			String(usageTotals.requests)
		)
		await expect(await canvas.findByRole('img', { name: /Spend by day/ })).toBeVisible()
		await expect(canvas.getByRole('table', { name: usageCopy.byModel })).toBeVisible()
		await expect(canvas.getByRole('table', { name: usageCopy.byTool })).toBeVisible()
	}}
/>

<!-- Before the first request: the tabs stand, and one empty state says what will show -->
<Story
	name="Empty"
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(usageCopy.empty.title)).toBeVisible()
		await expect(canvas.queryByRole('img', { name: /Spend by day/ })).toBeNull()
	}}
/>
