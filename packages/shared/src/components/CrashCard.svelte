<script lang="ts">
	// The crash card: the message, a copy button and a restart, on the page surface. It covers everything, including
	// the shell, because the state behind the shell can no longer be trusted. CrashScreen renders it from the crash
	// store; hooks.client.ts mounts the same card for an error before the layout exists, so the two never differ.
	// It is a modal <dialog>, so it opens in the browser's top layer: a sheet, a menu or a popover that was open when
	// the error came is in that layer too, and a card drawn beneath it would be a crash nobody sees. Escape does not
	// close it; the only ways out are the two buttons. Focus lands on the card itself, never on a button: nothing looks
	// pressed or ringed until Tab is pressed.
	import { Button } from '@eden/ui-kit'
	import { t } from '../i18n/index.js'
	import { crashStore } from '../stores/index.js'
	import type { CrashInfo } from '../types/index.js'

	let { error }: { error: CrashInfo | null } = $props()

	let copied = $state(false)

	async function copy() {
		const details = crashStore.formatErrorDetails({ hasCrashed: true, error })
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

	/** Opens the card over everything, whatever else is in the top layer. */
	function show(dialog: HTMLDialogElement) {
		if (dialog.open) return
		dialog.showModal()
		dialog.focus({ preventScroll: true })
	}
</script>

<dialog
	class="crash"
	role="alertdialog"
	aria-labelledby="crash-title"
	aria-describedby="crash-text"
	tabindex="-1"
	{@attach show}
	oncancel={(event) => event.preventDefault()}
	onclose={(event) => show(event.currentTarget)}
>
	<div class="crash-card">
		<h2 id="crash-title" class="crash-title">{$t('crash.title')}</h2>
		<p id="crash-text" class="crash-text">{$t('crash.text', { values: { name: $t('app.name') } })}</p>
		<div class="crash-details">
			<span class="crash-details-label">{$t('crash.details')}</span>
			<code>{error?.message || $t('crash.unknown')}</code>
		</div>
		<div class="crash-actions">
			<Button label={copied ? $t('crash.copied') : $t('crash.copy')} icon={copied ? 'check' : 'copy'} onclick={copy} />
			<Button
				variant="primary"
				label={$t('crash.reset', { values: { name: $t('app.name') } })}
				icon="rotate-ccw"
				onclick={reset}
			/>
		</div>
	</div>
</dialog>

<style>
	.crash {
		position: fixed;
		inset: 0;
		z-index: 9999;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		margin: 0;
		border: 0;
		align-items: center;
		justify-content: center;
		background: var(--surface-0);
		color: var(--text-primary);
		padding: var(--ed-gutter);
	}
	/* takes focus only from show(), so the browser never puts it on a button */
	.crash:focus {
		outline: none;
	}
	.crash[open] {
		display: flex;
	}
	.crash::backdrop {
		background: transparent;
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
