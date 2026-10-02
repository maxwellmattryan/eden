<script lang="ts">
	import { onMount } from 'svelte'
	import { meadow } from '@eden/shared/domains/places'
	import Meadow from '$lib/domains/places/views/Meadow.svelte'

	onMount(() => {
		void meadow.load()
	})
</script>

<Meadow />
