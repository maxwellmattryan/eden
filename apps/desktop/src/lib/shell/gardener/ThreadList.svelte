<script lang="ts">
	// The threads beside the conversation (product/substrate/ai.md, "Surfaces"): every thread, or the domain's when
	// the panel was opened from one, the latest first, the lock on a T2 thread. An app composition on the kit's List.
	import { List, type ListRowData, type MenuItem } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { stampToDate } from '@eden/shared/data'
	import { formatAgo } from '@eden/shared/dates'
	import { manifestFor } from '$lib/domains'
	import { undoToast } from '../undo'
	import { threads } from './threads.svelte'

	type Props = { domain?: string; onopen: (id: string) => void }
	let { domain, onopen }: Props = $props()

	const now = Date.now()
	const rows = $derived<ListRowData[]>(
		threads.of(domain).map((thread) => {
			const manifest = thread.domain ? manifestFor(thread.domain) : undefined
			const when = thread.updatedAt ? stampToDate(thread.updatedAt) : undefined
			return {
				id: thread.id,
				primary: thread.title,
				secondary: manifest ? $t(manifest.name) : $t('gardener.global'),
				icon: manifest?.glyph ?? 'sparkles',
				meta: when ? formatAgo(when.toISOString(), 'en', now) : undefined,
				badges: thread.tier === 'T2' ? [{ kind: 'tier', label: 'T2' }] : undefined,
				actions: [{ id: 'delete', label: $t('gardener.deleteThread'), icon: 'trash', destructive: true }],
			}
		})
	)

	function onaction(item: MenuItem, row: ListRowData) {
		if (item.id !== 'delete') return
		const thread = threads.threads.find((entry) => entry.id === row.id)
		const undo = threads.remove(row.id)
		undoToast($t('gardener.toast.deleted', { values: { title: thread?.title ?? '' } }), undo)
	}
</script>

{#if rows.length}
	<List {rows} compact onopen={(row) => onopen(row.id)} {onaction} />
{:else}
	<p class="quiet">{$t('gardener.noThreads')}</p>
{/if}

<style>
	.quiet {
		margin: 0;
		padding: var(--space-3);
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
</style>
