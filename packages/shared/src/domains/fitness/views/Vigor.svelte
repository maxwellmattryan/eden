<script lang="ts">
	// Vigor's page (product/domains/fitness.md, "Surfaces"), ported from Domains/Vigor/*: the header with the tab's one
	// primary action (and, on Workouts, New template quietly beside it), the five tabs, the page's error with Retry when
	// a write failed or the rows could not be read, and the tab's view. The sheets are the page's, so a header action and
	// a pane's button open the same one. The tab lives in the address; a pick goes back through the navigation seam.
	// Both apps mount this page; the phone reaches it from More, its sheets rising from the foot.
	import { InlineError, PageHeader, Segmented, domainGlyph, type PageHeaderAction } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { navigation } from '../../../navigation/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { runQuickLog } from '../../../shell/quick-log/index.js'
	import { fitness } from '../store.svelte.js'
	import { FITNESS_TABS, fitnessTab, type FitnessTab } from '../tabs.js'
	import type { Gym, MetricKind, Supplement, WorkoutTemplate } from '../types.js'
	import Body from './Body.svelte'
	import GoalSheet from './GoalSheet.svelte'
	import GymSheet from './GymSheet.svelte'
	import Gyms from './Gyms.svelte'
	import History from './History.svelte'
	import LogSheet from './LogSheet.svelte'
	import MetricSheet from './MetricSheet.svelte'
	import PlanSheet from './PlanSheet.svelte'
	import SupplementSheet from './SupplementSheet.svelte'
	import Supplements from './Supplements.svelte'
	import TemplateSheet from './TemplateSheet.svelte'
	import Workouts from './Workouts.svelte'

	type Props = {
		/** The route's `tab` parameter as the address has it; anything that is not a tab is Workouts. */
		tab?: string
	}
	let { tab: requested }: Props = $props()

	const tab = $derived<FitnessTab>(fitnessTab(requested))
	const tabItems = $derived(FITNESS_TABS.map((id) => $t(`domains.fitness.tabs.${id}`)))
	function selectTab(index: number) {
		void navigation.open({ place: 'fitness', tab: FITNESS_TABS[index] }, { replace: true, noScroll: true })
	}

	// One sheet at a time, made afresh each time it opens (`opened` keys it), so its form starts from what it is given
	type Open =
		| { sheet: 'log'; template?: WorkoutTemplate }
		| { sheet: 'template'; template?: WorkoutTemplate }
		| { sheet: 'plan'; template: WorkoutTemplate }
		| { sheet: 'goal' }
		| { sheet: 'metric'; kind: MetricKind }
		| { sheet: 'gym'; gym?: Gym }
		| { sheet: 'supplement'; supplement?: Supplement }
	let current = $state<Open>()
	let shown = $state(false)
	let opened = $state(0)
	function show(next: Open) {
		current = next
		opened += 1
		shown = true
	}

	function seed() {
		undoToast($t('common.sampleAdded'), fitness.seed($t('domains.fitness.name')))
	}
	const logWeight = () => runQuickLog('fitness.log-weight')

	const actions = $derived.by<PageHeaderAction[]>(() => {
		const quiet = (has: boolean) => (has ? undefined : ('secondary' as const))
		switch (tab) {
			case 'workouts':
				return [
					{
						label: $t('domains.fitness.workouts.log'),
						icon: 'check',
						variant: quiet(fitness.templates.length > 0),
						onclick: () => show({ sheet: 'log' }),
					},
					{
						label: $t('domains.fitness.workouts.newTemplate'),
						icon: 'plus',
						variant: 'quiet',
						onclick: () => show({ sheet: 'template' }),
					},
				]
			case 'history':
				return [
					{
						label: $t('domains.fitness.workouts.log'),
						icon: 'check',
						variant: quiet(fitness.logs.length > 0),
						onclick: () => show({ sheet: 'log' }),
					},
				]
			case 'body':
				return [
					{
						label: $t('domains.fitness.body.logWeight'),
						icon: 'gauge',
						variant: quiet(fitness.latestWeight !== undefined),
						onclick: logWeight,
					},
				]
			case 'gyms':
				return [
					{
						label: $t('domains.fitness.gyms.add'),
						icon: 'plus',
						variant: quiet(fitness.gyms.length > 0),
						onclick: () => show({ sheet: 'gym' }),
					},
				]
			case 'supplements':
				return [
					{
						label: $t('domains.fitness.supplements.add'),
						icon: 'pill',
						variant: quiet(fitness.supplements.length > 0),
						onclick: () => show({ sheet: 'supplement' }),
					},
				]
		}
		return []
	})
</script>

<div class="page">
	<PageHeader
		name={$t('domains.fitness.name')}
		subtitle={$t('domains.fitness.subtitle')}
		icon={domainGlyph('fitness')}
		{actions}
	>
		{#snippet filters()}
			<Segmented
				items={tabItems}
				selected={FITNESS_TABS.indexOf(tab)}
				label={$t('domains.fitness.tabsLabel')}
				onchange={selectTab}
			/>
		{/snippet}
	</PageHeader>

	{#if fitness.saveFailed}
		<div class="notice">
			<InlineError message={$t('domains.fitness.saveFailed')} onretry={() => fitness.flush()} live />
		</div>
	{/if}

	{#if tab === 'workouts'}
		<Workouts
			onstart={(template) => show({ sheet: 'log', template })}
			onplan={(template) => show({ sheet: 'plan', template })}
			onedit={(template) => show({ sheet: 'template', template })}
			onsample={seed}
		/>
	{:else if tab === 'history'}
		<History onlog={() => show({ sheet: 'log' })} onsample={seed} />
	{:else if tab === 'body'}
		<Body
			onlogweight={logWeight}
			onsetgoal={() => show({ sheet: 'goal' })}
			onlogmetric={(kind) => show({ sheet: 'metric', kind })}
			onsample={seed}
		/>
	{:else if tab === 'gyms'}
		<Gyms onedit={(gym) => show({ sheet: 'gym', gym })} onsample={seed} />
	{:else}
		<Supplements onedit={(supplement) => show({ sheet: 'supplement', supplement })} onsample={seed} />
	{/if}
</div>

{#key opened}
	{#if current?.sheet === 'log'}
		<LogSheet bind:open={shown} template={current.template} />
	{:else if current?.sheet === 'template'}
		<TemplateSheet bind:open={shown} template={current.template} />
	{:else if current?.sheet === 'plan'}
		<PlanSheet bind:open={shown} template={current.template} />
	{:else if current?.sheet === 'goal'}
		<GoalSheet bind:open={shown} />
	{:else if current?.sheet === 'metric'}
		<MetricSheet bind:open={shown} kind={current.kind} />
	{:else if current?.sheet === 'gym'}
		<GymSheet bind:open={shown} gym={current.gym} />
	{:else if current?.sheet === 'supplement'}
		<SupplementSheet bind:open={shown} supplement={current.supplement} />
	{/if}
{/key}

<style>
	.page {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.notice {
		padding: 0 var(--ed-gutter) var(--space-4);
	}
</style>
