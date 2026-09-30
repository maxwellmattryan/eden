<script lang="ts">
	// The composer beneath the thread (docs/engineering/ui-kit-components.md, "Deferred": an app composition): a
	// multiline field and one button, Send while the Gardener listens and Stop while it answers. Enter sends,
	// Shift+Enter breaks the line.
	import { Button, Field } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'

	type Props = {
		placeholder: string
		disabled?: boolean
		streaming?: boolean
		onsend: (text: string) => void
		onstop: () => void
	}
	let { placeholder, disabled = false, streaming = false, onsend, onstop }: Props = $props()

	let text = $state('')

	function send() {
		const value = text.trim()
		if (!value || disabled || streaming) return
		text = ''
		onsend(value)
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
		e.preventDefault()
		send()
	}
</script>

<div class="composer">
	<div class="composer-field">
		<Field bind:value={text} multiline {placeholder} {disabled} {onkeydown} label={$t('gardener.ask')} />
	</div>
	{#if streaming}
		<Button variant="secondary" icon="x" label={$t('gardener.stop')} onclick={onstop} />
	{:else}
		<Button variant="ai" icon="send" label={$t('gardener.send')} disabled={disabled || !text.trim()} onclick={send} />
	{/if}
</div>

<style>
	.composer {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
	}
	.composer-field {
		flex: 1;
		min-width: 0;
	}
</style>
