<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { canSee, canSeeLocked, stock } from '../../../stories/sample-data.js'
	import CanSee, { type CanSeeItem } from './CanSee.svelte'

	const s = defaultStrings.gardener
	const first = canSee[0]!
	const lockedIds = new Set(canSeeLocked)
	/** The ids this request was granted: the locked one is kept out of the items. */
	const granted: CanSeeItem[] = canSee.filter((item) => !lockedIds.has(item.id))
	/** The names the owner knows the ids by. */
	const names: Record<string, string> = {
		'stock-item': 'Stock',
		recipe: 'Recipes',
		'dietary-preference': 'Dietary preferences',
		allergy: 'Allergies',
		'medical-dietary-restriction': 'Medical dietary restriction',
	}
	const labelled = (items: CanSeeItem[]): CanSeeItem[] => items.map((item) => ({ ...item, label: names[item.id] }))
	const locked = labelled(canSeeLocked.map((id) => ({ id })))
	const withEmpty: CanSeeItem[] = [...granted.slice(0, 2), { id: 'local-event', count: 0 }, { id: 'task', count: 0 }]
	const trimmed = ['recipe', 'stock-item']
	const rows = stock.slice(0, 3)
	const total = (items: CanSeeItem[]) =>
		items.reduce((sum, item) => sum + (typeof item.count === 'number' ? item.count : 0), 0)
	const chipName = new RegExp(`^${s.canSee}`)

	/** Presses the button and waits for the panel. */
	async function openPanel(canvasElement: HTMLElement) {
		const canvas = canvasOf(canvasElement)
		const chip = canvas.getByRole('button', { name: chipName })
		await userEvent.click(chip)
		const dialog = await canvas.findByRole('dialog', { name: s.canSeeTitle })
		await waitFor(() => expect(dialog).toBeVisible())
		return { canvas, chip, dialog, panel: within(dialog) }
	}

	const { Story } = defineMeta({
		title: 'Components/Gardener/CanSee',
		component: CanSee,
		tags: ['autodocs'],
		parameters: {
			platformFrame: 'inline',
			docs: {
				description: {
					component:
						'The eye under a reply: an eye `IconButton`, like the copy glyph beside it, that opens a `DetailPopover` saying, literally, what the Gardener read for that reply. One row per id with rows it read, each opening to the rows themselves or to a sentence saying how many there are; the ids with nothing to read behind a quiet toggle; what was trimmed; the T2 ids kept out, each with an Allow when the app can ask for the grant; the audit log one quiet button away.',
				},
			},
		},
		args: { items: canSee, locked: [], trimmed: [], onexpand: fn() },
	})
</script>

<!-- The button opens the panel, whose caption counts the rows; a row opens to its sentence and back -->
<Story
	name="Default"
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const chip = canvas.getByRole('button', { name: chipName })
		await expect(chip).toHaveAttribute('aria-expanded', 'false')
		const { panel, dialog } = await openPanel(canvasElement)
		await expect(chip).toHaveAttribute('aria-expanded', 'true')
		await expect(panel.getByText(s.canSeeSummary(total(canSee), canSee.length))).toBeVisible()
		for (const item of canSee) {
			await expect(panel.getByRole('button', { name: new RegExp(`^${item.id} ${item.count}$`) })).toBeVisible()
		}
		const row = panel.getByRole('button', { name: new RegExp(`^${first.id} ${first.count}$`) })
		await expect(row).toHaveAttribute('aria-expanded', 'false')
		await userEvent.click(row)
		await expect(row).toHaveAttribute('aria-expanded', 'true')
		await expect(args.onexpand).toHaveBeenCalledWith(first)
		const region = panel.getByRole('region', { name: new RegExp(`^${first.id} ${first.count}$`) })
		await expect(region).toHaveTextContent(s.inContext(first.count, first.id))
		await userEvent.click(row)
		await expect(row).toHaveAttribute('aria-expanded', 'false')
		await expect(panel.queryByRole('region')).toBeNull()
		await expect(args.onexpand).toHaveBeenCalledTimes(1)
		await expect(panel.queryByRole('button', { name: s.openAuditLog })).toBeNull()
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(dialog).not.toBeVisible())
		await waitFor(() => expect(chip).toHaveFocus())
	}}
/>

<!-- The names the owner knows the ids by, in place of the ids -->
<Story
	name="With labels"
	args={{ items: labelled(canSee) }}
	play={async ({ canvasElement }) => {
		const { panel } = await openPanel(canvasElement)
		await expect(panel.getByRole('button', { name: new RegExp(`^${names[first.id]} ${first.count}$`) })).toBeVisible()
		await expect(panel.queryByText(first.id)).toBeNull()
	}}
/>

<!-- A T2 id kept out of this request sits under "Not shared" with a lock; with onunlock, Allow asks for the grant -->
<Story
	name="With locked"
	args={{ items: granted, locked, onunlock: fn() }}
	play={async ({ canvasElement, args }) => {
		const id = canSeeLocked[0]!
		const { panel } = await openPanel(canvasElement)
		await expect(
			panel.getByText(`${s.canSeeSummary(total(granted), granted.length)} · ${s.notShared(1)}`)
		).toBeVisible()
		const group = panel.getByRole('group', { name: s.notSharedLabel })
		await expect(group).toBeVisible()
		await expect(within(group).getByRole('button', { name: s.notSharedExplain })).toBeVisible()
		await expect(within(group).getByText(names[id]!)).toBeVisible()
		await expect(panel.queryByRole('button', { name: new RegExp(`^${id}`) })).toBeNull()
		await userEvent.click(within(group).getByRole('button', { name: s.allow }))
		await expect(args.onunlock).toHaveBeenCalledWith(id)
	}}
/>

<!-- Without onunlock the locked row is a picture with a spoken sentence beside it -->
<Story
	name="Locked, no grant"
	args={{ items: granted, locked }}
	play={async ({ canvasElement }) => {
		const { panel } = await openPanel(canvasElement)
		await expect(panel.getByText(s.locked(canSeeLocked[0]!))).toBeInTheDocument()
		await expect(panel.queryByRole('button', { name: s.allow })).toBeNull()
	}}
/>

<!-- Ids with nothing to read are not listed, and the caption counts only the types that are -->
<Story
	name="Nothing to read"
	args={{ items: withEmpty }}
	play={async ({ canvasElement }) => {
		const { panel } = await openPanel(canvasElement)
		await expect(panel.getByText(s.canSeeSummary(total(withEmpty), 2))).toBeVisible()
		await expect(panel.queryByText('local-event')).toBeNull()
		await expect(panel.queryByText('task')).toBeNull()
	}}
/>

<!-- The consumer's snippet fills the region with the rows themselves: the row is literal, never a summary; the panel
     eases to its new height rather than jumping -->
<Story
	name="Expanded"
	play={async ({ canvasElement }) => {
		const { panel, dialog } = await openPanel(canvasElement)
		await userEvent.click(panel.getByRole('button', { name: new RegExp(`^${first.id} ${first.count}$`) }))
		const region = panel.getByRole('region', { name: new RegExp(`^${first.id} ${first.count}$`) })
		await expect(region.querySelectorAll('li')).toHaveLength(rows.length)
		await waitFor(() => expect(dialog.getAnimations().length).toBeGreaterThan(0), { timeout: 1000 })
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

<!-- What was cut to fit the pack closes the section in a caption -->
<Story
	name="Trimmed"
	args={{ trimmed }}
	play={async ({ canvasElement }) => {
		const { panel } = await openPanel(canvasElement)
		await expect(panel.getByText(s.trimmed(trimmed.join(', ')))).toBeVisible()
	}}
/>

<!-- With onaudit the footer carries the audit log button -->
<Story
	name="With audit"
	args={{ onaudit: fn() }}
	play={async ({ canvasElement, args }) => {
		const { panel } = await openPanel(canvasElement)
		await userEvent.click(panel.getByRole('button', { name: s.openAuditLog }))
		await expect(args.onaudit).toHaveBeenCalledTimes(1)
	}}
/>

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
