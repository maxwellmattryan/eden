<script lang="ts">
	// Vigor's Workouts tab, ported from Domains/Vigor/Workouts: the templates with their exercise count and estimated
	// minutes, and the open one in the detail pane (pushed in a narrow page, D-112) with its exercises at their targets,
	// Start and Plan, and Edit and Delete in its menu. The sheets are the page's.
	import {
		BackButton,
		Button,
		DataTable,
		EmptyState,
		IconButton,
		List,
		Menu,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { holdBack } from '../../../navigation/index.js'
	import { showPushed, undoToast } from '../../../shell/index.js'
	import { fitness } from '../store.svelte.js'
	import type { WorkoutTemplate } from '../types.js'

	type Props = {
		onstart: (template: WorkoutTemplate) => void
		onplan: (template: WorkoutTemplate) => void
		onedit: (template?: WorkoutTemplate) => void
		onsample: () => void
	}
	let { onstart, onplan, onedit, onsample }: Props = $props()

	const uid = $props.id()
	const meta = (template: WorkoutTemplate) =>
		`${$t('domains.fitness.exercises', { values: { count: template.exercises.length } })} · ${$t('domains.fitness.minutes', { values: { minutes: template.minutes } })}`
	const rows = $derived<ListRowData[]>(
		fitness.templates.map((template) => ({
			id: template.id,
			primary: template.title,
			icon: 'dumbbell',
			meta: meta(template),
		}))
	)
	let selected = $state<string>()
	const detail = $derived(fitness.templateById(selected) ?? fitness.templates[0])
	const picked = $derived(fitness.templates.some((template) => template.id === selected))
	let back = $state<HTMLElement>()
	function open(id: string) {
		selected = id
		void showPushed(() => back)
	}
	// the phone's back press closes the pushed template before it leaves the page
	$effect(() => (picked ? holdBack(() => ((selected = undefined), true)) : undefined))

	const actions = $derived<MenuItem[]>([
		{ id: 'edit', label: $t('domains.fitness.edit'), icon: 'pencil' },
		{ id: 'delete', label: $t('domains.fitness.delete'), icon: 'trash', destructive: true },
	])
	let menuAnchor = $state<HTMLElement>()
	let menuOpen = $state(false)
	function act(item: MenuItem, template: WorkoutTemplate) {
		if (item.id === 'edit') onedit(template)
		if (item.id === 'delete') {
			selected = undefined
			undoToast(
				$t('garden.feed.templateRemoved', { values: { title: template.title } }),
				fitness.removeTemplate(template.id)
			)
		}
	}
</script>

{#if !fitness.templates.length}
	<EmptyState
		title={$t('domains.fitness.workouts.empty.title')}
		text={$t('domains.fitness.workouts.empty.text')}
		action={{ label: $t('domains.fitness.workouts.newTemplate'), icon: 'plus', onclick: () => onedit() }}
		sample={{ onclick: onsample }}
	/>
{:else}
	<div class={['body', { 'body-wide': detail, 'body-open': picked }]}>
		<div class="lists">
			<List
				header={$t('domains.fitness.workouts.list')}
				count={rows.length}
				{rows}
				current={detail?.id}
				onpick={(row) => open(row.id)}
				onopen={(row) => open(row.id)}
			/>
		</div>
		{#if detail}
			<aside class="detail" aria-labelledby="{uid}-detail">
				<div class="back" bind:this={back}><BackButton onback={() => (selected = undefined)} /></div>
				<div class="detail-head">
					<div class="detail-name">
						<h2 class="detail-title" id="{uid}-detail">{detail.title}</h2>
						<p class="detail-meta">{meta(detail)}</p>
					</div>
					<span class="anchor" bind:this={menuAnchor}>
						<IconButton
							icon="ellipsis"
							size="sm"
							label={$t('domains.fitness.actionsFor', { values: { name: detail.title } })}
							aria-haspopup="menu"
							aria-expanded={menuOpen}
							onclick={() => (menuOpen = !menuOpen)}
						/>
					</span>
					<Menu
						bind:open={menuOpen}
						anchor={menuAnchor}
						align="end"
						label={$t('domains.fitness.actionsFor', { values: { name: detail.title } })}
						items={actions}
						onselect={(item) => act(item, detail)}
					/>
				</div>
				<DataTable
					label={$t('domains.fitness.workouts.exercisesIn', { values: { title: detail.title } })}
					columns={[
						{ label: $t('domains.fitness.workouts.exercise') },
						{ label: $t('domains.fitness.workouts.setsReps'), numeric: true },
					]}
					rows={detail.exercises.map((exercise) => [
						exercise.name,
						$t('domains.fitness.workouts.setsRepsValue', { values: { sets: exercise.sets, reps: exercise.reps } }),
					])}
				/>
				<div class="detail-actions">
					<Button
						label={$t('domains.fitness.workouts.start')}
						variant="primary"
						icon="arrow-right"
						onclick={() => onstart(detail)}
					/>
					<Button label={$t('domains.fitness.workouts.plan')} icon="calendar-plus" onclick={() => onplan(detail)} />
				</div>
			</aside>
		{/if}
	</div>
{/if}

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
	.back {
		display: none;
	}
	@container page (max-width: 48rem) {
		.body-wide {
			grid-template-columns: minmax(0, 1fr);
		}
		.body:not(.body-open) .detail,
		.body-open .lists {
			display: none;
		}
		.back {
			display: block;
		}
	}
	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.anchor {
		display: inline-flex;
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		box-sizing: border-box;
		min-width: 0;
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
		text-wrap: balance;
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
</style>
