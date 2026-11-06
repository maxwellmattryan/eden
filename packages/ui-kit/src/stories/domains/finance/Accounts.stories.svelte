<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import Accounts from './Accounts.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Orchard/Accounts',
		component: Accounts,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Orchard’s Accounts (product/domains/finance.md §3): Assets, Debts and Net worth, then every account grouped by institution under its swatch, name and last update, each with its type, last four and balance in its own currency; a debt reads as owed. What is entered by hand is its own group: a yen account left out of totals (D-188), a car valued by hand, bitcoin priced daily. A stale link reads as of its last good read and offers Reconnect.',
				},
			},
		},
		args: {
			onlink: fn(),
			onaddasset: fn(),
			oncloseaccount: fn(),
			onreconnect: fn(),
			onsample: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Accounts>)}
	<Accounts {...args} />
{/snippet}

<!-- Seven accounts at four institutions plus what is entered by hand: $53,020.55 net -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('tab', { name: 'Accounts' })).toHaveAttribute('aria-selected', 'true')
		const totals: [string, string][] = [
			['Assets', '$64,036.73'],
			['Debts', '$11,016.18'],
			['Net worth', '$53,020.55'],
		]
		for (const [term, figure] of totals) {
			await expect(within(canvas.getByText(term).parentElement!).getByText(figure)).toBeVisible()
		}
		await expect(canvas.getByText('1 account in JPY is left out of totals')).toBeVisible()
		const groups = canvas.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
		await expect(groups).toEqual(['Chase', 'Ally', 'M1', 'Fidelity', 'Entered by hand'])
		const chase = within(canvas.getByRole('region', { name: 'Chase' }))
		await expect(chase.getByText('Updated 07:12')).toBeVisible()
		await expect(chase.getByText('$1,204.18 owed')).toBeVisible()
		const byHand = within(canvas.getByRole('region', { name: 'Entered by hand' }))
		await expect(byHand.getByText('¥84,000')).toBeVisible()
		await expect(byHand.getByText('0.0412 BTC ≈ $2,595.60')).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Link a bank' }))
		await expect(args.onlink).toHaveBeenCalledTimes(1)
	}}
/>

<!-- Chase needs a sign-in: the Notice with Reconnect, and the Chase group as of Sun 27 Sep -->
<Story
	name="Stale link"
	{template}
	args={{ stale: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('Chase needs you to sign in again')).toBeVisible()
		const chase = within(canvas.getByRole('region', { name: 'Chase' }))
		await expect(chase.getByText('as of Sun 27 Sep')).toBeVisible()
		await expect(chase.queryByText('Updated 07:12')).toBeNull()
		await expect(within(canvas.getByRole('region', { name: 'Ally' })).getByText('Updated 07:12')).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Reconnect' }))
		await expect(args.onreconnect).toHaveBeenCalledTimes(1)
	}}
/>

<!-- Nothing linked or entered: the EmptyState with Link a bank -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { name: 'Nothing linked yet' })).toBeVisible()
		await expect(canvas.queryByText('Assets')).toBeNull()
	}}
/>
