<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import Activity, { type ActivityFilter } from './Activity.svelte'
	import { KIND_NAMES } from './OrchardPage.svelte'

	const dining: ActivityFilter = { id: 'what:category:Dining', group: 'what', label: 'Dining' }
	const sapphire: ActivityFilter = { id: 'where:chase-sapphire', group: 'where', label: 'Chase ••8823' }
	const lastMonth: ActivityFilter = { id: 'when:last-month', group: 'when', label: 'Last month' }

	/** The feed's rows: one list item per money event. */
	const feedRows = (canvas: ReturnType<typeof canvasOf>) =>
		within(canvas.getByRole('region', { name: 'Transactions' })).getAllByRole('listitem')
	/** The sentence above the feed, read whole. */
	const totals = (canvas: ReturnType<typeof canvasOf>) => canvas.getByText(/^\d+ transactions$/).closest('p')!

	const { Story } = defineMeta({
		title: 'Domains/Orchard/Activity',
		component: Activity,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Orchard’s Activity (product/domains/finance.md §6): one feed of every money event across every account, grouped by day. Each row leads with its kind’s glyph, then the title, the kind in words, the bank on a pill (two, from → to, for a transfer or a card payment) and the signed amount; each pill filters to its account. The filter button at the end of the search row opens When, Where, What, How much and State; the active filters sit under it as removable chips. The totals line and the insights follow the filters, and the yen row is left out of totals and says so (D-188).',
				},
			},
		},
		args: {
			onfilterchange: fn(),
			oncategorise: fn(),
			onsplit: fn(),
			onreimbursable: fn(),
			onlink: fn(),
			onsample: fn(),
			onreconnect: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Activity>)}
	<Activity {...args} />
{/snippet}

<!-- Ten days of the sample: every kind at least once, a pending coffee, a transfer and a card payment, one yen row -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true')
		const rows = feedRows(canvas)
		await expect(rows).toHaveLength(29)
		const names = Object.values(KIND_NAMES)
		for (const row of rows) {
			await expect(row.querySelector('svg')).not.toBeNull()
			await expect(names.some((name) => row.textContent!.includes(name))).toBe(true)
		}
		const feed = within(canvas.getByRole('region', { name: 'Transactions' }))
		for (const name of names) {
			await expect(feed.getAllByText(new RegExp(`^${name}( · |$)`)).length).toBeGreaterThan(0)
		}
		const transfer = canvas.getByRole('button', { name: 'Actions for Transfer, Tue 29 Sep' }).closest('li')!
		const pills = within(transfer).getAllByRole('button', { name: /filter by this account$/ })
		await expect(pills.map((pill) => pill.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
			'Chase ••4417 Chase ending 4417, filter by this account',
			'Ally ••2290 Ally ending 2290, filter by this account',
		])
		await expect(feed.getByText('−¥10,000')).toBeVisible()
		await expect(canvas.getByText('1 account in JPY is left out of totals')).toBeVisible()
		await expect(canvas.queryByRole('button', { name: /^Remove filter/ })).toBeNull()
	}}
/>

<!-- The filters open from the funnel: five sections, each a heading over its choices -->
<Story
	name="Filter open"
	{template}
	args={{ popover: true }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const page = within(canvasElement.ownerDocument.body)
		const dialog = within(await page.findByRole('dialog', { name: 'Filters' }))
		await waitFor(() => expect(dialog.getByRole('heading', { name: 'When' })).toBeVisible())
		await expect(dialog.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
			'When',
			'Where',
			'What',
			'How much',
			'State',
		])
		await expect(dialog.getByRole('button', { name: 'Chase ••8823' })).toHaveAttribute('aria-pressed', 'false')
		await expect(dialog.getByRole('textbox', { name: 'Over' })).toBeVisible()
	}}
/>

<!-- Dining on the Sapphire card: only those rows, their totals, and the two filters as chips -->
<Story
	name="Filtered"
	{template}
	args={{ filters: [dining, sapphire] }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('button', { name: /^Filters, 2\b/ })).toBeVisible()
		const rows = feedRows(canvas)
		await expect(rows).toHaveLength(4)
		for (const row of rows) {
			await expect(row).toHaveTextContent(/· Dining/)
			await expect(row).toHaveTextContent(/Chase ••8823/)
		}
		await expect(totals(canvas)).toHaveTextContent('4 transactions · Out $153.73 · In $0.00')
		await expect(canvas.queryByText('1 account in JPY is left out of totals')).toBeNull()
		const top = within(canvas.getByRole('table', { name: 'Top merchants' }))
		await expect(top.getByRole('cell', { name: 'Sushi Ota' })).toBeVisible()
		await expect(top.queryByRole('cell', { name: 'H-E-B' })).toBeNull()
		await expect(canvas.getByRole('button', { name: 'Remove filter: Chase ••8823' })).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: 'Remove filter: Dining' }))
		await expect(args.onfilterchange).toHaveBeenCalledWith([sapphire])
	}}
/>

<!-- Filters that match nothing: the inline EmptyState in place of the feed, no totals and no insights -->
<Story
	name="No matches"
	{template}
	args={{ filters: [lastMonth] }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('Nothing matches these filters')).toBeVisible()
		await expect(canvas.queryByText(/^\d+ transactions$/)).toBeNull()
		await expect(canvas.queryByRole('complementary', { name: 'Insights' })).toBeNull()
		await userEvent.click(canvas.getByRole('button', { name: 'Clear filters' }))
		await expect(args.onfilterchange).toHaveBeenCalledWith([])
	}}
/>

<!-- Nothing linked: the same EmptyState as Overview's -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { name: 'Nothing linked yet' })).toBeVisible()
		await expect(canvas.queryByRole('textbox', { name: 'Search activity' })).toBeNull()
	}}
/>

<!-- Chase needs a sign-in: its rows keep their amounts, and the feed says how old they are -->
<Story
	name="Stale link"
	{template}
	args={{ stale: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('Chase as of Sun 27 Sep')).toBeVisible()
		await expect(canvas.getByText('−$6.75')).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Reconnect' })).toBeVisible()
	}}
/>
