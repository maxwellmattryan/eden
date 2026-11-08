<script lang="ts">
	// Orchard's page (product/domains/finance.md, "Surfaces"): the header with the tab's actions, the tabs (Activity,
	// #83, D-199, which has none; Accounts; Bills, #78; and Investments, #76, D-197), the page's error with Retry when a write failed or the rows could not be read, and the tab's view.
	// The tab lives in the address; a pick goes back through the navigation seam. The sheets are the page's, so a header
	// action and a row's menu open the same one. While a provider is bound (the desktop's Plaid), "Link a bank" leads
	// Accounts' header, "Link a brokerage" the Investments one, a stale link raises a notice beside it on every tab (then the most urgent income question, #80, has the one notice after it), a quiet key opens the provider's keys, and
	// its keys and Link sheets are mounted; on the phone and in a plain browser none of them shows. Bills' header
	// captures a bill (the document reader, `DocumentSheet`, bound to its session field for field) or adds one; the bill
	// form that a capture or a Gardener's card opens is the capture session's. Both apps mount this page; the phone
	// reaches it from More, its sheets rising from the foot.
	import {
		ConfirmSheet,
		DocumentSheet,
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
	import { readerOf } from '../../../shell/gardener/reader-line.js'
	import { staleDay } from '../accounts.js'
	import { billCapture } from '../capture.svelte.js'
	import { plaid } from '../plaid.svelte.js'
	import { provider } from '../provider.svelte.js'
	import { documentRead } from '../reader.svelte.js'
	import { statementImport } from '../statement.svelte.js'
	import { finance } from '../store.svelte.js'
	import { FINANCE_TABS, financeTab, type FinanceTab } from '../tabs.js'
	import type { IncomeQuestion } from '../income.js'
	import type { Account, Asset, Bill, Holding, IncomeSource, ProviderLink } from '../types.js'
	import type { LedgerRow } from '../ledger.js'
	import { dayLine } from '../words.js'
	import AccountSheet from './AccountSheet.svelte'
	import Accounts from './Accounts.svelte'
	import Activity from './Activity.svelte'
	import AssetSheet from './AssetSheet.svelte'
	import BalanceSheet from './BalanceSheet.svelte'
	import BillSheet from './BillSheet.svelte'
	import Bills from './Bills.svelte'
	import BonusSheet from './BonusSheet.svelte'
	import CategorySheet from './CategorySheet.svelte'
	import HoldingSheet from './HoldingSheet.svelte'
	import ImportSheet from './ImportSheet.svelte'
	import Income from './Income.svelte'
	import Investments from './Investments.svelte'
	import Lean from './Lean.svelte'
	import LinkSheet from './LinkSheet.svelte'
	import PaycheckSheet from './PaycheckSheet.svelte'
	import PaySheet from './PaySheet.svelte'
	import PlaidKeysSheet from './PlaidKeysSheet.svelte'
	import ReimbursableSheet from './ReimbursableSheet.svelte'
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
	const capture = () => void billCapture.start()

	/** The reader's provider line: who drafts the bill, on which model, at about what cost, or why none can. */
	const reader = $derived(
		readerOf(
			$t,
			documentRead.options?.preview,
			statementImport.open ? 'domains.finance.import.failures' : 'domains.finance.bills.failure'
		)
	)

	// the minute moves while the page is open, so a link goes stale without a reload; the income pass runs on each
	// visit, so a paycheck that did not come is noticed with no new rows (#80)
	onMount(() => {
		void finance.detectIncome()
		return finance.watch()
	})

	// One sheet at a time, made afresh each time it opens (`opened` keys it), so its form starts from what it is given
	type Open =
		| { sheet: 'account'; account?: Account }
		| { sheet: 'asset'; asset?: Asset }
		| { sheet: 'balance'; account: Account }
		| { sheet: 'replace'; account: Account }
		| { sheet: 'remove'; link: ProviderLink }
		| { sheet: 'paycheck'; source: IncomeSource; day: string }
		| { sheet: 'bonus'; source: IncomeSource; question: Extract<IncomeQuestion, { kind: 'bonus' }> }
		| { sheet: 'bill'; bill?: Bill }
		| { sheet: 'pay'; bill: Bill }
		| { sheet: 'holding'; holding: Holding; field: 'cost-basis' | 'value' }
		| { sheet: 'category'; row: LedgerRow }
		| { sheet: 'reimbursable'; row: LedgerRow }
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
		if (tab === 'activity') return []
		if (tab === 'bills')
			return [
				{
					id: 'capture-bill',
					label: $t('domains.finance.actions.captureBill'),
					icon: 'scan-text',
					variant: 'primary',
					onclick: capture,
				},
				{
					id: 'add-bill',
					label: $t('domains.finance.actions.addBill'),
					icon: 'plus',
					variant: 'secondary',
					onclick: () => show({ sheet: 'bill' }),
				},
			]
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
		// a statement goes into an account the owner has: with none yet, there is nothing to import into (#74)
		const importing: PageHeaderAction[] = finance.accounts.length
			? [
					{
						id: 'import',
						label: $t('domains.finance.actions.import'),
						icon: 'file-up',
						variant: 'secondary',
						onclick: () => statementImport.begin(),
					},
				]
			: []
		if (!bound) return [addAccount, addAsset, ...importing]
		const link: PageHeaderAction = {
			id: 'link-bank',
			label: $t('domains.finance.actions.linkBank'),
			icon: 'landmark',
			variant: 'primary',
			onclick: () => bound.link('bank'),
		}
		return [link, addAccount, addAsset, ...importing]
	})

	/** The first stale link, while a provider can sign it in again. */
	const stale = $derived.by(() => {
		if (!bound) return undefined
		const group = finance.groups.find((entry) => entry.kind === 'link' && entry.state === 'stale')
		if (group?.kind !== 'link') return undefined
		const day = group.accounts.map((account) => staleDay(account, finance.links, finance.clock)).find(Boolean)
		return { link: group.link, day: day ? dayLine(day, settings.language) : undefined }
	})

	/** The most urgent income question (#80), as the header's one notice: the whole sentence and its one action. */
	const asked = $derived.by(() => {
		const question = finance.income?.questions[0]
		const source = question ? finance.incomeById(question.sourceId) : undefined
		if (!question || !source) return undefined
		const employer = source.name
		if (question.kind === 'late') {
			const day = dayLine(question.day, settings.language)
			return {
				id: `late:${source.id}`,
				tone: 'warning' as const,
				title: $t('domains.finance.income.questions.late', { values: { employer, day } }),
				action: {
					label: $t('domains.finance.income.questions.answer'),
					onclick: () => show({ sheet: 'paycheck', source, day: question.day }),
				},
			}
		}
		if (question.kind === 'bonus')
			return {
				id: `bonus:${question.rowId}`,
				tone: 'info' as const,
				title: $t('domains.finance.income.questions.bonus', { values: { employer } }),
				action: {
					label: $t('domains.finance.income.questions.choose'),
					onclick: () => show({ sheet: 'bonus', source, question }),
				},
			}
		return {
			id: `new:${source.id}`,
			tone: 'info' as const,
			title: $t('domains.finance.income.questions.new', { values: { employer } }),
			action: { label: $t('domains.finance.income.questions.leaveLean'), onclick: () => leaveLean(source.id) },
			// dismissing it says the owner has seen it, as Leave lean mode does
			dismiss: () => void finance.seenNewIncome(source.id),
		}
	})

	/** "Leave lean mode" on a new paycheck: lean mode ends and the new source is seen, with one Undo. */
	function leaveLean(id: string) {
		const undos = [finance.endLean(), finance.seenNewIncome(id)].filter((undo) => undo !== undefined)
		if (undos.length) undoToast($t('domains.finance.toasts.leanOff'), () => undos.forEach((undo) => undo()))
	}
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
			{#if asked}
				{#key asked.id}
					<!-- page content, never announced: `note` replaces the tone's live role -->
					<Notice
						role="note"
						tone={asked.tone}
						title={asked.title}
						action={asked.action}
						ondismiss={asked.dismiss}
						breeze={false}
					/>
				{/key}
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

	{#if tab === 'activity'}
		<!-- nothing is drawn until the rows are read, as on Bills -->
		{#if finance.ready}
			<Activity
				oncategorise={(row) => show({ sheet: 'category', row })}
				onreimbursable={(row) => show({ sheet: 'reimbursable', row })}
				onlink={bound ? () => bound.link('bank') : undefined}
				onaddaccount={() => show({ sheet: 'account' })}
				onimport={() => statementImport.begin()}
				onsample={seed}
			/>
		{/if}
	{:else if tab === 'bills'}
		<!-- nothing is drawn until the rows are read, as on Accounts -->
		{#if finance.ready}
			<Bills
				oncapture={capture}
				onedit={(bill) => show({ sheet: 'bill', bill })}
				onmarkpaid={(bill) => show({ sheet: 'pay', bill })}
			/>
		{/if}
	{:else if tab === 'investments'}
		<Investments
			onlink={linkBrokerage}
			oncostbasis={(holding) => show({ sheet: 'holding', holding, field: 'cost-basis' })}
			onvalue={(holding) => show({ sheet: 'holding', holding, field: 'value' })}
		/>
	{:else}
		<Lean />

		<Accounts
			onaddaccount={() => show({ sheet: 'account' })}
			onedit={(account) => show({ sheet: 'account', account })}
			onbalance={(account) => show({ sheet: 'balance', account })}
			onreplace={(account) => show({ sheet: 'replace', account })}
			onimport={(account) => statementImport.begin(account.id)}
			oneditasset={(asset) => show({ sheet: 'asset', asset })}
			onremovelink={(link) => show({ sheet: 'remove', link })}
			onreconnect={bound ? (link) => bound.reconnect(link.id) : undefined}
			onresetlogin={bound?.sandbox ? (link) => void bound.resetLogin(link.id) : undefined}
			onsample={seed}
		/>

		<Income />
	{/if}
</div>

<!-- The document reader's sheet, for a bill's letter and a statement's PDF or picture, bound to its session field for field (finance.md §6, "Mounting it"). -->
<DocumentSheet
	bind:open={
		() => documentRead.open,
		(open) => {
			if (!open && documentRead.open) documentRead.cancel()
		}
	}
	phase={documentRead.phase}
	quality={documentRead.quality}
	failure={documentRead.failure}
	file={documentRead.file}
	bind:text={documentRead.text}
	masked={documentRead.masked}
	pages={documentRead.pages}
	imported={documentRead.imported}
	confirmLabel={documentRead.options?.confirmLabel ?? ''}
	next={documentRead.options?.next}
	provider={reader.blocked ?? reader.provider}
	model={reader.model}
	cost={reader.cost}
	onfiles={(files) => void documentRead.take(files)}
	onconfirm={(text) => documentRead.confirm(text)}
	onsendpicture={() => documentRead.sendPicture()}
	oncancel={() => documentRead.cancel()}
	onclose={() => documentRead.cancel()}
/>

<!-- The bill form a capture or a Gardener's card opens: made afresh as its draft arrives. -->
{#key billCapture.opened}
	{#if billCapture.open}
		<BillSheet bind:open={billCapture.open} capture />
	{/if}
{/key}

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

<!-- A statement's import (#74); its PDF or picture is read in the document reader above (D-190). -->
<ImportSheet bind:open={statementImport.open} />
{#key opened}
	{#if current?.sheet === 'account'}
		<AccountSheet bind:open={shown} account={current.account} />
	{:else if current?.sheet === 'asset'}
		<AssetSheet bind:open={shown} asset={current.asset} />
	{:else if current?.sheet === 'balance'}
		<BalanceSheet bind:open={shown} account={current.account} />
	{:else if current?.sheet === 'replace'}
		<ReplaceSheet bind:open={shown} account={current.account} />
	{:else if current?.sheet === 'paycheck'}
		<PaycheckSheet bind:open={shown} source={current.source} day={current.day} />
	{:else if current?.sheet === 'bonus'}
		<BonusSheet bind:open={shown} source={current.source} question={current.question} />
	{:else if current?.sheet === 'bill'}
		<BillSheet bind:open={shown} bill={current.bill} />
	{:else if current?.sheet === 'pay'}
		<PaySheet bind:open={shown} bill={current.bill} />
	{:else if current?.sheet === 'category'}
		<CategorySheet bind:open={shown} row={current.row} />
	{:else if current?.sheet === 'reimbursable'}
		<ReimbursableSheet bind:open={shown} row={current.row} />
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
