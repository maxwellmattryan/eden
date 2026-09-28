<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { canSee, canSeeLocked, stock } from '../../../stories/sample-data.js'
	import CanSee, { type CanSeeItem } from './CanSee.svelte'

	const s = defaultStrings.gardener
	const first = canSee[0]!
	/** The ids this request was granted: the locked one is kept out of the items. */
	const granted = canSee.filter((item) => !canSeeLocked.includes(item.id))
	const rows = stock.slice(0, 3)
	const chipName = (item: CanSeeItem) => s.contextRows(item.count, item.id)

	const { Story } = defineMeta({
		title: 'Components/Gardener/CanSee',
		component: CanSee,
		tags: ['autodocs'],
		args: { items: canSee, locked: [], onexpand: fn(), onaudit: fn() },
	})
</script>

<!-- A chip opens to its region and closes again; the audit log is one quiet button away -->
<Story
	name="Default"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const chip = canvas.getAllByRole('button', { name: chipName(first) })[0]!
		await expect(chip).toHaveAttribute('aria-expanded', 'false')
		await userEvent.click(chip)
		await expect(chip).toHaveAttribute('aria-expanded', 'true')
		const region = canvas.getByRole('region', { name: chipName(first) })
		await expect(region).toHaveTextContent(s.inContext(first.count, first.id))
		await expect(args.onexpand).toHaveBeenCalledWith(first)
		await userEvent.click(chip)
		await expect(chip).toHaveAttribute('aria-expanded', 'false')
		await expect(canvas.queryByRole('region')).toBeNull()
		await expect(args.onexpand).toHaveBeenCalledTimes(1)
		await userEvent.click(canvas.getAllByRole('button', { name: s.openAuditLog })[0]!)
		await expect(args.onaudit).toHaveBeenCalledTimes(1)
	}}
/>

<!-- A T2 id kept out of this request: grey with a lock, and said so for a screen reader -->
<Story
	name="With locked"
	args={{ items: granted, locked: canSeeLocked }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(s.locked(canSeeLocked[0]!))).toBeInTheDocument()
		await expect(canvas.queryByRole('button', { name: chipName(canSee[4]!) })).toBeNull()
	}}
/>

<!-- The consumer's snippet fills the region with the rows themselves: the chip is literal, never a summary -->
<Story
	name="Expanded"
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getAllByRole('button', { name: chipName(first) })[0]!)
		const region = canvas.getByRole('region', { name: chipName(first) })
		await expect(region.querySelectorAll('li')).toHaveLength(rows.length)
	}}
>
	{#snippet template(args)}
		<CanSee {...args}>
			{#snippet expanded(item)}
				<p class="rows-title">{item.id}</p>
				<ul class="rows">
					{#each rows as row (row.id)}
						<li>
							<span>{row.name}</span>
							<span class="rows-qty">{row.qty} {row.unit ?? ''}</span>
							<span class="rows-loc">{row.location}</span>
						</li>
					{/each}
				</ul>
			{/snippet}
		</CanSee>
	{/snippet}
</Story>

<style>
	.rows-title {
		margin: 0 0 var(--space-1);
		font: var(--ed-t-code);
		color: var(--text-primary);
	}
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.rows li {
		display: flex;
		gap: var(--space-3);
		font: var(--ed-t-body-sm);
		color: var(--text-primary);
	}
	.rows-qty {
		font: var(--ed-t-data-sm);
		margin-left: auto;
	}
	.rows-loc {
		color: var(--text-secondary);
	}
</style>
