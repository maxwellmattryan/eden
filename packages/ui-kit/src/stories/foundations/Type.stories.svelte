<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import TypeSpecimen from './TypeSpecimen.svelte'

	const { Story } = defineMeta({
		title: 'Foundations/Type',
		component: TypeSpecimen,
		parameters: { platforms: ['desktop'], platformFrame: 'inline' },
	})
</script>

<Story name="Specimens" />
