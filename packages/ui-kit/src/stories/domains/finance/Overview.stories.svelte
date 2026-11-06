<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import Overview from './Overview.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Orchard/Overview',
		component: Overview,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Orchard’s Overview (product/domains/finance.md §6): net worth with its month change and its year, this month’s cash flow, the checking balance before payday against zero, and beside them the bills of the next fortnight, the budget, the emergency fund, what Orchard flagged and every account with when it last updated. The yen account is left out of totals and says so (D-188). Bills, flags and accounts open their page.',
				},
			},
		},
		args: { onlink: fn(), onsample: fn(), onreconnect: fn(), onnavigate: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Overview>)}
	<Overview {...args} />
{/snippet}

<!-- The sample September: $53,020.55, a low of $268.42 the day before payday, two lines over budget -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
		await expect(canvas.getByText('$53,020.55')).toBeVisible()
		await expect(canvas.getByText('+$1,104.20 this month')).toBeVisible()
		await expect(canvas.getByText('1 account in JPY is left out of totals')).toBeVisible()
		await expect(canvas.getByText(/^Lowest \$268\.42 on Wed 14 Oct/)).toBeVisible()
		await expect(canvas.getByText('2 lines over: Dining, Subscriptions')).toBeVisible()
		await expect(canvas.getByText('$8,400 of $15,000 · by Jun 2027')).toBeVisible()
		await expect(canvas.queryByText(/sign in again/)).toBeNull()
		const bills = within(canvas.getByRole('region', { name: 'Bills in the next 14 days' }))
		await userEvent.click(bills.getByText('Hyde Park Lofts rent'))
		await expect(args.onnavigate).toHaveBeenCalledWith('finance/bills')
	}}
/>

<!-- Chase needs a sign-in: the Notice with Reconnect, a third flag, and every Chase figure as of Sun 27 Sep -->
<Story
	name="Stale link"
	{template}
	args={{ stale: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByText('Chase needs you to sign in again')).toHaveLength(2)
		const accounts = within(canvas.getByRole('region', { name: 'Accounts' }))
		await expect(accounts.getAllByText('as of Sun 27 Sep')).toHaveLength(3)
		await expect(accounts.getByText('Updated 07:12')).toBeVisible()
		await expect(accounts.getAllByText('Updated 06:58')).toHaveLength(2)
		await userEvent.click(canvas.getByRole('button', { name: 'Reconnect' }))
		await expect(args.onreconnect).toHaveBeenCalledTimes(1)
	}}
/>

<!-- Nothing linked: the EmptyState with Link a bank, no cards and no charts -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { name: 'Nothing linked yet' })).toBeVisible()
		await expect(canvas.queryByRole('img', { name: /^Net worth|^Money out|^Checking balance/ })).toBeNull()
		await userEvent.click(canvas.getByRole('button', { name: 'Link a bank' }))
		await expect(args.onlink).toHaveBeenCalledTimes(1)
	}}
/>
