<script lang="ts">
	import { onMount } from 'svelte'
	import Toolbench from '$lib/domains/toolbench/views/Toolbench.svelte'
	import { toolbench } from '@eden/shared/domains/toolbench'

	onMount(() => {
		void toolbench.load()
	})
</script>

<Toolbench />
