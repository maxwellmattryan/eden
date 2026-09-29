<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import DailyLine from './DailyLine.svelte'
	import { dailyLines } from '../../../stories/sample-data.js'

	const [marcus, neutral, , japanese] = dailyLines

	const { Story } = defineMeta({
		title: 'Components/Brand/DailyLine',
		component: DailyLine,
		tags: ['autodocs'],
		args: { line: marcus.line, source: marcus.source, large: false },
	})
</script>

<Story name="Default" />

<Story name="Large" args={{ line: neutral.line, source: neutral.source, large: true }} />

<Story name="Japanese" args={{ line: japanese.line, source: japanese.source, lang: 'ja' }} />
