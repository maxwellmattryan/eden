<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { canSee, stock } from '../../../stories/sample-data.js'
	import ReadList, { type ReadItem } from './ReadList.svelte'

	const s = defaultStrings.gardener
	const first = canSee[0]!
	const withEmpty: ReadItem[] = [...canSee.slice(0, 2), { id: 'local-event', count: 0 }, { id: 'task', count: 0 }]
	/** The names the owner knows the ids by, in place of the ids. */
	const labelled: ReadItem[] = [
		{ id: 'stock-item', label: 'Stock item', count: 22 },
		{ id: 'preferred-name', label: 'Preferred name', count: 1 },
	]
	const rows = stock.slice(0, 3)

	const { Story } = defineMeta({
		title: 'Components/Gardener/ReadList',
		component: ReadList,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'What the Gardener read, literally: one row per registry id with rows to read, opening one at a time to the rows themselves (the `expanded` snippet) or to a sentence saying how many there are; what was trimmed in a caption. An id with nothing to read is not listed. The “can see” popover and the audit log’s entry show this same list.',
				},
			},
		},
		args: { items: canSee, trimmed: [], onexpand: fn() },
	})
</script>

<!-- A row opens to its sentence and back; one row at a time -->
<Story
	name="Default"
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		for (const item of canSee) {
			await expect(canvas.getByRole('button', { name: new RegExp(`^${item.id} ${item.count}$`) })).toBeVisible()
		}
		const row = canvas.getByRole('button', { name: new RegExp(`^${first.id} ${first.count}$`) })
		await expect(row).toHaveAttribute('aria-expanded', 'false')
		await userEvent.click(row)
		await expect(row).toHaveAttribute('aria-expanded', 'true')
		await expect(args.onexpand).toHaveBeenCalledWith(first)
		await expect(canvas.getByRole('region', { name: new RegExp(`^${first.id} ${first.count}$`) })).toHaveTextContent(
			s.inContext(first.count, first.id)
		)
		const second = canSee[1]!
		await userEvent.click(canvas.getByRole('button', { name: new RegExp(`^${second.id} ${second.count}$`) }))
		await expect(row).toHaveAttribute('aria-expanded', 'false')
		await expect(canvas.getAllByRole('region')).toHaveLength(1)
	}}
/>

<!-- A name shows in place of the id -->
<Story
	name="With labels"
	args={{ items: labelled }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('button', { name: /^Stock item 22$/ })).toBeVisible()
		await expect(canvas.getByRole('button', { name: /^Preferred name 1$/ })).toBeVisible()
		await expect(canvas.queryByText('preferred-name')).toBeNull()
	}}
/>

<!-- Ids with nothing to read are not listed -->
<Story
	name="Nothing to read"
	args={{ items: withEmpty }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByRole('button')).toHaveLength(2)
		await expect(canvas.queryByText('local-event')).toBeNull()
		await expect(canvas.queryByText('task')).toBeNull()
	}}
/>

<!-- The consumer's snippet fills the region with the rows themselves; a long list scrolls inside it -->
<Story
	name="Expanded"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: new RegExp(`^${first.id} ${first.count}$`) }))
		const region = canvas.getByRole('region', { name: new RegExp(`^${first.id} ${first.count}$`) })
		await expect(region.querySelectorAll('li')).toHaveLength(rows.length)
	}}
>
	{#snippet template(args)}
		<ReadList {...args}>
			{#snippet expanded()}
				<ul class="rows">
					{#each rows as row (row.id)}
						<li><span>{row.name}</span><span class="rows-qty">{row.qty} {row.unit ?? ''}</span></li>
					{/each}
				</ul>
			{/snippet}
		</ReadList>
	{/snippet}
</Story>

<!-- What was cut to fit the pack closes the list in a caption -->
<Story
	name="Trimmed"
	args={{ trimmed: ['recipe', 'stock-item'] }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(s.trimmed('recipe, stock-item'))).toBeVisible()
	}}
/>

<style>
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
</style>
