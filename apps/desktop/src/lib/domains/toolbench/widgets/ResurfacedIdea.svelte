<script lang="ts">
	// The resurfaced-idea tile: the active idea left alone the longest, with how long.
	import { t } from '@eden/shared/i18n'
	import { toolbench } from '@eden/shared/domains/toolbench'
</script>

{#if toolbench.resurfaced}
	<p class="line">{toolbench.resurfaced.title}</p>
	<p class="meta">{$t('garden.untouched', { values: { days: toolbench.untouchedDays(toolbench.resurfaced) } })}</p>
{/if}

<style>
	.line {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.meta {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
