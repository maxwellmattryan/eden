<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Dials from './Dials.svelte'

	const { Story } = defineMeta({
		title: 'Foundations/Dials',
		component: Dials,
		parameters: { platforms: ['desktop'], platformFrame: 'inline' },
	})
</script>

<Story name="Brand levels by relief" />
