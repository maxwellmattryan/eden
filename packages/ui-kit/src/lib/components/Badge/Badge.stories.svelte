<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Badge, { type BadgeKind } from './Badge.svelte'
	import { grocery, stock } from '../../../stories/sample-data.js'

	/** Every kind, with the row qualifiers labelled the way a row would label them. */
	const kinds: { id: string; kind: BadgeKind; label?: string }[] = [
		{ id: 'read', kind: 'read' },
		{ id: 'write-draft', kind: 'write-draft' },
		{ id: 'write', kind: 'write' },
		{ id: 'act-external', kind: 'act-external' },
		{ id: 'tier', kind: 'tier' },
		{ id: 'estimated', kind: 'estimated' },
		{ id: 'origin-low-stock', kind: 'origin', label: grocery.items[0]!.origin },
		{ id: 'origin-recipe', kind: 'origin', label: grocery.items[2]!.origin },
		{ id: 'warning', kind: 'warning', label: 'expires tomorrow' },
		{ id: 'ai', kind: 'ai', label: 'inferred' },
		{ id: 'danger', kind: 'danger', label: 'expires today' },
		{ id: 'neutral', kind: 'neutral', label: 'mirror' },
	]

	const spinach = stock.find((item) => item.id === 'st-04')!
	const lmnt = grocery.items[0]!

	const { Story } = defineMeta({
		title: 'Components/Data/Badge',
		component: Badge,
		tags: ['autodocs'],
		args: { kind: 'write' },
		argTypes: {
			kind: {
				control: 'select',
				options: [
					'read',
					'write-draft',
					'write',
					'act-external',
					'tier',
					'estimated',
					'origin',
					'warning',
					'ai',
					'danger',
					'neutral',
				],
			},
		},
	})
</script>

<!-- read renders nothing, so the first slot is empty on purpose -->
<Story name="All kinds">
	{#snippet template(args)}
		<div class="row">
			{#each kinds as { id, kind, label } (id)}
				<Badge {...args} {kind} {label} />
			{/each}
		</div>
	{/snippet}
</Story>

<!-- Two row lines as a list would set them: the name in the platform text style, the badges after it -->
<Story name="In a row">
	{#snippet template(args)}
		<ul class="rows">
			<li class="line">
				<span class="name">{spinach.name}</span>
				<Badge {...args} kind="estimated" />
				<Badge {...args} kind="warning" label="expires tomorrow" />
				<span class="meta">{spinach.qty} {spinach.unit}</span>
			</li>
			<li class="line">
				<span class="name">{lmnt.name}</span>
				<Badge {...args} kind="origin" label={lmnt.origin} />
				<span class="meta">{lmnt.qty}</span>
			</li>
		</ul>
	{/snippet}
</Story>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		max-width: var(--sheet-max);
	}
	.line {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--ed-row);
		border-bottom: 1px solid var(--stroke-subtle);
		font: var(--ed-t-text);
	}
	.name {
		flex: 1;
	}
	.meta {
		font: var(--ed-t-data-sm);
		color: var(--text-secondary);
	}
</style>
