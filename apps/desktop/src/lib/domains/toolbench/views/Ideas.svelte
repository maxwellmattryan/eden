<script lang="ts">
	// Toolbench's Ideas view, ported from Domains/Toolbench/Ideas: the quick-add line that files an idea in five
	// seconds, the inbox as a List with the area, the status and the days an idea has rested, and the selected idea in
	// a detail pane with its fields, its log and its brainstorm thread. The thread shows stored messages; the button
	// opens the Gardener on the idea and runs its brainstorm, which appends to the thread (D-76).
	import {
		BackButton,
		Badge,
		Button,
		Chip,
		EmptyState,
		GardenerMessage,
		List,
		QuickAdd,
		Thread,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { gardenerUi } from '@eden/shared/shell/gardener'
	import { showPushed } from '@eden/shared/shell'
	import { undoToast } from '@eden/shared/shell'
	import { formatDay } from '@eden/shared/dates'
	import { ideaChips } from '@eden/shared/domains/toolbench'
	import { IDEA_STATUSES, RESURFACE_DAYS, toolbench, type Idea, type IdeaStatus } from '@eden/shared/domains/toolbench'

	type Props = {
		/** The id the page's Capture action focuses. */
		quickAddId: string
		/** The status chip that is on; none shows every idea but the archived. */
		status?: IdeaStatus
		/** Capture an idea, the empty state's primary action. */
		oncapture: () => void
	}
	let { quickAddId, status, oncapture }: Props = $props()

	const uid = $props.id()
	const statusLabel = (id: IdeaStatus) => $t(`domains.toolbench.ideas.status.${id}`)

	const moveItems = (idea: Idea): MenuItem[] =>
		IDEA_STATUSES.filter((id) => id !== 'archived' && id !== idea.status).map((id) => ({
			id: `move:${id}`,
			label: $t('domains.toolbench.ideas.actions.moveTo', { values: { status: statusLabel(id) } }),
			icon: 'arrow-right' as const,
		}))
	const actionsFor = (idea: Idea): MenuItem[] => [
		...moveItems(idea),
		...(idea.status !== 'archived'
			? [{ id: 'archive', label: $t('domains.toolbench.ideas.actions.archive'), icon: 'circle-check' as const }]
			: []),
		{ id: 'delete', label: $t('domains.toolbench.ideas.actions.delete'), icon: 'trash', destructive: true },
	]
	const toRow = (idea: Idea): ListRowData => {
		const days = toolbench.untouchedDays(idea)
		const rested = days >= RESURFACE_DAYS
		return {
			id: idea.id,
			primary: idea.title,
			icon: 'lightbulb',
			chips: [{ label: idea.area }],
			badges: [{ kind: 'neutral', label: statusLabel(idea.status) }],
			meta: rested ? $t('domains.toolbench.ideas.untouched', { values: { days } }) : undefined,
			metaWarn: rested,
			actions: actionsFor(idea),
		}
	}

	const shown = $derived(status ? toolbench.ideas.filter((idea) => idea.status === status) : toolbench.active)
	const rows = $derived(shown.map(toRow))
	/** The pane follows the filter: the selected idea while it is in the list, else the first one that is. */
	let selected = $state<string | undefined>(toolbench.reveal)
	toolbench.reveal = undefined
	const detail = $derived(shown.find((idea) => idea.id === selected) ?? shown[0])
	const project = $derived(detail ? toolbench.projectOf(detail) : undefined)
	// In a narrow page the list stands alone until an idea is picked; then the pane takes its place, under a back
	// arrow (a pushed view).
	const picked = $derived(shown.some((idea) => idea.id === selected))
	let back = $state<HTMLElement>()
	function open(id: string) {
		selected = id
		void showPushed(() => back)
	}

	function act(action: string, id: string) {
		const idea = toolbench.ideas.find((entry) => entry.id === id)
		if (!idea) return
		if (action.startsWith('move:')) {
			const next = action.slice('move:'.length) as IdeaStatus
			const { undo } = toolbench.setStatus(id, next, statusLabel(next))
			undoToast(
				$t('domains.toolbench.ideas.toast.moved', { values: { title: idea.title, status: statusLabel(next) } }),
				undo
			)
		} else if (action === 'archive') {
			const { undo } = toolbench.setStatus(id, 'archived', statusLabel('archived'))
			undoToast($t('domains.toolbench.ideas.toast.archived', { values: { title: idea.title } }), undo)
		} else if (action === 'delete') {
			const { undo } = toolbench.remove(id)
			undoToast($t('domains.toolbench.ideas.toast.deleted', { values: { title: idea.title } }), undo)
		}
	}
	function onaction(menuItem: MenuItem, row: ListRowData) {
		act(menuItem.id ?? '', row.id)
	}
	function add(text: string) {
		const { idea, undo } = toolbench.capture(text)
		open(idea.id)
		undoToast($t('domains.toolbench.ideas.toast.captured', { values: { title: idea.title } }), undo)
	}
	function seed() {
		undoToast($t('common.sampleAdded'), toolbench.seed($t('domains.toolbench.name')))
	}
</script>

{#if toolbench.ideas.length === 0}
	<EmptyState
		title={$t('domains.toolbench.ideas.empty.title')}
		text={$t('domains.toolbench.ideas.empty.text')}
		action={{ label: $t('domains.toolbench.ideas.capture'), icon: 'lightbulb', onclick: oncapture }}
		sample={{ onclick: seed }}
	/>
{:else}
	<div class={['body', { 'body-wide': detail, 'body-open': picked }]}>
		<div class="lists">
			<QuickAdd
				id={quickAddId}
				placeholder={$t('domains.toolbench.ideas.addPlaceholder')}
				parse={ideaChips}
				onadd={add}
			/>
			<List
				header={$t('domains.toolbench.ideas.list')}
				count={rows.length}
				{rows}
				selectable
				onopen={(row) => open(row.id)}
				{onaction}
			/>
		</div>

		{#if detail}
			<aside class="detail" aria-labelledby="{uid}-detail">
				<div class="back" bind:this={back}><BackButton onback={() => (selected = undefined)} /></div>
				<h2 class="detail-title" id="{uid}-detail">{detail.title}</h2>
				<dl class="fields">
					<dt>{$t('domains.toolbench.ideas.detail.status')}</dt>
					<dd><Badge kind="neutral" label={statusLabel(detail.status)} /></dd>
					<dt>{$t('domains.toolbench.ideas.detail.area')}</dt>
					<dd><Chip label={detail.area} /></dd>
					{#if project?.repo}
						<dt>{$t('domains.toolbench.ideas.detail.project')}</dt>
						<dd class="mono">{project.repo}</dd>
					{/if}
				</dl>

				<section class="block" aria-labelledby="{uid}-log">
					<h3 class="block-title" id="{uid}-log">{$t('domains.toolbench.ideas.detail.log')}</h3>
					{#if detail.log.length}
						<ol class="log">
							{#each detail.log as entry (entry.id)}
								<li class="log-row">
									<span class="mono log-when">{formatDay(entry.at)}</span>
									<span>{entry.line ?? (entry.key ? $t(entry.key, { values: entry.values }) : '')}</span>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="quiet">{$t('domains.toolbench.ideas.noLog')}</p>
					{/if}
				</section>

				<section class="block" aria-labelledby="{uid}-brainstorm">
					<h3 class="block-title" id="{uid}-brainstorm">{$t('domains.toolbench.ideas.detail.brainstorm')}</h3>
					{#if detail.brainstorm.length}
						<Thread label={$t('domains.toolbench.ideas.brainstormWith')}>
							{#each detail.brainstorm as message (message.id)}
								<GardenerMessage text={message.text} owner={message.owner} />
							{/each}
						</Thread>
					{/if}
					<div>
						<Button
							label={$t('domains.toolbench.ideas.brainstormWith')}
							variant="ai"
							icon="sparkles"
							onclick={() =>
								gardenerUi.show('toolbench', [`eden://idea/${detail.id}`], {
									tool: 'toolbench.brainstorm',
									input: { ideaId: detail.id },
								})}
						/>
					</div>
				</section>
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
		grid-template-columns: minmax(0, 1fr) var(--sheet-md);
		align-items: start;
	}
	/* the way back from the open idea, which only a narrow page needs */
	.back {
		display: none;
	}
	/* narrow page */
	@container page (max-width: 48rem) {
		/* one column: the list until an idea is picked, then the idea in its place */
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

	/* The detail pane: the idea's title, its fields, the log, the brainstorm thread */
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
	.detail-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
	}
	.fields {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-2) var(--space-4);
		align-items: center;
		margin: 0;
	}
	.fields dt {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.fields dd {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.mono {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.block-title {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.log {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.log-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--stroke-subtle);
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.log-row:last-child {
		border-bottom: 0;
	}
	.log-when {
		flex: none;
		color: var(--text-secondary);
	}
	.quiet {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		color: var(--text-secondary);
	}
</style>
