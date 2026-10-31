<script lang="ts">
	// The log form (Domains/Vigor/Workouts, "Log form"): the date, the gym, the duration and RPE, then a block of set
	// rows per exercise, the load in the owner's unit (D-58) and kept in kg. Start fills it from a template; Log a
	// workout opens it empty, with a template to pick. A new set starts from the one before it. Save needs one set with
	// reps above 0; a log of a template on a day it was planned for is done for that session.
	import { Button, Field, IconButton, Select, Sheet } from '@eden/ui-kit'
	import { todayIso } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { fitness } from '../store.svelte.js'
	import type { WorkoutTemplate } from '../types.js'
	import { fromDisplay, unitOf } from '../units.js'

	type Props = {
		open: boolean
		/** The template Start was pressed on; none for Log a workout. */
		template?: WorkoutTemplate
	}
	let { open = $bindable(), template }: Props = $props()

	const uid = $props.id()
	let next = 0
	const key = () => `k-${next++}`
	type SetRow = { key: string; reps: string; load: string }
	type Block = { key: string; exerciseId: string; name: string; sets: SetRow[] }
	const blocksOf = (from?: WorkoutTemplate): Block[] =>
		(from?.exercises ?? []).map((exercise) => ({
			key: key(),
			exerciseId: exercise.exerciseId,
			name: exercise.name,
			sets: Array.from({ length: exercise.sets }, () => ({ key: key(), reps: String(exercise.reps), load: '' })),
		}))

	// svelte-ignore state_referenced_locally
	const fromTemplate = template !== undefined
	// svelte-ignore state_referenced_locally
	let form = $state({
		templateId: template?.id ?? '',
		date: todayIso(),
		gymId: fitness.gyms[0]?.id ?? '',
		minutes: template ? String(template.minutes) : '',
		rpe: '',
		blocks: blocksOf(template),
	})
	const chosen = $derived(fitness.templateById(form.templateId))
	const unit = $derived(unitOf('weight', settings.measurement))
	const canSave = $derived(form.blocks.some((block) => block.sets.some((set) => Number(set.reps) > 0)))
	const title = $derived(
		chosen && fromTemplate
			? $t('domains.fitness.logForm.titleFor', { values: { title: chosen.title } })
			: $t('domains.fitness.logForm.title')
	)
	const RPE = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

	function pick(id: string) {
		const picked = fitness.templateById(id)
		form.templateId = id
		form.blocks = blocksOf(picked)
		if (picked) form.minutes = String(picked.minutes)
	}
	function addSet(block: Block) {
		const last = block.sets.at(-1)
		block.sets.push({ key: key(), reps: last?.reps ?? '', load: last?.load ?? '' })
	}
	function save(event: SubmitEvent) {
		event.preventDefault()
		if (!canSave) return
		const exercises = form.blocks
			.map((block) => ({
				exerciseId: block.exerciseId,
				name: block.name,
				sets: block.sets
					.filter((set) => Number(set.reps) > 0)
					.map((set) => {
						const load = Number(set.load.replace(',', '.'))
						return {
							reps: Math.round(Number(set.reps)),
							...(set.load.trim() && load > 0 ? { load: fromDisplay('weight', load, settings.measurement) } : {}),
						}
					}),
			}))
			.filter((exercise) => exercise.sets.length)
		const rpe = Number(form.rpe)
		const { log, undo } = fitness.logWorkout({
			...(chosen ? { templateId: chosen.id } : {}),
			title: chosen?.title ?? $t('domains.fitness.logForm.title'),
			date: form.date || todayIso(),
			...(form.gymId ? { gymId: form.gymId } : {}),
			minutes: Math.max(0, Math.round(Number(form.minutes) || 0)),
			...(rpe >= 1 && rpe <= 10 ? { rpe } : {}),
			exercises,
		})
		undoToast($t('garden.feed.workoutLogged', { values: { title: log.title } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{title}</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save}>
		{#if !fromTemplate}
			<Select
				label={$t('domains.fitness.logForm.template')}
				placeholder={$t('domains.fitness.logForm.none')}
				options={fitness.templates.map((entry) => ({ value: entry.id, label: entry.title }))}
				value={form.templateId}
				onchange={pick}
			/>
		{/if}
		<div class="pair">
			<Field label={$t('domains.fitness.logForm.date')} type="date" bind:value={form.date} />
			<Select
				label={$t('domains.fitness.logForm.gym')}
				placeholder={$t('domains.fitness.logForm.none')}
				options={fitness.gyms.map((gym) => ({ value: gym.id, label: gym.name }))}
				bind:value={form.gymId}
			/>
		</div>
		<div class="pair">
			<Field
				label={$t('domains.fitness.logForm.duration')}
				unit="min"
				bind:value={form.minutes}
				mono
				inputmode="numeric"
			/>
			<Select
				label={$t('domains.fitness.logForm.rpe')}
				placeholder={$t('domains.fitness.logForm.notRated')}
				options={RPE}
				bind:value={form.rpe}
			/>
		</div>
		{#each form.blocks as block (block.key)}
			<fieldset class="block">
				<legend class="block-title">{block.name}</legend>
				{#each block.sets as set, i (set.key)}
					<div class="set">
						<span class="set-index">{i + 1}</span>
						<Field label={$t('domains.fitness.logForm.reps')} bind:value={set.reps} mono inputmode="numeric" />
						<Field label={$t('domains.fitness.logForm.load')} {unit} bind:value={set.load} mono inputmode="decimal" />
						<IconButton
							icon="x"
							size="sm"
							label={$t('domains.fitness.logForm.removeSet', { values: { n: i + 1, name: block.name } })}
							tooltip
							onclick={() => block.sets.splice(i, 1)}
						/>
					</div>
				{/each}
				<div>
					<Button
						label={$t('domains.fitness.logForm.addSet')}
						variant="quiet"
						icon="plus"
						onclick={() => addSet(block)}
					/>
				</div>
			</fieldset>
		{:else}
			<p class="quiet">{$t('domains.fitness.logForm.noExercises')}</p>
		{/each}
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
	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-3);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
	}
	.block-title {
		padding: 0 var(--space-1);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.set {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr) auto;
		align-items: end;
		gap: var(--space-2);
	}
	.set-index {
		padding-bottom: var(--space-2);
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
	.quiet {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
</style>
