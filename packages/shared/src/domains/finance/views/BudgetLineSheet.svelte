<script lang="ts">
	// A budget line's sheet (product/domains/finance.md §6, "Budget (#84)", D-201), built as the bill form is: Edit
	// changes a category's line for the month shown, Add makes one for a category with none, never income. The amount
	// is in the home currency and above zero; Save toward a bill makes it a sinking fund with a target and a due month,
	// and since a fund always rolls over, it turns Roll over on and holds it there, saying why. Errors show on their
	// field and the first one takes focus on Save; Save writes the owner's row for the month and shows an undo toast.
	// Cancel, or dismissing the sheet, writes nothing.
	import { Button, Field, Select, Sheet, Toggle } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { t } from '../../../i18n/index.js'
	import { parseMoney, toDecimal, type Money } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { lineErrors, linesOf, type BudgetLineError } from '../budget.js'
	import { addMonths } from '../ledger.js'
	import { finance } from '../store.svelte.js'
	import { monthYearLine, moneyError } from '../words.js'

	type Props = {
		open: boolean
		/** `YYYY-MM`: the month the line is saved for. */
		month: string
		/** The category whose line to change; none to add one. */
		categoryId?: string
	}
	let { open = $bindable(), month, categoryId }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const home = $derived(settings.homeCurrency)

	// svelte-ignore state_referenced_locally
	const line = categoryId ? finance.budget(month).lines.find((entry) => entry.categoryId === categoryId) : undefined
	// svelte-ignore state_referenced_locally
	const name = categoryId ? (finance.categories.find((category) => category.id === categoryId)?.name ?? '') : ''
	// svelte-ignore state_referenced_locally
	let form = $state({
		categoryId: categoryId ?? '',
		amount: line ? toDecimal(line.amount) : '',
		rollover: line?.rollover ?? false,
		sinking: line?.sinking !== undefined,
		target: line?.sinking ? toDecimal(line.sinking.target) : '',
		by: line?.sinking && line.sinking.by >= month ? line.sinking.by : month,
	})
	type Key = 'category' | 'amount' | 'target'
	let errors = $state<Partial<Record<Key, string>>>({})

	const title = $derived(
		categoryId
			? $t('domains.finance.budget.sheet.editTitle', { values: { category: name } })
			: $t('domains.finance.budget.sheet.addTitle')
	)
	/** The categories with no line in the month, never income. */
	const choices = $derived.by(() => {
		const lined = linesOf(finance.budgets, month).map((row) => row.categoryId)
		return finance.categories
			.filter((category) => category.group !== 'income' && !lined.includes(category.id))
			.map((category) => ({ value: category.id, label: category.name }))
	})
	const months = $derived(
		Array.from({ length: 24 }, (_, at) => {
			const value = addMonths(month, at)
			return { value, label: monthYearLine(`${value}-01`, lang, true) }
		})
	)

	function setSinking(on: boolean) {
		form.sinking = on
		if (on) form.rollover = true
	}

	const codeKey: Record<BudgetLineError, Key> = {
		'budget:category': 'category',
		'budget:amount': 'amount',
		'budget:target': 'target',
	}
	const errorText = (code: BudgetLineError) => $t(`domains.finance.budget.errors.${code}`)

	/** The amount a field holds, or the words for why it holds none. */
	function amountOf(text: string): Money | string | undefined {
		if (!text.trim()) return undefined
		const parsed = parseMoney(text, home, lang)
		return 'error' in parsed ? moneyError(parsed.error, home, $t, lang) : parsed
	}

	async function save(event: SubmitEvent) {
		event.preventDefault()
		const amount = amountOf(form.amount)
		const target = form.sinking ? amountOf(form.target) : undefined
		const change = {
			kind: 'save' as const,
			categoryId: form.categoryId || undefined,
			amount: typeof amount === 'object' ? amount : undefined,
			rollover: form.rollover || form.sinking,
			...(form.sinking ? { sinking: { target: typeof target === 'object' ? target : undefined, by: form.by } } : {}),
		}
		const next: typeof errors = {}
		for (const code of lineErrors(change)) next[codeKey[code]] = errorText(code)
		// what could not be read says why, in place of "above zero"
		if (typeof amount === 'string') next.amount = amount
		if (typeof target === 'string') next.target = target
		errors = next
		const first = (['category', 'amount', 'target'] as const).find((key) => next[key])
		if (first) {
			await tick()
			document.getElementById(`${uid}-${first}`)?.focus()
			return
		}
		const answer = await finance.saveBudgetLine(month, change)
		if (answer && typeof answer === 'object') {
			const key = codeKey[answer.error]
			errors = { [key]: errorText(answer.error) }
			await tick()
			document.getElementById(`${uid}-${key}`)?.focus()
			return
		}
		const category = finance.categories.find((entry) => entry.id === change.categoryId)?.name ?? ''
		if (answer)
			undoToast(
				$t(categoryId ? 'domains.finance.budget.toasts.updated' : 'domains.finance.budget.toasts.added', {
					values: { category },
				}),
				answer
			)
		open = false
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{title}</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save} novalidate>
		{#if !categoryId}
			<Select
				id="{uid}-category"
				label={$t('domains.finance.budget.sheet.category')}
				options={choices}
				placeholder={$t('domains.finance.budget.sheet.choose')}
				bind:value={form.categoryId}
				error={errors.category}
			/>
		{/if}
		<Field
			id="{uid}-amount"
			label={$t('domains.finance.budget.sheet.amount')}
			unit={home}
			bind:value={form.amount}
			error={errors.amount}
			mono
			inputmode="decimal"
		/>
		<Toggle
			label={$t('domains.finance.budget.sheet.rollover')}
			bind:checked={form.rollover}
			disabled={form.sinking}
			description={form.sinking ? $t('domains.finance.budget.sheet.sinkingHint') : undefined}
		/>
		<Toggle label={$t('domains.finance.budget.sheet.sinking')} bind:checked={() => form.sinking, setSinking} />
		{#if form.sinking}
			<div class="pair">
				<Field
					id="{uid}-target"
					label={$t('domains.finance.budget.sheet.target')}
					unit={home}
					bind:value={form.target}
					error={errors.target}
					mono
					inputmode="decimal"
				/>
				<Select label={$t('domains.finance.budget.sheet.due')} options={months} bind:value={form.by} />
			</div>
		{/if}
	</form>
	{#snippet footer()}
		<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button label={$t('domains.finance.save')} variant="primary" type="submit" form="{uid}-form" />
	{/snippet}
</Sheet>

<style>
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
	/* two short fields side by side where the sheet is wide enough, one above the other where it is not */
	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
		gap: var(--space-3);
	}
</style>
