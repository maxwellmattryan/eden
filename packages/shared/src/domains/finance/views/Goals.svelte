<script lang="ts">
	// Orchard's Goals tab (product/domains/finance.md §6, "Goals (#88)", D-203), laid out as Budget is: the savings rate
	// card, then Saved, To go and Needed a month, one card per earmarked account in the Accounts tab's order, and the
	// closed goals under Done. A goal reads what it holds of its target over the kit's `Meter`, then the first line that
	// applies (reached, past its date, its date and monthly, or the month at the recent pace), an emergency fund's months
	// of essentials, and a dip under its high-water mark with an icon and warn ink. Every figure is worked out in
	// `goals.ts` and goes through `formatMoney` and Hide amounts; with amounts hidden a meter reads a percentage, so no
	// money reaches `aria-valuetext`. Rows do not act (D-118): each one's menu holds its actions.
	import { EmptyState, Icon, IconButton, InlineError, Menu, Meter, Skeleton, Stat, type MenuItem } from '@eden/ui-kit'
	import { onMount } from 'svelte'
	import { dateIn } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { decimalsOf, formatMoney, type Money } from '../../../money/index.js'
	import { amountText, settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { canEarmark, type GoalGroup, type GoalRow } from '../goals.js'
	import { finance } from '../store.svelte.js'
	import type { SavingsGoal } from '../types.js'
	import { dayLine, monthYearLine } from '../words.js'

	type Props = {
		/** Add a goal. */
		onadd: () => void
		onedit: (goal: SavingsGoal) => void
		/** Plan the rebuild of a dipped goal. */
		onrebuild: (goal: SavingsGoal) => void
		/** Set or edit the savings-rate target. */
		onrate: () => void
		/** A bought goal as an asset, or the loan that paid for it. */
		onasset: (goal: SavingsGoal) => void
		onloan: (goal: SavingsGoal) => void
		/** Add an account, when none can hold a goal. */
		onaccount: () => void
	}
	let { onadd, onedit, onrebuild, onrate, onasset, onloan, onaccount }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const hidden = $derived(settings.hideAmounts)
	const money = (amount: Money) => amountText(formatMoney(amount, lang), hidden)
	const majorOf = (amount: Money) => amount.minor / 10 ** decimalsOf(amount.currency)
	const percentOf = (part: number, whole: number) =>
		whole > 0 ? Math.round((Math.max(0, part) / whole) * 100) : part > 0 ? 100 : 0
	const monthText = (month: string) => monthYearLine(`${month}-01`, lang, true)
	const decimal = $derived(new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }))

	let readFailed = $state(false)
	function read() {
		readFailed = false
		finance.query({ rows: { limit: 1 } }).catch(() => (readFailed = true))
	}
	onMount(read)

	const view = $derived(finance.goalsView)
	const eligible = $derived(finance.accounts.some(canEarmark))
	const thisMonth = $derived(dateIn(undefined, finance.clock).slice(0, 7))

	/** What the meter and the head row read for a goal, as money or, with amounts hidden, as a percentage. */
	function reading(row: GoalRow) {
		const target = row.goal.target ?? row.saved
		const figure = $t('domains.finance.goals.of', { values: { saved: money(row.saved), target: money(target) } })
		if (hidden) {
			const percent = percentOf(row.saved.minor, target.minor)
			return {
				figure,
				value: percent,
				max: 100,
				text: $t('domains.finance.goals.savedPercent', { values: { percent } }),
			}
		}
		return { figure, value: majorOf(row.saved), max: Math.max(majorOf(target), 0), text: figure }
	}

	/** The row's second line, its parts in order, each only when it applies. */
	function footOf(row: GoalRow, group: GoalGroup): { text: string; warn?: boolean }[] {
		if (row.accountState === 'closed')
			return [
				{
					text: $t('domains.finance.goals.accountClosed', { values: { account: group.account?.name ?? '' } }),
					warn: true,
				},
			]
		if (row.accountState === 'gone') return [{ text: $t('domains.finance.goals.accountGone'), warn: true }]
		const parts: { text: string; warn?: boolean }[] = []
		const about = row.reachMonth
			? $t('domains.finance.goals.aboutAfter', { values: { month: monthText(row.reachMonth) } })
			: undefined
		if (row.reached) parts.push({ text: $t('domains.finance.goals.reached') })
		else if (row.past) {
			parts.push({ text: $t('domains.finance.goals.past'), warn: true })
			if (about) parts.push({ text: about })
		} else if (row.monthly && row.goal.by) {
			parts.push({
				text: $t('domains.finance.goals.byMonthly', {
					values: { month: monthText(row.goal.by), amount: money(row.monthly) },
				}),
			})
			if (row.behind) parts.push({ text: $t('domains.finance.goals.behind'), warn: true })
			else if (about) parts.push({ text: about })
		} else if (row.reachMonth)
			parts.push({ text: $t('domains.finance.goals.about', { values: { month: monthText(row.reachMonth) } }) })
		if (row.covers !== undefined)
			parts.push({ text: $t('domains.finance.goals.covers', { values: { months: decimal.format(row.covers) } }) })
		return parts
	}

	/** The dip line: how far the goal is under its high-water mark, and the rebuild when one is planned. */
	function dipOf(row: GoalRow): string | undefined {
		if (!row.dip) return undefined
		const down = $t('domains.finance.goals.dip', {
			values: { amount: money(row.dip.amount), high: money(row.dip.from), day: dayLine(row.dip.day, lang) },
		})
		if (!row.rebuildMonthly || !row.goal.rebuildBy) return down
		const rebuild = $t('domains.finance.goals.rebuild', {
			values: { month: monthText(row.goal.rebuildBy), amount: money(row.rebuildMonthly) },
		})
		return `${down} · ${rebuild}`
	}

	/** The account's bank and its last four, as the Accounts tab says them. */
	function whereOf(group: GoalGroup): string | undefined {
		const account = group.account
		if (!account) return undefined
		const institution = finance.linkById(account.linkId)?.institution.name ?? account.institution
		const parts = [institution, account.last4 ? `••${account.last4}` : undefined].filter(Boolean)
		return parts.length ? parts.join(' · ') : undefined
	}

	const rateGoal = $derived(view?.rateGoal)
	const rate = $derived(view?.rate)
	const target = $derived(rateGoal?.rate !== undefined ? Math.round(rateGoal.rate / 100) : undefined)

	type MenuFor =
		| { kind: 'row'; row: GoalRow; anchor: HTMLElement }
		| { kind: 'done'; goal: SavingsGoal; anchor: HTMLElement }
		| { kind: 'rate'; anchor: HTMLElement }
	let menuFor = $state<MenuFor>()
	let menuOpen = $state(false)
	function openMenu(next: MenuFor) {
		menuFor = next
		menuOpen = true
	}
	const menuLabel = $derived.by(() => {
		if (menuFor?.kind === 'rate') return $t('domains.finance.goals.rate.actions')
		const goal = menuFor?.kind === 'row' ? menuFor.row.goal : menuFor?.goal
		return $t('domains.finance.goals.actions', { values: { name: goal?.name ?? '' } })
	})
	const items = $derived.by<MenuItem[]>(() => {
		const label = (key: string) => $t(`domains.finance.goals.menu.${key}`)
		if (!menuFor) return []
		if (menuFor.kind === 'rate')
			return rateGoal
				? [
						{ id: 'rate-edit', label: $t('domains.finance.goals.rate.edit'), icon: 'pencil' },
						{ id: 'rate-remove', label: $t('domains.finance.goals.rate.remove'), icon: 'trash', destructive: true },
					]
				: [{ id: 'rate-set', label: $t('domains.finance.goals.rate.set'), icon: 'target' }]
		if (menuFor.kind === 'done') {
			const goal = menuFor.goal
			const bought = goal.closedAs === 'bought'
			return [
				{
					id: 'reopen',
					label: label('reopen'),
					icon: 'undo-2',
					disabled: goal.kind === 'emergency' && Boolean(view?.emergencyOpen),
				},
				...(bought
					? [
							{ id: 'asset', label: label('asset'), icon: 'package' as const },
							{ id: 'loan', label: label('loan'), icon: 'landmark' as const },
						]
					: []),
				{ id: 'delete', label: label('delete'), icon: 'trash', destructive: true },
			]
		}
		const row = menuFor.row
		return [
			{ id: 'edit', label: label('edit'), icon: 'pencil' },
			{ id: 'up', label: label('up'), icon: 'arrow-up', disabled: row.first },
			{ id: 'down', label: label('down'), icon: 'arrow-down', disabled: row.last },
			...(row.dip
				? [
						{ id: 'rebuild', label: label('rebuild'), icon: 'calendar' as const },
						{ id: 'from-here', label: label('fromHere'), icon: 'rotate-ccw' as const },
					]
				: []),
			...(row.goal.kind === 'target' ? [{ id: 'bought', label: label('bought'), icon: 'circle-check' as const }] : []),
			{ id: 'close', label: label('close'), icon: 'x' },
			{ id: 'delete', label: label('delete'), icon: 'trash', destructive: true },
		]
	})

	async function act(item: MenuItem) {
		const chosen = menuFor
		if (!chosen) return
		const toast = (key: string, undo: (() => void) | undefined, name = '') => {
			if (undo) undoToast($t(`domains.finance.goals.toasts.${key}`, { values: { name } }), undo)
		}
		if (chosen.kind === 'rate') {
			if (item.id === 'rate-remove')
				toast('rateRemoved', (await finance.saveRate(undefined)) as (() => void) | undefined)
			else onrate()
			return
		}
		const goal = chosen.kind === 'row' ? chosen.row.goal : chosen.goal
		const name = goal.name ?? ''
		switch (item.id) {
			case 'edit':
				return onedit(goal)
			case 'up':
			case 'down':
				return toast('moved', await finance.moveGoal(goal.id, item.id), name)
			case 'rebuild':
				return onrebuild(goal)
			case 'from-here':
				return toast('fromHere', await finance.startFromHere(goal.id), name)
			case 'bought':
				return toast('bought', await finance.closeGoal(goal.id, 'bought'), name)
			case 'close':
				return toast('closed', await finance.closeGoal(goal.id, 'closed'), name)
			case 'reopen':
				return toast('reopened', await finance.reopenGoal(goal.id), name)
			case 'asset':
				return onasset(goal)
			case 'loan':
				return onloan(goal)
			case 'delete':
				return toast('deleted', await finance.deleteGoal(goal.id), name)
		}
	}
</script>

{#if readFailed}
	<div class="body">
		<InlineError message={$t('domains.finance.goals.readFailed')} onretry={read} live />
	</div>
{:else if !view}
	<div class="body">
		<Skeleton rows={3} icon={false} />
	</div>
{:else if !view.hasGoals && !eligible}
	<EmptyState
		title={$t('domains.finance.goals.emptyTitle')}
		text={$t('domains.finance.goals.emptyNoAccount')}
		action={{ label: $t('domains.finance.actions.addAccount'), icon: 'plus', onclick: onaccount }}
	/>
{:else if !view.hasGoals}
	<EmptyState
		title={$t('domains.finance.goals.emptyTitle')}
		text={$t('domains.finance.goals.emptyText')}
		action={{ label: $t('domains.finance.goals.add'), icon: 'plus', onclick: onadd }}
	/>
{:else}
	<div class="body">
		<section class="card" aria-labelledby="{uid}-rate">
			<div class="group-head">
				<h2 class="group-title" id="{uid}-rate">{$t('domains.finance.goals.rate.title')}</h2>
				<span class="menu">
					<IconButton
						icon="ellipsis"
						size="xs"
						label={$t('domains.finance.goals.rate.actions')}
						tooltip
						aria-haspopup="menu"
						aria-expanded={menuOpen && menuFor?.kind === 'rate'}
						onclick={(event) => openMenu({ kind: 'rate', anchor: event.currentTarget })}
					/>
				</span>
			</div>
			{#if rate?.rate !== undefined}
				{@const months = rate.months.filter((entry) => entry.rate !== undefined)}
				<div class="rate">
					<span class={['rate-figure', { danger: rate.rate < 0 }]}>
						<Stat value={$t('domains.finance.goals.rate.percent', { values: { rate: rate.rate } })} size="md" />
					</span>
					<p class="text">
						{$t('domains.finance.goals.rate.sentence', { values: { rate: rate.rate, months: rate.months.length } })}
					</p>
				</div>
				{#if months.length}
					<ul class="months">
						{#each months as entry (entry.month)}
							<li>
								{$t('domains.finance.goals.rate.month', {
									values: { month: monthYearLine(`${entry.month}-01`, lang), rate: entry.rate },
								})}
							</li>
						{/each}
					</ul>
				{/if}
				{#if target !== undefined}
					{@const percent = percentOf(rate.rate, target)}
					<Meter
						value={Math.max(0, rate.rate)}
						max={target}
						label={$t('domains.finance.goals.rate.title')}
						valuetext={$t('domains.finance.goals.rate.ofGoal', { values: { percent } })}
						tone="default"
					/>
					<p class="note">{$t('domains.finance.goals.rate.target', { values: { rate: target } })}</p>
				{/if}
			{:else}
				<p class="note">{$t('domains.finance.goals.rate.noIncome')}</p>
				{#if target !== undefined}
					<p class="note">{$t('domains.finance.goals.rate.target', { values: { rate: target } })}</p>
				{/if}
			{/if}
		</section>

		<div class="totals">
			<dl class="figures">
				<div class="figure">
					<dt>{$t('domains.finance.goals.totals.saved')}</dt>
					<dd><Stat value={money(view.totals.saved)} size="md" /></dd>
				</div>
				<div class="figure">
					<dt>{$t('domains.finance.goals.totals.toGo')}</dt>
					<dd><Stat value={money(view.totals.toGo)} size="md" /></dd>
				</div>
				<div class="figure">
					<dt>{$t('domains.finance.goals.totals.monthly')}</dt>
					<dd><Stat value={money(view.totals.monthly)} size="md" /></dd>
				</div>
			</dl>
			{#if view.totals.left.length}
				<p class="note">{$t('domains.finance.goals.totals.otherCurrencies')}</p>
			{/if}
		</div>

		{#each view.groups as group (group.accountId)}
			{@const where = whereOf(group)}
			<section class="card" aria-labelledby="{uid}-{group.accountId}">
				<div class="account-head">
					<div class="account-name">
						<h2 class="group-title" id="{uid}-{group.accountId}">
							{group.account?.name ?? $t('domains.finance.goals.goneTitle')}
						</h2>
						{#if where}<p class="note">{where}</p>{/if}
					</div>
					{#if group.account?.balance}
						<span class="figure-text">{money(group.account.balance)}</span>
					{/if}
				</div>
				<ul class="lines">
					{#each group.rows as row (row.goal.id)}
						{@const shown = reading(row)}
						{@const foot = footOf(row, group)}
						{@const dip = dipOf(row)}
						<li class="line">
							<div class="line-head">
								<span class="name">{row.goal.name}</span>
								<span class="figure-text">{shown.figure}</span>
								<span class="menu">
									<IconButton
										icon="ellipsis"
										size="sm"
										label={$t('domains.finance.goals.actions', { values: { name: row.goal.name ?? '' } })}
										aria-haspopup="menu"
										aria-expanded={menuOpen && menuFor?.kind === 'row' && menuFor.row.goal.id === row.goal.id}
										onclick={(event) => openMenu({ kind: 'row', row, anchor: event.currentTarget })}
									/>
								</span>
							</div>
							<Meter
								value={shown.value}
								max={shown.max}
								label={row.goal.name ?? ''}
								valuetext={shown.text}
								tone="default"
							/>
							{#if foot.length}
								<p class="line-foot">
									{#each foot as part (part.text)}
										<span class={{ warn: part.warn }}>{part.text}</span>
									{/each}
								</p>
							{/if}
							{#if dip}
								<p class="line-foot warn dip">
									<Icon name="trending-down" size="sm" />
									<span>{dip}</span>
								</p>
							{/if}
						</li>
					{/each}
				</ul>
				{#if group.notEarmarked || group.sharedMonthly}
					<p class="line-foot">
						{#if group.notEarmarked}
							<span>{$t('domains.finance.goals.notEarmarked', { values: { amount: money(group.notEarmarked) } })}</span>
						{/if}
						{#if group.sharedMonthly}
							<span>{$t('domains.finance.goals.shared', { values: { amount: money(group.sharedMonthly) } })}</span>
						{/if}
					</p>
				{/if}
			</section>
		{/each}

		{#if view.done.length}
			<section class="card" aria-labelledby="{uid}-done">
				<div class="group-head">
					<h2 class="group-title" id="{uid}-done">{$t('domains.finance.goals.done.title')}</h2>
				</div>
				<ul class="lines">
					{#each view.done as goal (goal.id)}
						<li class="line">
							<div class="line-head">
								<span class="name">{goal.name}</span>
								{#if goal.target}<span class="figure-text">{money(goal.target)}</span>{/if}
								<span class="menu">
									<IconButton
										icon="ellipsis"
										size="sm"
										label={$t('domains.finance.goals.actions', { values: { name: goal.name ?? '' } })}
										aria-haspopup="menu"
										aria-expanded={menuOpen && menuFor?.kind === 'done' && menuFor.goal.id === goal.id}
										onclick={(event) => openMenu({ kind: 'done', goal, anchor: event.currentTarget })}
									/>
								</span>
							</div>
							<p class="line-foot">
								<span>
									{$t(
										goal.closedAs === 'bought'
											? 'domains.finance.goals.done.bought'
											: 'domains.finance.goals.done.closed',
										{
											values: { month: monthText((goal.closedOn ?? thisMonth).slice(0, 7)) },
										}
									)}
								</span>
							</p>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
{/if}

<Menu
	bind:open={menuOpen}
	anchor={menuFor?.anchor}
	align="end"
	label={menuLabel}
	{items}
	onselect={(item) => void act(item)}
/>

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
		gap: var(--space-2);
	}
	.figures {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-6);
		margin: 0;
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
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
	}
	.note {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.text {
		margin: 0;
		font: var(--ed-t-text);
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
	.group-head,
	.account-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.group-head .group-title,
	.account-name {
		flex: 1;
		min-width: 0;
	}
	.account-name {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.group-title {
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
	}
	.rate {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.rate-figure.danger :global(.ed-stat) {
		color: var(--danger);
	}
	.months {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.lines {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.line {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) 0;
	}
	.line + .line {
		border-top: 1px solid var(--stroke-subtle);
	}
	.line-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		font: var(--ed-t-text);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.figure-text {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.menu {
		display: inline-flex;
	}
	.line-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.dip {
		flex-wrap: nowrap;
		gap: var(--space-1);
	}
	.warn {
		color: var(--warn);
	}
</style>
