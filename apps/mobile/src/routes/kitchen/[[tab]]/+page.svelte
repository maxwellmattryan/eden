<script lang="ts">
	import { onMount } from 'svelte'
	import Hearth from '$lib/domains/kitchen/views/Hearth.svelte'
	import { kitchen } from '@eden/shared/domains/kitchen'

	onMount(() => {
		void kitchen.load()
	})
</script>

<Hearth />
