<script lang="ts">
	// The crash screen the global error handler raises: the crash card, once the crash store holds an error.
	import { crashError, hasCrashed } from '../stores/index.js'
	import CrashCard from './CrashCard.svelte'
</script>

{#if $hasCrashed}
	<CrashCard error={$crashError} />
{/if}
