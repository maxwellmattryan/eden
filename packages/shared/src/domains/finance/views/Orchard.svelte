<script lang="ts">
	// Orchard's page (product/domains/finance.md, "Surfaces"): the header with its actions, the page's error with Retry
	// when a write failed or the rows could not be read, and the Accounts tab, the one tab so far, so there is no
	// Segmented. The sheets are the page's, so a header action and a row's menu open the same one. While a provider is
	// bound (the desktop's Plaid), "Link a bank" leads the header, a stale link raises a notice beside it (then the most
	// urgent income question, #80, has the one notice after it, on every platform), a quiet key
	// opens the provider's keys, and its keys and Link sheets are mounted; on the phone and in a plain browser none of
	// them shows. Both apps mount this page; the phone reaches it from More, its sheets rising from the foot.
	import {
		ConfirmSheet,
		DocumentSheet,
		IconButton,
		InlineError,
		Notice,
		PageHeader,
		domainGlyph,
		type PageHeaderAction,
	} from '@eden/ui-kit'
	import { onMount } from 'svelte'
	import { formatCost, modelLabel } from '../../../gardener/index.js'
	import { t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { staleDay } from '../accounts.js'
	import { plaid } from '../plaid.svelte.js'
	import { provider } from '../provider.svelte.js'
	import { documentRead } from '../reader.svelte.js'
	import { statementImport } from '../statement.svelte.js'
	import { finance } from '../store.svelte.js'
	import type { IncomeQuestion } from '../income.js'
	import type { Account, Asset, IncomeSource, ProviderLink } from '../types.js'
	import { dayLine } from '../words.js'
	import AccountSheet from './AccountSheet.svelte'
	import Accounts from './Accounts.svelte'
	import AssetSheet from './AssetSheet.svelte'
	import BalanceSheet from './BalanceSheet.svelte'
	import BonusSheet from './BonusSheet.svelte'
	import ImportSheet from './ImportSheet.svelte'
	import Income from './Income.svelte'
	import Lean from './Lean.svelte'
	import LinkSheet from './LinkSheet.svelte'
	import PaycheckSheet from './PaycheckSheet.svelte'
	import PlaidKeysSheet from './PlaidKeysSheet.svelte'
	import ReplaceSheet from './ReplaceSheet.svelte'

	type Props = {
		/** The route's `tab` parameter; every value shows Accounts, the one tab so far. */
		tab?: string
	}
	let { tab: _tab }: Props = $props()

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
			onclick: () => bound.link(),
		}
		return [link, addAccount, addAsset, ...importing]
	})

	// The document reader's provider line, for a statement's PDF or picture: who reads it, on what, at about what cost
	const reader = $derived.by(() => {
		const preview = documentRead.options?.preview
		if (!preview) return {}
		if ('unavailable' in preview) return { provider: $t(`domains.finance.import.failures.${preview.unavailable}`) }
		const key = `settings.privacy.destinations.${preview.provider}`
		const name = $t(key)
		return {
			provider: name === key ? preview.provider : name,
			model: modelLabel(preview.model),
			cost: $t('domains.finance.import.cost', { values: { cost: formatCost(preview.estimateUsd) } }),
		}
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

<!-- A statement's import (#74), and the document reader its PDF or picture is read in first (D-190): one each. -->
<ImportSheet bind:open={statementImport.open} />
<DocumentSheet
	bind:open={documentRead.open}
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
	provider={reader.provider}
	model={reader.model}
	cost={reader.cost}
	onfiles={(files) => void documentRead.take(files)}
	onconfirm={(text) => documentRead.confirm(text)}
	onsendpicture={() => documentRead.sendPicture()}
	oncancel={() => documentRead.cancel()}
	onclose={() => documentRead.cancel()}
/>

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
