<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import Vigor from '@eden/shared/domains/fitness/views/Vigor.svelte'
	import { fitness } from '@eden/shared/domains/fitness'

	onMount(() => {
		void fitness.load()
	})
</script>

<Vigor tab={page.params.tab} />
