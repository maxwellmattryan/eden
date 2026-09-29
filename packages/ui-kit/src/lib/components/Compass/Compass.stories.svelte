<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { skyMotif } from '../../../stories/sample-data.js'
	import Compass from './Compass.svelte'

	/** The wind blows to the point opposite the one it comes from. */
	const downwind = (skyMotif.windFrom + 180) % 360
	const label = 'Wind from the south-south-east. North is up.'

	const { Story } = defineMeta({
		title: 'Components/Brand/Compass',
		component: Compass,
		tags: ['autodocs'],
		args: { bearing: downwind, label },
		argTypes: { bearing: { control: { type: 'range', min: 0, max: 359, step: 1 } } },
	})
</script>

<!-- A wind from the south-south-east: the needle points north-north-west, the way it blows -->
<Story
	name="Wind"
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		await expect(canvasOf(canvasElement).getByRole('img', { name: label })).toBeVisible()
	}}
/>

<Story name="North" args={{ bearing: 0, label: 'North' }} />

<Story name="East" args={{ bearing: 90, label: 'East' }} />

<Story name="Sizes">
	{#snippet template(args)}
		<div style="display: flex; align-items: center; gap: var(--space-4)">
			<Compass {...args} size="sm" label="Small" />
			<Compass {...args} size="md" label="Medium" />
			<Compass {...args} size="lg" label="Large" />
			<Compass {...args} size="xl" label="Extra large" />
		</div>
	{/snippet}
</Story>

<!-- Beside a label that already says it, the compass is decoration -->
<Story name="Decorative" args={{ label: undefined }} />

<Story name="With a tooltip" args={{ tooltip: 'The wind blows to the north-north-west.' }} />
