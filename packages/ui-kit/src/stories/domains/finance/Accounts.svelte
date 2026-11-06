<script lang="ts">
	// Orchard's Accounts (product/domains/finance.md §3 and §6, design/screens.md `orchard-accounts`): Assets, Debts
	// and Net worth at the top, then every account grouped by its institution under the institution's swatch, name and
	// when it last updated, each with its type, last four and balance in its own currency; a debt reads as owed. What
	// is entered by hand is its own group: the yen account (left out of totals, D-188), the car and the cold-storage
	// bitcoin. With a stale link the Chase group reads as of its last good read, and its rows offer Reconnect.
	// Story-only.
	import { EmptyState, Icon, IconButton, Menu, Stat, type MenuItem, type PageHeaderAction } from '$lib/index.js'
	import OrchardPage, {
		OTHER_CURRENCY,
		STALE_AS_OF,
		dayLabel,
		formatAbs,
		formatMoney,
		isStale,
		usdOf,
		type Money,
	} from './OrchardPage.svelte'
	import { orchardAccounts, orchardAssets, orchardInstitutions, type SampleAccountType } from '../../sample-data.js'

	type Props = {
		/** Nothing linked and nothing entered. */
		empty?: boolean
		/** Chase needs a sign-in. */
		stale?: boolean
		onlink?: () => void
		onaddasset?: () => void
		oncloseaccount?: (id: string) => void
		onreconnect?: () => void
		onsample?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		empty = false,
		stale = false,
		onlink,
		onaddasset,
		oncloseaccount,
		onreconnect,
		onsample,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const TYPES: Record<SampleAccountType, string> = {
		checking: 'Checking',
		credit: 'Credit card',
		loan: 'Auto loan',
		savings: 'Savings',
		brokerage: 'Brokerage',
		retirement: '401(k)',
	}

	type Row = { id: string; name: string; detail: string; balance: Money; text?: string; stale?: boolean }
	const linked = $derived(
		orchardInstitutions.map((institution) => ({
			...institution,
			stale: stale && institution.id === 'chase',
			rows: orchardAccounts
				.filter((account) => account.institution === institution.id)
				.map((account): Row => ({
					id: account.id,
					name: account.name,
					detail: `${TYPES[account.type]} · ••${account.last4}`,
					balance: account.balance,
					stale: stale && isStale(account.id),
				})),
		}))
	)
	const byHand: Row[] = [
		...orchardAccounts
			.filter((account) => account.manual)
			.map((account) => ({
				id: account.id,
				name: account.name,
				detail: `${TYPES[account.type]} · ••${account.last4} · Not in totals`,
				balance: account.balance,
			})),
		...orchardAssets.map((asset) => ({
			id: asset.id,
			name: asset.name,
			detail: asset.valuedOn ? `Valued ${dayLabel(asset.valuedOn)}` : 'Priced daily',
			balance: asset.value,
			text: asset.quantity
				? `${asset.quantity.amount} ${asset.quantity.unit} ≈ ${formatMoney(asset.value)}`
				: undefined,
		})),
	]

	const usdBalances = [
		...orchardAccounts.filter((account) => account.balance.currency === 'USD').map((account) => account.balance.minor),
		...orchardAssets.map((asset) => asset.value.minor),
	]
	const assets = usdOf(usdBalances.filter((minor) => minor > 0).reduce((sum, minor) => sum + minor, 0))
	const debts = usdOf(usdBalances.filter((minor) => minor < 0).reduce((sum, minor) => sum - minor, 0))
	const worth = usdOf(assets.minor - debts.minor)

	const actions = $derived<PageHeaderAction[]>([
		{ label: 'Link a bank', icon: 'landmark', onclick: onlink },
		{ label: 'Add an asset', icon: 'plus', onclick: onaddasset },
	])

	let menuFor = $state<{ row: Row; anchor: HTMLElement }>()
	let menuOpen = $state(false)
	const menuItems = $derived<MenuItem[]>([
		...(menuFor?.row.stale ? [{ id: 'reconnect', label: 'Reconnect', icon: 'refresh-cw' as const }] : []),
		{ id: 'close', label: 'Close account', destructive: true },
	])
</script>

{#snippet rows(list: Row[])}
	<ul class="rows">
		{#each list as row (row.id)}
			<li class="row">
				<span class="name">{row.name}</span>
				<span class="detail">{row.detail}</span>
				{#if row.text}
					<span class="balance">{row.text}</span>
				{:else if row.balance.minor < 0}
					<span class="balance cost">{formatAbs(row.balance)} owed</span>
				{:else}
					<span class="balance">{formatMoney(row.balance)}</span>
				{/if}
				<span class="menu">
					<IconButton
						icon="ellipsis"
						size="sm"
						label="Actions for {row.name}"
						aria-haspopup="menu"
						aria-expanded={menuOpen && menuFor?.row.id === row.id}
						onclick={(event) => {
							menuFor = { row, anchor: event.currentTarget }
							menuOpen = true
						}}
					/>
				</span>
			</li>
		{/each}
	</ul>
{/snippet}

<OrchardPage tab="Accounts" {actions} {stale} {onreconnect} {onnavigate}>
	{#snippet children(_platform)}
		{#if empty}
			<EmptyState
				title="Nothing linked yet"
				text="Link a bank and Orchard keeps every account current on this device, or enter one by hand."
				action={{ label: 'Link a bank', icon: 'landmark', onclick: onlink }}
				sample={{ onclick: onsample }}
			/>
		{:else}
			<div class="body">
				<div class="totals">
					<dl class="figures">
						<div class="figure">
							<dt>Assets</dt>
							<dd><Stat value={formatMoney(assets)} size="md" /></dd>
						</div>
						<div class="figure">
							<dt>Debts</dt>
							<dd><Stat value={formatMoney(debts)} unit="owed" size="md" /></dd>
						</div>
						<div class="figure">
							<dt>Net worth</dt>
							<dd><Stat value={formatMoney(worth)} size="md" /></dd>
						</div>
					</dl>
					<p class="note">{OTHER_CURRENCY}</p>
					{#if stale}<p class="note">Includes Chase {STALE_AS_OF}</p>{/if}
				</div>

				{#each linked as group (group.id)}
					<section class="card" aria-labelledby="{uid}-{group.id}">
						<div class="group-head">
							<span class="swatch" style:--bank={group.colour} aria-hidden="true"></span>
							<h2 class="group-title" id="{uid}-{group.id}">{group.name}</h2>
							<span class="note">{group.stale ? STALE_AS_OF : `Updated ${group.lastUpdated}`}</span>
						</div>
						{@render rows(group.rows)}
					</section>
				{/each}

				<section class="card" aria-labelledby="{uid}-hand">
					<div class="group-head">
						<span class="glyph"><Icon name="pencil" size="sm" /></span>
						<h2 class="group-title" id="{uid}-hand">Entered by hand</h2>
					</div>
					{@render rows(byHand)}
				</section>
			</div>
			<Menu
				bind:open={menuOpen}
				anchor={menuFor?.anchor}
				align="end"
				label="Actions for {menuFor?.row.name ?? 'this account'}"
				items={menuItems}
				onselect={(item) => {
					if (!menuFor) return
					if (item.id === 'reconnect') onreconnect?.()
					else oncloseaccount?.(menuFor.row.id)
				}}
			/>
		{/if}
	{/snippet}
</OrchardPage>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.totals {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.figures {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-6);
		margin: 0 0 var(--space-1);
	}
	.figure {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.figure dt {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.figure dd {
		margin: 0;
	}
	.note {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
	}
	.group-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.group-head .note {
		margin-left: auto;
	}
	.swatch {
		flex: none;
		width: var(--space-3);
		height: var(--space-3);
		border-radius: var(--radius-full);
		background: var(--bank);
	}
	.glyph {
		display: inline-flex;
		color: var(--text-secondary);
	}
	.group-title {
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
	}
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		grid-template-areas:
			'name balance menu'
			'detail balance menu';
		align-items: center;
		column-gap: var(--space-3);
		padding: var(--space-2) 0;
	}
	.row + .row {
		border-top: 1px solid var(--stroke-subtle);
	}
	.name {
		grid-area: name;
		font: var(--ed-t-text);
	}
	.detail {
		grid-area: detail;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.balance {
		grid-area: balance;
		justify-self: end;
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
		text-align: end;
	}
	.cost {
		color: var(--danger);
	}
	.menu {
		display: inline-flex;
		grid-area: menu;
	}
</style>
