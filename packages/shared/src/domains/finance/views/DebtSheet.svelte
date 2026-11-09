<script module lang="ts">
	export type DebtSheetMode = 'card' | 'promo' | 'loan' | 'new-loan'
</script>

<script lang="ts">
	// A debt's terms (#86, D-201), laid out as the account form. `card`: the APR and the credit limit. `promo`: an intro
	// rate and the day it ends, today or later (clearing it is the row menu's). `loan`: the APR, the monthly payment and
	// its due day. `new-loan`: a loan Plaid can't see, its name, lender, currency and balance, then those terms; its
	// payment becomes a monthly repeating bill. On a linked account an empty field means "use what the bank says", and
	// each field's helper shows the bank's value or says it has none; a hand-entered one has no such helper. Errors show
	// under their field and the first takes focus on Save; Save answers an undo toast.
	import { Button, Field, Select, Sheet } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { todayIso } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { currencyOptions, formatMoney, parseMoney, toDecimal, type Money } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { parseRate, providerRateOf, rateInput, rateText } from '../debt.js'
	import { finance } from '../store.svelte.js'
	import type { Account } from '../types.js'
	import { moneyError } from '../words.js'

	type Props = {
		open: boolean
		mode: DebtSheetMode
		/** The card or loan; none for a new loan. */
		account?: Account
	}
	let { open = $bindable(), mode, account }: Props = $props()

	type Key = 'name' | 'balance' | 'rate' | 'limit' | 'payment' | 'dueDay' | 'promoRate' | 'ends'

	const uid = $props.id()
	const lang = $derived(settings.language)
	const today = todayIso()
	// svelte-ignore state_referenced_locally
	const held = finance.liabilityOf(account?.id)
	// svelte-ignore state_referenced_locally
	let form = $state({
		name: '',
		lender: '',
		currency: settings.homeCurrency,
		balance: '',
		rate: held?.rate !== undefined ? rateInput(held.rate, lang) : '',
		limit: held?.ownerLimit ? toDecimal(held.ownerLimit) : '',
		payment: held?.payment ? toDecimal(held.payment) : '',
		dueDay: held?.dueDay ? String(held.dueDay) : '',
		promoRate: held?.promo ? rateInput(held.promo.rate, lang) : '0',
		ends: held?.promo?.ends ?? '',
	})
	let errors = $state<Partial<Record<Key, string>>>({})

	const currency = $derived(account?.currency ?? form.currency)
	const currencies = $derived(currencyOptions(lang, settings.homeCurrency))
	const loan = $derived(mode === 'loan' || mode === 'new-loan')
	const title = $derived(
		$t(
			mode === 'promo'
				? 'domains.finance.debt.sheet.introTitle'
				: mode === 'new-loan'
					? 'domains.finance.debt.sheet.newLoanTitle'
					: 'domains.finance.debt.sheet.termsTitle'
		)
	)

	/** On a linked account, what the bank says: its value, or that it has none. */
	const bank = $derived(account?.linkId ? (account.institution ?? '') : undefined)
	function fromBank(value: string | undefined): string | undefined {
		if (bank === undefined) return undefined
		return value === undefined
			? $t('domains.finance.debt.sheet.bankNone', { values: { bank } })
			: $t('domains.finance.debt.sheet.fromBank', { values: { bank, value } })
	}
	const providerRate = $derived(account ? providerRateOf(account, held) : undefined)
	const money = (amount: Money | undefined) => (amount ? formatMoney(amount, lang) : undefined)
	const rateHelp = $derived(fromBank(providerRate !== undefined ? rateText(providerRate, lang) : undefined))
	const limitHelp = $derived(fromBank(money(held?.limit)))
	const paymentHelp = $derived(fromBank(money(held?.loan?.minimum)))
	const dueHelp = $derived(
		bank !== undefined && held?.loan?.due
			? fromBank(String(Number(held.loan.due.slice(8))))
			: $t('domains.finance.debt.sheet.dueDayHelp')
	)

	function rateOf(text: string, key: Key, next: Partial<Record<Key, string>>, required: boolean) {
		if (!text.trim()) {
			if (required) next[key] = $t('domains.finance.debt.errors.rate')
			return undefined
		}
		const points = parseRate(text, lang)
		if (points === undefined) next[key] = $t('domains.finance.debt.errors.rate')
		return points
	}
	function amountOf(
		text: string,
		key: Key,
		next: Partial<Record<Key, string>>,
		required: string | undefined
	): Money | undefined {
		if (!text.trim()) {
			if (required) next[key] = required
			return undefined
		}
		const parsed = parseMoney(text, currency, lang)
		if ('error' in parsed) {
			next[key] = moneyError(parsed.error, currency, $t, lang)
			return undefined
		}
		if (parsed.minor <= 0) {
			next[key] = $t('domains.finance.errors.amount')
			return undefined
		}
		return parsed
	}
	function dueDayOf(text: string, next: Partial<Record<Key, string>>, required: boolean) {
		const value = text.trim()
		if (!value) {
			if (required) next.dueDay = $t('domains.finance.debt.errors.dueDay')
			return undefined
		}
		const day = /^\d{1,2}$/.test(value) ? Number(value) : 0
		if (day < 1 || day > 31) next.dueDay = $t('domains.finance.debt.errors.dueDay')
		return day >= 1 && day <= 31 ? day : undefined
	}

	async function save(event: SubmitEvent) {
		event.preventDefault()
		const next: Partial<Record<Key, string>> = {}
		const fresh = mode === 'new-loan'
		if (fresh && !form.name.trim()) next.name = $t('domains.finance.errors.name')
		const balance = fresh
			? amountOf(form.balance, 'balance', next, $t('domains.finance.debt.errors.balance'))
			: undefined
		const rate = mode === 'promo' ? undefined : rateOf(form.rate, 'rate', next, fresh)
		const limit = mode === 'card' ? amountOf(form.limit, 'limit', next, undefined) : undefined
		const payment =
			loan || mode === 'card'
				? amountOf(form.payment, 'payment', next, fresh ? $t('domains.finance.debt.errors.payment') : undefined)
				: undefined
		const dueDay = loan ? dueDayOf(form.dueDay, next, fresh) : undefined
		const promoRate = mode === 'promo' ? rateOf(form.promoRate, 'promoRate', next, true) : undefined
		if (mode === 'promo' && (!/^\d{4}-\d{2}-\d{2}$/.test(form.ends) || form.ends < today))
			next.ends = $t('domains.finance.debt.errors.ends')
		errors = next
		// in the order the fields are laid out
		const order: Key[] = ['name', 'balance', 'rate', 'limit', 'payment', 'dueDay', 'promoRate', 'ends']
		const first = order.find((key) => next[key])
		if (first) {
			await tick()
			document.getElementById(`${uid}-${first}`)?.focus()
			return
		}
		if (fresh) {
			const added = await finance.saveLoan({
				name: form.name,
				lender: form.lender.trim() || undefined,
				currency,
				balance: balance!,
				rate: rate!,
				payment: payment!,
				dueDay: dueDay!,
			})
			if (!added) return
			undoToast($t('domains.finance.debt.toasts.loanAdded', { values: { name: added.account.name } }), added.undo)
			open = false
			return
		}
		if (!account) return
		const name = account.name
		if (mode === 'promo') {
			const undo = finance.setPromo(account.id, { rate: promoRate!, ends: form.ends })
			if (undo) undoToast($t('domains.finance.debt.toasts.introSaved', { values: { name } }), undo)
			open = false
			return
		}
		const undo = await finance.saveTerms(
			account.id,
			mode === 'card' ? { rate, ownerLimit: limit, payment } : { rate, payment, dueDay }
		)
		if (undo) undoToast($t('domains.finance.debt.toasts.termsSaved', { values: { name } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{title}</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save} novalidate>
		{#if mode === 'new-loan'}
			<Field id="{uid}-name" label={$t('domains.finance.debt.sheet.name')} bind:value={form.name} error={errors.name} />
			<Field label={$t('domains.finance.debt.sheet.lender')} bind:value={form.lender} />
			<div class="pair">
				<Select label={$t('domains.finance.debt.sheet.currency')} options={currencies} bind:value={form.currency} />
				<Field
					id="{uid}-balance"
					label={$t('domains.finance.debt.sheet.balance')}
					unit={currency}
					bind:value={form.balance}
					error={errors.balance}
					helper={$t('domains.finance.accountForm.debtHelp')}
					mono
					inputmode="decimal"
				/>
			</div>
		{/if}
		{#if mode === 'promo'}
			<div class="pair">
				<Field
					id="{uid}-promoRate"
					label={$t('domains.finance.debt.sheet.introRate')}
					unit="%"
					bind:value={form.promoRate}
					error={errors.promoRate}
					mono
					inputmode="decimal"
				/>
				<Field
					id="{uid}-ends"
					label={$t('domains.finance.debt.sheet.ends')}
					type="date"
					min={today}
					bind:value={form.ends}
					error={errors.ends}
				/>
			</div>
		{:else}
			<div class="pair">
				<Field
					id="{uid}-rate"
					label={$t('domains.finance.debt.sheet.apr')}
					unit="%"
					bind:value={form.rate}
					error={errors.rate}
					helper={rateHelp}
					mono
					inputmode="decimal"
				/>
				{#if mode === 'card'}
					<Field
						id="{uid}-limit"
						label={$t('domains.finance.debt.sheet.limit')}
						unit={currency}
						bind:value={form.limit}
						error={errors.limit}
						helper={limitHelp}
						mono
						inputmode="decimal"
					/>
				{:else}
					<Field
						id="{uid}-payment"
						label={$t('domains.finance.debt.sheet.payment')}
						unit={currency}
						bind:value={form.payment}
						error={errors.payment}
						helper={paymentHelp}
						mono
						inputmode="decimal"
					/>
				{/if}
			</div>
			{#if mode === 'card'}
				<!-- what the plan pays until a statement states a minimum (D-201) -->
				<Field
					id="{uid}-payment"
					label={$t('domains.finance.debt.sheet.minimum')}
					unit={currency}
					bind:value={form.payment}
					error={errors.payment}
					helper={$t('domains.finance.debt.sheet.minimumHelp')}
					mono
					inputmode="decimal"
				/>
			{/if}
			{#if loan}
				<Field
					id="{uid}-dueDay"
					label={$t('domains.finance.debt.sheet.dueDay')}
					bind:value={form.dueDay}
					error={errors.dueDay}
					helper={dueHelp}
					mono
					inputmode="numeric"
					maxlength={2}
				/>
			{/if}
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
