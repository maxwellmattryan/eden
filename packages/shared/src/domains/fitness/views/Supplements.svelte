<script lang="ts">
	// Vigor's Supplements tab, ported from Domains/Vigor/Supplements: each supplement with its brand, dose and when it is
	// taken, its last intake and Took it, which logs one now with undo. The open one (pushed in a narrow page, D-112)
	// shows the Hearth stock item it is kept as, read from that row, with Open in Hearth, or that it is not linked, and
	// its last 30 intakes newest first. Edit opens the page's sheet; Delete comes with undo.
	import { BackButton, Button, EmptyState } from '@eden/ui-kit'
	import { locale, t } from '../../../i18n/index.js'
	import { holdBack, navigation } from '../../../navigation/index.js'
	import { settings } from '../../../settings/index.js'
	import { showPushed, undoToast } from '../../../shell/index.js'
	import { fitness } from '../store.svelte.js'
	import type { Supplement } from '../types.js'
	import { whenLine } from '../words.js'

	type Props = {
		onedit: (supplement?: Supplement) => void
		onsample: () => void
	}
	let { onedit, onsample }: Props = $props()

	const uid = $props.id()
	const format = $derived({ lang: $locale ?? 'en', clock: settings.clock })
	const when = (iso: string) => whenLine(iso, $t, format)
	const details = (entry: Supplement) =>
		[entry.brand, entry.dose, $t(`domains.fitness.supplements.when.${entry.when}`)].filter(Boolean).join(' · ')
	const lastOf = (entry: Supplement) => {
		const last = fitness.intakesOf(entry.id)[0]
		return last ? when(last.at) : $t('domains.fitness.supplements.notTaken')
	}

	let selected = $state<string>()
	const detail = $derived(fitness.supplements.find((entry) => entry.id === selected) ?? fitness.supplements[0])
	const stock = $derived(fitness.stockByUri(detail?.stockItemUri))
	const intakes = $derived(detail ? fitness.intakesOf(detail.id).slice(0, 30) : [])
	const picked = $derived(fitness.supplements.some((entry) => entry.id === selected))
	let back = $state<HTMLElement>()
	function open(id: string) {
		selected = id
		void showPushed(() => back)
	}
	$effect(() => (picked ? holdBack(() => ((selected = undefined), true)) : undefined))

	function took(entry: Supplement) {
		const done = fitness.took(entry.id)
		if (done) undoToast($t('garden.feed.supplementTaken', { values: { name: entry.name } }), done.undo)
	}
	function remove(entry: Supplement) {
		if (selected === entry.id) selected = undefined
		undoToast($t('garden.feed.supplementRemoved', { values: { name: entry.name } }), fitness.removeSupplement(entry.id))
	}
</script>

{#if !fitness.supplements.length}
	<EmptyState
		title={$t('domains.fitness.supplements.empty.title')}
		text={$t('domains.fitness.supplements.empty.text')}
		action={{ label: $t('domains.fitness.supplements.add'), icon: 'pill', onclick: () => onedit() }}
		sample={{ onclick: onsample }}
	/>
{:else}
	<div class={['body', { 'body-wide': detail, 'body-open': picked }]}>
		<ul class="rows" aria-label={$t('domains.fitness.supplements.list')}>
			{#each fitness.supplements as entry (entry.id)}
				<li class={['row', { current: entry.id === detail?.id }]}>
					<button
						class="open"
						type="button"
						aria-current={entry.id === detail?.id ? 'true' : undefined}
						onclick={() => open(entry.id)}
					>
						<span class="name">{entry.name}</span>
						<span class="secondary">{details(entry)}</span>
					</button>
					<span class="last">{lastOf(entry)}</span>
					<Button
						label={$t('domains.fitness.supplements.tookIt')}
						aria-label={$t('domains.fitness.supplements.took', { values: { name: entry.name } })}
						icon="check"
						onclick={() => took(entry)}
					/>
				</li>
			{/each}
		</ul>
		{#if detail}
			<aside class="detail" aria-labelledby="{uid}-detail">
				<div class="back" bind:this={back}><BackButton onback={() => (selected = undefined)} /></div>
				<div>
					<h2 class="detail-title" id="{uid}-detail">{detail.name}</h2>
					<p class="detail-meta">{details(detail)}</p>
				</div>
				<div class="stock">
					{#if stock}
						<span
							>{$t('domains.fitness.supplements.stock', {
								values: { name: stock.name, quantity: stock.quantity },
							})}</span
						>
						<Button
							label={$t('domains.fitness.supplements.openStock')}
							variant="quiet"
							icon="arrow-up-right"
							onclick={() => void navigation.open({ place: 'kitchen', tab: 'stock' })}
						/>
					{:else}
						<span class="quiet">{$t('domains.fitness.supplements.notLinked')}</span>
					{/if}
				</div>
				<section class="intakes" aria-labelledby="{uid}-intakes">
					<h3 class="intakes-title" id="{uid}-intakes">{$t('domains.fitness.supplements.intakes')}</h3>
					{#if intakes.length}
						<ul class="intake-list">
							{#each intakes as intake (intake.id)}
								<li class="mono">{when(intake.at)}</li>
							{/each}
						</ul>
					{:else}
						<p class="quiet">{$t('domains.fitness.supplements.noIntakes')}</p>
					{/if}
				</section>
				<div class="detail-actions">
					<Button label={$t('domains.fitness.edit')} icon="pencil" onclick={() => onedit(detail)} />
					<Button label={$t('domains.fitness.delete')} variant="danger" icon="trash" onclick={() => remove(detail)} />
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
		.body-open .rows {
			display: none;
		}
		.back {
			display: block;
		}
	}
	/* The rows: a card like a List's, each row a button that opens it, its last intake, and Took it (D-118: they open,
	   so they hover) */
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
		min-width: 0;
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
		min-width: 0;
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
	.quiet {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
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
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
