<script lang="ts">
	// Lean mode's card (product/domains/finance.md §6, #80, D-198), above the accounts while a source carries
	// `leanSince`: how many months the liquid money lasts on the essentials and at the usual spending, the essential
	// categories and what repeats outside them, the things to pause. With no complete month of spending only the
	// heading and a line show. Rows do not act (D-118). Every figure goes through `formatMoney`, so Hide amounts masks
	// it; the month counts are not money.
	import { Button, List, Skeleton, Stat, type ListRowData } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { formatMoney, money, type Money } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { finance } from '../store.svelte.js'
	import { dayLine, monthLine } from '../words.js'

	const uid = $props.id()
	const lang = $derived(settings.language)
	const amount = (value: Money) => formatMoney(value, lang)
	const perMonth = (value: Money) => $t('domains.finance.lean.perMonth', { values: { amount: amount(value) } })
	const monthsOf = (months: number) => $t('domains.finance.lean.months', { values: { months } })

	/** Lean mode is on: the sources are read before the ledger, so the card's frame can wait for the figures. */
	const on = $derived(finance.incomeSources.some((source) => source.leanSince))
	const lean = $derived(finance.income?.lean)
	const runway = $derived(lean && !('reason' in lean.runway) ? lean.runway : undefined)

	const names = $derived(new Map(finance.categories.map((category) => [category.id, category.name])))
	const essentials = $derived<ListRowData[]>(
		(lean?.essentials ?? []).map((line) => ({ id: line.categoryId, primary: line.name, meta: perMonth(line.amount) }))
	)
	const pause = $derived<ListRowData[]>(
		(lean?.pause ?? []).map((entry) => ({
			id: entry.merchantId,
			primary: entry.name,
			secondary: (entry.categoryId && names.get(entry.categoryId)) || $t('domains.finance.lean.uncategorised'),
			meta: perMonth(entry.amount),
		}))
	)
	const pauseTotal = $derived.by(() => {
		const list = lean?.pause ?? []
		const home = settings.homeCurrency
		return money(
			list.reduce((sum, entry) => sum + entry.amount.minor, 0),
			home
		)
	})

	function end() {
		const undo = finance.endLean()
		if (undo) undoToast($t('domains.finance.toasts.leanOff'), undo)
	}
</script>

{#if on && !finance.empty}
	<div class="lean">
		{#if !lean}
			<div class="card" aria-busy="true"><Skeleton rows={3} /></div>
		{:else}
			<section class="card" aria-labelledby="{uid}-title">
				<div class="heading">
					<div class="what">
						<h2 class="title" id="{uid}-title">{$t('domains.finance.lean.title')}</h2>
						<span class="caption"
							>{$t('domains.finance.lean.since', { values: { day: dayLine(lean.since, lang) } })}</span
						>
					</div>
					<Button label={$t('domains.finance.lean.end')} variant="secondary" onclick={end} />
				</div>

				{#if !runway}
					<p class="quiet">{$t('domains.finance.lean.noHistory')}</p>
				{:else}
					{#if runway.covered}
						<p class="line">{$t('domains.finance.lean.covered')}</p>
					{:else}
						<dl class="figures">
							<div class="figure">
								<dt>{$t('domains.finance.lean.onEssentials')}</dt>
								<dd>
									<Stat value={monthsOf(runway.months ?? 0)} size="md" />
									{#if runway.until}
										<span class="caption">
											{$t('domains.finance.lean.until', { values: { month: monthLine(runway.until, lang, true) } })}
										</span>
									{/if}
								</dd>
							</div>
							{#if runway.usualMonths !== undefined}
								<div class="figure">
									<dt>{$t('domains.finance.lean.atUsual')}</dt>
									<dd><Stat value={monthsOf(runway.usualMonths)} size="md" /></dd>
								</div>
							{/if}
						</dl>
					{/if}

					<section class="part" aria-labelledby="{uid}-essentials">
						<h3 class="label" id="{uid}-essentials">{$t('domains.finance.lean.essentials')}</h3>
						{#if essentials.length}
							<List labelledby="{uid}-essentials" rows={essentials} />
						{/if}
						<p class="caption">
							{$t('domains.finance.lean.total', { values: { amount: amount(runway.essentials) } })}
						</p>
					</section>

					<section class="part" aria-labelledby="{uid}-pause">
						<h3 class="label" id="{uid}-pause">{$t('domains.finance.lean.pause')}</h3>
						{#if pause.length}
							<List labelledby="{uid}-pause" rows={pause} />
							<p class="caption">{$t('domains.finance.lean.total', { values: { amount: amount(pauseTotal) } })}</p>
						{:else}
							<p class="caption">{$t('domains.finance.lean.nothing')}</p>
						{/if}
					</section>
				{/if}
			</section>
		{/if}
	</div>
{/if}

<style>
	.lean {
		padding: 0 var(--ed-gutter) var(--space-6);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
		padding: var(--space-4);
		background: var(--surface-1);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
	}
	.heading {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}
	.what {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		min-width: 0;
	}
	.title {
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		color: var(--text-primary);
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
		min-width: 0;
	}
	.figure dt {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.figure dd {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.part {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.label {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.caption {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.line,
	.quiet {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		color: var(--text-primary);
	}
	.quiet {
		color: var(--text-secondary);
	}
</style>
