<script lang="ts">
	// The conversations (product/substrate/ai.md, "Surfaces": "listed globally"; D-113): every thread, the latest
	// first, each with what its requests came to. Opening one opens the panel on it, beside this page; a row's menu
	// leads to its requests in the audit log, or deletes it with an undo. The totals come from the audit log, so they
	// cover the ninety days it is kept; a conversation older than that shows none.
	import { onMount } from 'svelte'
	import { EmptyState, InlineError, List, Skeleton, type ListRowData, type MenuItem } from '@eden/ui-kit'
	import { stampToDate } from '../../../data/index.js'
	import { formatAgo } from '../../../dates/index.js'
	import { auditThreadTotals, formatCost, NO_AUDIT_PARAMS, type ThreadUsage } from '../../../gardener/index.js'
	import { locale, t } from '../../../i18n/index.js'
	import { domainFace } from '../domain-face.js'
	import { undoToast } from '../../undo.js'
	import { gardenerUi } from '../panel-ui.svelte.js'
	import { gardenerSetup } from '../setup.svelte.js'
	import { threads } from '../threads.svelte.js'
	import { gotoAudit } from './audit-link.js'

	let totals = $state<Record<string, ThreadUsage>>({})

	async function readTotals() {
		try {
			totals = Object.fromEntries((await auditThreadTotals()).map((total) => [total.threadId, total]))
		} catch {
			// the list stands without its figures
		}
	}
	onMount(() => void threads.load())
	// a request just audited changes this month's spend, and a conversation's total with it
	$effect(() => {
		void gardenerSetup.spentThisMonth
		void readTotals()
	})

	const now = Date.now()
	const number = $derived(new Intl.NumberFormat($locale ?? 'en'))
	const rows = $derived<ListRowData[]>(
		threads.threads.map((thread) => {
			const manifest = thread.domain ? domainFace(thread.domain) : undefined
			const when = thread.updatedAt ? stampToDate(thread.updatedAt) : undefined
			const total = totals[thread.id]
			return {
				id: thread.id,
				primary: thread.title,
				secondary: [
					manifest ? $t(manifest.name) : $t('gardener.global'),
					total
						? $t('gardenerPage.conversations.summary', {
								values: { requests: total.requests, tokens: number.format(total.tokensIn + total.tokensOut) },
							})
						: $t('gardenerPage.conversations.noRequests'),
					...(when ? [formatAgo(when.toISOString(), $locale ?? 'en', now)] : []),
				].join(' · '),
				icon: manifest?.glyph ?? 'sparkles',
				meta: total ? formatCost(total.costUsd) : undefined,
				badges: thread.tier === 'T2' ? [{ kind: 'tier', label: 'T2' }] : undefined,
				actions: [
					{ id: 'audit', label: $t('gardenerPage.conversations.showAudit'), icon: 'clipboard-list' },
					{ id: 'delete', label: $t('gardener.deleteThread'), icon: 'trash', destructive: true },
				],
			}
		})
	)

	function open(id: string) {
		gardenerUi.show()
		void threads.open(id)
	}
	function onaction(item: MenuItem, row: ListRowData) {
		if (item.id === 'audit') {
			void gotoAudit({ ...NO_AUDIT_PARAMS, thread: row.id })
			return
		}
		if (item.id !== 'delete') return
		const thread = threads.threads.find((entry) => entry.id === row.id)
		undoToast($t('gardener.toast.deleted', { values: { title: thread?.title ?? '' } }), threads.remove(row.id))
	}
</script>

<div class="body">
	{#if threads.failed}
		<InlineError message={$t('gardenerPage.conversations.error')} onretry={() => threads.reload()} live />
	{:else if !threads.ready}
		<Skeleton rows={4} />
	{:else if !rows.length}
		<EmptyState
			title={$t('gardenerPage.conversations.empty.title')}
			text={$t('gardenerPage.conversations.empty.text')}
			action={{ label: $t('gardener.ask'), onclick: () => gardenerUi.show() }}
		/>
	{:else}
		<List
			{rows}
			header={$t('gardener.threads')}
			count={rows.length}
			current={threads.current?.id}
			onopen={(row) => open(row.id)}
			{onaction}
		/>
		<p class="quiet">{$t('gardenerPage.conversations.totalsNote')}</p>
	{/if}
</div>

<style>
	.body {
		display: grid;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.quiet {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
</style>
