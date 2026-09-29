<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import MoonGlyph from './MoonGlyph.svelte'

	/** The eight named phases, by where they fall in the cycle. */
	const phases = [
		{ id: 'new', name: 'New moon', cycle: 0 },
		{ id: 'waxing-crescent', name: 'Waxing crescent', cycle: 0.125 },
		{ id: 'first-quarter', name: 'First quarter', cycle: 0.25 },
		{ id: 'waxing-gibbous', name: 'Waxing gibbous', cycle: 0.375 },
		{ id: 'full', name: 'Full moon', cycle: 0.5 },
		{ id: 'waning-gibbous', name: 'Waning gibbous', cycle: 0.625 },
		{ id: 'last-quarter', name: 'Last quarter', cycle: 0.75 },
		{ id: 'waning-crescent', name: 'Waning crescent', cycle: 0.875 },
	]

	const { Story } = defineMeta({
		title: 'Components/Data/MoonGlyph',
		component: MoonGlyph,
		tags: ['autodocs'],
		args: { cycle: 0.63, size: 'lg', label: 'Waning gibbous, 84 % lit' },
		argTypes: { cycle: { control: { type: 'range', min: 0, max: 1, step: 0.01 } } },
	})
</script>

<!-- The sample night: waning gibbous, 84 % lit -->
<Story
	name="Default"
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('img', { name: 'Waning gibbous, 84 % lit' })).toBeVisible()
	}}
/>

<!-- The eight named phases; every point between them has its own shape -->
<Story name="Phases">
	{#snippet template(args)}
		<ul class="phases">
			{#each phases as phase (phase.id)}
				<li>
					<MoonGlyph {...args} cycle={phase.cycle} label={undefined} />
					<span>{phase.name}</span>
				</li>
			{/each}
		</ul>
	{/snippet}
</Story>

<Story name="Sizes">
	{#snippet template(args)}
		<div class="sizes">
			<MoonGlyph {...args} size="sm" label={undefined} />
			<MoonGlyph {...args} size="md" label={undefined} />
			<MoonGlyph {...args} size="lg" label={undefined} />
		</div>
	{/snippet}
</Story>

<style>
	.phases {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-8) * 3), 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.phases li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.sizes {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}
</style>
