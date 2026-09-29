<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Stat from './Stat.svelte'
	import { budget, quickLogs, weightAverage, weightSeries } from '../../../stories/sample-data.js'

	const latest = String(weightSeries.at(-1))
	const unit = quickLogs[0]?.unit ?? ''

	const { Story } = defineMeta({
		title: 'Components/Data/Stat',
		component: Stat,
		tags: ['autodocs'],
		args: { value: latest, unit },
	})
</script>

<Story name="Default" />

<Story name="With unit" args={{ value: latest, unit: `${unit} · 7-day ${weightAverage}` }} />

<!-- lg heads a widget, md is one figure among several in a card, sm sits in a dense row -->
<Story name="Sizes">
	{#snippet template(args)}
		<div class="sizes">
			<Stat {...args} size="lg" />
			<Stat {...args} size="md" />
			<Stat {...args} size="sm" />
		</div>
	{/snippet}
</Story>

<Story name="Long value" args={{ value: '1,234,567.89', unit: `of ${budget.cap} ${budget.currency} this month` }} />

<style>
	.sizes {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
	}
</style>
