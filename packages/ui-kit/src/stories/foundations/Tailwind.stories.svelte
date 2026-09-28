<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import TailwindMapping from './TailwindMapping.svelte'

	const { Story } = defineMeta({
		title: 'Foundations/Tailwind mapping',
		component: TailwindMapping,
	})
</script>

<Story name="Utilities follow the accent" />
