<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import Budget from './Budget.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Orchard/Budget',
		component: Budget,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Orchard’s Budget: the month’s Planned, Spent and Left, then the fixed lines (D-16), the variable ones and the sinking funds. Each line reads what was spent of what was planned over a meter, with any rollover; a line over budget says by how much, in words as well as the danger tone. Draft with the Gardener drafts the month from history.',
				},
			},
		},
		args: { ondraft: fn(), onedit: fn(), onreconnect: fn(), onnavigate: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Budget>)}
	<Budget {...args} />
{/snippet}

<!-- September 2026: Dining and Subscriptions are over, Groceries carries $22.00 in -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('tab', { name: 'Budget' })).toHaveAttribute('aria-selected', 'true')
		const groups = canvas.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
		await expect(groups).toEqual(['Fixed', 'Variable', 'Sinking funds'])
		const dining = canvas.getByRole('meter', { name: 'Dining' }).closest('li')!
		await expect(within(dining).getByText('Over by $12.40')).toBeVisible()
		const subscriptions = canvas.getByRole('meter', { name: 'Subscriptions' }).closest('li')!
		await expect(within(subscriptions).getByText('Over by $4.97')).toBeVisible()
		await expect(canvas.getAllByText(/^Over by/)).toHaveLength(2)
		const meters = ['Fixed', 'Variable', 'Sinking funds'].flatMap((group) =>
			within(canvas.getByRole('region', { name: group })).getAllByRole('meter')
		)
		await expect(meters).toHaveLength(10)
		for (const meter of meters) await expect(meter).toHaveAttribute('aria-valuenow')
		await expect(canvas.getByRole('meter', { name: 'Dining' })).toHaveAttribute('aria-valuenow', '312.4')
		await expect(canvas.getByText('+$22.00 rolled over')).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Draft with the Gardener' }))
		await expect(args.ondraft).toHaveBeenCalledTimes(1)
	}}
/>

<!-- Chase needs a sign-in: Spent says it counts Chase as of Sun 27 Sep -->
<Story
	name="Stale link"
	{template}
	args={{ stale: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('Chase needs you to sign in again')).toBeVisible()
		await expect(canvas.getByText('Spent includes Chase as of Sun 27 Sep')).toBeVisible()
	}}
/>

<!-- No budget yet: the EmptyState with Draft with the Gardener -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { name: 'No budget yet' })).toBeVisible()
		await expect(canvas.queryByRole('meter', { name: 'Dining' })).toBeNull()
	}}
/>
