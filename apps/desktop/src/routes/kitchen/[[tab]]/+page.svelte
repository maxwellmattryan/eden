<script lang="ts">
	import { onMount } from 'svelte'
	import Hearth from '$lib/domains/kitchen/views/Hearth.svelte'
	import { kitchen } from '$lib/domains/kitchen/store.svelte'

	onMount(() => {
		void kitchen.load()
	})
</script>

<Hearth />
