<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import Bills from './Bills.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Orchard/Bills',
		component: Bills,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Orchard’s Bills (product/domains/finance.md §6, “A bill, from letter to paid”): every bill by state, Overdue, Due soon, Upcoming, Expected and Paid, each with its payee, one-off or monthly, estimate or actual, where it came from, the due day and the amount. A paid bill names its payment. When two payments could each have paid a bill, it asks which. Eden never pays a bill; the menu opens the payee’s site (D-8).',
				},
			},
		},
		args: {
			oncapture: fn(),
			onadd: fn(),
			onmatch: fn(),
			onmarkpaid: fn(),
			onopensite: fn(),
			ondelete: fn(),
			onreconnect: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Bills>)}
	<Bills {...args} />
{/snippet}

<!-- Six bills across the five states: gas overdue, rent due tomorrow, an estimate, a card statement, an EOB, a paid one -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('tab', { name: 'Bills' })).toHaveAttribute('aria-selected', 'true')
		const states = canvas.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
		await expect(states).toEqual(['Overdue', 'Due soon', 'Upcoming', 'Expected', 'Paid'])
		const paid = within(canvas.getByRole('region', { name: 'Paid' }))
		await expect(paid.getByText('Paid Tue 22 Sep from Chase ••4417')).toBeVisible()
		await expect(canvas.getByText('about $64.00')).toBeVisible()
		await expect(canvas.queryByText('Two payments could have paid this')).toBeNull()
		await userEvent.click(canvas.getByRole('button', { name: 'Capture a bill' }))
		await expect(args.oncapture).toHaveBeenCalledTimes(1)
	}}
/>

<!-- Two payments could each have paid the gas bill: one Button per candidate, and Neither -->
<Story
	name="Ambiguous match"
	{template}
	args={{ ambiguous: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const overdue = within(canvas.getByRole('region', { name: 'Overdue' }))
		await expect(overdue.getByText('Two payments could have paid this')).toBeVisible()
		await expect(overdue.getByRole('button', { name: 'Tue 29 Sep · TEXAS GAS AUTOPAY · $38.00' })).toBeVisible()
		await expect(overdue.getByRole('button', { name: 'Neither' })).toBeVisible()
		await userEvent.click(overdue.getByRole('button', { name: 'Mon 28 Sep · TXGAS SVC · $38.10' }))
		await expect(args.onmatch).toHaveBeenCalledWith('pm-01')
	}}
/>

<!-- Chase needs a sign-in: the card statement's bill reads as of Sun 27 Sep -->
<Story
	name="Stale link"
	{template}
	args={{ stale: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('Chase needs you to sign in again')).toBeVisible()
		await expect(canvas.getByText(/Card statement · minimum \$35\.00 · as of Sun 27 Sep/)).toBeVisible()
	}}
/>

<!-- No bills yet: the EmptyState with Capture a bill -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { name: 'No bills yet' })).toBeVisible()
		await expect(canvas.queryByRole('heading', { name: 'Overdue' })).toBeNull()
	}}
/>
