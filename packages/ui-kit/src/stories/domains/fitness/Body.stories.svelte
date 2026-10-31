<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { weightAverage, weightGoal } from '../../sample-data.js'
	import Body from './Body.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Vigor/Body',
		component: Body,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Vigor’s Body view: the latest weight, the seven-day average and the goal as three Stats with Set goal quietly beside them, the daily weights as a TrendChart with the average and the goal as its two named, dashed references, and the other metrics (body fat, waist) beneath with their latest value, day and Log. Log weight in the header opens Quick Log on Vigor’s weight tab. Weights are kept in kg and shown in lb under the imperial system (D-58).',
				},
			},
		},
		args: { onlogweight: fn(), onsave: fn(), onsample: fn(), onnavigate: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Body>)}
	<Body {...args} />
{/snippet}

<!-- The sample fortnight: 82.4 kg this morning, the average and the goal drawn on the chart -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('tab', { name: 'Body' })).toHaveAttribute('aria-selected', 'true')
		await expect(within(canvas.getByText('Latest').parentElement!).getByText('82.4')).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Set goal' })).toBeVisible()
		const chart = await canvas.findByRole('img', {
			name: `Weight, last 30 days, from 83.6 to 82.4 kg, average ${weightAverage.toFixed(1)}, goal ${weightGoal.toFixed(1)}`,
		})
		await expect(chart).toBeVisible()
		const others = within(canvas.getByRole('region', { name: 'Other metrics' }))
		await expect(others.getByText('18.4 %')).toBeVisible()
		await expect(others.getByRole('button', { name: 'Log waist' })).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Log weight' }))
		await expect(args.onlogweight).toHaveBeenCalledTimes(1)
	}}
/>

<!-- Set goal: a target weight and the day to reach it by -->
<Story
	name="Set goal"
	{template}
	args={{ settingGoal: true }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const page = within(canvasElement.ownerDocument.body)
		const sheet = within(await page.findByRole('dialog', { name: 'Set a goal' }))
		await waitFor(() => expect(sheet.getByRole('textbox', { name: 'Target weight' })).toBeVisible())
		await expect(sheet.getByRole('textbox', { name: 'Target weight' })).toHaveValue('80.0')
		await expect(sheet.getByLabelText('By')).toHaveValue('2026-12-31')
	}}
/>

<!-- No weight yet: no Stats and no chart, the EmptyState with Log weight -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'No weight logged yet' })).toBeVisible()
		await expect(canvas.queryByText('Latest')).toBeNull()
		await expect(canvas.queryByRole('img', { name: /^Weight/ })).toBeNull()
		await expect(canvas.getAllByRole('button', { name: 'Log weight' })).toHaveLength(2)
	}}
/>
