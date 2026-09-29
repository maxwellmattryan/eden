<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Colors from './Colors.svelte'

	const { Story } = defineMeta({
		title: 'Foundations/Colors',
		component: Colors,
		parameters: { platforms: ['desktop'], platformFrame: 'inline' },
	})
</script>

<Story name="Tokens and contrast" />
