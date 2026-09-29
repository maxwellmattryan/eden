<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import Chip, { type ChipTone } from './Chip.svelte'
	import { iconNames } from '$lib/icons/icons.js'
	import { budget, canSee, integrations } from '../../../stories/sample-data.js'

	const tones: { tone: ChipTone; label: string }[] = [
		{ tone: 'neutral', label: 'fridge' },
		{ tone: 'accent', label: 'weeknight' },
		{ tone: 'ai', label: 'stock-item' },
		{ tone: 'honey', label: budget.model },
		{ tone: 'grey', label: 'Google Family' },
		{ tone: 'outline', label: 'Low stock' },
	]

	const { Story } = defineMeta({
		title: 'Components/Data/Chip',
		component: Chip,
		tags: ['autodocs'],
		args: { label: 'fridge', tone: 'neutral', onselect: fn() },
		argTypes: {
			tone: { control: 'select', options: ['neutral', 'accent', 'ai', 'honey', 'grey', 'outline'] },
			status: { control: 'select', options: [undefined, 'healthy', 'stale', 'failed', 'off'] },
			icon: { control: 'select', options: iconNames },
			meter: { control: { type: 'range', min: 0, max: 100 } },
		},
	})
</script>

<Story name="Tones">
	{#snippet template(args)}
		<div class="row">
			{#each tones as { tone, label } (tone)}
				<Chip {...args} {tone} {label} />
			{/each}
		</div>
	{/snippet}
</Story>

<Story name="With icon and count">
	{#snippet template(args)}
		<div class="row">
			<Chip {...args} label={canSee[0]!.id} count={canSee[0]!.count} tone="ai" mono />
			<Chip {...args} label="Low stock" tone="outline" icon="chevron-down" />
			<Chip {...args} label="Google Family" tone="grey" icon="lock" />
			<Chip {...args} label="No key on this device" tone="grey" icon="sparkles" />
		</div>
	{/snippet}
</Story>

<!-- Healthy is the accent, stale the warning, failed danger, off quiet; the word is beside the dot for assistive technology -->
<Story name="Status dots" args={{ onclick: fn() }}>
	{#snippet template(args)}
		<div class="row">
			{#each integrations as integration (integration.id)}
				<Chip {...args} label={integration.label} status={integration.status} />
			{/each}
			<Chip {...args} label="Open-Meteo" status="stale" />
			<Chip {...args} label="HealthKit" status="failed" />
		</div>
	{/snippet}
</Story>

<!-- The model chip: the Gardener's hands in honey, with the month's budget as a meter -->
<Story
	name="Meter"
	args={{ label: budget.model, tone: 'honey', icon: 'sparkles', meter: budget.percent, onclick: fn() }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByRole('meter')[0]!).toHaveAttribute('aria-valuenow', String(budget.percent))
	}}
/>

<!-- A selectable chip toggles its own state and reports it -->
<Story
	name="Selectable"
	args={{ label: 'fridge', selectable: true }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const chip = canvas.getAllByRole('button', { name: 'fridge' })[0]!
		await expect(chip).toHaveAttribute('aria-pressed', 'false')
		await userEvent.click(chip)
		await expect(chip).toHaveAttribute('aria-pressed', 'true')
		await expect(args.onselect).toHaveBeenLastCalledWith(true)
		await userEvent.click(chip)
		await expect(chip).toHaveAttribute('aria-pressed', 'false')
		await expect(args.onselect).toHaveBeenLastCalledWith(false)
	}}
/>

<Story name="Mono" args={{ label: 'kg', mono: true }} />

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
</style>
