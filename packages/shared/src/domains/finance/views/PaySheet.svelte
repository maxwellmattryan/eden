<script lang="ts">
	// Mark paid (product/domains/finance.md §6, D-194): the payments around a bill's due day, whatever their amount, the
	// payee's first and then by how close each is to what is left to pay, at most 20. Each one pays the bill with it, so
	// a part leaves the rest due and Mark paid can be used again; "Paid another way" records what is left, today, with no
	// transaction. Each is one write with an undo; the pass then closes the bill's tasks and rolls its series on.
	import { Button, List, Sheet, Spinner, type ListRowData } from '@eden/ui-kit'
	import { onMount } from 'svelte'
	import type { Entity } from '../../../data/index.js'
	import { t } from '../../../i18n/index.js'
	import { formatMoney, type Money } from '../../../money/index.js'
	import { amountText, settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { remainingOf } from '../bills.js'
	import { cleanMerchant } from '../merchants.js'
	import { finance } from '../store.svelte.js'
	import type { Bill, TransactionPayload } from '../types.js'
	import { dayLine } from '../words.js'

	type Props = {
		open: boolean
		bill: Bill
	}
	let { open = $bindable(), bill }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const money = (amount: Money) => amountText(formatMoney(amount, lang, { sign: 'never' }), settings.hideAmounts)
	let choices = $state<Entity<TransactionPayload>[] | undefined>()
	let busy = $state(false)

	onMount(() => {
		void finance.paymentChoices(bill.id).then((found) => (choices = found))
	})

	const rows = $derived<ListRowData[]>(
		(choices ?? []).map((row) => {
			const account = finance.accountById(row.payload.accountId)
			return {
				id: row.id,
				primary: cleanMerchant(row.payload.name, row.payload.merchantName),
				secondary: [
					dayLine(row.payload.day, lang),
					account ? (account.last4 ? `${account.name} ••${account.last4}` : account.name) : undefined,
				]
					.filter(Boolean)
					.join(' · '),
				meta: money(row.payload.amount),
			}
		})
	)
	const left = $derived(remainingOf(bill) ?? bill.amount)

	async function pay(how: { transactionId: string } | { another: true }) {
		if (busy) return
		busy = true
		try {
			const undo = await finance.payBill(bill.id, how)
			if (undo) undoToast($t('domains.finance.bills.toasts.paid', { values: { payee: bill.payee } }), undo)
			open = false
		} finally {
			busy = false
		}
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.finance.bills.pay.title', { values: { payee: bill.payee } })}</h2>
	{/snippet}
	<div class="body">
		<p class="line quiet">{$t('domains.finance.bills.pay.text')}</p>
		{#if choices === undefined}
			<Spinner size="md" />
		{:else if rows.length}
			<List
				header={$t('domains.finance.bills.pay.choose')}
				{rows}
				onopen={(row) => void pay({ transactionId: row.id })}
			/>
		{:else}
			<p class="line quiet">{$t('domains.finance.bills.pay.none')}</p>
		{/if}
		<div class="another">
			<Button
				label={$t('domains.finance.bills.pay.another')}
				icon="check"
				disabled={busy}
				onclick={() => void pay({ another: true })}
			/>
			<p class="line quiet">{$t('domains.finance.bills.pay.anotherText', { values: { amount: money(left) } })}</p>
		</div>
	</div>
	{#snippet footer()}
		<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => (open = false)} />
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.body,
	.another {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.another {
		align-items: flex-start;
		gap: var(--space-1);
	}
	.line {
		margin: 0;
		font: var(--ed-t-body);
	}
	.quiet {
		color: var(--text-secondary);
	}
</style>
