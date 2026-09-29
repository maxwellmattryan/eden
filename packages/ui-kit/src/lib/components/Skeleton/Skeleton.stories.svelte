<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import Skeleton from './Skeleton.svelte'
	import { stock } from '../../../stories/sample-data.js'

	// As many rows as the fridge list it stands in for.
	const fridgeRows = stock.filter((item) => item.location === 'fridge').length

	const { Story } = defineMeta({
		title: 'Components/Feedback/Skeleton',
		component: Skeleton,
		tags: ['autodocs'],
		args: { rows: 3, icon: true },
		argTypes: { rows: { control: { type: 'number', min: 0, max: 12 } } },
	})
</script>

<Story
	name="Default"
	play={async ({ canvasElement }) => {
		const root = canvasElement.querySelector('[aria-busy="true"]')
		await expect(root).not.toBeNull()
		await expect(root).toHaveTextContent('Loading')
	}}
>
	{#snippet template(args)}
		<div style="max-width: 420px">
			<Skeleton {...args} />
		</div>
	{/snippet}
</Story>

<Story name="No icon" args={{ rows: fridgeRows, icon: false }}>
	{#snippet template(args)}
		<div style="max-width: 420px">
			<Skeleton {...args} />
		</div>
	{/snippet}
</Story>

<Story name="Compact" args={{ rows: fridgeRows }} parameters={{ platforms: ['desktop'] }}>
	{#snippet template(args)}
		<div data-density="compact" style="max-width: 420px">
			<Skeleton {...args} />
		</div>
	{/snippet}
</Story>
