<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import Orchard from '@eden/shared/domains/finance/views/Orchard.svelte'
	import { finance } from '@eden/shared/domains/finance'

	onMount(() => {
		void finance.load()
	})
</script>

<Orchard tab={page.params.tab} />
