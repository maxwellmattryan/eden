<script lang="ts">
	// Orchard's page (product/domains/finance.md, "Surfaces"): the header with its tabs and the tab's actions, the page's
	// error with Retry when a write failed or the rows could not be read, and the tab: Accounts or Investments (D-195).
	// The tab lives in the address; a pick goes back through the navigation seam. The sheets are the page's, so a
	// header action and a row's menu open the same one. While a provider is bound (the desktop's Plaid), "Link a bank"
	// leads the Accounts header and "Link a brokerage" the Investments one, a stale link raises a notice beside it, a
	// quiet key opens the provider's keys, and its keys and Link sheets are mounted; on the phone and in a plain browser
	// none of them shows. Both apps mount this page; the phone reaches it from More, its sheets rising from the foot.
	import {
		ConfirmSheet,
		IconButton,
		InlineError,
		Notice,
		PageHeader,
		Segmented,
		domainGlyph,
		type PageHeaderAction,
	} from '@eden/ui-kit'
	import { onMount } from 'svelte'
	import { t } from '../../../i18n/index.js'
	import { navigation } from '../../../navigation/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { staleDay } from '../accounts.js'
	import { plaid } from '../plaid.svelte.js'
	import { provider } from '../provider.svelte.js'
	import { finance } from '../store.svelte.js'
	import { FINANCE_TABS, financeTab, type FinanceTab } from '../tabs.js'
	import type { Account, Asset, Holding, ProviderLink } from '../types.js'
	import { dayLine } from '../words.js'
	import AccountSheet from './AccountSheet.svelte'
	import Accounts from './Accounts.svelte'
	import AssetSheet from './AssetSheet.svelte'
	import BalanceSheet from './BalanceSheet.svelte'
	import HoldingSheet from './HoldingSheet.svelte'
	import Investments from './Investments.svelte'
	import LinkSheet from './LinkSheet.svelte'
	import PlaidKeysSheet from './PlaidKeysSheet.svelte'
	import ReplaceSheet from './ReplaceSheet.svelte'

	type Props = {
		/** The route's `tab` parameter as the address has it; anything that is not a tab is Accounts. */
		tab?: string
	}
	let { tab: requested }: Props = $props()

	const tab = $derived<FinanceTab>(financeTab(requested))
	const tabItems = $derived(FINANCE_TABS.map((id) => $t(`domains.finance.tabs.${id}`)))
	function selectTab(index: number) {
		void navigation.open({ place: 'finance', tab: FINANCE_TABS[index] }, { replace: true, noScroll: true })
	}

	// the minute moves while the page is open, so a link goes stale without a reload
	onMount(() => finance.watch())

	// One sheet at a time, made afresh each time it opens (`opened` keys it), so its form starts from what it is given
	type Open =
		| { sheet: 'account'; account?: Account }
		| { sheet: 'asset'; asset?: Asset }
		| { sheet: 'balance'; account: Account }
		| { sheet: 'replace'; account: Account }
		| { sheet: 'remove'; link: ProviderLink }
		| { sheet: 'holding'; holding: Holding; field: 'cost-basis' | 'value' }
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
	const linkBrokerage = $derived(bound ? () => bound.link('brokerage') : undefined)
	const actions = $derived.by<PageHeaderAction[]>(() => {
		if (tab === 'investments')
			return linkBrokerage
				? [
						{
							id: 'link-brokerage',
							label: $t('domains.finance.actions.linkBrokerage'),
							icon: 'landmark',
							variant: 'primary',
							onclick: linkBrokerage,
						},
					]
				: []
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
		const link: PageHeaderAction = {
			id: 'link-bank',
			label: $t('domains.finance.actions.linkBank'),
			icon: 'landmark',
			variant: 'primary',
			onclick: () => bound.link('bank'),
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
		{#snippet filters()}
			<Segmented
				items={tabItems}
				selected={FINANCE_TABS.indexOf(tab)}
				label={$t('domains.finance.tabsLabel')}
				onchange={selectTab}
			/>
		{/snippet}
		{#snippet aside()}
			{#if stale && bound}
				<Notice
					tone="warning"
					title={$t('domains.finance.stale.title', { values: { name: stale.link.institution.name } })}
					detail={stale.day ? $t('domains.finance.stale.detail', { values: { day: stale.day } }) : undefined}
					action={{ label: $t('domains.finance.actions.reconnect'), onclick: () => bound.reconnect(stale.link.id) }}
				/>
			{/if}
			{#if bound}
				<span class="keys">
					<IconButton
						icon="key-round"
						size="xs"
						label={$t('domains.finance.plaid.keysButton')}
						tooltip
						onclick={() => bound.credentials()}
					/>
				</span>
			{/if}
		{/snippet}
	</PageHeader>

	{#if finance.saveFailed}
		<div class="notice">
			<InlineError message={$t('domains.finance.saveFailed')} onretry={() => finance.flush()} live />
		</div>
	{/if}

	{#if tab === 'investments'}
		<Investments
			onlink={linkBrokerage}
			oncostbasis={(holding) => show({ sheet: 'holding', holding, field: 'cost-basis' })}
			onvalue={(holding) => show({ sheet: 'holding', holding, field: 'value' })}
		/>
	{:else}
		<Accounts
			onaddaccount={() => show({ sheet: 'account' })}
			onedit={(account) => show({ sheet: 'account', account })}
			onbalance={(account) => show({ sheet: 'balance', account })}
			onreplace={(account) => show({ sheet: 'replace', account })}
			oneditasset={(asset) => show({ sheet: 'asset', asset })}
			onremovelink={(link) => show({ sheet: 'remove', link })}
			onreconnect={bound ? (link) => bound.reconnect(link.id) : undefined}
			onresetlogin={bound?.sandbox ? (link) => void bound.resetLogin(link.id) : undefined}
			onsample={seed}
		/>
	{/if}
</div>

<!-- The provider's own sheets, while one is bound (the desktop's Plaid): its keys, and its Link session. -->
{#if bound}
	<PlaidKeysSheet
		bind:open={
			() => plaid.sheet === 'keys',
			(open) => {
				if (!open && plaid.sheet === 'keys') plaid.sheet = 'none'
			}
		}
	/>
	<LinkSheet
		bind:open={
			() => plaid.sheet === 'link',
			(open) => {
				if (!open && plaid.sheet === 'link') plaid.sheet = 'none'
			}
		}
	/>
{/if}

{#key opened}
	{#if current?.sheet === 'account'}
		<AccountSheet bind:open={shown} account={current.account} />
	{:else if current?.sheet === 'asset'}
		<AssetSheet bind:open={shown} asset={current.asset} />
	{:else if current?.sheet === 'balance'}
		<BalanceSheet bind:open={shown} account={current.account} />
	{:else if current?.sheet === 'replace'}
		<ReplaceSheet bind:open={shown} account={current.account} />
	{:else if current?.sheet === 'holding'}
		<HoldingSheet bind:open={shown} holding={current.holding} field={current.field} />
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
	.keys {
		display: inline-flex;
		align-self: flex-end;
	}
</style>
