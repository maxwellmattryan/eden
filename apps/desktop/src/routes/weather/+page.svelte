<script lang="ts">
	import { onMount } from 'svelte'
	import Sky from '$lib/domains/weather/views/Sky.svelte'
	import { weather } from '$lib/domains/weather/store.svelte'

	onMount(() => {
		void weather.load()
	})
</script>

<Sky />
