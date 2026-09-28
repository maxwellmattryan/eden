<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Scales from './Scales.svelte'

	const { Story } = defineMeta({
		title: 'Foundations/Scales',
		component: Scales,
		parameters: { platforms: ['desktop'], platformFrame: 'inline' },
	})
</script>

<Story name="Spacing, radius, elevation, motion" />
