<script lang="ts">
	// Orchard's page (product/domains/finance.md, "Surfaces"): the header with its actions, the page's error with Retry
	// when a write failed or the rows could not be read, and the Accounts tab, the one tab so far, so there is no
	// Segmented. The sheets are the page's, so a header action and a row's menu open the same one. While a provider is
	// bound, "Link a bank" leads the header and a stale link raises a notice beside it; until #73 binds one, neither
	// shows. Both apps mount this page; the phone reaches it from More, its sheets rising from the foot.
	import { ConfirmSheet, InlineError, Notice, PageHeader, domainGlyph, type PageHeaderAction } from '@eden/ui-kit'
	import { onMount } from 'svelte'
	import { t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { staleDay } from '../accounts.js'
	import { provider } from '../provider.svelte.js'
	import { finance } from '../store.svelte.js'
	import type { Account, Asset, ProviderLink } from '../types.js'
	import { dayLine } from '../words.js'
	import AccountSheet from './AccountSheet.svelte'
	import Accounts from './Accounts.svelte'
	import AssetSheet from './AssetSheet.svelte'
	import BalanceSheet from './BalanceSheet.svelte'
	import ReplaceSheet from './ReplaceSheet.svelte'

	type Props = {
		/** The route's `tab` parameter; every value shows Accounts, the one tab so far. */
		tab?: string
	}
	let { tab: _tab }: Props = $props()

	// the minute moves while the page is open, so a link goes stale without a reload
	onMount(() => finance.watch())

	// One sheet at a time, made afresh each time it opens (`opened` keys it), so its form starts from what it is given
	type Open =
		| { sheet: 'account'; account?: Account }
		| { sheet: 'asset'; asset?: Asset }
		| { sheet: 'balance'; account: Account }
		| { sheet: 'replace'; account: Account }
		| { sheet: 'remove'; link: ProviderLink }
	let current = $state<Open>()
	let shown = $state(false)
	let opened = $state(0)
	function show(next: Open) {
		current = next
		opened += 1
		shown = true
	}

	function seed() {
		undoToast($t('common.sampleAdded'), finance.seed())
	}
	function removeLink(link: ProviderLink) {
		const undo = finance.removeLink(link.id)
		if (undo) undoToast($t('domains.finance.toasts.linkRemoved', { values: { name: link.institution.name } }), undo)
	}

	const bound = $derived(provider.bound)
	const actions = $derived.by<PageHeaderAction[]>(() => {
		const addAccount: PageHeaderAction = {
			id: 'add-account',
			label: $t('domains.finance.actions.addAccount'),
			icon: 'plus',
			variant: bound ? 'secondary' : 'primary',
			onclick: () => show({ sheet: 'account' }),
		}
		const addAsset: PageHeaderAction = {
			id: 'add-asset',
			label: $t('domains.finance.actions.addAsset'),
			icon: 'package',
			variant: 'secondary',
			onclick: () => show({ sheet: 'asset' }),
		}
		if (!bound) return [addAccount, addAsset]
		// the bank's own glyph arrives with the binding (#73)
		const link: PageHeaderAction = {
			id: 'link-bank',
			label: $t('domains.finance.actions.linkBank'),
			variant: 'primary',
			onclick: () => bound.link(),
		}
		return [link, addAccount, addAsset]
	})

	/** The first stale link, while a provider can sign it in again. */
	const stale = $derived.by(() => {
		if (!bound) return undefined
		const group = finance.groups.find((entry) => entry.kind === 'link' && entry.state === 'stale')
		if (group?.kind !== 'link') return undefined
		const day = group.accounts.map((account) => staleDay(account, finance.links, finance.clock)).find(Boolean)
		return { link: group.link, day: day ? dayLine(day, settings.language) : undefined }
	})
</script>

<div class="page">
	<PageHeader
		name={$t('domains.finance.name')}
		subtitle={$t('domains.finance.subtitle')}
		icon={domainGlyph('finance')}
		{actions}
	>
		{#snippet aside()}
			{#if stale && bound}
				<Notice
					tone="warning"
					title={$t('domains.finance.stale.title', { values: { name: stale.link.institution.name } })}
					detail={stale.day ? $t('domains.finance.stale.detail', { values: { day: stale.day } }) : undefined}
					action={{ label: $t('domains.finance.actions.reconnect'), onclick: () => bound.reconnect(stale.link.id) }}
				/>
			{/if}
		{/snippet}
	</PageHeader>

	{#if finance.saveFailed}
		<div class="notice">
			<InlineError message={$t('domains.finance.saveFailed')} onretry={() => finance.flush()} live />
		</div>
	{/if}

	<Accounts
		onaddaccount={() => show({ sheet: 'account' })}
		onedit={(account) => show({ sheet: 'account', account })}
		onbalance={(account) => show({ sheet: 'balance', account })}
		onreplace={(account) => show({ sheet: 'replace', account })}
		oneditasset={(asset) => show({ sheet: 'asset', asset })}
		onremovelink={(link) => show({ sheet: 'remove', link })}
		onreconnect={bound ? (link) => bound.reconnect(link.id) : undefined}
		onsample={seed}
	/>
</div>

{#key opened}
	{#if current?.sheet === 'account'}
		<AccountSheet bind:open={shown} account={current.account} />
	{:else if current?.sheet === 'asset'}
		<AssetSheet bind:open={shown} asset={current.asset} />
	{:else if current?.sheet === 'balance'}
		<BalanceSheet bind:open={shown} account={current.account} />
	{:else if current?.sheet === 'replace'}
		<ReplaceSheet bind:open={shown} account={current.account} />
	{:else if current?.sheet === 'remove'}
		{@const link = current.link}
		<ConfirmSheet
			bind:open={shown}
			title={$t('domains.finance.removeLink.title', { values: { name: link.institution.name } })}
			text={$t('domains.finance.removeLink.text')}
			subject={$t('domains.finance.removeLink.subject')}
			resource={$t('domains.finance.removeLink.resource')}
			verb={$t('domains.finance.removeLink.verb')}
			danger
			onconfirm={() => removeLink(link)}
		/>
	{/if}
{/key}

<style>
	.page {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.notice {
		padding: 0 var(--ed-gutter) var(--space-4);
	}
</style>
