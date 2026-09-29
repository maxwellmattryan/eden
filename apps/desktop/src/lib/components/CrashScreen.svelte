<script lang="ts">
	// The crash screen the global error handler raises: a card on the page surface with the message, a copy button and
	// a restart. It covers everything, including the shell, because the state behind the shell can no longer be trusted.
	import { Button } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { crashError, crashStore, hasCrashed } from '@eden/shared/stores'
	import { get } from 'svelte/store'

	let copied = $state(false)

	async function copy() {
		const details = crashStore.formatErrorDetails(get(crashStore))
		try {
			await navigator.clipboard.writeText(details)
			copied = true
			setTimeout(() => (copied = false), 2000)
		} catch {
			// no clipboard: the details stay on screen
		}
	}

	function reset() {
		window.location.reload()
	}
</script>

{#if $hasCrashed}
	<div class="crash" role="alertdialog" aria-labelledby="crash-title" aria-describedby="crash-text">
		<div class="crash-card">
			<h2 id="crash-title" class="crash-title">{$t('crash.title')}</h2>
			<p id="crash-text" class="crash-text">{$t('crash.text', { values: { name: $t('app.name') } })}</p>
			<div class="crash-details">
				<span class="crash-details-label">{$t('crash.details')}</span>
				<code>{$crashError?.message || $t('crash.unknown')}</code>
			</div>
			<div class="crash-actions">
				<Button
					label={copied ? $t('crash.copied') : $t('crash.copy')}
					icon={copied ? 'check' : 'copy'}
					onclick={copy}
				/>
				<Button
					variant="primary"
					label={$t('crash.reset', { values: { name: $t('app.name') } })}
					icon="rotate-ccw"
					onclick={reset}
				/>
			</div>
		</div>
	</div>
{/if}

<style>
	.crash {
		position: fixed;
		inset: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-0);
		padding: var(--ed-gutter);
	}
	.crash-card {
		width: 100%;
		max-width: 28rem;
		display: grid;
		gap: 12px;
		border: 1px solid var(--stroke);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		padding: 24px;
	}
	.crash-title {
		margin: 0;
		font: var(--ed-t-title-lg);
		color: var(--text-primary);
	}
	.crash-text {
		margin: 0;
		font: var(--ed-t-body);
		color: var(--text-secondary);
	}
	.crash-details {
		display: grid;
		gap: 6px;
		border: 1px solid var(--stroke-subtle);
		border-radius: var(--ed-radius-control);
		background: var(--surface-2);
		padding: 12px;
	}
	.crash-details-label {
		font: var(--ed-t-label);
		color: var(--text-secondary);
	}
	.crash-details code {
		display: block;
		max-height: 8rem;
		overflow: auto;
		font: var(--ed-t-code);
		white-space: pre-wrap;
		word-break: break-all;
		color: var(--text-primary);
	}
	.crash-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
