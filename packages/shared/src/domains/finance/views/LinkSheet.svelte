<script lang="ts">
	// The Link sheet (product/domains/finance.md §8): Eden's own sheet around Plaid. On desktop Plaid's hosted page runs
	// in the system browser, so a bank's OAuth runs in a real browser and no Plaid script loads here; on iOS Plaid's
	// native sheet lies over this one (D-206), and the copy says so. It shows the session's phase: starting, waiting
	// for the owner to finish in Plaid, reading the accounts, linked, cancelled, expired, or failed. Closing it never
	// ends a session; "Stop waiting" does. Each change is said once, through the hidden polite line, and focus moves to
	// the phase's primary action.
	import { Button, InlineError, List, Sheet, Spinner, type ListRowData } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { t } from '../../../i18n/index.js'
	import { formatMoney } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { changeKeys, openPageAgain, plaid, sheetClosed, startAgain, stopWaiting } from '../plaid.svelte.js'
	import { finance } from '../store.svelte.js'
	import { isDebt, type Account } from '../types.js'
	import { accountDetail } from '../words.js'

	type Props = {
		open: boolean
	}
	let { open = $bindable() }: Props = $props()

	const uid = $props.id()
	const session = $derived(plaid.session)
	const phase = $derived(session?.state ?? 'starting')
	const reconnect = $derived(session?.mode === 'reconnect')
	const name = $derived(session?.name || $t('domains.finance.plaid.link.aBank'))
	const sandbox = $derived(plaid.status?.environment === 'sandbox')
	/** Plaid's native sheet (iOS) rather than a page in the browser. */
	const onSheet = $derived(plaid.status?.link === 'sheet')
	/** The phrases that name where Plaid runs: the sheet's own on iOS, the browser's elsewhere. */
	const where = (key: 'starting' | 'waitingTitle' | 'waiting' | 'openAgain' | 'expired') =>
		$t(`domains.finance.plaid.link.${onSheet ? 'sheet.' : ''}${key}`)

	const title = $derived.by(() => {
		const again = $t('domains.finance.plaid.link.reconnectTitle', { values: { name } })
		switch (phase) {
			case 'waiting':
				return reconnect ? again : where('waitingTitle')
			case 'reading':
				return $t('domains.finance.plaid.link.readingTitle')
			case 'linked':
				return $t(`domains.finance.plaid.link.${reconnect ? 'reconnected' : 'linked'}`, { values: { name } })
			default:
				return reconnect ? again : $t('domains.finance.plaid.link.title')
		}
	})
	const errorLine = $derived(
		session?.code === 'invalid-keys'
			? $t('domains.finance.plaid.link.invalidKeys')
			: session?.code === 'network'
				? $t('domains.finance.plaid.link.network')
				: $t('domains.finance.plaid.link.failed')
	)
	/** What the phase says, for the hidden line: its title and its one sentence. */
	const said = $derived.by(() => {
		const line = {
			starting: where('starting'),
			waiting: where('waiting'),
			reading: $t('domains.finance.plaid.link.reading'),
			linked: reconnect ? '' : $t('domains.finance.plaid.link.arriving'),
			cancelled: $t('domains.finance.plaid.link.cancelled'),
			expired: where('expired'),
			error: errorLine,
		}[phase]
		return [title, line].filter(Boolean).join('. ')
	})

	const lang = $derived(settings.language)
	function row(account: Account): ListRowData {
		const amount = account.balance ? formatMoney(account.balance, lang) : undefined
		return {
			id: account.id,
			primary: account.name,
			secondary: accountDetail(account, finance.accounts, $t),
			meta: !amount
				? $t('domains.finance.row.noBalance')
				: isDebt(account.kind)
					? $t('domains.finance.row.owed', { values: { amount } })
					: amount,
		}
	}
	const rows = $derived((session?.accounts ?? []).map(row))

	// effect: imperative DOM. Each new phase puts focus on its primary action, once the phase's content is drawn.
	let body = $state<HTMLElement>()
	$effect(() => {
		const now = phase
		if (!open || !body) return
		void tick().then(() => {
			if (now !== plaid.session?.state) return
			body?.closest('dialog')?.querySelector<HTMLElement>('[data-primary] button, button[data-primary]')?.focus()
		})
	})
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title" initialFocus="first" onclose={sheetClosed}>
	{#snippet header()}
		<div class="head">
			<h2 class="title" id="{uid}-title">{title}</h2>
			{#if phase === 'waiting'}<Spinner size="sm" />{/if}
		</div>
	{/snippet}
	<div class="phase" bind:this={body}>
		<p class="ed-sr-only" aria-live="polite">{open ? said : ''}</p>
		{#if phase === 'starting' || phase === 'reading'}
			<p class="busy">
				<Spinner size="md" />
				<span>{phase === 'starting' ? where('starting') : $t('domains.finance.plaid.link.reading')}</span>
			</p>
		{:else if phase === 'waiting'}
			<p class="text">{where('waiting')}</p>
			{#if sandbox}<p class="caption">{$t('domains.finance.plaid.link.sandbox')}</p>{/if}
		{:else if phase === 'linked'}
			{#if !reconnect}
				{#if rows.length}
					<div class="accounts">
						<List header={$t('domains.finance.plaid.link.accounts')} {rows} />
					</div>
				{/if}
				<p class="caption">{$t('domains.finance.plaid.link.arriving')}</p>
			{/if}
		{:else if phase === 'cancelled'}
			<p class="text">{$t('domains.finance.plaid.link.cancelled')}</p>
		{:else if phase === 'expired'}
			<p class="text">{where('expired')}</p>
		{:else if phase === 'error'}
			<div data-primary>
				<InlineError message={errorLine} onretry={startAgain} />
			</div>
		{/if}
	</div>
	{#snippet footer()}
		{#if phase === 'waiting'}
			<Button label={$t('domains.finance.plaid.link.stop')} variant="quiet" onclick={stopWaiting} />
			<Button
				label={where('openAgain')}
				variant="secondary"
				iconRight={onSheet ? undefined : 'external-link'}
				data-primary
				onclick={openPageAgain}
			/>
		{:else if phase === 'linked'}
			<Button
				label={$t('domains.finance.plaid.link.done')}
				variant="primary"
				data-primary
				onclick={() => (open = false)}
			/>
		{:else if phase === 'cancelled'}
			<Button label={$t('domains.finance.plaid.link.tryAgain')} variant="primary" data-primary onclick={startAgain} />
		{:else if phase === 'expired'}
			<Button label={$t('domains.finance.plaid.link.startAgain')} variant="primary" data-primary onclick={startAgain} />
		{:else if phase === 'error' && session?.code === 'invalid-keys'}
			<Button label={$t('domains.finance.plaid.link.changeKeys')} variant="quiet" onclick={changeKeys} />
		{/if}
	{/snippet}
</Sheet>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
		overflow-wrap: anywhere;
	}
	/* one steady height, so a change of phase does not make the sheet jump */
	.phase {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-height: 10rem;
	}
	.busy {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font: var(--ed-t-body);
		color: var(--text-secondary);
	}
	.text {
		margin: 0;
		font: var(--ed-t-body);
		color: var(--text-primary);
	}
	.caption {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	/* past about six rows the list scrolls inside the sheet */
	.accounts {
		max-height: 20rem;
		overflow-y: auto;
	}
</style>
