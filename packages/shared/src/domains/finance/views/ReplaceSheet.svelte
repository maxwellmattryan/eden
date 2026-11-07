<script lang="ts">
	// "This replaces…": the account the owner says this one took over from, a new card for a lost one or a bank's new
	// account number. Only the accounts it may name are offered: never itself, never one replaced already and never one
	// that would make a loop. Saving names the old one on this account and closes it as of today if it is open, in one
	// write with one undo.
	import { Button, Select, Sheet } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { finance } from '../store.svelte.js'
	import type { Account } from '../types.js'

	type Props = {
		open: boolean
		account: Account
	}
	let { open = $bindable(), account }: Props = $props()

	const uid = $props.id()
	const candidates = $derived(finance.candidatesFor(account.id))
	const options = $derived(
		candidates.map((candidate) => ({
			value: candidate.id,
			label: [
				candidate.name,
				candidate.last4 ? $t('domains.finance.row.last4', { values: { last4: candidate.last4 } }) : undefined,
				candidate.institution,
			]
				.filter(Boolean)
				.join(' · '),
		}))
	)
	// svelte-ignore state_referenced_locally
	let chosen = $state(account.replaces ?? '')

	function save(event: SubmitEvent) {
		event.preventDefault()
		const old = finance.accountById(chosen)
		if (!old) return
		const undo = finance.replaceAccount(account.id, old.id)
		if (undo) undoToast($t('domains.finance.toasts.replaced', { values: { name: old.name } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<div class="head">
			<h2 class="title" id="{uid}-title">{$t('domains.finance.replaceForm.title')}</h2>
			<p class="context">{account.name}</p>
		</div>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save}>
		{#if options.length}
			<Select
				label={$t('domains.finance.replaceForm.account')}
				placeholder={$t('domains.finance.replaceForm.account')}
				{options}
				bind:value={chosen}
			/>
		{:else}
			<p class="none">{$t('domains.finance.replaceForm.none')}</p>
		{/if}
		<p class="context">{$t('domains.finance.replaceForm.text')}</p>
	</form>
	{#snippet footer()}
		<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button
			label={$t('domains.finance.save')}
			variant="primary"
			type="submit"
			form="{uid}-form"
			disabled={!options.length || !candidates.some((candidate) => candidate.id === chosen)}
		/>
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
	.context {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.none {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		color: var(--text-secondary);
	}
</style>
