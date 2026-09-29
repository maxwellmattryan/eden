<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Composite from './Composite.svelte'

	// The default frame shows this once per platform: 32 px controls and 14 px text on desktop, 44 px and 16 px on mobile.
	const { Story } = defineMeta({
		title: 'Foundations/Platform',
		component: Composite,
	})
</script>

<Story name="Desktop and mobile side by side" />
