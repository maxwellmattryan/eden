<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import Toolbench from '@eden/shared/domains/toolbench/views/Toolbench.svelte'
	import { toolbench } from '@eden/shared/domains/toolbench'

	onMount(() => {
		void toolbench.load()
	})
</script>

<Toolbench tab={page.params.tab} />
