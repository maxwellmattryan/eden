<script lang="ts">
	// Toolbench's Ideas view (product/domains/toolbench.md, "Surfaces"): the inbox of ideas with a status filter and a
	// detail pane showing the log and the brainstorm thread. Capture an idea is the primary action; the quick-add line
	// files one in five seconds. Each row names its area and status; an idea nobody has touched for weeks carries the
	// days in its meta. The brainstorm is a Thread of GardenerMessages in the Gardener's green (D-40), attached to the idea.
	import {
		Badge,
		Button,
		Chip,
		EmptyState,
		GardenerMessage,
		List,
		PageHeader,
		QuickAdd,
		Segmented,
		Thread,
		domainGlyph,
		type ListRowData,
		type MenuItem,
	} from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import { ideaLog, ideas, projects, sidebar } from '../../sample-data.js'

	type Idea = (typeof ideas)[number]
	type Status = Idea['status']

	type Props = {
		/** The status chip that is on; none shows every idea but the archived. */
		status?: Status
		/** No ideas at all. */
		empty?: boolean
		/** The idea open in the detail pane. */
		selected?: string
		oncapture?: () => void
		onadd?: (text: string) => void
		onopen?: (row: ListRowData) => void
		onaction?: (item: MenuItem, row: ListRowData) => void
		onfilter?: (status: Status | undefined) => void
		onbrainstorm?: () => void
		onsample?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		status,
		empty = false,
		selected = 'i-02',
		oncapture,
		onadd,
		onopen,
		onaction,
		onfilter,
		onbrainstorm,
		onsample,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const toolbench = sidebar.items.find((entry) => entry.id === 'toolbench')!
	const TABS = ['Ideas', 'Projects', 'Lab', 'Studio', 'Notes']
	const STATUSES: { id: Status; label: string }[] = [
		{ id: 'idea', label: 'Idea' },
		{ id: 'exploring', label: 'Exploring' },
		{ id: 'building', label: 'Building' },
		{ id: 'archived', label: 'Archived' },
	]
	const rowActions: MenuItem[] = [
		{ id: 'status', label: 'Change status', icon: 'arrow-right' },
		{ id: 'brainstorm', label: 'Brainstorm', icon: 'sparkles' },
		{ id: 'archive', label: 'Archive', icon: 'circle-check' },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
	]
	const count = (id: Status) => ideas.filter((idea) => idea.status === id).length

	const toRow = (idea: Idea): ListRowData => ({
		id: idea.id,
		primary: idea.title,
		icon: 'lightbulb',
		chips: [{ label: idea.area }],
		badges: [{ kind: 'neutral', label: idea.status }],
		meta: 'untouchedDays' in idea ? `${idea.untouchedDays} days` : undefined,
		metaWarn: 'untouchedDays' in idea,
		actions: rowActions,
	})
	const shown = $derived(
		empty ? [] : ideas.filter((idea) => (status ? idea.status === status : idea.status !== 'archived'))
	)
	const rows = $derived(shown.map(toRow))
	/** The pane follows the filter: the selected idea while it is in the list, else the first one that is. */
	const detail = $derived(shown.find((idea) => idea.id === selected) ?? shown[0])
	const log = $derived(detail?.id === ideaLog.ideaId ? ideaLog : undefined)
	const project = $derived(detail?.status === 'building' ? projects[0] : undefined)
	const headerActions = $derived([
		{
			label: 'Capture an idea',
			icon: 'lightbulb' as const,
			variant: empty ? ('secondary' as const) : undefined,
			onclick: oncapture,
		},
	])
</script>

<AppFrame current="toolbench" {onnavigate}>
	{#snippet children(_platform)}
		<div class="page">
			<PageHeader
				name={toolbench.name}
				subtitle={toolbench.subtitle}
				icon={domainGlyph('toolbench')}
				actions={headerActions}
			>
				{#snippet filters()}
					<Segmented items={TABS} selected={0} label="Toolbench sections" />
					{#each STATUSES as item (item.id)}
						<Chip
							label={item.label}
							count={count(item.id)}
							tone="outline"
							selectable
							selected={status === item.id}
							onselect={(on) => onfilter?.(on ? item.id : undefined)}
						/>
					{/each}
				{/snippet}
			</PageHeader>

			{#if empty}
				<EmptyState
					title="No ideas yet"
					text="Capture one in five seconds and file it later. The good ones grow into projects."
					action={{ label: 'Capture an idea', icon: 'lightbulb', onclick: oncapture }}
					sample={{ onclick: onsample }}
				/>
			{:else}
				<div class={['body', { 'body-wide': detail }]}>
					<div class="lists">
						<QuickAdd placeholder="Capture an idea" onadd={(text) => onadd?.(text)} />
						<List header="Ideas" count={rows.length} {rows} selectable {onopen} {onaction} />
					</div>

					{#if detail}
						<aside class="detail" aria-labelledby="{uid}-detail">
							<h2 class="detail-title" id="{uid}-detail">{detail.title}</h2>
							<dl class="fields">
								<dt>Status</dt>
								<dd><Badge kind="neutral" label={detail.status} /></dd>
								<dt>Area</dt>
								<dd><Chip label={detail.area} /></dd>
								{#if project}
									<dt>Project</dt>
									<dd class="mono">{project.repo}</dd>
								{/if}
							</dl>

							<section class="block" aria-labelledby="{uid}-log">
								<h3 class="block-title" id="{uid}-log">Log</h3>
								{#if log}
									<ol class="log">
										{#each log.entries as entry (entry.id)}
											<li class="log-row"><span class="mono log-when">{entry.when}</span><span>{entry.line}</span></li>
										{/each}
									</ol>
								{:else}
									<p class="quiet">No log yet.</p>
								{/if}
							</section>

							<section class="block" aria-labelledby="{uid}-brainstorm">
								<h3 class="block-title" id="{uid}-brainstorm">Brainstorm</h3>
								{#if log}
									<Thread label="Brainstorm with the Gardener">
										{#each log.brainstorm as message (message.id)}
											<GardenerMessage text={message.text} owner={message.owner} />
										{/each}
									</Thread>
								{:else}
									<div>
										<Button label="Brainstorm with the Gardener" variant="ai" icon="sparkles" onclick={onbrainstorm} />
									</div>
								{/if}
							</section>
						</aside>
					{/if}
				</div>
			{/if}
		</div>
	{/snippet}
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.body {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.body-wide {
		grid-template-columns: minmax(0, 1fr) var(--sheet-md);
		align-items: start;
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
