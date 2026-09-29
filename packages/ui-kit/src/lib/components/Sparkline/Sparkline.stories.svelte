<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Sparkline from './Sparkline.svelte'
	import { weightAverage, weightGoal, weightSeries } from '../../../stories/sample-data.js'

	const latest = weightSeries.at(-1)!

	const { Story } = defineMeta({
		title: 'Components/Data/Sparkline',
		component: Sparkline,
		tags: ['autodocs'],
		args: { values: weightSeries, width: 320, height: 48, legend: 'Weight' },
	})
</script>

<Story
	name="Default"
	args={{
		reference: weightAverage,
		referenceLabel: '7-day average',
		label: `Weight over 14 days, latest ${latest} kg, seven-day average ${weightAverage}`,
	}}
/>

<Story
	name="With reference and goal"
	args={{
		reference: weightGoal,
		referenceLabel: `Goal ${weightGoal.toFixed(1)} by 12-31`,
		label: `Weight over 14 days, latest ${latest} kg, goal ${weightGoal.toFixed(1)}`,
	}}
/>

<Story name="Empty" args={{ values: [] }} />

<Story name="Single" args={{ values: [latest] }} />

<Story name="Flat" args={{ values: Array.from({ length: 7 }, () => weightAverage) }} />
