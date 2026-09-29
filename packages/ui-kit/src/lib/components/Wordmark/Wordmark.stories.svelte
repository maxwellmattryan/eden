<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Wordmark from './Wordmark.svelte'
	import DailyLine from '../DailyLine/DailyLine.svelte'
	import { dailyLines } from '../../../stories/sample-data.js'

	const [marcus] = dailyLines

	const { Story } = defineMeta({
		title: 'Components/Brand/Wordmark',
		component: Wordmark,
		tags: ['autodocs'],
		args: { name: 'eden' },
	})
</script>

<Story name="Default" />

<!-- The splash per docs/design/brand.md: the wordmark, one daily line with its source, nothing else, on surface-0. -->
<Story name="Splash composition">
	{#snippet template(args)}
		<div
			style="min-height: 420px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-4); text-align: center; background: var(--surface-0); color: var(--text-primary)"
		>
			<Wordmark {...args} />
			<DailyLine line={marcus.line} source={marcus.source} style="align-items: center" />
		</div>
	{/snippet}
</Story>
