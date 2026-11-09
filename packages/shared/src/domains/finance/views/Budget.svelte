<script lang="ts">
	// Orchard's Budget tab (product/domains/finance.md §6, "Budget (#84)", D-201), ported from Domains/Orchard/Budget:
	// the month stepper, then Planned, Spent and Left with the income and what is left to plan, then the Fixed,
	// Variable and Sinking funds cards. A line reads what was spent of what is available over the kit's `Meter`, with
	// Over by in words, what rolled over, and a sinking fund's due month and monthly share. Every figure is worked out
	// in `budget.ts` and goes through `formatMoney` and Hide amounts; with amounts hidden a meter reads a percentage, so
	// no money reaches `aria-valuetext`. Rows do not act (D-118): a line's menu edits or removes it, from the current
	// month on; a past month is read-only. The month is the view's own and starts on the current one at each visit;
	// it tells the page through `onmonth`, for the header's actions.
	import { EmptyState, Icon, IconButton, InlineError, Menu, Meter, Skeleton, Stat, type MenuItem } from '@eden/ui-kit'
	import { onMount } from 'svelte'
	import { dateIn } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { decimalsOf, formatMoney, money as moneyOf, type Money } from '../../../money/index.js'
	import { amountText, settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { staleDay } from '../accounts.js'
	import { firstBudgetMonth, toPlanOf, type BudgetGroup, type BudgetLine } from '../budget.js'
	import { leanSinceOf } from '../income.js'
	import { addMonths } from '../ledger.js'
	import { finance } from '../store.svelte.js'
	import { dayLine, monthYearLine } from '../words.js'

	type Props = {
		/** The month shown, as it changes and once on mount. */
		onmonth?: (month: string) => void
		/** Draft from history, for the month shown. */
		ondraft: (month: string) => void
		/** Edit line, for the month shown. */
		onedit: (month: string, categoryId: string) => void
	}
	let { onmonth, ondraft, onedit }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const hidden = $derived(settings.hideAmounts)
	const money = (amount: Money) => amountText(formatMoney(amount, lang), hidden)
	const signed = (amount: Money) => amountText(formatMoney(amount, lang, { sign: 'exceptZero' }), hidden)
	const majorOf = (amount: Money) => amount.minor / 10 ** decimalsOf(amount.currency)
	const percentOf = (part: number, whole: number) =>
		whole > 0 ? Math.round((Math.max(0, part) / whole) * 100) : part > 0 ? 100 : 0

	const current = $derived(dateIn(undefined, finance.clock).slice(0, 7))
	let month = $state(dateIn(undefined, finance.clock).slice(0, 7))
	const earliest = $derived.by(() => {
		const first = firstBudgetMonth(finance.budgets)
		return first && first < current ? first : current
	})
	const latest = $derived(addMonths(current, 1))
	const editable = $derived(month >= current)
	function step(by: number) {
		month = addMonths(month, by)
		onmonth?.(month)
	}

	let readFailed = $state(false)
	function read() {
		readFailed = false
		finance.query({ rows: { limit: 1 } }).catch(() => (readFailed = true))
	}
	onMount(() => {
		onmonth?.(month)
		read()
	})

	const view = $derived(finance.ledgerReady ? finance.budget(month) : undefined)
	const income = $derived(finance.budgetIncome)
	const toPlan = $derived(view ? toPlanOf(income, view.planned) : undefined)
	const absolute = (amount: Money) => moneyOf(Math.abs(amount.minor), amount.currency)

	/** The first account whose balance is not fresh: its institution and the day it is as of. */
	const stale = $derived.by(() => {
		for (const account of finance.accounts) {
			if (account.closedOn) continue
			const day = staleDay(account, finance.links, finance.clock)
			if (!day) continue
			const institution = finance.linkById(account.linkId)?.institution.name ?? account.institution ?? account.name
			return { institution, day: dayLine(day, lang) }
		}
		return undefined
	})
	const lean = $derived(leanSinceOf(finance.incomeSources) !== undefined)

	const GROUPS: readonly BudgetGroup[] = ['fixed', 'variable', 'sinking']

	/** What the meter and the head row read for a line, as money or, with amounts hidden, as a percentage. */
	function reading(line: BudgetLine) {
		if (line.sinking) {
			const { saved, target } = line.sinking
			const figure = $t('domains.finance.budget.of', { values: { spent: money(saved), available: money(target) } })
			if (hidden) {
				const percent = percentOf(saved.minor, target.minor)
				return {
					figure,
					value: percent,
					max: 100,
					text: $t('domains.finance.budget.savedPercent', { values: { percent } }),
				}
			}
			return { figure, value: Math.max(0, majorOf(saved)), max: majorOf(target), text: figure }
		}
		const figure = $t('domains.finance.budget.of', {
			values: { spent: money(line.spent), available: money(line.available) },
		})
		if (hidden) {
			const percent = percentOf(line.spent.minor, line.available.minor)
			return {
				figure,
				value: percent,
				max: 100,
				text: $t('domains.finance.budget.planPercent', { values: { percent } }),
			}
		}
		return { figure, value: Math.max(0, majorOf(line.spent)), max: majorOf(line.available), text: figure }
	}

	/** The line's footer parts, each only when it applies. */
	function footOf(line: BudgetLine): { text: string; danger?: boolean }[] {
		const parts: { text: string; danger?: boolean }[] = []
		if (line.over)
			parts.push({ text: $t('domains.finance.budget.over', { values: { amount: money(line.over) } }), danger: true })
		if (line.sinking) {
			const due = $t('domains.finance.budget.due', {
				values: { month: monthYearLine(`${line.sinking.by}-01`, lang, true) },
			})
			const monthly = line.sinking.monthly
			parts.push({
				text: monthly
					? `${due} · ${$t('domains.finance.budget.monthly', { values: { amount: money(monthly) } })}`
					: due,
			})
		} else if (line.carried.minor !== 0)
			parts.push({ text: $t('domains.finance.budget.rolledOver', { values: { amount: signed(line.carried) } }) })
		else if (line.rollover) parts.push({ text: $t('domains.finance.budget.rollsOver') })
		return parts
	}

	let menuFor = $state<{ line: BudgetLine; anchor: HTMLElement }>()
	let menuOpen = $state(false)
	const items = $derived<MenuItem[]>([
		{ id: 'edit', label: $t('domains.finance.budget.edit'), icon: 'pencil' },
		{ id: 'remove', label: $t('domains.finance.budget.remove'), icon: 'trash', destructive: true },
	])
	async function act(item: MenuItem) {
		const line = menuFor?.line
		if (!line) return
		if (item.id === 'edit') onedit(month, line.categoryId)
		else if (item.id === 'remove') {
			const undo = await finance.removeBudgetLine(month, line.categoryId)
			if (undo) undoToast($t('domains.finance.budget.toasts.removed', { values: { category: line.name } }), undo)
		}
	}
</script>

<div class="body">
	<div class="stepper">
		<IconButton
			icon="chevron-left"
			size="sm"
			label={$t('domains.finance.budget.previous')}
			disabled={month <= earliest}
			onclick={() => step(-1)}
		/>
		<p class="month" aria-live="polite">{monthYearLine(`${month}-01`, lang, true)}</p>
		<IconButton
			icon="chevron-right"
			size="sm"
			label={$t('domains.finance.budget.next')}
			disabled={month >= latest}
			onclick={() => step(1)}
		/>
	</div>

	{#if readFailed}
		<InlineError message={$t('domains.finance.budget.readFailed')} onretry={read} live />
	{:else if !view}
		<Skeleton rows={3} icon={false} />
	{:else if view.lines.length}
		<div class="totals">
			<dl class="figures">
				<div class="figure">
					<dt>{$t('domains.finance.budget.planned')}</dt>
					<dd><Stat value={money(view.planned)} size="md" /></dd>
				</div>
				<div class="figure">
					<dt>{$t('domains.finance.budget.spent')}</dt>
					<dd><Stat value={money(view.spent)} size="md" /></dd>
				</div>
				<div class="figure">
					<dt>{$t('domains.finance.budget.left')}</dt>
					<dd><Stat value={money(view.left)} size="md" /></dd>
				</div>
				{#if income}
					<div class="figure">
						<dt>{$t('domains.finance.budget.income')}</dt>
						<dd>
							<Stat value={money(income.amount)} size="md" />
							<span class="note">
								{income.basis === 'paychecks'
									? $t('domains.finance.budget.fromPaychecks')
									: $t('domains.finance.budget.average', { values: { months: income.months } })}
							</span>
						</dd>
					</div>
				{/if}
				{#if toPlan}
					<div class="figure">
						<dt>{$t('domains.finance.budget.toPlan')}</dt>
						<dd>
							<Stat value={money(absolute(toPlan))} size="md" />
							<span class={['note', { danger: toPlan.minor < 0 }]}>
								{toPlan.minor < 0
									? $t('domains.finance.budget.overPlanned', { values: { amount: money(absolute(toPlan)) } })
									: $t('domains.finance.budget.notPlanned', { values: { amount: money(toPlan) } })}
							</span>
						</dd>
					</div>
				{/if}
			</dl>
			{#if stale}
				<p class="note">{$t('domains.finance.budget.stale', { values: stale })}</p>
			{/if}
			{#if view.unbudgeted.minor > 0}
				<p class="note">{$t('domains.finance.budget.outside', { values: { amount: money(view.unbudgeted) } })}</p>
			{/if}
			{#if view.hasOther}
				<p class="note">{$t('domains.finance.budget.otherCurrencies')}</p>
			{/if}
			{#if lean}
				<p class="note">{$t('domains.finance.budget.lean')}</p>
			{/if}
		</div>

		{#each GROUPS as group (group)}
			{@const lines = view.groups[group]}
			{#if lines.length}
				<section class="card" aria-labelledby="{uid}-{group}">
					<div class="group-head">
						{#if group === 'sinking'}<span class="glyph"><Icon name="piggy-bank" size="sm" /></span>{/if}
						<h2 class="group-title" id="{uid}-{group}">{$t(`domains.finance.budget.groups.${group}`)}</h2>
					</div>
					<ul class="lines">
						{#each lines as line (line.categoryId)}
							{@const shown = reading(line)}
							{@const foot = footOf(line)}
							<li class="line">
								<div class="line-head">
									<span class="name">{line.name}</span>
									<span class="figure-text">{shown.figure}</span>
									{#if editable}
										<span class="menu">
											<IconButton
												icon="ellipsis"
												size="sm"
												label={$t('domains.finance.budget.actions', { values: { category: line.name } })}
												aria-haspopup="menu"
												aria-expanded={menuOpen && menuFor?.line.categoryId === line.categoryId}
												onclick={(event) => {
													menuFor = { line, anchor: event.currentTarget }
													menuOpen = true
												}}
											/>
										</span>
									{/if}
								</div>
								<Meter value={shown.value} max={shown.max} label={line.name} valuetext={shown.text} />
								{#if foot.length}
									<p class="line-foot">
										{#each foot as part (part.text)}
											<span class={{ danger: part.danger }}>{part.text}</span>
										{/each}
									</p>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	{/if}
</div>

{#if view && !readFailed && !view.lines.length}
	<EmptyState
		title={$t('domains.finance.budget.emptyTitle')}
		text={$t('domains.finance.budget.emptyText')}
		action={editable
			? { label: $t('domains.finance.budget.draft'), icon: 'clipboard-list', onclick: () => ondraft(month) }
			: undefined}
	/>
{/if}

<Menu
	bind:open={menuOpen}
	anchor={menuFor?.anchor}
	align="end"
	label={$t('domains.finance.budget.actions', { values: { category: menuFor?.line.name ?? '' } })}
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
	.stepper {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.month {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
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
		gap: var(--space-1) var(--space-3);
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.danger {
		color: var(--danger);
	}
</style>
