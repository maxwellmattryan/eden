<script lang="ts">
	import { onMount } from 'svelte'
	import Sky from '$lib/domains/weather/views/Sky.svelte'
	import { weather } from '@eden/shared/weather'

	onMount(() => {
		void weather.load()
	})
</script>

<Sky />
