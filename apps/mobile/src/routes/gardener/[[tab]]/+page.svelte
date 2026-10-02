<script lang="ts">
	import { page } from '$app/state'
	import Gardener from '@eden/shared/shell/gardener/page/Gardener.svelte'
</script>

<Gardener tab={page.params.tab} />
