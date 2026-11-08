<script lang="ts">
	// The bonus question (product/domains/finance.md §6, #80, D-198): an employer paid extra, so where should it go?
	// Leaving it where it came in is the default; a savings, investment or retirement account, or a debt to pay down,
	// adds a todo due today to move it, since Eden never moves the money (D-8). A bonus on its own can be left out of
	// the monthly average; one paid in the paycheck's deposit cannot. Save answers the question with one Undo for all
	// it did; "Not a bonus" only answers it.
	import { Button, Select, Sheet, Stat, Toggle } from '@eden/ui-kit'
	import { todayIso } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { formatMoney } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { tasks } from '../../../shell/today/index.js'
	import type { IncomeQuestion } from '../income.js'
	import { finance, type Undo } from '../store.svelte.js'
	import { isDebt, type Account, type IncomeSource } from '../types.js'
	import { dayLine, importAccountName } from '../words.js'

	type Props = {
		open: boolean
		source: IncomeSource
		question: Extract<IncomeQuestion, { kind: 'bonus' }>
	}
	let { open = $bindable(), source, question }: Props = $props()

	const LEAVE = 'leave'
	const SAVINGS: readonly Account['kind'][] = ['savings', 'investment', 'retirement']

	const uid = $props.id()
	const lang = $derived(settings.language)
	const into = $derived(finance.accountById(finance.ledger.entry(question.rowId)?.accountId ?? source.accountId))
	const intoName = $derived(into ? importAccountName(into, $t) : '')
	const destinations = $derived(
		finance.accounts.filter(
			(account) =>
				!account.closedOn &&
				account.id !== into?.id &&
				(SAVINGS.includes(account.kind) || (isDebt(account.kind) && (account.balance?.minor ?? 0) > 0))
		)
	)
	const options = $derived([
		{ value: LEAVE, label: $t('domains.finance.income.bonus.leave', { values: { account: intoName } }) },
		...destinations
			.filter((account) => !isDebt(account.kind))
			.map((account) => ({ value: account.id, label: importAccountName(account, $t) })),
		...destinations
			.filter((account) => isDebt(account.kind))
			.map((account) => ({
				value: account.id,
				label: $t('domains.finance.income.bonus.payDown', { values: { account: importAccountName(account, $t) } }),
			})),
	])
	let chosen = $state(LEAVE)
	let outOfAverage = $state(true)

	async function save(event: SubmitEvent) {
		event.preventDefault()
		open = false
		const undos: Undo[] = []
		const answered = finance.handleBonus(source.id, question.rowId)
		if (answered) undos.push(answered)
		const to = chosen === LEAVE ? undefined : finance.accountById(chosen)
		if (to) {
			const title = $t('domains.finance.income.bonus.task', {
				values: { employer: source.name, account: importAccountName(to, $t) },
			})
			undos.push(tasks.addInput({ kind: 'todo', title, due: todayIso() }).undo)
		}
		if (!question.combined && outOfAverage) {
			const oneOff = await finance.setOneOff(question.rowId, true)
			if (oneOff) undos.push(oneOff)
		}
		if (undos.length) undoToast($t('domains.finance.toasts.bonusSaved'), () => undos.forEach((undo) => undo()))
	}

	function notBonus() {
		open = false
		const undo = finance.handleBonus(source.id, question.rowId)
		if (undo) undoToast($t('domains.finance.toasts.notBonus'), undo)
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<div class="head">
			<h2 class="title" id="{uid}-title">{$t('domains.finance.income.bonus.title')}</h2>
			<Stat value={formatMoney(question.amount, lang)} size="md" />
			<p class="context">
				{$t('domains.finance.income.bonus.context', {
					values: { employer: source.name, account: intoName, day: dayLine(question.day, lang) },
				})}
			</p>
		</div>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save}>
		<Select label={$t('domains.finance.income.bonus.destination')} {options} bind:value={chosen} />
		{#if chosen !== LEAVE}
			<p class="context">{$t('domains.finance.income.bonus.reminder')}</p>
		{/if}
		{#if question.combined}
			<p class="context">{$t('domains.finance.income.bonus.combined')}</p>
		{:else}
			<Toggle label={$t('domains.finance.income.bonus.outOfAverage')} bind:checked={outOfAverage} />
		{/if}
	</form>
	{#snippet footer()}
		<!-- the quiet answer sits at the footer's start, away from Save -->
		<span class="start">
			<Button label={$t('domains.finance.income.bonus.notBonus')} variant="quiet" onclick={notBonus} />
		</span>
		<Button label={$t('domains.finance.income.bonus.save')} variant="primary" type="submit" form="{uid}-form" />
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
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.start {
		display: flex;
		margin-inline-end: auto;
	}
	.context {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
