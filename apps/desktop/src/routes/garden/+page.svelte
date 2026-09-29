<script lang="ts">
	import { onMount } from 'svelte'
	import { manifests } from '$lib/domains'
	import Garden from '$lib/domains/garden/Garden.svelte'
	import { garden } from '$lib/domains/garden/store.svelte'

	onMount(() => {
		void garden.load()
		for (const manifest of manifests) void manifest.load?.()
	})
</script>

<Garden />
