<script lang="ts">
	// The bill form (product/domains/finance.md §6): a bill added by hand, changed, or drafted from a letter or by the
	// Gardener, laid out as the account form is, the short fields paired on a wide sheet and stacked on a narrow one.
	// The payee and a positive amount are needed; no due day makes the bill Expected; a card makes it that card's
	// statement, with its minimum. Errors show on their field and the first one takes focus on Save; Save writes the bill
	// (with the letter's `file-import` row, for a capture) and shows an undo toast. On a capture it first shows Drafting
	// while the Gardener reads the letter, then the form filled from the answer, or why there is none with a way to enter
	// it by hand. A draft of a live bill of the same payee and period says it updates that bill.
	import { Button, Field, InlineError, Select, Sheet, Spinner, Toggle } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { t } from '../../../i18n/index.js'
	import { currencyOptions, parseMoney, toDecimal } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { draftOfBill, safeUrl, type BillDraft } from '../bills.js'
	import { billCapture } from '../capture.svelte.js'
	import { finance } from '../store.svelte.js'
	import { BILL_REPEATS, type Bill, type BillRepeat } from '../types.js'
	import { cadenceLabel, moneyError } from '../words.js'

	type Props = {
		open: boolean
		/** The bill to change; none for a new one. */
		bill?: Bill
		/** The form is the capture's (or a Gardener card's): its draft, its Drafting and failure states. */
		capture?: boolean
	}
	let { open = $bindable(), bill, capture = false }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	// svelte-ignore state_referenced_locally
	const given: BillDraft | undefined = capture ? billCapture.draft : bill ? draftOfBill(bill) : undefined
	let form = $state({
		payee: given?.payee ?? '',
		amount: given?.amount ? toDecimal(given.amount) : '',
		currency: given?.amount?.currency ?? settings.homeCurrency,
		due: given?.due ?? '',
		estimate: given?.estimate ?? false,
		repeat: given?.repeat ? String(given.repeat) : 'none',
		fixed: given?.fixed ?? false,
		accountId: given?.accountId ?? '',
		minimum: given?.minimum ? toDecimal(given.minimum) : '',
		url: given?.url ?? '',
	})
	type Key = 'payee' | 'amount' | 'minimum' | 'url'
	let errors = $state<Partial<Record<Key, string>>>({})

	const id = $derived(capture ? billCapture.draft?.id : bill?.id)
	const phase = $derived(capture ? billCapture.phase : 'form')
	const currencies = $derived(currencyOptions(lang, settings.homeCurrency))
	const repeats = $derived([
		{ value: 'none', label: $t('domains.finance.bills.form.never') },
		...BILL_REPEATS.map((months) => ({ value: String(months), label: cadenceLabel({ months }, $t) })),
	])
	/** The open credit cards, and the one the bill already names even if it has closed since. */
	const cards = $derived([
		{ value: '', label: $t('domains.finance.bills.form.noCard') },
		...finance.accounts
			.filter((account) => account.kind === 'credit-card' && (!account.closedOn || account.id === form.accountId))
			.map((account) => ({
				value: account.id,
				label: account.last4 ? `${account.name} ••${account.last4}` : account.name,
			})),
	])
	const title = $derived(
		id
			? $t('domains.finance.bills.form.titleEdit')
			: capture
				? $t('domains.finance.bills.form.titleDraft')
				: $t('domains.finance.bills.form.titleNew')
	)
	const failure = $derived.by(() => {
		const key = `domains.finance.bills.failure.${billCapture.failure ?? 'network'}`
		const text = $t(key)
		return text === key ? $t('domains.finance.bills.failure.network') : text
	})

	function close() {
		open = false
		if (capture) void billCapture.cancel()
	}

	async function save(event: SubmitEvent) {
		event.preventDefault()
		if (phase !== 'form') return
		const next: typeof errors = {}
		if (!form.payee.trim()) next.payee = $t('domains.finance.bills.errors.payee')
		const amount = parseMoney(form.amount, form.currency, lang)
		if ('error' in amount) next.amount = moneyError(amount.error, form.currency, $t, lang)
		else if (amount.minor <= 0) next.amount = $t('domains.finance.bills.errors.positive')
		const minimum = form.accountId && form.minimum.trim() ? parseMoney(form.minimum, form.currency, lang) : undefined
		if (minimum && 'error' in minimum) next.minimum = moneyError(minimum.error, form.currency, $t, lang)
		if (form.url.trim() && !safeUrl(form.url)) next.url = $t('domains.finance.bills.errors.url')
		errors = next
		const first = (['payee', 'amount', 'minimum', 'url'] as const).find((key) => next[key])
		if (first || 'error' in amount) {
			await tick()
			document.getElementById(`${uid}-${first}`)?.focus()
			return
		}
		const repeat = form.repeat === 'none' ? undefined : (Number(form.repeat) as BillRepeat)
		const draft: BillDraft = {
			...(id ? { id } : {}),
			payee: form.payee,
			amount,
			...(form.due ? { due: form.due } : {}),
			...(form.estimate ? { estimate: true } : {}),
			...(repeat ? { repeat, fixed: form.fixed } : {}),
			...(form.accountId ? { accountId: form.accountId } : {}),
			...(minimum && !('error' in minimum) ? { minimum } : {}),
			...(form.url.trim() ? { url: form.url.trim() } : {}),
			...(given?.period && given.due === (form.due || undefined) ? { period: given.period } : {}),
			...(capture && given?.source ? { source: given.source } : {}),
		}
		const fingerprint = capture ? billCapture.fingerprint : undefined
		const saved = await finance.saveBill(draft, fingerprint ? { fingerprint } : undefined)
		if (!saved) return
		undoToast($t(id ? 'domains.finance.bills.toasts.saved' : 'domains.finance.bills.toasts.added'), saved.undo)
		if (capture) billCapture.saved()
		open = false
	}
</script>

<Sheet
	bind:open={
		() => open,
		(next) => {
			if (!next) close()
		}
	}
	size="md"
	labelledby="{uid}-title"
>
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{title}</h2>
	{/snippet}
	{#if phase === 'drafting'}
		<div class="drafting" role="status">
			<Spinner size="md" />
			<p class="line">{$t('domains.finance.bills.form.drafting')}</p>
		</div>
	{:else if phase === 'failed'}
		<div class="failed">
			<InlineError message={failure} live />
			<div>
				<Button label={$t('domains.finance.bills.form.byHand')} onclick={() => billCapture.byHand()} />
			</div>
		</div>
	{:else}
		<form class="form" id="{uid}-form" onsubmit={save} novalidate>
			{#if capture && billCapture.updates}
				<p class="line quiet">
					{$t('domains.finance.bills.form.updates', { values: billCapture.updates })}
				</p>
			{/if}
			<Field
				id="{uid}-payee"
				label={$t('domains.finance.bills.form.payee')}
				bind:value={form.payee}
				error={errors.payee}
			/>
			<div class="pair">
				<Field
					id="{uid}-amount"
					label={$t('domains.finance.bills.form.amount')}
					unit={form.currency}
					bind:value={form.amount}
					error={errors.amount}
					mono
					inputmode="decimal"
				/>
				<Select label={$t('domains.finance.bills.form.currency')} options={currencies} bind:value={form.currency} />
			</div>
			<div class="pair">
				<Field
					id="{uid}-due"
					label={$t('domains.finance.bills.form.due')}
					type="date"
					bind:value={form.due}
					helper={$t('domains.finance.bills.form.dueHelp')}
				/>
				<Select label={$t('domains.finance.bills.form.repeats')} options={repeats} bind:value={form.repeat} />
			</div>
			<Toggle label={$t('domains.finance.bills.form.estimate')} bind:checked={form.estimate} />
			{#if form.repeat !== 'none'}
				<Toggle label={$t('domains.finance.bills.form.fixed')} bind:checked={form.fixed} />
			{/if}
			<div class="pair">
				<Select label={$t('domains.finance.bills.form.card')} options={cards} bind:value={form.accountId} />
				{#if form.accountId}
					<Field
						id="{uid}-minimum"
						label={$t('domains.finance.bills.form.minimum')}
						unit={form.currency}
						bind:value={form.minimum}
						error={errors.minimum}
						mono
						inputmode="decimal"
					/>
				{/if}
			</div>
			<Field
				id="{uid}-url"
				label={$t('domains.finance.bills.form.url')}
				type="url"
				inputmode="url"
				bind:value={form.url}
				error={errors.url}
			/>
		</form>
	{/if}
	{#snippet footer()}
		<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={close} />
		{#if phase === 'form'}
			<Button label={$t('domains.finance.save')} variant="primary" type="submit" form="{uid}-form" />
		{/if}
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.form,
	.failed {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.drafting {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) 0;
	}
	.line {
		margin: 0;
		font: var(--ed-t-body);
	}
	.quiet {
		color: var(--text-secondary);
	}
	/* two short fields side by side where the sheet is wide enough, one above the other where it is not */
	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
		gap: var(--space-3);
	}
</style>
