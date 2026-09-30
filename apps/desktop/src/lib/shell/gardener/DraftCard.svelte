<script lang="ts">
	// A draft the Gardener left for the owner to commit (product/substrate/ai.md, "Surfaces"; D-74): a task, a plan
	// of tasks and events, a grocery list, code to copy, or a capture to verify. Nothing is stored before the owner
	// commits; a commit is an ordinary store write with an undo toast (D-12) and settles the card on its message. The
	// substrate's parts (tasks, events) are written here; a domain's parts go to the domain that drafted them.
	import { convertFileSrc } from '@tauri-apps/api/core'
	import { writeText } from '@tauri-apps/plugin-clipboard-manager'
	import { Badge, Button, CaptureSheet, Icon, type CaptureRow } from '@eden/ui-kit'
	import { isTauri } from '@eden/shared/api'
	import { createEvent, deleteRows, type TaskInput } from '@eden/shared/data'
	import type { DraftCard as Draft, DraftState } from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { manifestFor } from '$lib/domains'
	import { tasks } from '../today/store.svelte'
	import { undoToast } from '../undo'
	import { gardenerSetup } from './setup.svelte'

	type Props = {
		draft: Draft
		status: DraftState
		/** The domain that drafted it, for the parts only it can commit. */
		domain: string
		onsettle: (state: 'committed' | 'discarded') => void
	}
	let { draft, status, domain, onsettle }: Props = $props()

	let busy = $state(false)
	let copied = $state(false)
	let captureOpen = $state(false)

	const title = $derived.by(() => {
		if (draft.kind === 'task') return $t('gardener.draft.task')
		if (draft.kind === 'plan') return draft.title
		if (draft.kind === 'grocery') return $t('gardener.draft.grocery', { values: { count: draft.items.length } })
		if (draft.kind === 'code') return draft.title ?? $t('gardener.draft.code')
		return $t('gardener.draft.capture', { values: { count: draft.rows.length } })
	})
	const settled = $derived(status !== 'pending')
	const thumbnail = $derived(
		draft.kind === 'capture' && draft.path && isTauri() ? convertFileSrc(draft.path) : undefined
	)

	const toTask = (task: {
		title: string
		due?: string
		notes?: string
		timeOfDay?: string
		priority?: 'low' | 'high'
	}): TaskInput => ({
		kind: 'todo',
		title: task.title,
		due: task.due,
		timeOfDay: task.timeOfDay,
		priority: task.priority ?? 'none',
		notes: task.notes,
	})

	/** The domain's part of a commit, when it has one. */
	async function domainCommit(card: Draft): Promise<(() => void) | undefined> {
		const commit = manifestFor(domain)?.commitDraft
		if (!commit) return undefined
		const result = await commit(card)
		return result?.undo
	}

	async function commit() {
		if (busy || settled) return
		busy = true
		try {
			const undos: (() => void)[] = []
			if (draft.kind === 'task') {
				const { undo } = tasks.addInput(toTask(draft))
				undos.push(undo)
				undoToast($t('today.toast.added', { values: { title: draft.title } }), undo)
			} else if (draft.kind === 'plan') {
				if (draft.tasks.length) undos.push(tasks.addMany(draft.tasks.map(toTask)).undo)
				for (const event of draft.events) {
					const row = await createEvent({
						kind: event.kind as 'shop-day',
						title: event.title,
						startAt: event.day,
						allDay: true,
					})
					undos.push(() => void deleteRows([row.uri]))
				}
				const undo = await domainCommit(draft)
				if (undo) undos.push(undo)
				undoToast($t('gardener.draft.planCommitted', { values: { count: draft.tasks.length } }), () =>
					undos.forEach((back) => back())
				)
			} else if (draft.kind === 'grocery') {
				const undo = await domainCommit(draft)
				if (undo) undoToast($t('gardener.draft.groceryCommitted', { values: { count: draft.items.length } }), undo)
			} else if (draft.kind === 'code') {
				if (isTauri()) await writeText(draft.code)
				else await navigator.clipboard.writeText(draft.code)
				copied = true
				busy = false
				return
			} else if (draft.kind === 'capture') {
				captureOpen = true
				busy = false
				return
			}
			onsettle('committed')
		} finally {
			busy = false
		}
	}

	async function commitCapture(rows: CaptureRow[]) {
		if (draft.kind !== 'capture') return
		const undo = await domainCommit({ ...draft, rows })
		if (undo) undoToast($t('gardener.draft.captureCommitted', { values: { count: rows.length } }), undo)
		onsettle('committed')
	}
</script>

<section class={['draft', settled && 'draft-settled']} aria-label={title}>
	<div class="draft-head">
		<Icon
			name={draft.kind === 'code' ? 'copy' : draft.kind === 'capture' ? 'camera' : 'sparkles'}
			size="sm"
			class="draft-icon"
		/>
		<span class="draft-title">{title}</span>
		<span class="draft-badge"><Badge kind="write-draft" /></span>
	</div>

	{#if draft.kind === 'task'}
		<p class="draft-line">
			{draft.title}{draft.due ? ` · ${draft.due}` : ''}{draft.timeOfDay ? ` ${draft.timeOfDay}` : ''}
		</p>
		{#if draft.notes}<p class="draft-quiet">{draft.notes}</p>{/if}
	{:else if draft.kind === 'plan'}
		{#if draft.meals?.length}
			<ul class="draft-list">
				{#each draft.meals as day (day.day)}
					<li><strong>{day.day}</strong> · {day.meals.map((meal) => meal.name).join(', ')}</li>
				{/each}
			</ul>
		{/if}
		{#if draft.tasks.length}
			<ul class="draft-list">
				{#each draft.tasks as task, i (i)}
					<li>{task.title}{task.due ? ` · ${task.due}` : ''}</li>
				{/each}
			</ul>
		{/if}
		{#if draft.events.length}
			<p class="draft-quiet">{draft.events.map((event) => `${event.title} · ${event.day}`).join(' · ')}</p>
		{/if}
		{#if draft.grocery?.length}
			<p class="draft-quiet">{$t('gardener.draft.plusGrocery', { values: { count: draft.grocery.length } })}</p>
		{/if}
	{:else if draft.kind === 'grocery'}
		<ul class="draft-list">
			{#each draft.items as item, i (i)}
				<li>{item.name}{item.qty ? ` · ${item.qty}` : ''}{item.note ? ` (${item.note})` : ''}</li>
			{/each}
		</ul>
	{:else if draft.kind === 'code'}
		<pre class="draft-code"><code>{draft.code}</code></pre>
	{:else if draft.kind === 'capture'}
		<p class="draft-line">{$t('gardener.draft.captureText')}</p>
	{/if}

	{#if !settled}
		<div class="draft-actions">
			{#if draft.kind === 'code'}
				<Button
					variant="honey"
					icon="copy"
					label={copied ? $t('gardener.draft.copied') : $t('gardener.draft.copy')}
					disabled={busy}
					onclick={commit}
				/>
				<Button variant="quiet" label={$t('gardener.draft.done')} onclick={() => onsettle('committed')} />
			{:else}
				<Button
					variant="honey"
					icon={draft.kind === 'capture' ? 'camera' : 'check'}
					label={draft.kind === 'task'
						? $t('gardener.draft.addTask')
						: draft.kind === 'plan'
							? $t('gardener.draft.createTasks', { values: { count: draft.tasks.length } })
							: draft.kind === 'grocery'
								? $t('gardener.draft.addToList')
								: $t('gardener.draft.verify')}
					disabled={busy}
					onclick={commit}
				/>
				<Button
					variant="quiet"
					label={$t('gardener.draft.discard')}
					disabled={busy}
					onclick={() => onsettle('discarded')}
				/>
			{/if}
		</div>
	{:else}
		<p class="draft-result">
			{status === 'committed' ? $t('gardener.draft.committed') : $t('gardener.draft.discarded')}
		</p>
	{/if}
</section>

{#if draft.kind === 'capture'}
	<CaptureSheet
		bind:open={captureOpen}
		provider={gardenerSetup.provider.id}
		cost={$t('gardener.draft.captureCost')}
		rows={draft.rows}
		image={thumbnail}
		oncommit={(rows) => void commitCapture(rows)}
	/>
{/if}

<style>
	.draft {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		border-radius: var(--ed-radius-control);
		border: 1px solid color-mix(in srgb, var(--honey) 30%, transparent);
		background: var(--honey-muted);
		color: var(--text-primary);
		min-width: 0;
	}
	.draft-settled {
		background: var(--surface-1);
		border-color: var(--ed-card-border);
	}
	.draft-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--honey);
		min-width: 0;
	}
	.draft :global(.draft-icon) {
		flex: none;
	}
	.draft-title {
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.draft-badge {
		margin-left: auto;
		flex: none;
		display: inline-flex;
	}
	.draft-line,
	.draft-result {
		margin: 0;
		font: var(--ed-t-body);
	}
	.draft-result {
		color: var(--text-secondary);
	}
	.draft-quiet {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.draft-list {
		margin: 0;
		padding-left: var(--space-4);
		font: var(--ed-t-body);
		display: grid;
		gap: 2px;
	}
	.draft-code {
		margin: 0;
		padding: var(--space-3);
		border-radius: var(--ed-radius-control);
		background: var(--surface-0);
		font: var(--ed-t-data-sm);
		overflow: auto;
		max-height: 320px;
	}
	.draft-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
