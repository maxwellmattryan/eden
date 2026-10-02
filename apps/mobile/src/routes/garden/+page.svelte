<script lang="ts">
	import { onMount } from 'svelte'
	import { feed } from '@eden/shared/shell'
	import { manifests } from '$lib/domains'
	import Garden from '$lib/shell/garden/Garden.svelte'

	onMount(() => {
		void feed.load()
		for (const manifest of manifests) void manifest.load?.()
	})
</script>

<Garden />
