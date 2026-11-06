<script lang="ts">
	// The phone lock's screen (docs/engineering/app-scaffold.md, "The phone lock"): the splash's frame with a heading,
	// a line and one Unlock, over the whole window. It is a modal <dialog>, so it stands in the browser's top layer and
	// the pages under it stay mounted and inert. Escape does nothing, and Android's back is used up by the open dialog
	// (`closeTopLayer`). When another dialog opens under it (a notification tap opening its sheet), it opens itself
	// again on top; only the crash card stands over it. Focus lands on the dialog itself, never on the button, so
	// nothing is ringed until Tab. It shows once the splash has gone: until then the splash covers the shell.
	import { AppMark, Button, InlineError, dismissToast } from '@eden/ui-kit'
	import { t } from '../../i18n/index.js'
	import { hasCrashed, splashVisible } from '../../stores/index.js'
	import { phoneLock } from './lock.svelte.js'

	const LABEL = { face: 'lock.unlockFace', touch: 'lock.unlockTouch', fingerprint: 'lock.unlock', none: 'lock.unlock' }
	const label = $derived($t(LABEL[phoneLock.biometry]))

	function raise(dialog: HTMLDialogElement) {
		if (dialog.open) dialog.close()
		dialog.showModal()
		dialog.focus({ preventScroll: true })
	}

	// The browser can close a modal without a cancellable `cancel` (Chromium closes it on a second Escape with no
	// activation between), and a closed dialog no longer makes the page inert: while locked, it opens again at once.
	// raise() closes and reopens it, so its own close arrives with the dialog open again, and is let be.
	function reopen(dialog: HTMLDialogElement) {
		if (dialog.open || phoneLock.phase === 'open' || $hasCrashed) return
		raise(dialog)
	}

	// effect: imperative DOM. Opens the gate in the top layer, and keeps it on top of any dialog or popover (a menu, a
	// toast) opened after it.
	function gate(dialog: HTMLDialogElement) {
		dismissToast()
		// the crash card already up stays on top: the lock comes back with the relaunch it offers
		if (!$hasCrashed) raise(dialog)
		const observer = new MutationObserver((records) => {
			if ($hasCrashed) return
			const opened = records.some(
				(record) => record.target !== dialog && record.target instanceof HTMLDialogElement && record.target.open
			)
			if (opened) raise(dialog)
		})
		observer.observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true })
		// `toggle` does not bubble, so it is heard in the capture phase
		const onToggle = (event: Event) => {
			if ($hasCrashed || !(event instanceof ToggleEvent) || event.newState !== 'open') return
			const target = event.target
			if (!(target instanceof HTMLElement) || !target.hasAttribute('popover') || dialog.contains(target)) return
			raise(dialog)
		}
		document.addEventListener('toggle', onToggle, true)
		return () => {
			observer.disconnect()
			document.removeEventListener('toggle', onToggle, true)
		}
	}
</script>

{#if phoneLock.phase !== 'open' && !$splashVisible}
	<dialog
		class="lock"
		role="dialog"
		aria-labelledby="lock-title"
		aria-describedby="lock-line"
		tabindex="-1"
		{@attach gate}
		oncancel={(event) => event.preventDefault()}
		onclose={(event) => reopen(event.currentTarget)}
	>
		<div class="lock-column">
			<AppMark />
			<h2 id="lock-title" class="lock-title">{$t('lock.title', { values: { name: $t('app.name') } })}</h2>
			<p id="lock-line" class="lock-line">{$t('lock.line')}</p>
			<Button variant="primary" icon="lock" {label} disabled={phoneLock.prompting} onclick={() => phoneLock.unlock()} />
			<div class="lock-error">
				{#if phoneLock.failed}
					<InlineError message={$t('lock.failed')} live />
				{/if}
			</div>
		</div>
	</dialog>
{/if}

<style>
	.lock {
		position: fixed;
		inset: 0;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		margin: 0;
		border: 0;
		padding: calc(var(--ed-safe-top) + var(--space-6)) calc(var(--ed-safe-right) + var(--space-6))
			calc(var(--ed-safe-bottom) + var(--space-6)) calc(var(--ed-safe-left) + var(--space-6));
		background: var(--surface-0);
		color: var(--text-primary);
	}
	/* takes focus only from raise(), so the browser never puts it on the button */
	.lock:focus {
		outline: none;
	}
	.lock[open] {
		display: grid;
		place-items: center;
	}
	.lock::backdrop {
		background: var(--surface-0);
	}
	.lock-column {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: var(--space-3);
		text-align: center;
	}
	.lock-title {
		margin: var(--space-2) 0 0;
		font: var(--ed-t-title-lg);
		color: var(--text-primary);
	}
	.lock-line {
		margin: 0 0 var(--space-2);
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	/* held for the error (one line, its padding and its border), so the button never moves when it appears */
	.lock-error {
		display: grid;
		justify-items: center;
		align-items: start;
		min-height: calc(var(--ed-control) + var(--space-6));
	}
</style>
