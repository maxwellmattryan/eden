<script lang="ts">
	// A goal's sheet (product/domains/finance.md §6, "Goals (#88)", D-203), built as the budget line's is. Add offers
	// saving for something or an emergency fund (while none is open); Edit keeps the kind. The account is an open one
	// that is not a debt, and the target is in its currency. An emergency fund is sized in months of essentials, which
	// fill the target; with no essentials history the target is typed. The date is a month or none, and the sheet says
	// live what a month it asks. Errors show on their field and the first one takes focus on Save; Save writes the goal
	// and shows an undo toast. Cancel, or dismissing the sheet, writes nothing.
	import { Button, Field, Segmented, Select, Sheet } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { dateIn } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { formatMoney, parseMoney, toDecimal, type Money } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import {
		canEarmark,
		EMERGENCY_MONTHS,
		emergencyTarget,
		goalErrors,
		goalPreview,
		type GoalDraft,
		type GoalError,
	} from '../goals.js'
	import { addMonths } from '../ledger.js'
	import { finance } from '../store.svelte.js'
	import type { SavingsGoal } from '../types.js'
	import { monthYearLine, moneyError } from '../words.js'

	type Props = {
		open: boolean
		/** The goal to change; none to add one. */
		goal?: SavingsGoal
	}
	let { open = $bindable(), goal }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const thisMonth = $derived(dateIn(undefined, finance.clock).slice(0, 7))
	const NO_DATE = 'none'
	const KINDS = ['target', 'emergency'] as const

	// svelte-ignore state_referenced_locally
	const offerKinds = !goal && !finance.goalsView?.emergencyOpen
	// svelte-ignore state_referenced_locally
	let kind = $state<GoalDraft['kind']>(goal?.kind === 'emergency' ? 'emergency' : 'target')
	// svelte-ignore state_referenced_locally
	let form = $state({
		name: goal?.name ?? '',
		accountId: goal?.accountId && canEarmark(finance.accountById(goal.accountId)) ? goal.accountId : '',
		target: goal?.target ? toDecimal(goal.target) : '',
		months: String(goal?.months ?? EMERGENCY_MONTHS.initial),
		by: goal?.by ?? NO_DATE,
	})
	type Key = 'name' | 'account' | 'target' | 'months'
	let errors = $state<Partial<Record<Key, string>>>({})

	const account = $derived(finance.accountById(form.accountId))
	const currency = $derived(account?.currency ?? settings.homeCurrency)
	const essentials = $derived(finance.goalsView?.essentials)
	const sized = $derived(essentials ? emergencyTarget(essentials, Number(form.months)) : undefined)

	const kindItems = $derived([$t('domains.finance.goals.sheet.target'), $t('domains.finance.goals.sheet.emergency')])
	const accounts = $derived(
		finance.accounts
			.filter(canEarmark)
			.map((entry) => ({ value: entry.id, label: entry.last4 ? `${entry.name} · ••${entry.last4}` : entry.name }))
	)
	const monthChoices = $derived(
		Array.from({ length: EMERGENCY_MONTHS.max - EMERGENCY_MONTHS.min + 1 }, (_, at) => {
			const months = EMERGENCY_MONTHS.min + at
			return { value: String(months), label: $t('domains.finance.goals.sheet.monthsOption', { values: { months } }) }
		})
	)
	const byChoices = $derived.by(() => {
		const months = Array.from({ length: 60 }, (_, at) => {
			const value = addMonths(thisMonth, at)
			return { value, label: monthYearLine(`${value}-01`, lang, true) }
		})
		// a past date is kept as a choice while editing it
		const past =
			goal?.by && goal.by < thisMonth ? [{ value: goal.by, label: monthYearLine(`${goal.by}-01`, lang, true) }] : []
		return [{ value: NO_DATE, label: $t('domains.finance.goals.sheet.noDate') }, ...past, ...months]
	})

	/** The target a field holds, or the words for why it holds none. */
	function amountOf(text: string): Money | string | undefined {
		if (!text.trim()) return undefined
		const parsed = parseMoney(text, currency, lang)
		return 'error' in parsed ? moneyError(parsed.error, currency, $t, lang) : parsed
	}

	/** An emergency fund's target follows its months while the essentials are in the account's currency. */
	function fillTarget() {
		if (kind === 'emergency' && sized && sized.currency === currency) form.target = toDecimal(sized)
	}
	function setKind(index: number) {
		kind = KINDS[index] ?? 'target'
		const fund = $t('domains.finance.goals.sheet.emergencyName')
		if (kind === 'emergency') {
			if (!form.name.trim()) form.name = fund
			if (!form.target.trim()) fillTarget()
		} else if (form.name === fund) form.name = ''
	}

	const by = $derived(form.by === NO_DATE ? undefined : form.by)
	const live = $derived.by(() => {
		const target = amountOf(form.target)
		if (!by || typeof target !== 'object') return undefined
		const monthly = goalPreview(
			finance.goals,
			finance.accounts,
			{ id: goal?.id, accountId: form.accountId, target, by },
			thisMonth
		)
		return monthly
			? $t('domains.finance.goals.sheet.live', {
					values: { amount: formatMoney(monthly, lang), month: monthYearLine(`${by}-01`, lang, true) },
				})
			: undefined
	})

	const codeKey: Record<GoalError, Key> = {
		'goal:name': 'name',
		'goal:account': 'account',
		'goal:target': 'target',
		'goal:months': 'months',
		'goal:rate': 'target',
		'goal:emergency': 'name',
	}
	const errorText = (code: GoalError) => $t(`domains.finance.goals.errors.${code}`)
	const ORDER: readonly Key[] = ['name', 'account', 'target', 'months']

	async function focus(key: Key) {
		await tick()
		document.getElementById(`${uid}-${key}`)?.focus()
	}

	async function save(event: SubmitEvent) {
		event.preventDefault()
		const target = amountOf(form.target)
		const draft: GoalDraft = {
			...(goal ? { id: goal.id } : {}),
			kind,
			name: form.name,
			accountId: form.accountId || undefined,
			target: typeof target === 'object' ? target : undefined,
			...(kind === 'emergency' ? { months: Number(form.months) } : {}),
			...(by ? { by } : {}),
		}
		const next: typeof errors = {}
		for (const code of goalErrors(draft, { accounts: finance.accounts, goals: finance.goals }))
			next[codeKey[code]] ??= errorText(code)
		// what could not be read says why, in place of "above zero"
		if (typeof target === 'string') next.target = target
		errors = next
		const first = ORDER.find((key) => next[key])
		if (first) return focus(first)
		const answer = await finance.saveGoal(draft)
		if (answer && typeof answer === 'object') {
			const key = codeKey[answer.error]
			errors = { [key]: errorText(answer.error) }
			return focus(key)
		}
		if (answer)
			undoToast(
				$t(goal ? 'domains.finance.goals.toasts.saved' : 'domains.finance.goals.toasts.added', {
					values: { name: draft.name!.trim() },
				}),
				answer
			)
		open = false
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{goal ? $t('domains.finance.goals.sheet.editTitle') : $t('domains.finance.goals.sheet.addTitle')}
		</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save} novalidate>
		{#if offerKinds}
			<Segmented
				items={kindItems}
				selected={KINDS.indexOf(kind)}
				label={$t('domains.finance.goals.sheet.kind')}
				onchange={setKind}
			/>
		{/if}
		<Field
			id="{uid}-name"
			label={$t('domains.finance.goals.sheet.name')}
			bind:value={form.name}
			error={errors.name}
			maxlength={60}
		/>
		<div class="pair">
			<Select
				id="{uid}-account"
				label={$t('domains.finance.goals.sheet.account')}
				options={accounts}
				placeholder={$t('domains.finance.goals.sheet.chooseAccount')}
				bind:value={form.accountId}
				error={errors.account}
				onchange={fillTarget}
			/>
			<Field
				id="{uid}-target"
				label={$t('domains.finance.goals.sheet.amount')}
				unit={currency}
				bind:value={form.target}
				error={errors.target}
				mono
				inputmode="decimal"
			/>
		</div>
		{#if kind === 'emergency'}
			<Select
				id="{uid}-months"
				label={$t('domains.finance.goals.sheet.months')}
				options={monthChoices}
				bind:value={form.months}
				error={errors.months}
				helper={sized
					? $t('domains.finance.goals.sheet.sized', {
							values: { months: Number(form.months), amount: formatMoney(sized, lang) },
						})
					: $t('domains.finance.goals.sheet.noEssentials')}
				onchange={fillTarget}
			/>
		{/if}
		<Select label={$t('domains.finance.goals.sheet.by')} options={byChoices} bind:value={form.by} />
		<p class="note" aria-live="polite">{live ?? ''}</p>
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
	.note {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
</style>
