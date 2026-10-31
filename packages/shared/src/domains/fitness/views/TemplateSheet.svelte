<script lang="ts">
	// The template form (Domains/Vigor/Workouts, "Template form"): the title, the estimated minutes and the exercises
	// in order, each picked from the bundled library (or the owner's own) or typed as a new one, with its target sets and
	// reps, moved up or down or removed. Save needs a title and one exercise; a typed name becomes a custom row.
	import { Button, Field, IconButton, Select, Sheet } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { EXERCISES } from '../exercises.js'
	import { fitness } from '../store.svelte.js'
	import type { WorkoutTemplate } from '../types.js'

	type Props = {
		open: boolean
		/** The template to edit; none for a new one. */
		template?: WorkoutTemplate
	}
	let { open = $bindable(), template }: Props = $props()

	const uid = $props.id()
	const CUSTOM = 'custom'
	let next = 0
	const key = () => `e-${next++}`
	type Row = { key: string; exerciseId: string; custom: string; sets: string; reps: string }

	// svelte-ignore state_referenced_locally
	let form = $state({
		title: template?.title ?? '',
		minutes: template ? String(template.minutes) : '',
		exercises: (template?.exercises ?? []).map((exercise): Row => ({
			key: key(),
			exerciseId: exercise.exerciseId,
			custom: '',
			sets: String(exercise.sets),
			reps: String(exercise.reps),
		})),
	})
	const library = $derived([
		...[...EXERCISES, ...fitness.exercises].map((exercise) => ({ value: exercise.id, label: exercise.name })),
		{ value: CUSTOM, label: $t('domains.fitness.templateForm.custom') },
	])
	const nameOf = (row: Row) =>
		row.exerciseId === CUSTOM
			? row.custom.trim()
			: ([...EXERCISES, ...fitness.exercises].find((exercise) => exercise.id === row.exerciseId)?.name ?? '')
	const filled = $derived(form.exercises.filter((row) => nameOf(row)))
	const canSave = $derived(form.title.trim() !== '' && filled.length > 0)

	function move(index: number, by: number) {
		const rows = [...form.exercises]
		const [row] = rows.splice(index, 1)
		rows.splice(index + by, 0, row!)
		form.exercises = rows
	}
	const count = (text: string, fallback: number) => Math.max(1, Math.round(Number(text)) || fallback)
	function save(event: SubmitEvent) {
		event.preventDefault()
		if (!canSave) return
		const { template: saved, undo } = fitness.saveTemplate({
			id: template?.id,
			title: form.title,
			minutes: Math.max(0, Math.round(Number(form.minutes) || 0)),
			exercises: filled.map((row) => ({
				...(row.exerciseId === CUSTOM ? {} : { exerciseId: row.exerciseId }),
				name: nameOf(row),
				sets: count(row.sets, 3),
				reps: count(row.reps, 10),
			})),
		})
		undoToast($t('garden.feed.templateSaved', { values: { title: saved.title } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{template ? $t('domains.fitness.templateForm.titleEdit') : $t('domains.fitness.templateForm.titleNew')}
		</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save}>
		<div class="pair">
			<Field label={$t('domains.fitness.templateForm.title')} bind:value={form.title} />
			<Field
				label={$t('domains.fitness.templateForm.minutes')}
				unit="min"
				bind:value={form.minutes}
				mono
				inputmode="numeric"
			/>
		</div>
		<ol class="exercises" aria-label={$t('domains.fitness.templateForm.exercises')}>
			{#each form.exercises as row, i (row.key)}
				<li class="exercise">
					<div class="pick">
						<Select
							label={$t('domains.fitness.templateForm.exercise', { values: { n: i + 1 } })}
							placeholder={$t('domains.fitness.templateForm.pick')}
							options={library}
							bind:value={row.exerciseId}
						/>
						{#if row.exerciseId === CUSTOM}
							<Field label={$t('domains.fitness.templateForm.customName')} bind:value={row.custom} />
						{/if}
					</div>
					<Field label={$t('domains.fitness.templateForm.sets')} bind:value={row.sets} mono inputmode="numeric" />
					<Field label={$t('domains.fitness.templateForm.reps')} bind:value={row.reps} mono inputmode="numeric" />
					<div class="moves">
						<IconButton
							icon="arrow-up"
							size="xs"
							label={$t('domains.fitness.templateForm.moveUp', { values: { n: i + 1 } })}
							tooltip
							disabled={i === 0}
							onclick={() => move(i, -1)}
						/>
						<IconButton
							icon="arrow-down"
							size="xs"
							label={$t('domains.fitness.templateForm.moveDown', { values: { n: i + 1 } })}
							tooltip
							disabled={i === form.exercises.length - 1}
							onclick={() => move(i, 1)}
						/>
						<IconButton
							icon="trash"
							size="xs"
							label={$t('domains.fitness.templateForm.remove', { values: { n: i + 1 } })}
							danger
							tooltip
							onclick={() => form.exercises.splice(i, 1)}
						/>
					</div>
				</li>
			{/each}
		</ol>
		<div>
			<Button
				label={$t('domains.fitness.templateForm.add')}
				variant="quiet"
				icon="plus"
				onclick={() => form.exercises.push({ key: key(), exerciseId: '', custom: '', sets: '3', reps: '10' })}
			/>
		</div>
	</form>
	{#snippet footer()}
		<Button label={$t('domains.fitness.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button label={$t('domains.fitness.save')} variant="primary" type="submit" form="{uid}-form" disabled={!canSave} />
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-3);
	}
	.exercises {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.exercise {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto;
		align-items: end;
		gap: var(--space-2);
	}
	.pick {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.moves {
		display: flex;
		gap: var(--space-1);
		padding-bottom: var(--space-2);
	}
</style>
