<script lang="ts">
	// The account form, for one entered by hand, new or changed: the name, the bank if any, the kind, the currency,
	// the last four digits, the balance as the bank shows it (a debt as the positive amount owed) and the owner's share.
	// The short fields pair on a wide sheet and stack on a narrow one. Errors show on their field and the first one
	// takes focus on Save; a balance that changed is set as of now, with today's snapshot, in the same write.
	import { Button, Field, Select, Sheet } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { t } from '../../../i18n/index.js'
	import { currencyOptions, parseMoney, toDecimal } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { finance } from '../store.svelte.js'
	import { ACCOUNT_KINDS, isDebt, WHOLE, type Account, type AccountKind } from '../types.js'
	import { kindLabel, moneyError, parseShare, shareText } from '../words.js'

	type Props = {
		open: boolean
		account?: Account
		/** What a new account starts from (a bought goal's loan, #88); ignored with `account`. */
		preset?: { name: string; kind: AccountKind }
	}
	let { open = $bindable(), account, preset }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	// svelte-ignore state_referenced_locally
	const start = account ? undefined : preset
	// svelte-ignore state_referenced_locally
	let form = $state({
		name: account?.name ?? start?.name ?? '',
		institution: account?.institution ?? '',
		kind: (account?.kind ?? start?.kind ?? 'checking') as string,
		currency: account?.currency ?? settings.homeCurrency,
		last4: account?.last4 ?? '',
		balance: account?.balance ? toDecimal(account.balance) : '',
		share: shareText(account?.share ?? WHOLE),
	})
	let errors = $state<Partial<Record<'name' | 'last4' | 'balance' | 'share', string>>>({})

	const kind = $derived<AccountKind>(
		(ACCOUNT_KINDS as readonly string[]).includes(form.kind) ? (form.kind as AccountKind) : 'checking'
	)
	const kinds = $derived(ACCOUNT_KINDS.map((id) => ({ value: id, label: kindLabel(id, $t) })))
	const currencies = $derived(currencyOptions(lang, settings.homeCurrency))

	async function save(event: SubmitEvent) {
		event.preventDefault()
		const next: typeof errors = {}
		if (!form.name.trim()) next.name = $t('domains.finance.errors.name')
		const last4 = form.last4.trim()
		if (last4 && !/^\d{4}$/.test(last4)) next.last4 = $t('domains.finance.errors.last4')
		const parsed = form.balance.trim() ? parseMoney(form.balance, form.currency, lang) : undefined
		if (parsed && 'error' in parsed) next.balance = moneyError(parsed.error, form.currency, $t, lang)
		const share = parseShare(form.share)
		if (share === undefined) next.share = $t('domains.finance.errors.share')
		errors = next
		// in the order the fields are laid out
		const first = (['name', 'last4', 'share', 'balance'] as const).find((key) => next[key])
		if (first) {
			await tick()
			document.getElementById(`${uid}-${first}`)?.focus()
			return
		}
		const { created, undo } = finance.saveAccount({
			id: account?.id,
			name: form.name,
			kind,
			currency: form.currency,
			institution: form.institution.trim() || undefined,
			last4: last4 || undefined,
			balance: parsed && !('error' in parsed) ? parsed : undefined,
			share: share ?? WHOLE,
		})
		undoToast($t(created ? 'domains.finance.toasts.accountAdded' : 'domains.finance.toasts.accountSaved'), undo)
		open = false
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{account ? $t('domains.finance.accountForm.titleEdit') : $t('domains.finance.accountForm.titleNew')}
		</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save} novalidate>
		<Field id="{uid}-name" label={$t('domains.finance.accountForm.name')} bind:value={form.name} error={errors.name} />
		<Field label={$t('domains.finance.accountForm.institution')} bind:value={form.institution} />
		<div class="pair">
			<Select label={$t('domains.finance.accountForm.kind')} options={kinds} bind:value={form.kind} />
			<Select label={$t('domains.finance.accountForm.currency')} options={currencies} bind:value={form.currency} />
		</div>
		<div class="pair">
			<Field
				id="{uid}-last4"
				label={$t('domains.finance.accountForm.last4')}
				bind:value={form.last4}
				error={errors.last4}
				mono
				inputmode="numeric"
				maxlength={4}
			/>
			<Field
				id="{uid}-share"
				label={$t('domains.finance.accountForm.share')}
				bind:value={form.share}
				error={errors.share}
				mono
				inputmode="decimal"
			/>
		</div>
		<Field
			id="{uid}-balance"
			label={$t('domains.finance.accountForm.balance')}
			unit={form.currency}
			bind:value={form.balance}
			error={errors.balance}
			helper={isDebt(kind) ? $t('domains.finance.accountForm.debtHelp') : undefined}
			mono
			inputmode="decimal"
		/>
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
