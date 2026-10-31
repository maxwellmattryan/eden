<script lang="ts">
	// The plan sheet (Domains/Vigor/Workouts, "Plan"): a date and a time for a template, which make a `workout-session`
	// Event titled after it (D-177).
	import { Button, Field, Sheet } from '@eden/ui-kit'
	import { daysFromToday } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { fitness } from '../store.svelte.js'
	import type { WorkoutTemplate } from '../types.js'

	type Props = {
		open: boolean
		template: WorkoutTemplate
	}
	let { open = $bindable(), template }: Props = $props()

	const uid = $props.id()
	let form = $state({ date: daysFromToday(1), time: '18:00' })

	function save(event: SubmitEvent) {
		event.preventDefault()
		if (!form.date || !form.time) return
		const { session, undo } = fitness.planSession(template.id, form.date, form.time)
		undoToast($t('garden.feed.sessionPlanned', { values: { title: session.title } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{$t('domains.fitness.planForm.title', { values: { title: template.title } })}
		</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save}>
		<Field label={$t('domains.fitness.planForm.date')} type="date" bind:value={form.date} />
		<Field label={$t('domains.fitness.planForm.time')} type="time" bind:value={form.time} />
	</form>
	{#snippet footer()}
		<Button label={$t('domains.fitness.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button
			label={$t('domains.fitness.save')}
			variant="primary"
			type="submit"
			form="{uid}-form"
			disabled={!form.date || !form.time}
		/>
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
</style>
