<script module lang="ts">
	import type { SampleTransaction, SampleTxKind } from '../../sample-data.js'

	export type FilterGroup = 'when' | 'where' | 'what' | 'amount' | 'state'
	/** One active filter: `id` says what it tests (`what:category:Dining`, `where:chase-sapphire`), `label` its chip. */
	export interface ActivityFilter {
		id: string
		group: FilterGroup
		label: string
	}

	/** Moves between the owner's own money: neither in nor out of their hands. */
	const MOVES: readonly SampleTxKind[] = ['transfer', 'card-payment', 'investment-buy', 'investment-sell']
	export const isMove = (tx: SampleTransaction) => MOVES.includes(tx.kind)

	const minorUnits = (tx: SampleTransaction) => (tx.amount.currency === 'JPY' ? 1 : 100)
	function passes(tx: SampleTransaction, filter: ActivityFilter): boolean {
		const [, a = '', b = ''] = filter.id.split(':')
		switch (filter.group) {
			case 'when':
				// the sample year: every row is from September; last month holds none
				return a === 'last-month' ? tx.date.startsWith('08-') : true
			case 'where':
				return tx.account === a || tx.toAccount === a
			case 'what':
				return a === 'category' ? tx.category === b : tx.kind === b
			case 'amount': {
				const size = Math.abs(tx.amount.minor) / minorUnits(tx)
				return a === 'over' ? size > Number(b) : size < Number(b)
			}
			case 'state':
				if (a === 'pending') return !!tx.pending
				if (a === 'posted') return !tx.pending
				if (a === 'reimbursable') return !!tx.reimbursable
				if (a === 'uncategorised') return !tx.category
				return tx.flags?.includes(a as 'recurring' | 'bill' | 'one-off') ?? false
		}
	}

	/**
	 * Whether a row passes the filters: any one filter of a group is enough, and every group with a filter must pass
	 * (Dining and Chase Sapphire: the Dining rows on that card).
	 */
	export function matches(tx: SampleTransaction, filters: readonly ActivityFilter[]): boolean {
		const groups = [...new Set(filters.map((filter) => filter.group))]
		return groups.every((group) => filters.some((filter) => filter.group === group && passes(tx, filter)))
	}

	/** The search row's text: words in the title, category or kind, or `>100` and `<20` by amount. */
	export function searched(tx: SampleTransaction, query: string, kindName: string): boolean {
		const text = query.trim().toLowerCase()
		if (!text) return true
		const amount = /^([<>])\s*(\d+(?:\.\d+)?)$/.exec(text)
		if (amount) {
			const size = Math.abs(tx.amount.minor) / minorUnits(tx)
			return amount[1] === '>' ? size > Number(amount[2]) : size < Number(amount[2])
		}
		return [tx.title, tx.category ?? '', kindName].some((field) => field.toLowerCase().includes(text))
	}
</script>

<script lang="ts">
	// Orchard's Activity (product/domains/finance.md §6, design/screens.md `orchard-activity`): one feed of every money
	// event across every account, grouped by day, each row with its kind's glyph, a title, the kind in words and the
	// bank on a pill (two, from → to, for a move between the owner's accounts). The search row ends in the filter
	// button, which opens the filters in a Popover; the active ones sit under it as removable chips. The totals line
	// and the insights beside the feed follow the filters. Rows do not open in the mock, so they take no hover
	// ground (D-118). Filters are not kept between sessions here. Story-only.
	import {
		BarChart,
		Button,
		Chip,
		DataTable,
		EmptyState,
		Field,
		Icon,
		IconButton,
		Menu,
		Popover,
		type DataTableCell,
		type MenuItem,
	} from '$lib/index.js'
	import OrchardPage, {
		KIND_GLYPHS,
		KIND_NAMES,
		OTHER_CURRENCY,
		STALE_AS_OF,
		bankOf,
		dayLabel,
		formatMoney,
		kindTone,
		usdOf,
	} from './OrchardPage.svelte'
	import BankPill from './BankPill.svelte'
	import { orchardAccounts, orchardTransactions, orchardTypical } from '../../sample-data.js'

	type Props = {
		/** Nothing linked yet. */
		empty?: boolean
		/** Chase needs a sign-in. */
		stale?: boolean
		/** The filters on when the page opens. */
		filters?: ActivityFilter[]
		/** The filter popover open. */
		popover?: boolean
		/** Called with the whole list after every change. */
		onfilterchange?: (next: ActivityFilter[]) => void
		oncategorise?: (id: string) => void
		onsplit?: (id: string) => void
		onreimbursable?: (id: string) => void
		onlink?: () => void
		onsample?: () => void
		onreconnect?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		empty = false,
		stale = false,
		filters = [],
		popover = false,
		onfilterchange,
		oncategorise,
		onsplit,
		onreimbursable,
		onlink,
		onsample,
		onreconnect,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()

	// svelte-ignore state_referenced_locally
	let active = $state<ActivityFilter[]>([...filters])
	// svelte-ignore state_referenced_locally
	let filtersOpen = $state(popover)
	let filtersAnchor = $state<HTMLElement>()
	let query = $state('')
	let over = $state('')
	let under = $state('')

	function change(next: ActivityFilter[]) {
		active = next
		onfilterchange?.(next)
	}
	const has = (id: string) => active.some((filter) => filter.id === id)
	function toggle(option: ActivityFilter, on: boolean) {
		const rest = active.filter((filter) => filter.id !== option.id)
		change(on ? [...rest, option] : rest)
	}
	function setAmount(side: 'over' | 'under', value: string) {
		const rest = active.filter((filter) => !filter.id.startsWith(`amount:${side}:`))
		const size = Number(value)
		const label = `${side === 'over' ? 'Over' : 'Under'} $${value}`
		change(value.trim() && size > 0 ? [...rest, { id: `amount:${side}:${size}`, group: 'amount', label }] : rest)
	}

	const option = (group: FilterGroup, id: string, label: string): ActivityFilter => ({
		id: `${group}:${id}`,
		group,
		label,
	})
	const KINDS = Object.keys(KIND_NAMES) as SampleTxKind[]
	const CATEGORIES = [...new Set(orchardTransactions.flatMap((tx) => (tx.category ? [tx.category] : [])))].sort()
	const SECTIONS: { id: FilterGroup; title: string; options: ActivityFilter[] }[] = [
		{
			id: 'when',
			title: 'When',
			options: [
				option('when', 'this-month', 'This month'),
				option('when', 'last-month', 'Last month'),
				option('when', 'last-90', 'Last 90 days'),
				option('when', 'this-year', 'This year'),
			],
		},
		{
			id: 'where',
			title: 'Where',
			options: orchardAccounts.map((account) => {
				const bank = bankOf(account.id)
				return option('where', account.id, `${bank.name} ••${bank.last4}`)
			}),
		},
		{
			id: 'what',
			title: 'What',
			options: [
				...CATEGORIES.map((category) => option('what', `category:${category}`, category)),
				...KINDS.map((kind) => option('what', `kind:${kind}`, KIND_NAMES[kind])),
			],
		},
		{ id: 'amount', title: 'How much', options: [] },
		{
			id: 'state',
			title: 'State',
			options: [
				option('state', 'pending', 'Pending'),
				option('state', 'posted', 'Posted'),
				option('state', 'recurring', 'Recurring'),
				option('state', 'bill', 'Part of a bill'),
				option('state', 'one-off', 'One-off'),
				option('state', 'reimbursable', 'Reimbursable'),
				option('state', 'uncategorised', 'Uncategorised'),
			],
		},
	]

	const rows = $derived(
		orchardTransactions.filter((tx) => matches(tx, active) && searched(tx, query, KIND_NAMES[tx.kind]))
	)
	const days = $derived.by(() => {
		const out: { day: string; rows: typeof rows }[] = []
		for (const tx of rows) {
			const last = out.at(-1)
			if (last?.day === tx.date) last.rows.push(tx)
			else out.push({ day: tx.date, rows: [tx] })
		}
		return out
	})
	const dayTitle = (day: string) => (day === '09-30' ? 'Today' : dayLabel(day))

	/** USD rows only: the yen row is left out of every total and says so (D-188). */
	const counted = $derived(rows.filter((tx) => tx.amount.currency === 'USD' && !isMove(tx)))
	const spending = $derived(counted.filter((tx) => tx.amount.minor < 0))
	const outTotal = $derived(usdOf(spending.reduce((sum, tx) => sum - tx.amount.minor, 0)))
	const inTotal = $derived(usdOf(counted.reduce((sum, tx) => sum + Math.max(tx.amount.minor, 0), 0)))
	const otherCurrency = $derived(rows.some((tx) => tx.amount.currency !== 'USD'))

	const dollars = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`
	/** Mon 21 Sep and Mon 28 Sep: the weeks the sample rows fall in. */
	const WEEKS = [
		{ from: '09-21', label: '21 Sep' },
		{ from: '09-28', label: '28 Sep' },
	]
	const weekOf = (date: string) => [...WEEKS].reverse().find((week) => date >= week.from)!
	const byWeek = (pick: (tx: (typeof rows)[number]) => boolean) =>
		WEEKS.map(
			(week) =>
				spending.filter((tx) => weekOf(tx.date) === week && pick(tx)).reduce((sum, tx) => sum - tx.amount.minor, 0) /
				100
		)
	const weekly = $derived([
		{ id: 'groceries', label: 'Groceries', values: byWeek((tx) => tx.category === 'Groceries') },
		{ id: 'dining', label: 'Dining', values: byWeek((tx) => tx.category === 'Dining') },
		{
			id: 'else',
			label: 'Everything else',
			values: byWeek((tx) => tx.category !== 'Groceries' && tx.category !== 'Dining'),
		},
	])

	const merchants = $derived.by(() => {
		const totals: Record<string, { count: number; total: number }> = {}
		for (const tx of spending) {
			const entry = totals[tx.title] ?? { count: 0, total: 0 }
			totals[tx.title] = { count: entry.count + 1, total: entry.total - tx.amount.minor }
		}
		return Object.entries(totals)
			.sort((a, b) => b[1].total - a[1].total)
			.slice(0, 5)
			.map(([name, entry]) => [
				name,
				String(entry.count),
				formatMoney(usdOf(Math.round(entry.total / entry.count))),
				formatMoney(usdOf(entry.total)),
			])
	})

	const typical = $derived.by(() => {
		const totals: Record<string, number> = {}
		for (const tx of spending) {
			const category = tx.category ?? 'Uncategorised'
			totals[category] = (totals[category] ?? 0) - tx.amount.minor
		}
		return Object.entries(totals)
			.sort((a, b) => b[1] - a[1])
			.map(([category, minor]): (string | DataTableCell)[] => {
				const usual = orchardTypical[category]
				if (usual === undefined) return [category, formatMoney(usdOf(minor)), '—', '—']
				const delta = minor - Math.round(usual * 100)
				return [
					category,
					formatMoney(usdOf(minor)),
					formatMoney(usdOf(Math.round(usual * 100))),
					{
						text: formatMoney(usdOf(delta), { sign: true }),
						tone: delta > 0 ? 'danger' : delta < 0 ? 'positive' : 'neutral',
					},
				]
			})
	})

	const months = $derived(
		rows.length === 0
			? []
			: [
					[
						'Sep 21–30',
						formatMoney(inTotal),
						formatMoney(outTotal),
						formatMoney(usdOf(inTotal.minor - outTotal.minor), { sign: true }),
					],
				]
	)

	const ROW_ACTIONS: MenuItem[] = [
		{ id: 'categorise', label: 'Categorise' },
		{ id: 'split', label: 'Split' },
		{ id: 'reimbursable', label: 'Mark reimbursable' },
	]
	let menuFor = $state<{ id: string; title: string; anchor: HTMLElement }>()
	let menuOpen = $state(false)
	function act(item: MenuItem) {
		if (!menuFor) return
		if (item.id === 'categorise') oncategorise?.(menuFor.id)
		else if (item.id === 'split') onsplit?.(menuFor.id)
		else onreimbursable?.(menuFor.id)
	}

	const secondLine = (tx: (typeof rows)[number]) =>
		[
			KIND_NAMES[tx.kind],
			tx.category,
			tx.pending ? 'Pending' : undefined,
			tx.split ? 'Split' : undefined,
			tx.reimbursable ? `${formatMoney(tx.reimbursable)} to be paid back` : undefined,
		]
			.filter(Boolean)
			.join(' · ')
	const where = (accountId: string) =>
		option('where', accountId, `${bankOf(accountId).name} ••${bankOf(accountId).last4}`)
</script>

<OrchardPage tab="Activity" {stale} {onreconnect} {onnavigate}>
	{#snippet children(platform)}
		{#if empty}
			<EmptyState
				title="Nothing linked yet"
				text="Link a bank and Orchard keeps every account current on this device, or enter one by hand."
				action={{ label: 'Link a bank', icon: 'landmark', onclick: onlink }}
				sample={{ onclick: onsample }}
			/>
		{:else}
			<div class={['body', { phone: platform === 'mobile' }]}>
				<div class="search">
					<Field
						class="search-field"
						label="Search activity"
						placeholder="Merchant, note or >100"
						icon="search"
						bind:value={query}
					/>
					<span class="anchor" bind:this={filtersAnchor}>
						<IconButton
							icon="funnel"
							label="Filters"
							count={active.length}
							active={filtersOpen}
							aria-haspopup="dialog"
							aria-expanded={filtersOpen}
							onclick={() => (filtersOpen = !filtersOpen)}
						/>
					</span>
					<Popover bind:open={filtersOpen} anchor={filtersAnchor} align="end" label="Filters">
						<div class="filters">
							{#each SECTIONS as section (section.id)}
								<section class="filter-group" aria-labelledby="{uid}-f-{section.id}">
									<h2 class="filter-title" id="{uid}-f-{section.id}">{section.title}</h2>
									{#if section.id === 'amount'}
										<div class="amounts">
											<Field
												label="Over"
												unit="$"
												mono
												inputmode="decimal"
												bind:value={over}
												oninput={() => setAmount('over', over)}
											/>
											<Field
												label="Under"
												unit="$"
												mono
												inputmode="decimal"
												bind:value={under}
												oninput={() => setAmount('under', under)}
											/>
										</div>
									{:else}
										<div class="filter-chips">
											{#each section.options as choice (choice.id)}
												<Chip
													label={choice.label}
													selectable
													selected={has(choice.id)}
													onselect={(on) => toggle(choice, on)}
												/>
											{/each}
										</div>
									{/if}
								</section>
							{/each}
						</div>
					</Popover>
				</div>

				{#if active.length > 0}
					<div class="active">
						{#each active as filter (filter.id)}
							<Chip
								label={filter.label}
								tone="accent"
								icon="x"
								aria-label="Remove filter: {filter.label}"
								onclick={() => change(active.filter((entry) => entry.id !== filter.id))}
							/>
						{/each}
						<Button label="Clear" variant="quiet" onclick={() => change([])} />
					</div>
				{/if}

				{#if rows.length === 0}
					<EmptyState
						inline
						title="Nothing matches these filters"
						text="Take a filter off, or clear them all."
						action={{ label: 'Clear filters', onclick: () => change([]) }}
					/>
				{:else}
					<div class="layout">
						<section class="feed" aria-labelledby="{uid}-feed">
							<h2 class="ed-sr-only" id="{uid}-feed">Transactions</h2>
							<div class="feed-head">
								<p class="totals">
									<span>{rows.length} transactions</span> ·
									<span class="cost">Out {formatMoney(outTotal)}</span> ·
									<span class="earned">In {formatMoney(inTotal)}</span>
								</p>
								<p class="note">{stale ? `Chase ${STALE_AS_OF}` : 'Updated 07:12'}</p>
							</div>
							{#if otherCurrency}<p class="note">{OTHER_CURRENCY}</p>{/if}
							{#each days as group (group.day)}
								<section class="day" aria-labelledby="{uid}-d-{group.day}">
									<h3 class="day-title" id="{uid}-d-{group.day}">{dayTitle(group.day)}</h3>
									<ul class="rows">
										{#each group.rows as tx (tx.id)}
											{@const tone = kindTone(tx.kind)}
											{@const from = bankOf(tx.account)}
											<li class="row">
												<span class={['tile', tone]} aria-hidden="true">
													<Icon name={KIND_GLYPHS[tx.kind]} size="sm" />
												</span>
												<span class="title">{tx.title}</span>
												<span class="second">{secondLine(tx)}</span>
												<span class="pills">
													<BankPill
														institution={from.name}
														last4={from.last4}
														colour={from.colour}
														touch={platform === 'mobile'}
														onclick={() => !has(`where:${tx.account}`) && change([...active, where(tx.account)])}
													/>
													{#if tx.toAccount}
														{@const to = bankOf(tx.toAccount)}
														<span class="arrow" aria-hidden="true">→</span>
														<span class="ed-sr-only">to</span>
														<BankPill
															institution={to.name}
															last4={to.last4}
															colour={to.colour}
															touch={platform === 'mobile'}
															onclick={() => !has(`where:${tx.toAccount}`) && change([...active, where(tx.toAccount!)])}
														/>
													{/if}
												</span>
												<span class={['amount', tone]}>{formatMoney(tx.amount, { sign: true })}</span>
												<span class="menu">
													<IconButton
														icon="ellipsis"
														size="sm"
														label="Actions for {tx.title}, {dayTitle(tx.date)}"
														aria-haspopup="menu"
														aria-expanded={menuOpen && menuFor?.id === tx.id}
														onclick={(event) => {
															menuFor = { id: tx.id, title: tx.title, anchor: event.currentTarget }
															menuOpen = true
														}}
													/>
												</span>
											</li>
										{/each}
									</ul>
								</section>
							{/each}
						</section>

						<aside class="insights" aria-label="Insights">
							<section class="card" aria-labelledby="{uid}-weeks">
								<h2 class="card-title" id="{uid}-weeks">Spending by week</h2>
								<BarChart
									series={weekly}
									labels={WEEKS.map((week) => week.label)}
									format={dollars}
									height={140}
									label="Spending by week, stacked by Groceries, Dining and everything else"
								/>
							</section>
							<section class="card" aria-labelledby="{uid}-merchants">
								<h2 class="card-title" id="{uid}-merchants">Top merchants</h2>
								<DataTable
									label="Top merchants"
									columns={[
										{ label: 'Merchant' },
										{ label: 'Count', numeric: true },
										{ label: 'Average', numeric: true },
										{ label: 'Total', numeric: true },
									]}
									rows={merchants}
								/>
							</section>
							<section class="card" aria-labelledby="{uid}-typical">
								<h2 class="card-title" id="{uid}-typical">Against typical</h2>
								<DataTable
									label="Against typical"
									columns={[
										{ label: 'Category' },
										{ label: 'This month', numeric: true },
										{
											label: 'Typical',
											numeric: true,
											hint: 'What the category usually comes to over the same days of a month.',
										},
										{ label: 'Change', numeric: true },
									]}
									rows={typical}
								/>
							</section>
							<section class="card" aria-labelledby="{uid}-months">
								<h2 class="card-title" id="{uid}-months">In and out by month</h2>
								<DataTable
									label="In and out by month"
									columns={[
										{ label: 'Month' },
										{ label: 'In', numeric: true },
										{ label: 'Out', numeric: true },
										{ label: 'Net', numeric: true },
									]}
									rows={months}
								/>
							</section>
						</aside>
					</div>
				{/if}
				<Menu
					bind:open={menuOpen}
					anchor={menuFor?.anchor}
					align="end"
					label="Actions for {menuFor?.title ?? 'this row'}"
					items={ROW_ACTIONS}
					onselect={act}
				/>
			</div>
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
	.search {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
	}
	.search :global(.search-field) {
		flex: 1;
		min-width: 0;
	}
	.anchor {
		display: inline-flex;
	}
	.filters {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		max-width: 28rem;
		max-height: 70vh;
		overflow: auto;
		padding: var(--space-3);
	}
	.filter-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.filter-title {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
	}
	.filter-chips,
	.active {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.amounts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}
	.layout {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-6);
	}
	.feed {
		display: flex;
		flex: 999 1 26rem;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	/* wide enough that each insight table shows its last column whole; when the feed and it cannot both fit, it goes
	   under the feed at full width (D-112) */
	.insights {
		display: flex;
		flex: 1 1 30rem;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.phone .feed,
	.phone .insights {
		flex-basis: 100%;
	}
	.feed-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
	}
	.totals {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.note {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.day {
		display: flex;
		flex-direction: column;
	}
	.day-title {
		margin: 0;
		padding: var(--space-2) 0 var(--space-1);
		border-bottom: 1px solid var(--stroke-subtle);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto auto;
		grid-template-areas:
			'tile title pills amount menu'
			'tile second pills amount menu';
		align-items: center;
		column-gap: var(--space-3);
		padding: var(--space-2) 0;
	}
	.row + .row {
		border-top: 1px solid var(--stroke-subtle);
	}
	.phone .row {
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		grid-template-areas:
			'tile title amount menu'
			'tile second second second'
			'tile pills pills pills';
		row-gap: var(--space-1);
	}
	.tile {
		display: inline-grid;
		grid-area: tile;
		place-items: center;
		align-self: start;
		width: var(--space-8);
		height: var(--space-8);
		border: 1px solid var(--stroke-subtle);
		border-radius: var(--ed-radius-control);
		background: var(--surface-2);
		color: var(--text-secondary);
	}
	.title {
		grid-area: title;
		overflow: hidden;
		font: var(--ed-t-text);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.second {
		grid-area: second;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		grid-area: pills;
		align-items: center;
		gap: var(--space-1);
	}
	.arrow {
		font: var(--ed-t-caption);
		color: var(--text-secondary);
	}
	.amount {
		grid-area: amount;
		justify-self: end;
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.menu {
		display: inline-flex;
		grid-area: menu;
	}
	.cost {
		color: var(--danger);
	}
	.earned {
		color: var(--success);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
	}
	.card-title {
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
	}
</style>
