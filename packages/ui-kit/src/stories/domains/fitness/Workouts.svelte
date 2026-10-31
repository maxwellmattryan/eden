<script lang="ts">
	// Vigor's Workouts view (product/domains/fitness.md, "Surfaces"): the templates, each with its exercise count and
	// estimated minutes, and the open one in the detail pane on desktop (pushed on a narrow page, D-112) with its
	// exercises at their target sets × reps, Start as the pane's primary and Plan beside it. The header logs a workout
	// and, quietly, makes a template. Start opens the log form prefilled from the template; the template form and the
	// plan are sheets of their own. Story-only.
	import {
		BackButton,
		Button,
		DataTable,
		EmptyState,
		Field,
		IconButton,
		List,
		Menu,
		Select,
		Sheet,
		type ListRowData,
		type MenuItem,
		type PageHeaderAction,
	} from '$lib/index.js'
	import VigorPage from './VigorPage.svelte'
	import { exerciseLibrary, gyms, workoutTemplates, type SampleWorkoutTemplate } from '../../sample-data.js'

	type Props = {
		empty?: boolean
		/** A write failed: the page's error with Retry above the body. */
		error?: boolean
		/** The template open in the pane. */
		selected?: string
		/** The phone with the open template pushed over the list. */
		pushed?: boolean
		/** The log form open, prefilled from the selected template (Start) or empty (Log a workout). */
		logging?: 'start' | 'empty'
		/** The template form open on the selected template. */
		editing?: boolean
		/** The plan sheet open. */
		planning?: boolean
		onlog?: () => void
		onnew?: () => void
		onstart?: (id: string) => void
		onplan?: (id: string) => void
		onaction?: (item: MenuItem, id: string) => void
		onsave?: (form: string) => void
		onretry?: () => void
		onsample?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		empty = false,
		error = false,
		selected = 'wt-01',
		pushed = false,
		logging,
		editing = false,
		planning = false,
		onlog,
		onnew,
		onstart,
		onplan,
		onaction,
		onsave,
		onretry,
		onsample,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const templates = $derived(empty ? [] : workoutTemplates)
	// svelte-ignore state_referenced_locally
	let current = $state(selected)
	const detail = $derived(templates.find((template) => template.id === current))
	const meta = (template: SampleWorkoutTemplate) => `${template.exercises.length} exercises · ${template.minutes} min`
	const ACTIONS: MenuItem[] = [
		{ id: 'edit', label: 'Edit', icon: 'pencil' },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
	]
	const toRow = (template: SampleWorkoutTemplate): ListRowData => ({
		id: template.id,
		primary: template.title,
		icon: 'dumbbell',
		meta: meta(template),
	})
	let menuAnchor = $state<HTMLElement>()
	let menuOpen = $state(false)

	// The log form: Start fills it from the template, Log a workout leaves it empty with a template to pick
	// svelte-ignore state_referenced_locally
	let logOpen = $state(logging !== undefined)
	// svelte-ignore state_referenced_locally
	let fromTemplate = $state(logging !== 'empty')
	const logFrom = (template?: SampleWorkoutTemplate) => ({
		date: '2026-09-30',
		gym: 'g-01',
		minutes: template ? String(template.minutes) : '',
		rpe: '',
		template: template?.id ?? '',
		blocks: (template?.exercises ?? []).map((exercise) => ({
			id: exercise.exerciseId,
			name: exercise.name,
			sets: Array.from({ length: exercise.sets }, (_, i) => ({ id: `s-${i}`, reps: String(exercise.reps), load: '' })),
		})),
	})
	// svelte-ignore state_referenced_locally
	let log = $state(logFrom(logging === 'empty' ? undefined : workoutTemplates.find((entry) => entry.id === selected)))
	const logTitle = $derived.by(() => {
		const template = fromTemplate ? workoutTemplates.find((entry) => entry.id === log.template) : undefined
		return template ? `Log ${template.title}` : 'Log a workout'
	})
	const canLog = $derived(log.blocks.some((block) => block.sets.some((set) => Number(set.reps) > 0)))
	function start(template: SampleWorkoutTemplate) {
		log = logFrom(template)
		fromTemplate = true
		logOpen = true
		onstart?.(template.id)
	}
	function logEmpty() {
		log = logFrom()
		fromTemplate = false
		logOpen = true
		onlog?.()
	}
	function addSet(block: (typeof log.blocks)[number]) {
		const last = block.sets.at(-1)
		block.sets.push({ id: `s-${block.sets.length}-${Date.now()}`, reps: last?.reps ?? '', load: last?.load ?? '' })
	}
	const RPE = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))
	const GYMS = gyms.map((gym) => ({ value: gym.id, label: gym.name }))
	const TEMPLATES = workoutTemplates.map((template) => ({ value: template.id, label: template.title }))

	// The template form: the title, the minutes, and the exercises in order, each from the library or typed as new
	// svelte-ignore state_referenced_locally
	let formOpen = $state(editing)
	const LIBRARY = [
		...exerciseLibrary.map((exercise) => ({ value: exercise.id, label: exercise.name })),
		{ value: 'custom', label: 'Custom…' },
	]
	const formFrom = (template?: SampleWorkoutTemplate) => ({
		title: template?.title ?? '',
		minutes: template ? String(template.minutes) : '',
		exercises: (template?.exercises ?? []).map((exercise, i) => ({
			key: `e-${i}`,
			exerciseId: exercise.exerciseId,
			custom: '',
			sets: String(exercise.sets),
			reps: String(exercise.reps),
		})),
	})
	let form = $state(formFrom(workoutTemplates.find((entry) => entry.id === selected)))
	const canSave = $derived(form.title.trim() !== '' && form.exercises.length > 0)
	function moveExercise(index: number, by: number) {
		const next = [...form.exercises]
		const [item] = next.splice(index, 1)
		next.splice(index + by, 0, item!)
		form.exercises = next
	}
	function edit(template?: SampleWorkoutTemplate) {
		form = formFrom(template)
		formOpen = true
		if (!template) onnew?.()
	}

	// svelte-ignore state_referenced_locally
	let planOpen = $state(planning)
	let plan = $state({ date: '2026-10-02', time: '18:00' })

	const actions = $derived<PageHeaderAction[]>([
		{ label: 'Log a workout', icon: 'check', variant: empty ? 'secondary' : undefined, onclick: logEmpty },
		{ label: 'New template', icon: 'plus', variant: 'quiet', onclick: () => edit() },
	])
</script>

{#snippet pane(template: SampleWorkoutTemplate)}
	<div class="detail-head">
		<div class="detail-name">
			<h2 class="detail-title" id="{uid}-detail">{template.title}</h2>
			<p class="detail-meta">{meta(template)}</p>
		</div>
		<span class="anchor" bind:this={menuAnchor}>
			<IconButton
				icon="ellipsis"
				size="sm"
				label="Actions for {template.title}"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				onclick={() => (menuOpen = !menuOpen)}
			/>
		</span>
		<Menu
			bind:open={menuOpen}
			anchor={menuAnchor}
			align="end"
			label="Actions for {template.title}"
			items={ACTIONS}
			onselect={(item) => {
				if (item.id === 'edit') edit(template)
				onaction?.(item, template.id)
			}}
		/>
	</div>
	<DataTable
		label="Exercises in {template.title}"
		columns={[{ label: 'Exercise' }, { label: 'Sets × reps', numeric: true }]}
		rows={template.exercises.map((exercise) => [exercise.name, `${exercise.sets} × ${exercise.reps}`])}
	/>
	<div class="detail-actions">
		<Button label="Start" variant="primary" icon="arrow-right" onclick={() => start(template)} />
		<Button
			label="Plan"
			icon="calendar-plus"
			onclick={() => {
				planOpen = true
				onplan?.(template.id)
			}}
		/>
	</div>
{/snippet}

<VigorPage tab="Workouts" {actions} {error} {onretry} {onnavigate}>
	{#snippet children(platform)}
		{#if empty}
			<EmptyState
				title="No workouts yet"
				text="Make a template from the exercise library, then start it to log a session set by set."
				action={{ label: 'New template', icon: 'plus', onclick: () => edit() }}
				sample={{ onclick: onsample }}
			/>
		{:else if platform === 'mobile' && pushed && detail}
			<div class="body">
				<BackButton breadcrumb="Workouts" onback={() => (pushed = false)} />
				<section class="detail" aria-labelledby="{uid}-detail">{@render pane(detail)}</section>
			</div>
		{:else}
			<div class={['body', { 'body-wide': platform === 'desktop' && detail }]}>
				<List
					header="Templates"
					count={templates.length}
					rows={templates.map(toRow)}
					current={platform === 'desktop' ? current : undefined}
					onpick={(row) => {
						current = row.id
						if (platform === 'mobile') pushed = true
					}}
				/>
				{#if platform === 'desktop' && detail}
					<aside class="detail" aria-labelledby="{uid}-detail">{@render pane(detail)}</aside>
				{/if}
			</div>
		{/if}

		<Sheet bind:open={logOpen} size="md" labelledby="{uid}-log-title">
			{#snippet header()}
				<h2 class="form-title" id="{uid}-log-title">{logTitle}</h2>
			{/snippet}
			<form
				class="form"
				id="{uid}-log"
				onsubmit={(event) => {
					event.preventDefault()
					onsave?.('log')
					logOpen = false
				}}
			>
				{#if !fromTemplate}
					<Select
						label="Template"
						placeholder="None"
						options={TEMPLATES}
						bind:value={log.template}
						onchange={(value) => {
							const template = workoutTemplates.find((entry) => entry.id === value)
							log = { ...logFrom(template), template: value }
						}}
					/>
				{/if}
				<div class="pair">
					<Field label="Date" type="date" bind:value={log.date} />
					<Select label="Gym" placeholder="None" options={GYMS} bind:value={log.gym} />
				</div>
				<div class="pair">
					<Field label="Duration" unit="min" bind:value={log.minutes} mono inputmode="numeric" />
					<Select label="RPE" placeholder="Not rated" options={RPE} bind:value={log.rpe} />
				</div>
				{#each log.blocks as block (block.id)}
					<fieldset class="block">
						<legend class="block-title">{block.name}</legend>
						{#each block.sets as set, i (set.id)}
							<div class="set">
								<span class="set-index">{i + 1}</span>
								<Field label="Reps" bind:value={set.reps} mono inputmode="numeric" />
								<Field label="Load" unit="kg" bind:value={set.load} mono inputmode="decimal" />
								<IconButton
									icon="x"
									size="sm"
									label="Remove set {i + 1} of {block.name}"
									tooltip
									onclick={() => block.sets.splice(i, 1)}
								/>
							</div>
						{/each}
						<div>
							<Button label="Add set" variant="quiet" icon="plus" onclick={() => addSet(block)} />
						</div>
					</fieldset>
				{/each}
			</form>
			{#snippet footer()}
				<Button label="Cancel" variant="quiet" onclick={() => (logOpen = false)} />
				<Button label="Save" variant="primary" type="submit" form="{uid}-log" disabled={!canLog} />
			{/snippet}
		</Sheet>

		<Sheet bind:open={formOpen} size="md" labelledby="{uid}-form-title">
			{#snippet header()}
				<h2 class="form-title" id="{uid}-form-title">{form.title ? 'Edit template' : 'New template'}</h2>
			{/snippet}
			<form
				class="form"
				id="{uid}-form"
				onsubmit={(event) => {
					event.preventDefault()
					onsave?.('template')
					formOpen = false
				}}
			>
				<div class="pair">
					<Field label="Title" bind:value={form.title} />
					<Field label="Estimated time" unit="min" bind:value={form.minutes} mono inputmode="numeric" />
				</div>
				<ol class="exercises" aria-label="Exercises">
					{#each form.exercises as exercise, i (exercise.key)}
						<li class="exercise">
							<div class="exercise-pick">
								<Select label="Exercise {i + 1}" options={LIBRARY} bind:value={exercise.exerciseId} />
								{#if exercise.exerciseId === 'custom'}
									<Field label="Name" bind:value={exercise.custom} />
								{/if}
							</div>
							<Field label="Sets" bind:value={exercise.sets} mono inputmode="numeric" />
							<Field label="Reps" bind:value={exercise.reps} mono inputmode="numeric" />
							<div class="exercise-moves">
								<IconButton
									icon="arrow-up"
									size="xs"
									label="Move exercise {i + 1} up"
									tooltip
									disabled={i === 0}
									onclick={() => moveExercise(i, -1)}
								/>
								<IconButton
									icon="arrow-down"
									size="xs"
									label="Move exercise {i + 1} down"
									tooltip
									disabled={i === form.exercises.length - 1}
									onclick={() => moveExercise(i, 1)}
								/>
								<IconButton
									icon="trash"
									size="xs"
									label="Remove exercise {i + 1}"
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
						label="Add exercise"
						variant="quiet"
						icon="plus"
						onclick={() =>
							form.exercises.push({
								key: `e-${form.exercises.length}-${Date.now()}`,
								exerciseId: '',
								custom: '',
								sets: '3',
								reps: '10',
							})}
					/>
				</div>
			</form>
			{#snippet footer()}
				<Button label="Cancel" variant="quiet" onclick={() => (formOpen = false)} />
				<Button label="Save" variant="primary" type="submit" form="{uid}-form" disabled={!canSave} />
			{/snippet}
		</Sheet>

		<Sheet bind:open={planOpen} size="sm" labelledby="{uid}-plan-title">
			{#snippet header()}
				<h2 class="form-title" id="{uid}-plan-title">Plan {detail?.title ?? 'a session'}</h2>
			{/snippet}
			<form
				class="form"
				id="{uid}-plan"
				onsubmit={(event) => {
					event.preventDefault()
					onsave?.('plan')
					planOpen = false
				}}
			>
				<div class="pair">
					<Field label="Date" type="date" bind:value={plan.date} />
					<Field label="Time" type="time" bind:value={plan.time} />
				</div>
			</form>
			{#snippet footer()}
				<Button label="Cancel" variant="quiet" onclick={() => (planOpen = false)} />
				<Button label="Save" variant="primary" type="submit" form="{uid}-plan" disabled={!plan.date} />
			{/snippet}
		</Sheet>
	{/snippet}
</VigorPage>

<style>
	.body {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.body-wide {
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
	}
	.anchor {
		display: inline-flex;
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		box-sizing: border-box;
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.detail-head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
	}
	.detail-name {
		flex: 1;
		min-width: 0;
	}
	.detail-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
	}
	.detail-meta {
		margin: var(--space-1) 0 0;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
	.detail-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.form-title {
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
	.exercise-pick {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.exercise-moves {
		display: flex;
		gap: var(--space-1);
		padding-bottom: var(--space-2);
	}
</style>
