<script lang="ts">
	// The device's Coinbase key (product/domains/finance.md §8, D-204): the key's name and its private key, tried
	// against Coinbase and stored in the device's secure store only once Coinbase says the key can view and can neither
	// trade nor transfer. Once saved they are never shown again: the webview can only ask whether a key exists. Replace
	// key and Reconnect open straight on the empty fields. What was typed is cleared whenever the sheet closes.
	import { Button, Field, Icon, InlineError, Sheet, Spinner } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import type { CryptoErrorCode } from '../../../api/crypto.js'
	import { t } from '../../../i18n/index.js'
	import { crypto, saveCoinbaseKey } from '../crypto.svelte.js'

	type Props = {
		open: boolean
	}
	let { open = $bindable() }: Props = $props()

	const uid = $props.id()
	let name = $state('')
	let privateKey = $state('')
	let saving = $state(false)
	let failure = $state<CryptoErrorCode>()
	/** Replace key was chosen in the sheet: the empty fields show though a key is saved. */
	let replace = $state(false)
	const held = $derived(Boolean(crypto.status?.hasKey) && !crypto.replacing && !replace)
	const ready = $derived(Boolean(name.trim() && privateKey.trim()) && !saving)

	/** The refusals that are the key's own, shown under its field; anything else can be retried. */
	const KEY_ERRORS: Partial<Record<CryptoErrorCode, string>> = {
		'invalid-key': 'domains.finance.crypto.key.invalid',
		refused: 'domains.finance.crypto.key.refused',
		'not-read-only': 'domains.finance.crypto.key.notReadOnly',
	}
	const keyError = $derived(failure ? KEY_ERRORS[failure] : undefined)

	async function focusName() {
		await tick()
		document.getElementById(`${uid}-name`)?.focus()
	}

	async function save(event?: SubmitEvent) {
		event?.preventDefault()
		if (!ready) return
		saving = true
		failure = undefined
		const code = await saveCoinbaseKey(name, privateKey)
		saving = false
		if (!code) return
		failure = code
		if (code === 'invalid-key') await focusName()
	}

	function replaceKey() {
		replace = true
		void focusName()
	}

	/** Whatever was typed goes with the sheet. */
	function closed() {
		name = ''
		privateKey = ''
		failure = undefined
		replace = false
		saving = false
		crypto.replacing = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title" onclose={closed}>
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.finance.crypto.key.title')}</h2>
	{/snippet}
	{#if held}
		<p class="held"><Icon name="circle-check" size="sm" />{$t('domains.finance.crypto.key.held')}</p>
	{:else}
		<form class="form" id="{uid}-form" onsubmit={save} novalidate>
			<Field
				id="{uid}-name"
				label={$t('domains.finance.crypto.key.name')}
				bind:value={name}
				autocomplete="off"
				spellcheck="false"
				disabled={saving}
				mono
			/>
			<Field
				id="{uid}-key"
				type="password"
				label={$t('domains.finance.crypto.key.privateKey')}
				bind:value={privateKey}
				helper={$t('domains.finance.crypto.key.help')}
				error={keyError ? $t(keyError) : undefined}
				autocomplete="off"
				spellcheck="false"
				disabled={saving}
				mono
			/>
		</form>
		{#if failure && !keyError}
			<InlineError message={$t('domains.finance.crypto.key.unreachable')} onretry={() => save()} live />
		{/if}
	{/if}
	{#snippet footer()}
		{#if held}
			<Button label={$t('domains.finance.crypto.key.replace')} variant="secondary" onclick={replaceKey} />
		{:else}
			{#if saving}<Spinner size="sm" />{/if}
			<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => (open = false)} />
			<Button
				label={$t('domains.finance.crypto.key.save')}
				variant="primary"
				type="submit"
				form="{uid}-form"
				disabled={!ready}
			/>
		{/if}
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.held {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font: var(--ed-t-body);
		color: var(--text-primary);
	}
</style>
