<script lang="ts">
	import { onMount } from 'svelte'
	import { manifests } from '$lib/domains'
	import { feed } from '$lib/shell/feed.svelte'
	import Garden from '$lib/shell/garden/Garden.svelte'

	onMount(() => {
		void feed.load()
		for (const manifest of manifests) void manifest.load?.()
	})
</script>

<Garden />
