<script lang="ts">
	// The eye under the last reply (product/substrate/ai.md, D-149): what that reply read, literally. The rows sent
	// up front with the owner's message and the rows its tools fetched are one list, kept on the reply's can-see
	// block as they are read; an id opens to the rows behind it, named as the owner knows them. A T2 id in reach that
	// the owner has not shared is listed with an Allow, which records a standing read grant the next request uses.
	import { CanSee, ConfirmSheet } from '@eden/ui-kit'
	import type { MessageBlock } from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { grants } from '@eden/shared/shell'
	import { undoToast } from '@eden/shared/shell'
	import { labelRows, registryLabel, type RowLabel } from '@eden/shared/shell/gardener'
	import { GRANT_SUBJECT } from '@eden/shared/shell/gardener'

	type Props = { block: Extract<MessageBlock, { kind: 'can-see' }> }
	let { block }: Props = $props()

	// the rows behind an opened id, labelled; read when it opens, and again each time the popover does
	let labels = $state<Record<string, RowLabel[] | undefined>>({})
	let unlocking = $state<string | undefined>()

	// each id as the owner knows it (a fact's name), the id itself beside it; the owner's files the request carried
	// are one more line, opening to their names (D-82)
	const FILES_ITEM = 'attachment'
	const files = $derived(block.attachments ?? [])
	const items = $derived([
		...block.items.map((item) => ({ ...item, label: registryLabel(item.id) })),
		...(files.length ? [{ id: FILES_ITEM, count: files.length, label: $t('gardener.attachments.canSee') }] : []),
	])
	// a locked id the owner has since shared leaves the list: the block is that request's snapshot, the grant is live
	const locked = $derived(
		block.locked
			.filter(
				(id) =>
					!grants.grants.some(
						(grant) =>
							grant.subject === GRANT_SUBJECT &&
							grant.resource === id &&
							grant.access === 'read' &&
							grant.lifetime === 'standing' &&
							!grant.deletedAt
					)
			)
			.map((id) => ({ id, label: registryLabel(id) }))
	)
	async function expand(item: { id: string }) {
		if (item.id === FILES_ITEM) return
		labels = { ...labels, [item.id]: await labelRows(item.id, block.rows[item.id] ?? []) }
	}
	/** A standing read grant on the T2 id the tools in reach declared; the next request includes it (grants.md). */
	async function allow(id: string) {
		unlocking = undefined
		try {
			const granted = await grants.grant({
				subject: GRANT_SUBJECT,
				resource: id,
				resourceType: 'registry',
				access: 'read',
				lifetime: 'standing',
				origin: 'confirm',
			})
			undoToast($t('gardener.allowed', { values: { id: registryLabel(id) } }), () => void grants.revoke(granted.id))
		} catch {
			// the store refused: the id stays locked
		}
	}
</script>

<CanSee
	{items}
	{locked}
	trimmed={block.trimmed}
	size="xs"
	onopen={() => (labels = {})}
	onexpand={(item) => void expand(item)}
	onunlock={(id) => (unlocking = id)}
>
	{#snippet expanded(item)}
		{@const rows = labels[item.id]}
		{#if item.id === FILES_ITEM}
			<ul class="rows">
				{#each files as name, i (i)}<li>{name}</li>{/each}
			</ul>
		{:else if !(block.rows[item.id] ?? []).length}
			<p class="rows-none">{$t('gardener.noRows')}</p>
		{:else if !rows}
			<p class="rows-none">…</p>
		{:else}
			<ul class="rows">
				{#each rows as row (row.id)}<li>{row.label}</li>{/each}
			</ul>
		{/if}
	{/snippet}
</CanSee>

{#if unlocking}
	<ConfirmSheet
		open={true}
		title={$t('gardener.allow.title')}
		subject={$t('shell.gardener')}
		resource={registryLabel(unlocking)}
		text={$t('gardener.allow.text', { values: { id: registryLabel(unlocking) } })}
		verb={$t('gardener.allow.verb')}
		onconfirm={() => unlocking && void allow(unlocking)}
		oncancel={() => (unlocking = undefined)}
	/>
{/if}

<style>
	.rows {
		margin: 0;
		padding-left: var(--space-4);
		font: var(--ed-t-body-sm);
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.rows-none {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
</style>
