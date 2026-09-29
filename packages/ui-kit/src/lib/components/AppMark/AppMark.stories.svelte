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

<!-- the drawing alone in the brand colour, so it follows the theme and the accent; the surface shows through its cuts -->
<Story name="Default" />

<!-- the size of the splash and About, where the cracks and the leaf veins show -->
<Story name="Large">
	{#snippet template()}
		<AppMark style="width: 96px; height: 96px" />
	{/snippet}
</Story>

<!-- the head of the desktop sidebar (D-55): the mark beside the wordmark at display-md -->
<Story name="With wordmark">
	{#snippet template()}
		<div style="display: flex; align-items: center; gap: var(--space-2)">
			<AppMark />
			<Wordmark name="Eden" size="md" />
		</div>
	{/snippet}
</Story>
