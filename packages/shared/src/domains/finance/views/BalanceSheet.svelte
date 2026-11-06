<script lang="ts">
	// The balance of an account entered by hand, as of now: one amount in the account's currency, written with today's
	// snapshot. A debt is entered as the positive amount owed, as the bank shows it.
	import { Button, Field, Sheet } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { t } from '../../../i18n/index.js'
	import { parseMoney, toDecimal } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { finance } from '../store.svelte.js'
	import { isDebt, type Account } from '../types.js'
	import { moneyError } from '../words.js'

	type Props = {
		open: boolean
		account: Account
	}
	let { open = $bindable(), account }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	// svelte-ignore state_referenced_locally
	let value = $state(account.balance ? toDecimal(account.balance) : '')
	let error = $state<string>()

	async function save(event: SubmitEvent) {
		event.preventDefault()
		const parsed = parseMoney(value, account.currency, lang)
		if ('error' in parsed) {
			error = moneyError(parsed.error, account.currency, $t, lang)
			await tick()
			document.getElementById(`${uid}-amount`)?.focus()
			return
		}
		const undo = finance.setBalance(account.id, parsed)
		if (undo) undoToast($t('domains.finance.toasts.balanceUpdated'), undo)
		open = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<div class="head">
			<h2 class="title" id="{uid}-title">{$t('domains.finance.balanceForm.title')}</h2>
			<p class="context">{account.name}</p>
		</div>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save} novalidate>
		<Field
			id="{uid}-amount"
			label={$t('domains.finance.balanceForm.amount')}
			unit={account.currency}
			bind:value
			{error}
			helper={isDebt(account.kind) ? $t('domains.finance.accountForm.debtHelp') : undefined}
			mono
			inputmode="decimal"
		/>
	</form>
	{#snippet footer()}
		<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button label={$t('domains.finance.save')} variant="primary" type="submit" form="{uid}-form" />
	{/snippet}
</Sheet>

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.context {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
