<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { supplements } from '../../sample-data.js'
	import Supplements from './Supplements.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Vigor/Supplements',
		component: Supplements,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Vigor’s Supplements view: each supplement with its brand, dose and when it is taken, its last intake, and Took it, which logs one now with undo. The open one shows the Hearth stock item it is kept as, read from that row, with Open in Hearth, or that it is not linked, and its intake log newest first. The form links a stock item by name.',
				},
			},
		},
		args: { onadd: fn(), ontook: fn(), onopenstock: fn(), onsave: fn(), onsample: fn(), onnavigate: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Supplements>)}
	<Supplements {...args} />
{/snippet}

<!-- LMNT citrus taken this morning at 06:50 and linked to Hearth's stock; creatine not linked -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('tab', { name: 'Supplements' })).toHaveAttribute('aria-selected', 'true')
		const list = within(canvas.getByRole('list', { name: 'Supplements' }))
		await expect(list.getAllByRole('listitem')).toHaveLength(supplements.length)
		await expect(list.getByText('LMNT · 1 packet · pre-workout')).toBeVisible()
		await expect(list.getByText('today 06:50')).toBeVisible()
		await userEvent.click(list.getByRole('button', { name: 'Took LMNT citrus' }))
		await expect(args.ontook).toHaveBeenCalledWith('su-01')
		if (canvas.queryByRole('complementary', { name: 'LMNT citrus' })) {
			const pane = within(canvas.getByRole('complementary', { name: 'LMNT citrus' }))
			await expect(pane.getByText(/^Hearth: LMNT citrus/)).toBeVisible()
			await userEvent.click(pane.getByRole('button', { name: 'Open in Hearth' }))
			await expect(args.onopenstock).toHaveBeenCalledWith('LMNT citrus')
			await expect(within(pane.getByRole('region', { name: 'Intake log' })).getAllByRole('listitem')).toHaveLength(4)
		}
	}}
/>

<!-- No supplements: the EmptyState with Add supplement and the sample-data link -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 2, name: 'No supplements yet' })).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Add sample data' }))
		await expect(args.onsample).toHaveBeenCalledTimes(1)
	}}
/>
