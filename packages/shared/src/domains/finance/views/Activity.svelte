<script lang="ts">
	// Orchard's Activity (product/domains/finance.md §6, design/screens.md `orchard-activity`; D-199), ported from
	// Domains/Orchard/Activity: one feed of every money event across every account, newest first and grouped by day,
	// each row with its kind's glyph, a title, a second line and the bank on a pill (two, from → to, for a pair). The
	// search row ends in the filter button, which opens the filters in a Popover; the chips that are on sit under it.
	// The totals line and the four insight cards follow the whole filter, and every answer is the ledger's (D-194). The
	// filters live in the session (`activitySession`), never in storage or the address. Rows take no hover ground
	// (D-118): the menu is the action. Every figure goes through `formatMoney` and Hide amounts.
	import {
		BarChart,
		Button,
		Chip,
		DataTable,
		EmptyState,
		Field,
		Icon,
		IconButton,
		InlineError,
		Menu,
		Popover,
		Skeleton,
		type DataTableCell,
		type MenuItem,
	} from '@eden/ui-kit'
	import { onMount } from 'svelte'
	import { addDays, formatDateOf, todayIso } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { formatMoney, money, toDecimal, type Money } from '../../../money/index.js'
	import { amountText, settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { INSTITUTION_COLOUR, INSTITUTION_LOGO } from '../accounts.js'
	import {
		KIND_GLYPHS,
		PERIOD_PRESETS,
		STATE_CHIPS,
		againstTypical,
		amountChipMinor,
		chipKey,
		chipLabel,
		filterOf,
		inOutByMonth,
		kindTone,
		liveChips,
		monthLine,
		rowTitle,
		rowWords,
		spendingSeries,
		topMerchantOptions,
		topMerchants,
		wholeMoney,
		type ActivityChip,
	} from '../activity.js'
	import { activitySession } from '../activity.svelte.js'
	import { LedgerQueryError, queryLedger, type LedgerAnswer, type LedgerRow } from '../ledger.js'
	import { provider } from '../provider.svelte.js'
	import { finance } from '../store.svelte.js'
	import { TX_KINDS, type Account } from '../types.js'
	import { dayLine } from '../words.js'
	import BankPill from './BankPill.svelte'

	type Props = {
		oncategorise: (row: LedgerRow) => void
		onreimbursable: (row: LedgerRow) => void
		onlink?: () => void
		onaddaccount: () => void
		onimport: () => void
		onsample: () => void
	}
	let { oncategorise, onreimbursable, onlink, onaddaccount, onimport, onsample }: Props = $props()

	const uid = $props.id()
	const searchId = `${uid}-search`
	const lang = $derived(settings.language)
	const home = $derived(settings.homeCurrency)
	const hide = $derived(settings.hideAmounts)
	const show = (amount: Money) => amountText(formatMoney(amount, lang), hide)
	const signed = (amount: Money) => amountText(formatMoney(amount, lang, { sign: 'exceptZero' }), hide)
	const size = (amount: Money) => show(money(Math.abs(amount.minor), amount.currency))
	const today = $derived.by(() => {
		void finance.clock
		return todayIso()
	})
	function dayTitle(day: string): string {
		if (day === today) return $t('domains.finance.activity.today')
		if (day === addDays(today, -1)) return $t('domains.finance.activity.yesterday')
		return dayLine(day, lang)
	}

	// ---- The read ----------------------------------------------------------------------------------------------------

	let readFailed = $state(false)
	function read() {
		readFailed = false
		finance.query({ rows: { limit: 1 } }).catch(() => (readFailed = true))
	}
	onMount(read)

	let body = $state<HTMLElement>()
	const phone = $derived(!!body && body.closest('[data-platform]')?.getAttribute('data-platform') === 'mobile')

	// ---- Names, read live ----------------------------------------------------------------------------------------------

	const categoryName = (id: string) =>
		id === 'none'
			? $t('domains.finance.activity.states.uncategorised')
			: finance.categories.find((category) => category.id === id)?.name
	const merchantName = (id: string) => finance.merchants.find((merchant) => merchant.id === id)?.name
	const accountLabel = (account: Account) =>
		account.last4
			? $t('domains.finance.activity.accountName', { values: { name: account.name, last4: account.last4 } })
			: account.name
	function bankOf(account: Account) {
		const institution = finance.linkById(account.linkId)?.institution
		const colour = institution?.colour
		const logo = institution?.logo
		return {
			institution: institution?.name ?? account.institution ?? account.name,
			last4: account.last4,
			colour: colour && INSTITUTION_COLOUR.test(colour) ? colour : undefined,
			logo: logo && INSTITUTION_LOGO.test(logo) ? logo : undefined,
		}
	}
	const chipWords = $derived({
		tr: $t,
		day: (iso: string) => dayLine(iso, lang),
		money: show,
		home,
		linkName: (id: string) => finance.linkById(id)?.institution.name,
		accountName: (id: string) => {
			const account = finance.accountById(id)
			return account ? accountLabel(account) : undefined
		},
		categoryName,
		merchantName,
	})

	// ---- The filter ------------------------------------------------------------------------------------------------------

	const chips = $derived(
		liveChips(activitySession.chips, {
			accountIds: finance.accounts.map((account) => account.id),
			linkIds: finance.links.map((link) => link.id),
			categoryIds: finance.categories.map((category) => category.id),
			merchantIds: finance.merchants.map((merchant) => merchant.id),
		})
	)
	const filter = $derived(filterOf(chips, activitySession.text, { home, locale: lang, today }))
	const filterKey = $derived(JSON.stringify(filter))

	// the page size goes back to 50 whenever the filter changes: the size is kept with the filter it was set for
	let shown = $state(50)
	let shownFor = $state('')
	const limit = $derived(shownFor === filterKey ? shown : 50)
	function showMore() {
		shown = Math.min(1000, limit + 50)
		shownFor = filterKey
	}

	const sameChip = (a: ActivityChip, b: ActivityChip) => JSON.stringify(a) === JSON.stringify(b)
	const isOn = (chip: ActivityChip) => activitySession.chips.some((entry) => sameChip(entry, chip))

	let filtersOpen = $state(false)
	let filtersAnchor = $state<HTMLElement>()
	const range = activitySession.chips.find((chip) => chip.group === 'when' && 'from' in chip)
	const amountOf = (side: 'over' | 'under') => {
		const chip = activitySession.chips.find((entry) => entry.group === 'amount' && entry.side === side)
		return chip?.group === 'amount' ? toDecimal(money(chip.minor, home)) : ''
	}
	let rangeFrom = $state(range && 'from' in range ? range.from : '')
	let rangeTo = $state(range && 'to' in range ? range.to : '')
	let over = $state(amountOf('over'))
	let under = $state(amountOf('under'))

	function pickPreset(chip: ActivityChip) {
		rangeFrom = ''
		rangeTo = ''
		activitySession.toggle(chip)
	}
	function setRange() {
		if (rangeFrom && rangeTo && rangeFrom <= rangeTo)
			activitySession.add({ group: 'when', from: rangeFrom, to: rangeTo })
	}
	function setAmount(side: 'over' | 'under', text: string) {
		const minor = amountChipMinor(text, home, lang)
		if (minor === undefined) activitySession.remove(`amount:${side}`)
		else activitySession.add({ group: 'amount', side, minor })
	}
	/** A chip off from the row: its fields in the popover go back to empty. */
	function removeChip(chip: ActivityChip) {
		const key = chipKey(chip)
		if (key === 'when') rangeFrom = rangeTo = ''
		if (key === 'amount:over') over = ''
		if (key === 'amount:under') under = ''
		activitySession.remove(key)
	}
	function clearChips() {
		rangeFrom = rangeTo = over = under = ''
		activitySession.clear()
	}
	function resetAll() {
		clearChips()
		activitySession.reset()
	}

	// ---- The popover's options ------------------------------------------------------------------------------------------

	const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
	const whereOptions = $derived([
		...finance.links.map((link) => ({
			chip: { group: 'where', linkId: link.id } as ActivityChip,
			label: link.institution.name,
		})),
		...[...finance.accounts]
			.sort((a, b) => Number(Boolean(a.closedOn)) - Number(Boolean(b.closedOn)))
			.map((account) => ({
				chip: { group: 'where', accountId: account.id } as ActivityChip,
				label: accountLabel(account),
			})),
	])
	const whatOptions = $derived.by(() => {
		const kinds = new Set(finance.ledger.entries.map((entry) => entry.kind))
		return [
			...[...finance.categories]
				.sort(byName)
				.map((category) => ({
					chip: { group: 'what', categoryId: category.id } as ActivityChip,
					label: category.name,
				})),
			...topMerchantOptions(finance.ledger, 12).map((merchant) => ({
				chip: { group: 'what', merchantId: merchant.merchantId } as ActivityChip,
				label: merchantName(merchant.merchantId) ?? merchant.name,
			})),
			...TX_KINDS.filter((kind) => kinds.has(kind)).map((kind) => ({
				chip: { group: 'what', kind } as ActivityChip,
				label: $t(`domains.finance.txKinds.${kind}`),
			})),
		]
	})
	const whenOptions = $derived(
		PERIOD_PRESETS.map((preset) => ({
			chip: { group: 'when', preset } as ActivityChip,
			label: $t(`domains.finance.activity.presets.${preset}`),
		}))
	)
	const stateOptions = $derived(
		STATE_CHIPS.map((state) => ({
			chip: { group: 'state', state } as ActivityChip,
			label: $t(`domains.finance.activity.states.${state}`),
		}))
	)
	const sections = $derived([
		{ id: 'when', options: whenOptions },
		{ id: 'where', options: whereOptions },
		{ id: 'what', options: whatOptions },
		{ id: 'amount', options: [] },
		{ id: 'state', options: stateOptions },
	])

	// ---- The answers ----------------------------------------------------------------------------------------------------

	/** Nothing until the rows are read; `null` when the filter matches nothing or cannot be answered. */
	const answer = $derived.by((): LedgerAnswer | null | undefined => {
		if (!finance.ledgerReady) return undefined
		try {
			const found = queryLedger(finance.ledger, { filter, rows: { limit } })
			return found.count ? found : null
		} catch (error) {
			if (error instanceof LedgerQueryError) return null
			throw error
		}
	})
	const days = $derived.by(() => {
		const out: { day: string; rows: LedgerRow[] }[] = []
		for (const row of answer?.rows ?? []) {
			const last = out.at(-1)
			if (last?.day === row.day) last.rows.push(row)
			else out.push({ day: row.day, rows: [row] })
		}
		return out
	})
	const leftOut = $derived(
		answer?.left.length
			? $t('domains.finance.activity.leftOut', {
					values: {
						currencies: new Intl.ListFormat(lang, { type: 'conjunction' }).format(
							answer.left.map((entry) => entry.currency)
						),
					},
				})
			: undefined
	)

	const insights = $derived.by(() => {
		if (!answer) return undefined
		const ledger = finance.ledger
		const otherLabel = $t('domains.finance.activity.insights.else')
		const spending = spendingSeries(ledger, filter, { weekStart: settings.weekStart, otherLabel, categoryName })
		const labels = spending.labels.map((key) =>
			spending.bucket === 'week' ? formatDateOf(key, lang) : monthLine(key, lang, 'short')
		)
		const seriesNames = new Intl.ListFormat(lang, { type: 'conjunction' }).format(
			spending.series.map((one) => one.label)
		)
		const merchants = topMerchants(ledger, filter).map((entry) => [
			merchantName(entry.merchantId) ?? entry.merchantId,
			String(entry.count),
			entry.average ? show(entry.average) : '—',
			show(entry.total),
		])
		const against = againstTypical(ledger, filter, today)
		const typical = (against?.rows ?? []).map((entry): (string | DataTableCell)[] => [
			categoryName(entry.categoryId) ?? entry.categoryId,
			show(entry.now),
			entry.typical ? show(entry.typical) : '—',
			{
				text: signed(entry.change),
				tone: entry.change.minor > 0 ? 'danger' : entry.change.minor < 0 ? 'positive' : 'neutral',
			},
		])
		const months = inOutByMonth(ledger, filter).map((entry) => [
			monthLine(entry.month, lang),
			show(entry.in),
			show(entry.out),
			signed(entry.net),
		])
		return {
			spending: spending.series.length
				? {
						series: spending.series,
						labels,
						label: $t(
							spending.bucket === 'week'
								? 'domains.finance.activity.insights.spendingWeeks'
								: 'domains.finance.activity.insights.spendingMonths',
							{ values: { series: seriesNames } }
						),
					}
				: undefined,
			merchants,
			typical: against && typical.length ? { month: monthLine(against.month, lang), rows: typical } : undefined,
			months,
		}
	})
	const chartFormat = $derived((value: number) => amountText(wholeMoney(value, home, lang), hide))

	// ---- A row's menu ---------------------------------------------------------------------------------------------------

	let menuFor = $state<{ row: LedgerRow; anchor: HTMLElement }>()
	let menuOpen = $state(false)
	const menuItems = $derived.by((): MenuItem[] => {
		const row = menuFor?.row
		if (!row) return []
		const items: MenuItem[] = []
		if (!row.parts?.length)
			items.push({ id: 'category', label: $t('domains.finance.activity.menu.changeCategory'), icon: 'pencil' })
		items.push(
			row.oneOff
				? { id: 'not-one-off', label: $t('domains.finance.activity.menu.notOneOff'), icon: 'undo-2' }
				: { id: 'one-off', label: $t('domains.finance.activity.menu.markOneOff'), icon: 'sparkles' }
		)
		if (row.reimbursable)
			items.push({ id: 'not-reimbursable', label: $t('domains.finance.activity.menu.notReimbursable'), icon: 'x' })
		else if (row.amount.minor < 0)
			items.push({
				id: 'reimbursable',
				label: $t('domains.finance.activity.menu.markReimbursable'),
				icon: 'hand-coins',
			})
		return items
	})
	async function act(item: MenuItem) {
		const row = menuFor?.row
		if (!row) return
		if (item.id === 'category') oncategorise(row)
		else if (item.id === 'reimbursable') onreimbursable(row)
		else if (item.id === 'one-off' || item.id === 'not-one-off') {
			const on = item.id === 'one-off'
			const undo = await finance.setOneOff(row.id, on)
			if (undo) undoToast($t(`domains.finance.activity.toasts.${on ? 'oneOff' : 'notOneOff'}`), undo)
		} else if (item.id === 'not-reimbursable') {
			const answer = await finance.setReimbursable(row.id, undefined)
			if (typeof answer === 'function') undoToast($t('domains.finance.activity.toasts.notReimbursable'), answer)
		}
	}

	// ---- The `/` key ----------------------------------------------------------------------------------------------------

	const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
	function onkeydown(event: KeyboardEvent) {
		if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
		const target = event.target
		if (target instanceof Element && target.closest(EDITABLE)) return
		const field = document.getElementById(searchId)
		if (!field) return
		event.preventDefault()
		field.focus()
	}
</script>

<svelte:window {onkeydown} />

{#snippet pill(account: Account | undefined)}
	{#if account}
		{@const bank = bankOf(account)}
		<BankPill
			institution={bank.institution}
			last4={bank.last4}
			colour={bank.colour}
			logo={bank.logo}
			touch={phone}
			onclick={() => activitySession.add({ group: 'where', accountId: account.id })}
		/>
	{/if}
{/snippet}

{#if finance.empty}
	<EmptyState
		title={$t('domains.finance.activity.empty.title')}
		text={$t('domains.finance.activity.empty.text')}
		action={provider.bound && onlink
			? { label: $t('domains.finance.actions.linkBank'), icon: 'landmark', onclick: onlink }
			: { label: $t('domains.finance.actions.addAccount'), icon: 'plus', onclick: onaddaccount }}
		sample={{ label: $t('domains.finance.empty.sample'), onclick: onsample }}
	/>
{:else if readFailed}
	<div class="body">
		<InlineError message={$t('domains.finance.activity.readFailed')} onretry={read} live />
	</div>
{:else if finance.ledgerReady && !finance.ledger.entries.length}
	<EmptyState
		title={$t('domains.finance.activity.empty.noneTitle')}
		text={$t('domains.finance.activity.empty.noneText')}
		action={{ label: $t('domains.finance.actions.import'), icon: 'file-up', onclick: onimport }}
	/>
{:else}
	<div class="body" bind:this={body}>
		<div class="search">
			<Field
				id={searchId}
				class="search-field"
				label={$t('domains.finance.activity.search')}
				placeholder={$t('domains.finance.activity.searchPlaceholder')}
				icon="search"
				bind:value={activitySession.text}
			/>
			<span class="anchor" bind:this={filtersAnchor}>
				<IconButton
					icon="funnel"
					label={$t('domains.finance.activity.filters')}
					count={chips.length}
					active={filtersOpen}
					aria-haspopup="dialog"
					aria-expanded={filtersOpen}
					onclick={() => (filtersOpen = !filtersOpen)}
				/>
			</span>
			<Popover
				bind:open={filtersOpen}
				anchor={filtersAnchor}
				align="end"
				label={$t('domains.finance.activity.filters')}
			>
				<div class="filters">
					{#each sections as section (section.id)}
						<section class="filter-group" aria-labelledby="{uid}-f-{section.id}">
							<h2 class="filter-title" id="{uid}-f-{section.id}">
								{$t(`domains.finance.activity.sections.${section.id}`)}
							</h2>
							{#if section.id === 'amount'}
								<div class="pair">
									<Field
										label={$t('domains.finance.activity.over')}
										unit={home}
										mono
										inputmode="decimal"
										bind:value={over}
										oninput={() => setAmount('over', over)}
									/>
									<Field
										label={$t('domains.finance.activity.under')}
										unit={home}
										mono
										inputmode="decimal"
										bind:value={under}
										oninput={() => setAmount('under', under)}
									/>
								</div>
							{:else}
								<div class="filter-chips">
									{#each section.options as option (chipKey(option.chip) + JSON.stringify(option.chip))}
										<Chip
											label={option.label}
											selectable
											selected={isOn(option.chip)}
											onselect={() =>
												section.id === 'when' ? pickPreset(option.chip) : activitySession.toggle(option.chip)}
										/>
									{/each}
								</div>
								{#if section.id === 'when'}
									<div class="pair">
										<Field
											label={$t('domains.finance.activity.from')}
											type="date"
											bind:value={rangeFrom}
											oninput={setRange}
										/>
										<Field
											label={$t('domains.finance.activity.to')}
											type="date"
											bind:value={rangeTo}
											oninput={setRange}
										/>
									</div>
								{/if}
							{/if}
						</section>
					{/each}
				</div>
			</Popover>
		</div>

		{#if chips.length}
			<div class="active" role="group" aria-label={$t('domains.finance.activity.chips.label')}>
				{#each chips as chip (chipKey(chip))}
					{@const label = chipLabel(chip, chipWords)}
					<Chip
						{label}
						tone="accent"
						icon="x"
						aria-label={$t('domains.finance.activity.chips.remove', { values: { label } })}
						onclick={() => removeChip(chip)}
					/>
				{/each}
				<Button label={$t('domains.finance.activity.chips.clear')} variant="quiet" onclick={clearChips} />
			</div>
		{/if}

		{#if answer === undefined}
			<Skeleton rows={3} icon />
		{:else if answer === null}
			<EmptyState
				inline
				title={$t('domains.finance.activity.noMatch.title')}
				text={$t('domains.finance.activity.noMatch.text')}
				action={{ label: $t('domains.finance.activity.noMatch.action'), onclick: resetAll }}
			/>
		{:else}
			<div class="layout">
				<section class="feed" aria-labelledby="{uid}-feed">
					<h2 class="ed-sr-only" id="{uid}-feed">{$t('domains.finance.activity.feed')}</h2>
					<p class="totals">
						<span>{$t('domains.finance.activity.totals', { values: { count: answer.count } })}</span> ·
						<span class="cost">{$t('domains.finance.activity.out', { values: { amount: size(answer.out) } })}</span>
						·
						<span class="earned">{$t('domains.finance.activity.in', { values: { amount: show(answer.in) } })}</span>
					</p>
					{#if leftOut}<p class="note">{leftOut}</p>{/if}
					{#each days as group (group.day)}
						<section class="day" aria-labelledby="{uid}-d-{group.day}">
							<h3 class="day-title" id="{uid}-d-{group.day}">{dayTitle(group.day)}</h3>
							<ul class="rows">
								{#each group.rows as row (row.id)}
									{@const tone = kindTone(row.kind)}
									{@const title = rowTitle(row, $t)}
									<li class="row">
										<span class={['tile', tone]} aria-hidden="true">
											<Icon name={KIND_GLYPHS[row.kind]} size="sm" />
										</span>
										<span class="title">{title}</span>
										<span class="second">{rowWords(row, { tr: $t, money: show, categoryName })}</span>
										<span class="pills">
											{@render pill(finance.accountById(row.accountId))}
											{#if row.toAccountId}
												<span class="arrow" aria-hidden="true">→</span>
												<span class="ed-sr-only">{$t('domains.finance.activity.pillTo')}</span>
												{@render pill(finance.accountById(row.toAccountId))}
											{/if}
										</span>
										<span class={['amount', tone]}>{signed(row.amount)}</span>
										<span class="menu">
											{#if row.pairId === undefined}
												<IconButton
													icon="ellipsis"
													size="sm"
													label={$t('domains.finance.activity.menu.label', {
														values: { title, day: dayTitle(row.day) },
													})}
													aria-haspopup="menu"
													aria-expanded={menuOpen && menuFor?.row.id === row.id}
													onclick={(event) => {
														menuFor = { row, anchor: event.currentTarget }
														menuOpen = true
													}}
												/>
											{/if}
										</span>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
					{#if answer.rows.length < answer.count && limit < 1000}
						<div class="more">
							<Button label={$t('domains.finance.activity.showMore')} variant="quiet" onclick={showMore} />
						</div>
					{:else if answer.count > answer.rows.length}
						<p class="note">{$t('domains.finance.activity.cap')}</p>
					{/if}
				</section>

				{#if insights && (insights.spending || insights.merchants.length || insights.typical || insights.months.length)}
					<aside class="insights" aria-label={$t('domains.finance.activity.insights.label')}>
						{#if insights.spending}
							<section class="card" aria-labelledby="{uid}-spending">
								<h2 class="card-title" id="{uid}-spending">{$t('domains.finance.activity.insights.spending')}</h2>
								<BarChart
									series={insights.spending.series}
									labels={insights.spending.labels}
									format={chartFormat}
									height={140}
									label={insights.spending.label}
								/>
							</section>
						{/if}
						{#if insights.merchants.length}
							<section class="card" aria-labelledby="{uid}-merchants">
								<h2 class="card-title" id="{uid}-merchants">{$t('domains.finance.activity.insights.merchants')}</h2>
								<DataTable
									label={$t('domains.finance.activity.insights.merchants')}
									columns={[
										{ label: $t('domains.finance.activity.columns.merchant') },
										{ label: $t('domains.finance.activity.columns.count'), numeric: true },
										{ label: $t('domains.finance.activity.columns.average'), numeric: true },
										{ label: $t('domains.finance.activity.columns.total'), numeric: true },
									]}
									rows={insights.merchants}
								/>
							</section>
						{/if}
						{#if insights.typical}
							<section class="card" aria-labelledby="{uid}-typical">
								<h2 class="card-title" id="{uid}-typical">{$t('domains.finance.activity.insights.typical')}</h2>
								<DataTable
									label={$t('domains.finance.activity.insights.typical')}
									columns={[
										{ label: $t('domains.finance.activity.columns.category') },
										{ label: insights.typical.month, numeric: true },
										{
											label: $t('domains.finance.activity.columns.typical'),
											numeric: true,
											hint: $t('domains.finance.activity.typicalHint'),
										},
										{ label: $t('domains.finance.activity.columns.change'), numeric: true },
									]}
									rows={insights.typical.rows}
								/>
							</section>
						{/if}
						{#if insights.months.length}
							<section class="card" aria-labelledby="{uid}-months">
								<h2 class="card-title" id="{uid}-months">{$t('domains.finance.activity.insights.inOut')}</h2>
								<DataTable
									label={$t('domains.finance.activity.insights.inOut')}
									columns={[
										{ label: $t('domains.finance.activity.columns.month') },
										{ label: $t('domains.finance.activity.columns.in'), numeric: true },
										{ label: $t('domains.finance.activity.columns.out'), numeric: true },
										{ label: $t('domains.finance.activity.columns.net'), numeric: true },
									]}
									rows={insights.months}
								/>
							</section>
						{/if}
					</aside>
				{/if}
			</div>
		{/if}
		<Menu
			bind:open={menuOpen}
			anchor={menuFor?.anchor}
			align="end"
			label={menuFor
				? $t('domains.finance.activity.menu.label', {
						values: { title: rowTitle(menuFor.row, $t), day: dayTitle(menuFor.row.day) },
					})
				: $t('domains.finance.activity.feed')}
			items={menuItems}
			onselect={act}
		/>
	</div>
{/if}

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
	.pair {
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
	:global([data-platform='mobile']) .feed,
	:global([data-platform='mobile']) .insights {
		flex-basis: 100%;
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
	:global([data-platform='mobile']) .row {
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
		min-width: var(--space-8);
	}
	.more {
		display: flex;
		justify-content: center;
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
