<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import AppMark from './AppMark.svelte'
	import Wordmark from '../Wordmark/Wordmark.svelte'

	const { Story } = defineMeta({
		title: 'Components/Brand/AppMark',
		component: AppMark,
		tags: ['autodocs'],
	})
</script>

<!-- the brand ground and the on-brand ink, so it follows the theme and the accent -->
<Story name="Default" />

<!-- the head of the desktop sidebar (D-55): the mark beside the wordmark at display-md -->
<Story name="With wordmark">
	{#snippet template()}
		<div style="display: flex; align-items: center; gap: var(--space-2)">
			<AppMark />
			<Wordmark name="eden" size="md" />
		</div>
	{/snippet}
</Story>
