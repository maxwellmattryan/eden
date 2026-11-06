<script lang="ts">
	// Orchard's Bills (product/domains/finance.md §6, "A bill, from letter to paid"): every bill by state, in the order
	// Overdue, Due soon, Upcoming, Expected, Paid, each row with its payee, one-off or monthly, estimate or actual,
	// where it came from, the due day and the amount. A paid bill names the payment that paid it. When two payments
	// could each have paid a bill, a Notice above it asks which, one Button per candidate, and Neither. Eden never pays:
	// the menu opens the payee's site (D-8). Story-only.
	import {
		Button,
		EmptyState,
		List,
		Notice,
		type ListRowData,
		type MenuItem,
		type PageHeaderAction,
	} from '$lib/index.js'
	import OrchardPage, { STALE_AS_OF, bankOf, dayLabel, formatMoney, isStale } from './OrchardPage.svelte'
	import { orchardBills, type SampleBill, type SampleBillState } from '../../sample-data.js'

	type Props = {
		/** No bills yet. */
		empty?: boolean
		/** Two payments could each have paid Texas Gas Service: the Notice asks which. */
		ambiguous?: boolean
		/** Chase needs a sign-in. */
		stale?: boolean
		oncapture?: () => void
		onadd?: () => void
		/** The payment the owner chose, or null for Neither. */
		onmatch?: (candidate: string | null) => void
		onmarkpaid?: (id: string) => void
		onopensite?: (id: string) => void
		ondelete?: (id: string) => void
		onreconnect?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		empty = false,
		ambiguous = false,
		stale = false,
		oncapture,
		onadd,
		onmatch,
		onmarkpaid,
		onopensite,
		ondelete,
		onreconnect,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const STATES: { id: SampleBillState; title: string }[] = [
		{ id: 'overdue', title: 'Overdue' },
		{ id: 'due-soon', title: 'Due soon' },
		{ id: 'upcoming', title: 'Upcoming' },
		{ id: 'expected', title: 'Expected' },
		{ id: 'paid', title: 'Paid' },
	]
	const SOURCES: Record<SampleBill['source'], string> = {
		letter: 'From a letter',
		statement: 'Card statement',
		repeating: 'Repeating',
	}

	function secondary(bill: SampleBill): string {
		if (bill.paidBy) {
			const bank = bankOf(bill.paidBy.account)
			return `Paid ${dayLabel(bill.paidBy.day)} from ${bank.name} ••${bank.last4}`
		}
		return [
			bill.cadence === 'monthly' ? 'Monthly' : 'One-off',
			bill.estimate ? 'Estimate' : 'Actual',
			SOURCES[bill.source],
			bill.minimum ? `minimum ${formatMoney(bill.minimum)}` : undefined,
			stale && bill.source === 'statement' && isStale('chase-sapphire') ? STALE_AS_OF : undefined,
		]
			.filter(Boolean)
			.join(' · ')
	}
	const rowOf = (bill: SampleBill): ListRowData => ({
		id: bill.id,
		primary: bill.payee,
		secondary: secondary(bill),
		chips: [{ label: bill.estimate ? `about ${formatMoney(bill.amount)}` : formatMoney(bill.amount), mono: true }],
		meta: bill.due ? dayLabel(bill.due) : undefined,
		metaWarn: bill.state === 'overdue',
		actions: [
			...(bill.state === 'paid' ? [] : [{ id: 'paid', label: 'Mark paid', icon: 'check' as const }]),
			...(bill.url ? [{ id: 'site', label: 'Open payee’s site', icon: 'external-link' as const }] : []),
			{ id: 'delete', label: 'Delete', icon: 'trash' as const, destructive: true },
		],
	})
	const groups = $derived(
		STATES.map((state) => ({ ...state, bills: orchardBills.filter((bill) => bill.state === state.id) }))
	)
	const unsure = orchardBills.find((bill) => bill.candidates)!

	function act(item: MenuItem, row: ListRowData) {
		if (item.id === 'paid') onmarkpaid?.(row.id)
		else if (item.id === 'site') onopensite?.(row.id)
		else ondelete?.(row.id)
	}

	const actions = $derived<PageHeaderAction[]>([
		{ label: 'Capture a bill', icon: 'scan-text', onclick: oncapture },
		{ label: 'Add a bill', icon: 'plus', onclick: onadd },
	])
</script>

<OrchardPage tab="Bills" {actions} {stale} {onreconnect} {onnavigate}>
	{#snippet children(platform)}
		{#if empty}
			<EmptyState
				title="No bills yet"
				text="Photograph or drop a letter and it is read on this device; the Gardener drafts the bill for you to confirm."
				action={{ label: 'Capture a bill', icon: 'scan-text', onclick: oncapture }}
			/>
		{:else}
			<div class="body">
				{#each groups as group (group.id)}
					<section class="group" aria-labelledby="{uid}-{group.id}">
						<div class="group-head">
							<h2 class="group-title" id="{uid}-{group.id}">{group.title}</h2>
							<span class={['count', { warn: group.id === 'overdue' }]}>{group.bills.length}</span>
						</div>
						{#if group.id === 'overdue' && ambiguous}
							<div class="match">
								<Notice
									tone="warning"
									title="Two payments could have paid this"
									detail="{unsure.payee}, {formatMoney(unsure.amount)} due {dayLabel(unsure.due!)}. Which one paid it?"
								/>
								<div
									class={['candidates', { stacked: platform === 'mobile' }]}
									role="group"
									aria-label="Payments that could have paid {unsure.payee}"
								>
									{#each unsure.candidates! as candidate (candidate.id)}
										<Button
											label="{dayLabel(candidate.day)} · {candidate.printed} · {formatMoney(candidate.amount)}"
											onclick={() => onmatch?.(candidate.id)}
										/>
									{/each}
									<Button label="Neither" variant="quiet" onclick={() => onmatch?.(null)} />
								</div>
							</div>
						{/if}
						<List headless labelledby="{uid}-{group.id}" rows={group.bills.map(rowOf)} onaction={act} />
					</section>
				{/each}
			</div>
		{/if}
	{/snippet}
</OrchardPage>

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
	.candidates {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.stacked {
		flex-direction: column;
		align-items: stretch;
	}
</style>
