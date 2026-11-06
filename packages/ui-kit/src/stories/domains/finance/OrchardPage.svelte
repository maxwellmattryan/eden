<script module lang="ts">
	import type { IconName } from '$lib/index.js'
	import {
		orchardAccounts,
		orchardInstitutions,
		orchardStaleSince,
		type SampleAccount,
		type SampleMoney,
		type SampleTxKind,
	} from '../../sample-data.js'

	export const ORCHARD_TABS = ['Overview', 'Activity', 'Accounts', 'Bills', 'Budget'] as const
	export type OrchardTab = (typeof ORCHARD_TABS)[number]

	export type Money = SampleMoney

	/** The currency's own decimals, as Intl knows them: 2 for USD, 0 for JPY (D-188). */
	const decimalsOf = (currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
	/** The amount in whole units of its currency, signed: 2430 for $2,430.00, −10000 for ¥−10,000. */
	export const majorOf = (value: Money) => value.minor / 10 ** decimalsOf(value.currency)
	/**
	 * An amount as Orchard writes it, in its currency's own decimals (D-188): "$1,204.18", "¥84,000". With `sign`, money
	 * in reads "+$2,430.00" and money out "−$6.75"; with `whole`, a round figure such as a goal reads "$15,000".
	 */
	export function formatMoney(value: Money, options: { sign?: boolean; whole?: boolean } = {}): string {
		const format = new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: value.currency,
			signDisplay: options.sign ? 'exceptZero' : 'auto',
			...(options.whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
		})
		return format.format(majorOf(value)).replace('-', '−')
	}
	/** The same amount without its sign: what "owed" or "Out" stand beside. */
	export const formatAbs = (value: Money) => formatMoney({ ...value, minor: Math.abs(value.minor) })
	export const usdOf = (minor: number): Money => ({ minor, currency: 'USD' })

	/** The glyph each kind leads its row with (product/domains/finance.md §6). */
	export const KIND_GLYPHS: Record<SampleTxKind, IconName> = {
		purchase: 'shopping-bag',
		refund: 'undo-2',
		transfer: 'arrow-left-right',
		'card-payment': 'credit-card',
		'bill-payment': 'receipt',
		income: 'banknote',
		'interest-earned': 'percent',
		dividend: 'coins',
		'interest-charged': 'percent',
		fee: 'hand-coins',
		'investment-buy': 'trending-up',
		'investment-sell': 'trending-down',
	}
	/** Each kind in words: the row's second line, for screen readers and search. */
	export const KIND_NAMES: Record<SampleTxKind, string> = {
		purchase: 'Purchase',
		refund: 'Refund',
		transfer: 'Transfer',
		'card-payment': 'Card payment',
		'bill-payment': 'Bill payment',
		income: 'Paycheck',
		'interest-earned': 'Interest earned',
		dividend: 'Dividend',
		'interest-charged': 'Interest charged',
		fee: 'Fee',
		'investment-buy': 'Investment buy',
		'investment-sell': 'Investment sell',
	}
	/** Costs tint danger and money earned tints positive; everything else stays in ink. */
	export function kindTone(kind: SampleTxKind): 'cost' | 'earned' | 'plain' {
		if (kind === 'interest-charged' || kind === 'fee') return 'cost'
		if (kind === 'income' || kind === 'interest-earned' || kind === 'dividend') return 'earned'
		return 'plain'
	}

	const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
	/** A sample day (`MM-DD`) as the page writes it: "Sun 27 Sep", in the dataset's year. */
	export function dayLabel(day: string): string {
		const [month, date] = day.split('-').map(Number) as [number, number]
		const at = new Date(2026, month - 1, date)
		return `${WEEKDAYS[at.getDay()]} ${date} ${MONTHS[month - 1]}`
	}

	/** What a stale link's figures carry in place of "Updated 07:12". */
	export const STALE_AS_OF = `as of ${dayLabel(orchardStaleSince)}`
	/** Under every total that leaves the yen account out (D-188). */
	export const OTHER_CURRENCY = '1 account in JPY is left out of totals'

	export interface Bank {
		name: string
		last4: string
		colour?: string
	}
	export const accountOf = (id: string): SampleAccount => orchardAccounts.find((account) => account.id === id)!
	/** The bank an account is shown as on a pill: the institution's name and colour, or a manual account's own name. */
	export function bankOf(id: string): Bank {
		const account = accountOf(id)
		const institution = orchardInstitutions.find((entry) => entry.id === account.institution)
		return {
			name: institution?.name ?? account.bank ?? account.name,
			last4: account.last4,
			colour: institution?.colour,
		}
	}
	/** Chase is the link that needs a sign-in in the Stale link stories. */
	export const isStale = (accountId: string) => accountOf(accountId).institution === 'chase'
	/** "Updated 07:12", or the stale mark for a Chase account on a stale page. */
	export function freshness(accountId: string, stale: boolean): string {
		if (stale && isStale(accountId)) return STALE_AS_OF
		const institution = orchardInstitutions.find((entry) => entry.id === accountOf(accountId).institution)
		return institution ? `Updated ${institution.lastUpdated}` : 'Entered by hand'
	}
</script>

<script lang="ts">
	// What every Orchard page shares (product/domains/finance.md §6): the shell with Orchard current, the page header
	// with the five mocked tabs, and with a stale link the Notice that asks for a sign-in in the header's aside: a
	// broken link is a reconnect prompt, never a silent wrong number. No header motif yet (D-123, a handoff).
	// Story-only.
	import type { Snippet } from 'svelte'
	import { Notice, PageHeader, Segmented, domainGlyph, type PageHeaderAction, type Platform } from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import { sidebar } from '../../sample-data.js'

	type Props = {
		tab: OrchardTab
		actions?: PageHeaderAction[]
		/** Chase needs a sign-in: the Notice with Reconnect, and every Chase figure as of the last good read. */
		stale?: boolean
		onreconnect?: () => void
		onnavigate?: (id: string) => void
		children: Snippet<[Platform]>
	}
	let { tab, actions = [], stale = false, onreconnect, onnavigate, children: body }: Props = $props()

	const orchard = sidebar.items.find((entry) => entry.id === 'finance')!
</script>

{#snippet staleNotice()}
	<Notice
		tone="warning"
		icon="triangle-alert"
		title="Chase needs you to sign in again"
		detail="Balances as of {dayLabel(orchardStaleSince)}"
		action={{ label: 'Reconnect', onclick: onreconnect }}
	/>
{/snippet}

<AppFrame current="finance" {onnavigate}>
	{#snippet children(platform)}
		<!-- The tab row never runs past the page: tighter tabs on the phone so all five fit, and a scroll inside the row
		     if the text is larger still. The padding keeps the focus ring clear of the scroll's edge. -->
		{#snippet tabs()}
			<div class={['tabs', { phone: platform === 'mobile' }]}>
				<Segmented items={[...ORCHARD_TABS]} selected={ORCHARD_TABS.indexOf(tab)} label="Orchard sections" />
			</div>
		{/snippet}
		<div class="page">
			<PageHeader
				name={orchard.name}
				subtitle={orchard.subtitle}
				icon={domainGlyph('finance')}
				{actions}
				filters={tabs}
				aside={stale ? staleNotice : undefined}
			/>
			{@render body(platform)}
		</div>
	{/snippet}
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.tabs {
		min-width: 0;
		max-width: 100%;
		margin: calc(-1 * var(--space-1));
		padding: var(--space-1);
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.tabs.phone :global(.ed-seg-tab) {
		padding: 0 var(--space-2);
	}
</style>
