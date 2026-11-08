<script lang="ts">
	// Orchard's Bills tab (product/domains/finance.md §6, "A bill, from letter to paid"; D-196), ported from
	// Domains/Orchard/Bills: every bill by state, in the order Overdue, Due soon, Upcoming, Expected, Paid, each group with
	// its count and a group with none left out. A row is the payee, its cadence, estimate or actual and source (a card
	// statement's minimum and interest, what is still due or paid beyond it, a stale card's "as of"), the amount and the
	// due day; a paid one names the payment that paid it. When two payments could each have paid a bill, a Notice above
	// its group asks which, one Button per payment in a labelled group, and Neither. Rows do not act (D-118); their menus
	// do. Eden never pays: the menu opens the payee's site (D-8). Every figure goes through `formatMoney` and Hide amounts.
	import { Button, EmptyState, List, Notice, type ListRowData, type MenuItem } from '@eden/ui-kit'
	import { openExternal } from '../../../api/external.js'
	import { t } from '../../../i18n/index.js'
	import { formatMoney, type Money } from '../../../money/index.js'
	import { amountText, settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { staleDay } from '../accounts.js'
	import type { BillState } from '../bills.js'
	import { finance } from '../store.svelte.js'
	import type { Bill } from '../types.js'
	import { billChip, billSecondary, dayLine } from '../words.js'

	type Props = {
		oncapture: () => void
		onedit: (bill: Bill) => void
		onmarkpaid: (bill: Bill) => void
	}
	let { oncapture, onedit, onmarkpaid }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const money = (amount: Money) => amountText(formatMoney(amount, lang), settings.hideAmounts)
	const day = (iso: string) => dayLine(iso, lang)

	/** The day a statement's card is as of, while its link is stale. */
	function asOf(bill: Bill): string | undefined {
		const account = finance.accountById(bill.accountId)
		const stale = account ? staleDay(account, finance.links, finance.clock) : undefined
		return stale ? day(stale) : undefined
	}

	/** The latest payment a matched transaction made, which Not this payment takes off. */
	const matched = (bill: Bill) => [...(bill.payments ?? [])].reverse().find((payment) => payment.transactionId)

	function actions(bill: Bill, state: BillState): MenuItem[] {
		return [
			...(state === 'paid'
				? []
				: [{ id: 'paid', label: $t('domains.finance.bills.menu.markPaid'), icon: 'check' as const }]),
			{ id: 'edit', label: $t('domains.finance.bills.menu.edit'), icon: 'pencil' },
			...(matched(bill)
				? [{ id: 'unmatch', label: $t('domains.finance.bills.menu.notThis'), icon: 'undo-2' as const }]
				: []),
			...(bill.repeat
				? [{ id: 'stop', label: $t('domains.finance.bills.menu.stopRepeating'), icon: 'x' as const }]
				: []),
			...(bill.url
				? [{ id: 'site', label: $t('domains.finance.bills.menu.openSite'), icon: 'external-link' as const }]
				: []),
			{ id: 'delete', label: $t('domains.finance.bills.menu.delete'), icon: 'trash', destructive: true },
		]
	}

	function rowOf(bill: Bill, state: BillState): ListRowData {
		const words = { tr: $t, day, money, accounts: finance.accounts, asOf: bill.accountId ? asOf(bill) : undefined }
		return {
			id: bill.id,
			primary: bill.payee,
			secondary: billSecondary(bill, state, words),
			chips: [{ label: billChip(bill, words), mono: true }],
			meta: bill.due ? day(bill.due) : undefined,
			metaWarn: state === 'overdue',
			actions: actions(bill, state),
		}
	}

	const groups = $derived(
		finance.billsByState.map((group) => ({
			...group,
			rows: group.bills.map((bill) => rowOf(bill, group.state)),
			asking: group.bills.filter((bill) => (bill.ask?.length ?? 0) > 1),
		}))
	)

	async function act(item: MenuItem, row: ListRowData) {
		const bill = finance.billById(row.id)
		if (!bill) return
		const payee = bill.payee
		if (item.id === 'paid') onmarkpaid(bill)
		else if (item.id === 'edit') onedit(bill)
		else if (item.id === 'site' && bill.url) void openExternal(bill.url)
		else if (item.id === 'unmatch') {
			const payment = matched(bill)
			const undo = payment?.transactionId ? await finance.unmatchPayment(bill.id, payment.transactionId) : undefined
			if (undo) undoToast($t('domains.finance.bills.toasts.unmatched', { values: { payee } }), undo)
		} else if (item.id === 'stop') {
			const undo = await finance.stopRepeating(bill.id)
			if (undo) undoToast($t('domains.finance.bills.toasts.stopped', { values: { payee } }), undo)
		} else if (item.id === 'delete') {
			const undo = await finance.deleteBill(bill.id)
			if (undo) undoToast($t('domains.finance.bills.toasts.deleted', { values: { payee } }), undo)
		}
	}

	async function choose(bill: Bill, transactionId: string | null) {
		const undo = await finance.chooseMatch(bill.id, transactionId)
		const key = transactionId ? 'matched' : 'dismissed'
		if (undo) undoToast($t(`domains.finance.bills.toasts.${key}`, { values: { payee: bill.payee } }), undo)
	}
</script>

{#if !finance.bills.length}
	<EmptyState
		title={$t('domains.finance.bills.empty.title')}
		text={$t('domains.finance.bills.empty.text')}
		action={{ label: $t('domains.finance.actions.captureBill'), icon: 'scan-text', onclick: oncapture }}
	/>
{:else}
	<div class="body">
		{#each groups as group (group.state)}
			<section class="group" aria-labelledby="{uid}-{group.state}">
				<div class="group-head">
					<h2 class="group-title" id="{uid}-{group.state}">{$t(`domains.finance.bills.groups.${group.state}`)}</h2>
					<span class={['count', { warn: group.state === 'overdue' }]}>{group.bills.length}</span>
				</div>
				{#each group.asking as bill (bill.id)}
					<div class="match">
						<Notice
							tone="warning"
							title={$t('domains.finance.bills.ambiguous.title')}
							detail={$t('domains.finance.bills.ambiguous.detail', {
								values: { payee: bill.payee, amount: money(bill.amount), day: bill.due ? day(bill.due) : '' },
							})}
						/>
						<div
							class="candidates"
							role="group"
							aria-label={$t('domains.finance.bills.ambiguous.group', { values: { payee: bill.payee } })}
						>
							{#each bill.ask ?? [] as id (id)}
								{@const payment = finance.asked[id]}
								{#if payment}
									<Button
										label={$t('domains.finance.bills.ambiguous.candidate', {
											values: { day: day(payment.day), name: payment.name, amount: money(payment.amount) },
										})}
										onclick={() => void choose(bill, id)}
									/>
								{/if}
							{/each}
							<Button
								label={$t('domains.finance.bills.ambiguous.neither')}
								variant="quiet"
								onclick={() => void choose(bill, null)}
							/>
						</div>
					</div>
				{/each}
				<List headless labelledby="{uid}-{group.state}" rows={group.rows} onaction={act} />
			</section>
		{/each}
	</div>
{/if}

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.group-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.group-title {
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
	}
	.count {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
	.warn {
		color: var(--text-primary);
	}
	.match {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	/* the buttons wrap where the row is narrow, so each label stays whole */
	.candidates {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
