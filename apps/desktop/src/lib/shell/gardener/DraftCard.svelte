<script lang="ts">
	// A draft the Gardener left for the owner to commit (product/substrate/ai.md, "Surfaces"; D-74): a task, a plan
	// of tasks and events, a grocery list, code to copy, a capture to verify, or a recipe to check. Nothing is stored
	// before the owner commits; a commit is an ordinary store write with an undo toast (D-12) and settles the card on
	// its message. The substrate's parts (tasks, events) are written here; a domain's parts go to the domain that
	// drafted them, and a draft the domain checks on a surface of its own (a haul on Hearth's capture sheet, a recipe
	// in its Recipes view) is opened there and settles when the owner keeps or discards it there (D-86). It is its own
	// message in the thread: the Gardener's bubble in honey, since this is the Gardener acting (D-40).
	import { Button, GardenerMessage } from '@eden/ui-kit'
	import { createEvent, deleteRows, type TaskInput } from '@eden/shared/data'
	import { addDays, dateIn } from '@eden/shared/dates'
	import type { DraftCard as Draft, DraftState } from '@eden/shared/gardener'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { describeRecurrence, taskFromDraft, type DraftTask } from '@eden/shared/tasks'
	import { copyText } from '@eden/shared/api'
	import { manifestFor } from '$lib/domains'
	import { formatDayWord, formatRepeat, formatWallTime, type Words } from '../today/chips'
	import { tasks } from '../today/store.svelte'
	import { undoToast } from '../undo'

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

	const title = $derived.by(() => {
		if (draft.kind === 'task') return $t('gardener.draft.task')
		if (draft.kind === 'plan') return draft.title
		if (draft.kind === 'grocery') return $t('gardener.draft.grocery', { values: { count: draft.items.length } })
		if (draft.kind === 'code') return draft.title ?? $t('gardener.draft.code')
		if (draft.kind === 'recipe') return $t('gardener.draft.recipe', { values: { name: draft.recipe.name } })
		return $t('gardener.draft.capture', { values: { count: draft.rows.length } })
	})
	const settled = $derived(status !== 'pending')

	/** The row a drafted task becomes when it is kept: a todo, a routine or a habit, by what the draft holds. */
	const toTask = (task: DraftTask): TaskInput => taskFromDraft(task, dateIn(tasks.zone, Date.now()), tasks.zone)

	const words = $derived<Words>({
		t: $t,
		format: { lang: $locale ?? 'en', clock: settings.clock },
		today: tasks.view.day,
		tomorrow: addDays(tasks.view.day, 1),
	})
	/** A drafted task as one line: its title, then its day and time, or how it repeats, or what it counts toward. */
	function taskLine(task: DraftTask): string {
		const time = task.timeOfDay ? formatWallTime(task.timeOfDay, words.format) : undefined
		const parts = task.target
			? [
					$t(`today.target.${task.target.per === 'day' ? 'perDay' : 'perWeek'}`, {
						values: { count: task.target.count },
					}),
				]
			: task.recurrence
				? [formatRepeat(describeRecurrence(task.recurrence), words), time]
				: [task.due ? formatDayWord(task.due, words) : undefined, time]
		return [task.title, parts.filter(Boolean).join(' ')].filter(Boolean).join(' · ')
	}

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
			// the rows are read before one is added: a first read that lands after would drop it from the page
			await tasks.load()
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
				await copyText(draft.code)
				copied = true
				busy = false
				return
			} else {
				// checked on the domain's own surface: the card settles when the owner keeps or discards it there
				manifestFor(domain)?.openDraft?.(draft, onsettle)
				busy = false
				return
			}
			onsettle('committed')
		} finally {
			busy = false
		}
	}

	/** The kept rows go back in the draft's shape: a merge is the stock item's name while it is on. */
</script>

<GardenerMessage
	tone="honey"
	name={title}
	icon={draft.kind === 'code'
		? 'copy'
		: draft.kind === 'capture'
			? 'camera'
			: draft.kind === 'recipe'
				? 'cooking-pot'
				: 'sparkles'}
>
	{#if draft.kind === 'task'}
		<p class="draft-line">{taskLine(draft)}</p>
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
					<li>{taskLine(task)}</li>
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
	{:else if draft.kind === 'recipe'}
		<p class="draft-line">{$t('gardener.draft.recipeText')}</p>
		<p class="draft-quiet">
			{draft.recipe.ingredients.map((line) => line.name).join(', ')}
		</p>
	{/if}

	{#if !settled}
		<div class="draft-actions">
			{#if draft.kind === 'code'}
				<Button
					variant="honey"
					label={copied ? $t('gardener.draft.copied') : $t('gardener.draft.copy')}
					disabled={busy}
					onclick={commit}
				/>
				<Button variant="quiet" label={$t('gardener.draft.done')} onclick={() => onsettle('committed')} />
			{:else}
				<Button
					variant="honey"
					label={draft.kind === 'task'
						? $t('gardener.draft.addTask')
						: draft.kind === 'plan'
							? $t('gardener.draft.createTasks', { values: { count: draft.tasks.length } })
							: draft.kind === 'grocery'
								? $t('gardener.draft.addToList')
								: draft.kind === 'recipe'
									? $t('gardener.draft.openRecipe')
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
</GardenerMessage>

<style>
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
