<script lang="ts">
	// Orchard's Budget (product/domains/finance.md §2, design/screens.md `orchard-budget`): September 2026, with
	// Planned, Spent and Left at the top, then the fixed lines (D-16), the variable ones and the sinking funds. Each
	// line reads what was spent of what was planned over a meter, with any rollover; a line over budget says by how
	// much in the danger tone, so colour is never the only sign. The meter is story-local: a kit progress meter is a
	// handoff to #84. Story-only.
	import { EmptyState, Icon, IconButton, Menu, Stat, type MenuItem, type PageHeaderAction } from '$lib/index.js'
	import OrchardPage, { STALE_AS_OF, formatMoney, majorOf, usdOf, type Money } from './OrchardPage.svelte'
	import { orchardBudget, orchardSinkingFunds } from '../../sample-data.js'

	type Props = {
		/** No budget yet. */
		empty?: boolean
		/** Chase needs a sign-in. */
		stale?: boolean
		ondraft?: () => void
		onedit?: (category: string) => void
		onreconnect?: () => void
		onnavigate?: (id: string) => void
	}
	let { empty = false, stale = false, ondraft, onedit, onreconnect, onnavigate }: Props = $props()

	const uid = $props.id()
	type Line = { id: string; name: string; used: Money; of: Money; detail?: string; rollover?: Money }
	const lineOf = (line: (typeof orchardBudget.lines)[number]): Line => ({
		id: line.category,
		name: line.category,
		used: line.spent,
		of: line.planned,
		rollover: line.rollover,
	})
	const GROUPS: { id: string; title: string; lines: Line[]; icon?: 'piggy-bank' }[] = [
		{
			id: 'fixed',
			title: 'Fixed',
			lines: orchardBudget.lines.filter((line) => line.group === 'fixed').map(lineOf),
		},
		{
			id: 'variable',
			title: 'Variable',
			lines: orchardBudget.lines.filter((line) => line.group === 'variable').map(lineOf),
		},
		{
			id: 'sinking',
			title: 'Sinking funds',
			icon: 'piggy-bank',
			lines: orchardSinkingFunds.map((fund) => ({
				id: fund.id,
				name: fund.name,
				used: fund.saved,
				of: fund.target,
				detail: [`by ${fund.by}`, fund.monthly ? `${formatMoney(fund.monthly)} a month` : undefined]
					.filter(Boolean)
					.join(' · '),
			})),
		},
	]
	const planned = usdOf(orchardBudget.lines.reduce((sum, line) => sum + line.planned.minor, 0))
	const spent = usdOf(orchardBudget.lines.reduce((sum, line) => sum + line.spent.minor, 0))
	const left = usdOf(planned.minor - spent.minor)

	const actions = $derived<PageHeaderAction[]>([
		{ label: 'Draft with the Gardener', icon: 'sparkles', onclick: ondraft },
	])

	let menuFor = $state<{ line: Line; anchor: HTMLElement }>()
	let menuOpen = $state(false)
	const ITEMS: MenuItem[] = [{ id: 'edit', label: 'Edit line', icon: 'pencil' }]
</script>

<OrchardPage tab="Budget" {actions} {stale} {onreconnect} {onnavigate}>
	{#snippet children(_platform)}
		{#if empty}
			<EmptyState
				title="No budget yet"
				text="The Gardener drafts one from your last months: fixed lines from your bills, the rest from what you spend."
				action={{ label: 'Draft with the Gardener', icon: 'sparkles', onclick: ondraft }}
			/>
		{:else}
			<div class="body">
				<div class="totals">
					<p class="month">{orchardBudget.month}</p>
					<dl class="figures">
						<div class="figure">
							<dt>Planned</dt>
							<dd><Stat value={formatMoney(planned)} size="md" /></dd>
						</div>
						<div class="figure">
							<dt>Spent</dt>
							<dd><Stat value={formatMoney(spent)} size="md" /></dd>
						</div>
						<div class="figure">
							<dt>Left</dt>
							<dd><Stat value={formatMoney(left)} size="md" /></dd>
						</div>
					</dl>
					{#if stale}<p class="note">Spent includes Chase {STALE_AS_OF}</p>{/if}
				</div>

				{#each GROUPS as group (group.id)}
					<section class="card" aria-labelledby="{uid}-{group.id}">
						<div class="group-head">
							{#if group.icon}<span class="glyph"><Icon name={group.icon} size="sm" /></span>{/if}
							<h2 class="group-title" id="{uid}-{group.id}">{group.title}</h2>
						</div>
						<ul class="lines">
							{#each group.lines as line (line.id)}
								{@const over = line.used.minor - line.of.minor}
								<li class="line">
									<div class="line-head">
										<span class="name">{line.name}</span>
										<span class="figure-text">{formatMoney(line.used)} of {formatMoney(line.of)}</span>
										<span class="menu">
											<IconButton
												icon="ellipsis"
												size="sm"
												label="Actions for {line.name}"
												aria-haspopup="menu"
												aria-expanded={menuOpen && menuFor?.line.id === line.id}
												onclick={(event) => {
													menuFor = { line, anchor: event.currentTarget }
													menuOpen = true
												}}
											/>
										</span>
									</div>
									<div
										class={['meter', { 'meter-over': over > 0 }]}
										role="meter"
										aria-label={line.name}
										aria-valuemin={0}
										aria-valuemax={majorOf(line.of)}
										aria-valuenow={majorOf(line.used)}
										aria-valuetext="{formatMoney(line.used)} of {formatMoney(line.of)}"
										style:--fill="{Math.min(100, (line.used.minor / line.of.minor) * 100)}%"
									>
										<span class="meter-fill"></span>
									</div>
									{#if over > 0 || line.rollover || line.detail}
										<p class="line-foot">
											{#if over > 0}<span class="cost">Over by {formatMoney(usdOf(over))}</span>{/if}
											{#if line.rollover}<span>{formatMoney(line.rollover, { sign: true })} rolled over</span>{/if}
											{#if line.detail}<span>{line.detail}</span>{/if}
										</p>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
			<Menu
				bind:open={menuOpen}
				anchor={menuFor?.anchor}
				align="end"
				label="Actions for {menuFor?.line.name ?? 'this line'}"
				items={ITEMS}
				onselect={() => menuFor && onedit?.(menuFor.line.id)}
			/>
		{/if}
	{/snippet}
</OrchardPage>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.totals {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.month {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.figures {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-6);
		margin: 0;
	}
	.figure {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.figure dt {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.figure dd {
		margin: 0;
	}
	.note {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
	}
	.group-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.glyph {
		display: inline-flex;
		color: var(--text-secondary);
	}
	.group-title {
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
	}
	.lines {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.line {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) 0;
	}
	.line + .line {
		border-top: 1px solid var(--stroke-subtle);
	}
	.line-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.name {
		flex: 1;
		min-width: 0;
		font: var(--ed-t-text);
	}
	.figure-text {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.menu {
		display: inline-flex;
	}
	.meter {
		overflow: hidden;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--ed-meter-track);
	}
	.meter-fill {
		display: block;
		width: var(--fill);
		height: 100%;
		border-radius: inherit;
		background: var(--brand-primary);
	}
	.meter-over .meter-fill {
		background: var(--danger);
	}
	.line-foot {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.cost {
		color: var(--danger);
	}
</style>
