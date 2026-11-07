<script lang="ts">
	// The device's Plaid keys (product/domains/finance.md §8): the client id and this build's secret, tried against
	// Plaid and stored in the device's secure store only once Plaid accepts them. Once saved they are never shown
	// again: the webview can only ask whether they exist, so the sheet offers to replace or remove them. What was
	// typed is cleared from the sheet's state whenever it closes.
	import { Button, ConfirmSheet, Field, Icon, InlineError, Sheet, Spinner } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import type { PlaidErrorCode } from '../../../api/plaid.js'
	import { t } from '../../../i18n/index.js'
	import { clearKeys, plaid, saveKeys } from '../plaid.svelte.js'

	type Props = {
		open: boolean
	}
	let { open = $bindable() }: Props = $props()

	const uid = $props.id()
	const production = $derived(plaid.status?.environment === 'production')
	let clientId = $state('')
	let secret = $state('')
	let saving = $state(false)
	let failure = $state<PlaidErrorCode>()
	/** "Replace keys" was chosen: the empty fields show though keys are saved. */
	let replacing = $state(false)
	let confirming = $state(false)
	const held = $derived(Boolean(plaid.status?.hasKeys) && !replacing)
	const ready = $derived(Boolean(clientId.trim() && secret.trim()) && !saving)

	async function focusClientId() {
		await tick()
		document.getElementById(`${uid}-client`)?.focus()
	}

	async function save(event?: SubmitEvent) {
		event?.preventDefault()
		if (!ready) return
		saving = true
		failure = undefined
		const code = await saveKeys(clientId, secret)
		saving = false
		if (!code) return
		failure = code
		if (code === 'invalid-keys') await focusClientId()
	}

	function replace() {
		replacing = true
		void focusClientId()
	}

	/** Whatever was typed goes with the sheet. */
	function closed() {
		clientId = ''
		secret = ''
		failure = undefined
		replacing = false
		saving = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title" onclose={closed}>
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.finance.plaid.keys.title')}</h2>
	{/snippet}
	{#if held}
		<p class="held"><Icon name="circle-check" size="sm" />{$t('domains.finance.plaid.keys.held')}</p>
	{:else}
		<form class="form" id="{uid}-form" onsubmit={save} novalidate>
			<Field
				id="{uid}-client"
				label={$t('domains.finance.plaid.keys.clientId')}
				bind:value={clientId}
				autocomplete="off"
				spellcheck="false"
				disabled={saving}
				mono
			/>
			<Field
				id="{uid}-secret"
				type="password"
				label={$t(`domains.finance.plaid.keys.${production ? 'productionSecret' : 'sandboxSecret'}`)}
				bind:value={secret}
				helper={$t('domains.finance.plaid.keys.help')}
				error={failure === 'invalid-keys' ? $t('domains.finance.plaid.keys.refused') : undefined}
				autocomplete="off"
				spellcheck="false"
				disabled={saving}
				mono
			/>
		</form>
		{#if failure && failure !== 'invalid-keys'}
			<InlineError message={$t('domains.finance.plaid.keys.unreachable')} onretry={() => save()} live />
		{/if}
	{/if}
	{#snippet footer()}
		{#if held}
			<Button label={$t('domains.finance.plaid.keys.replace')} variant="secondary" onclick={replace} />
			<Button label={$t('domains.finance.plaid.keys.remove')} variant="danger" onclick={() => (confirming = true)} />
		{:else}
			{#if saving}<Spinner size="sm" />{/if}
			<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => (open = false)} />
			<Button
				label={$t('domains.finance.plaid.keys.save')}
				variant="primary"
				type="submit"
				form="{uid}-form"
				disabled={!ready}
			/>
		{/if}
	{/snippet}
</Sheet>

<ConfirmSheet
	bind:open={confirming}
	title={$t('domains.finance.plaid.keys.removeTitle')}
	text={$t('domains.finance.plaid.keys.removeText')}
	subject={$t('domains.finance.plaid.keys.removeSubject')}
	resource={$t('domains.finance.plaid.keys.removeResource')}
	verb={$t('domains.finance.plaid.keys.remove')}
	danger
	onconfirm={() => {
		replacing = false
		void clearKeys()
	}}
/>

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
