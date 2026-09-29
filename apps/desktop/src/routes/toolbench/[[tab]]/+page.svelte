<script lang="ts">
	import { onMount } from 'svelte'
	import Toolbench from '$lib/domains/toolbench/views/Toolbench.svelte'
	import { toolbench } from '$lib/domains/toolbench/store.svelte'

	onMount(() => {
		void toolbench.load()
	})
</script>

<Toolbench />
