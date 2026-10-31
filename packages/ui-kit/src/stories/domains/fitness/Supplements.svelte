<script lang="ts">
	// Vigor's Supplements view (product/domains/fitness.md, "Surfaces"): each supplement with its brand, dose and when
	// it is taken, its last intake, and Took it, which logs one now with undo. The open one shows its intake log, newest
	// first, and the Hearth stock item it is kept as, read from that row, with Open in Hearth; or that it is not
	// linked. The form is a sheet: name, brand, dose, when, and a stock item to link. Story-only.
	import { BackButton, Badge, Button, EmptyState, Field, Select, Sheet, type PageHeaderAction } from '$lib/index.js'
	import VigorPage, { dayLabel } from './VigorPage.svelte'
	import { intakeLog, stock, supplements, type SampleSupplement } from '../../sample-data.js'

	type Props = {
		empty?: boolean
		selected?: string
		/** The phone with the open supplement pushed over the list. */
		pushed?: boolean
		/** The form open on the selected supplement. */
		editing?: boolean
		onadd?: () => void
		ontook?: (id: string) => void
		onopenstock?: (name: string) => void
		onsave?: () => void
		onsample?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		empty = false,
		selected = 'su-01',
		pushed = false,
		editing = false,
		onadd,
		ontook,
		onopenstock,
		onsave,
		onsample,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const list = $derived(empty ? [] : supplements)
	// svelte-ignore state_referenced_locally
	let current = $state(selected)
	const detail = $derived(list.find((entry) => entry.id === current))
	const WHEN = { daily: 'daily', 'pre-workout': 'pre-workout', 'as-needed': 'as needed' } as const
	/** A sample intake's day and time as the page writes them: today, yesterday, or the day. */
	const when = (day: string, time: string) =>
		`${day === '09-30' ? 'today' : day === '09-29' ? 'yesterday' : dayLabel(day)} ${time}`
	const intakesOf = (id: string) => intakeLog.filter((entry) => entry.supplementId === id).slice(0, 30)
	const lastOf = (id: string) => {
		const last = intakesOf(id)[0]
		return last ? when(last.day, last.time) : 'not taken yet'
	}
	const details = (entry: SampleSupplement) => [entry.brand, entry.dose, WHEN[entry.when]].filter(Boolean).join(' · ')
	const stockOf = (entry: SampleSupplement) =>
		entry.stockItem ? stock.find((item) => item.name === entry.stockItem) : undefined

	const formOf = (entry?: SampleSupplement) => ({
		name: entry?.name ?? '',
		brand: entry?.brand ?? '',
		dose: entry?.dose ?? '',
		when: entry?.when ?? 'daily',
		stockItem: entry?.stockItem ? (stock.find((item) => item.name === entry.stockItem)?.id ?? '') : '',
	})
	// svelte-ignore state_referenced_locally
	let formOpen = $state(editing)
	let form = $state(formOf(supplements.find((entry) => entry.id === selected)))
	function open(entry?: SampleSupplement) {
		form = formOf(entry)
		formOpen = true
		if (!entry) onadd?.()
	}

	const actions = $derived<PageHeaderAction[]>([
		{ label: 'Add supplement', icon: 'pill', variant: empty ? 'secondary' : undefined, onclick: () => open() },
	])
</script>

{#snippet pane(entry: SampleSupplement)}
	{@const item = stockOf(entry)}
	<div>
		<h2 class="detail-title" id="{uid}-detail">{entry.name}</h2>
		<p class="detail-meta">{details(entry)}</p>
	</div>
	<div class="stock">
		{#if item}
			<span>Hearth: {item.name}, <span class="mono">{item.qty} {item.unit ?? ''}</span> left</span>
			{#if item.lowStock}<Badge kind="warning" label="low stock" />{/if}
			<Button label="Open in Hearth" variant="quiet" icon="arrow-up-right" onclick={() => onopenstock?.(item.name)} />
		{:else}
			<span class="voice">Not linked to stock</span>
		{/if}
	</div>
	<section class="intakes" aria-labelledby="{uid}-intakes">
		<h3 class="intakes-title" id="{uid}-intakes">Intake log</h3>
		<ul class="intake-list">
			{#each intakesOf(entry.id) as intake (intake.id)}
				<li class="mono">{when(intake.day, intake.time)}</li>
			{/each}
		</ul>
	</section>
	<div class="detail-actions">
		<Button label="Edit" icon="pencil" onclick={() => open(entry)} />
	</div>
{/snippet}

<VigorPage tab="Supplements" {actions} {onnavigate}>
	{#snippet children(platform)}
		{#if empty}
			<EmptyState
				title="No supplements yet"
				text="Add what you take and when, and log a dose with one press. Link it to Hearth to keep it stocked."
				action={{ label: 'Add supplement', icon: 'pill', onclick: () => open() }}
				sample={{ onclick: onsample }}
			/>
		{:else if platform === 'mobile' && pushed && detail}
			<div class="body">
				<BackButton breadcrumb="Supplements" onback={() => (pushed = false)} />
				<section class="detail" aria-labelledby="{uid}-detail">{@render pane(detail)}</section>
			</div>
		{:else}
			<div class={['body', { 'body-wide': platform === 'desktop' && detail }]}>
				<ul class="rows" aria-label="Supplements">
					{#each list as entry (entry.id)}
						<li class={['row', { current: platform === 'desktop' && entry.id === current }]}>
							<button
								class="open"
								type="button"
								aria-current={platform === 'desktop' && entry.id === current ? 'true' : undefined}
								onclick={() => {
									current = entry.id
									if (platform === 'mobile') pushed = true
								}}
							>
								<span class="name">{entry.name}</span>
								<span class="secondary">{details(entry)}</span>
							</button>
							<span class="last">{lastOf(entry.id)}</span>
							<Button label="Took it" aria-label="Took {entry.name}" icon="check" onclick={() => ontook?.(entry.id)} />
						</li>
					{/each}
				</ul>
				{#if platform === 'desktop' && detail}
					<aside class="detail" aria-labelledby="{uid}-detail">{@render pane(detail)}</aside>
				{/if}
			</div>
		{/if}

		<Sheet bind:open={formOpen} size="md" labelledby="{uid}-form-title">
			{#snippet header()}
				<h2 class="form-title" id="{uid}-form-title">{form.name ? 'Edit supplement' : 'Add supplement'}</h2>
			{/snippet}
			<form
				class="form"
				id="{uid}-form"
				onsubmit={(event) => {
					event.preventDefault()
					onsave?.()
					formOpen = false
				}}
			>
				<Field label="Name" bind:value={form.name} />
				<div class="pair">
					<Field label="Brand" bind:value={form.brand} />
					<Field label="Dose" bind:value={form.dose} />
				</div>
				<Select
					label="When"
					options={[
						{ value: 'daily', label: 'Daily' },
						{ value: 'pre-workout', label: 'Pre-workout' },
						{ value: 'as-needed', label: 'As needed' },
					]}
					bind:value={form.when}
				/>
				<Select
					label="Stock item"
					placeholder="Not linked"
					options={stock.map((item) => ({ value: item.id, label: item.name }))}
					bind:value={form.stockItem}
				/>
			</form>
			{#snippet footer()}
				<Button label="Cancel" variant="quiet" onclick={() => (formOpen = false)} />
				<Button
					label="Save"
					variant="primary"
					type="submit"
					form="{uid}-form"
					disabled={!form.name.trim() || !form.dose.trim()}
				/>
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
	/* The rows: a card like a List's, each row a button that opens it, its last intake, and Took it */
	.rows {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		overflow: hidden;
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
	}
	.row + .row {
		border-top: 1px solid var(--stroke-subtle);
	}
	.row:hover {
		background: var(--surface-2);
	}
	.row.current {
		background: var(--brand-muted);
	}
	.open {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-1);
		margin: 0;
		padding: var(--space-1);
		border: 0;
		border-radius: var(--ed-radius-control);
		background: none;
		color: var(--text-primary);
		text-align: start;
		cursor: pointer;
	}
	.open:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.name {
		font: var(--ed-t-text);
		font-weight: 500;
	}
	.secondary {
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.last,
	.mono {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
	}
	.last {
		color: var(--text-secondary);
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
	.detail-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
	}
	.detail-meta {
		margin: var(--space-1) 0 0;
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.stock {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.voice {
		color: var(--text-secondary);
	}
	.intakes {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.intakes-title {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.intake-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.detail-actions {
		display: flex;
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
</style>
