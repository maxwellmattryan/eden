<script lang="ts">
	// SvelteKit's error page: a routing or load error that is not a crash. Says what happened and offers the Garden.
	import { Button } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { resolve } from '$app/paths'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
</script>

<div class="error">
	<h1 class="error-title">{$t('error.title')}</h1>
	<p class="error-status">{$t('error.status', { values: { status: page.status } })}</p>
	{#if page.error?.message}
		<code class="error-message">{page.error.message}</code>
	{/if}
	<Button variant="primary" label={$t('error.home')} icon="arrow-left" onclick={() => goto(resolve('/garden'))} />
</div>

<style>
	.error {
		display: grid;
		justify-items: start;
		gap: 12px;
		padding: var(--ed-gutter);
	}
	.error-title {
		margin: 0;
		font: var(--ed-t-display-md);
		color: var(--text-primary);
	}
	.error-status {
		margin: 0;
		font: var(--ed-t-body);
		color: var(--text-secondary);
	}
	.error-message {
		font: var(--ed-t-code);
		color: var(--text-secondary);
		white-space: pre-wrap;
	}
</style>
