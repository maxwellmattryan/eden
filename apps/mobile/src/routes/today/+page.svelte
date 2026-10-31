<script lang="ts">
	import { onMount } from 'svelte'
	import { tasks } from '@eden/shared/shell/today'
	import Today from '$lib/shell/today/Today.svelte'

	onMount(() => {
		void tasks.load()
		// the minute moves while the page is open, so a time passes and the day turns without a reload
		return tasks.watch()
	})
</script>

<Today />
