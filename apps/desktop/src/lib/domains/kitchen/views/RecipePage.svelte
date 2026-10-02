<script lang="ts">
	// A recipe as it is read, in the Recipes view's pane: its picture across the top (D-93), its name, who wrote it and
	// where it came from, then how long it takes, how many it serves and its tags. The servings step up and down and
	// the amounts follow (D-107); the view works out the lines for the servings shown and hands them here already
	// marked against the stock, so what this page says is in stock is what would be cooked. Ingredients sit beside the
	// steps and stay in view while the steps scroll.
	import { Badge, Button, Chip, Icon, IconButton, tooltip } from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import { MAX_SERVES, scalable, type Estimate, type IngredientStatus } from '@eden/shared/domains/kitchen'
	import { formatUsd } from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { kitchen, type Recipe } from '@eden/shared/domains/kitchen'

	type Props = {
		recipe: Recipe
		/** The heading's id, which the pane is labelled by. */
		id: string
		/** How many the recipe is being cooked for. */
		serves: number
		/** The ingredients for those servings, each marked against the stock. */
		status: IngredientStatus[]
		/** About what the missing ingredients cost to buy (D-105). */
		toBuy: Estimate
		/** The recipe names something the owner avoids (D-25). */
		avoided: boolean
		onserves: (serves: number) => void
		oncook: () => void
		onaddmissing: () => void
		onedit: () => void
		ondelete: () => void
	}
	let { recipe, id, serves, status, toBuy, avoided, onserves, oncook, onaddmissing, onedit, ondelete }: Props = $props()

	const image = $derived(kitchen.recipeImage(recipe))
	const missing = $derived(status.filter((line) => line.state === 'missing').length)
	const host = (url: string) => {
		try {
			return new URL(url).hostname.replace(/^www\./, '')
		} catch {
			return url
		}
	}
	/** What the recipe came from, by name: the name it was given, else its page's site. */
	const source = $derived(recipe.sourceName || (recipe.sourceUrl ? host(recipe.sourceUrl) : ''))
	const amount = (line: IngredientStatus) => [line.ingredient.qty, line.ingredient.unit].filter(Boolean).join(' ')
</script>

{#if image}
	<img class="banner" src={image} alt="" />
{:else}
	<div class="banner banner-none" aria-hidden="true"><Icon name="cooking-pot" /></div>
{/if}

<div class="page">
	<header class="head">
		<h2 class="title" {id}>{recipe.name}</h2>
		{#if recipe.author || source}
			<p class="credit">
				{#if recipe.author}
					<span>{$t('domains.kitchen.recipes.credit.by', { values: { author: recipe.author } })}</span>
				{/if}
				{#if recipe.author && source}<span aria-hidden="true">·</span>{/if}
				{#if source && recipe.sourceUrl}
					<button class="source" type="button" onclick={() => void openExternal(recipe.sourceUrl!)}>
						{source}<Icon name="external-link" size="sm" />
					</button>
				{:else if source}
					<span>{source}</span>
				{/if}
			</p>
		{/if}
	</header>

	<div class="facts">
		{#if recipe.minutes}
			<span class="fact">
				<Icon name="clock" size="sm" />
				{$t('domains.kitchen.recipes.minutes', { values: { minutes: recipe.minutes } })}
			</span>
		{/if}
		{#if scalable(recipe)}
			<span class="fact" role="group" aria-label={$t('domains.kitchen.recipes.servings.label')}>
				<span>{$t('domains.kitchen.recipes.servings.label')}</span>
				<IconButton
					icon="minus"
					size="xs"
					label={$t('domains.kitchen.recipes.servings.fewer')}
					disabled={serves <= 1}
					onclick={() => onserves(serves - 1)}
				/>
				<span class="serves" aria-live="polite">{serves}</span>
				<IconButton
					icon="plus"
					size="xs"
					label={$t('domains.kitchen.recipes.servings.more')}
					disabled={serves >= MAX_SERVES}
					onclick={() => onserves(serves + 1)}
				/>
				{#if serves !== recipe.serves}
					<IconButton
						icon="rotate-ccw"
						size="xs"
						label={$t('domains.kitchen.recipes.servings.reset', { values: { count: recipe.serves } })}
						tooltip
						onclick={() => onserves(recipe.serves)}
					/>
				{/if}
			</span>
		{:else}
			<span class="fact" {@attach tooltip($t('domains.kitchen.recipes.servings.fixed'))}>
				{$t('domains.kitchen.recipes.serves', { values: { count: recipe.serves } })}
			</span>
		{/if}
		{#if recipe.tags.length}
			<span class="tags">
				{#each recipe.tags as tag (tag)}
					<Chip label={tag} tone="outline" />
				{/each}
			</span>
		{/if}
	</div>

	{#if avoided}
		<p class="warn"><Badge kind="danger" label={$t('domains.kitchen.recipes.avoided')} /></p>
	{/if}
	{#if recipe.tip}
		<p class="tip">{recipe.tip}</p>
	{/if}

	<div class="cols">
		{#if status.length}
			<section class="part ingredients" aria-labelledby="{id}-ingredients">
				<h3 class="part-title" id="{id}-ingredients">{$t('domains.kitchen.recipes.ingredients')}</h3>
				<ul class="lines">
					{#each status as line, index (index)}
						<li class="line">
							<span class="amount">{amount(line)}</span>
							<span class="name">
								{line.ingredient.name}{#if line.ingredient.note}<span class="line-note">, {line.ingredient.note}</span
									>{/if}
							</span>
							{#if line.state === 'missing'}
								<Badge kind="warning" label={$t('domains.kitchen.recipes.missing')} />
							{:else if line.enough === false}
								<Badge kind="warning" label={$t('domains.kitchen.recipes.notEnough')} />
							{:else}
								<Badge kind="neutral" label={$t('domains.kitchen.recipes.inStock')} />
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#if recipe.steps.length}
			<section class="part" aria-labelledby="{id}-steps">
				<h3 class="part-title" id="{id}-steps">{$t('domains.kitchen.recipes.steps')}</h3>
				<ol class="steps" role="list">
					{#each recipe.steps as step, index (index)}
						<li class="step">
							<span class="numeral" aria-hidden="true">{index + 1}</span>
							<span class="step-text">{step}</span>
						</li>
					{/each}
				</ol>
			</section>
		{/if}
	</div>

	<footer class="foot">
		{#if toBuy.priced}
			<p class="quiet">
				{$t('domains.kitchen.recipes.missingEstimate', { values: { total: formatUsd(toBuy.total) } })}
				{#if toBuy.unpriced}
					{$t('domains.kitchen.recipes.missingUnpriced', { values: { count: toBuy.unpriced } })}
				{/if}
			</p>
		{/if}
		<div class="actions">
			<Button
				label={$t('domains.kitchen.recipes.actions.cook')}
				variant="primary"
				icon="cooking-pot"
				disabled={!recipe.ingredients.length}
				onclick={oncook}
			/>
			<Button
				label={$t('domains.kitchen.recipes.actions.addMissing', { values: { count: missing } })}
				icon="plus"
				disabled={!missing}
				onclick={onaddmissing}
			/>
			<Button label={$t('domains.kitchen.recipes.actions.edit')} variant="quiet" icon="pencil" onclick={onedit} />
			<Button label={$t('domains.kitchen.recipes.actions.delete')} variant="danger" icon="trash" onclick={ondelete} />
		</div>
	</footer>
</div>

<style>
	/* The picture runs edge to edge across the top of the card, inside its border */
	.banner {
		display: block;
		width: 100%;
		aspect-ratio: 21 / 9;
		border-radius: calc(var(--ed-radius-card) - 1px) calc(var(--ed-radius-card) - 1px) 0 0;
		object-fit: cover;
		background: var(--surface-2);
	}
	/* a recipe with no picture keeps a quieter band: the pot on the brand's ground, half as tall */
	.banner-none {
		display: grid;
		place-items: center;
		aspect-ratio: 42 / 9;
		background: var(--brand-muted);
		color: var(--brand-primary);
	}
	.page {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-6);
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.title {
		margin: 0;
		font: var(--ed-t-display-lg);
		letter-spacing: var(--ed-t-display-lg-tracking);
		font-variation-settings: var(--ed-t-display-lg-opsz);
		text-wrap: balance;
	}
	.credit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		color: var(--text-secondary);
	}
	.source {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0;
		border: 0;
		border-radius: var(--ed-radius-control);
		background: none;
		font: inherit;
		letter-spacing: inherit;
		color: var(--text-primary);
		cursor: pointer;
	}
	.source:hover {
		color: var(--brand-primary);
	}
	.source:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	/* Time, servings and tags on one line, hairlines above and below */
	.facts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-6);
		padding: var(--space-3) 0;
		border-block: 1px solid var(--ed-card-border);
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
	}
	.fact,
	.tags {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.tags {
		flex-wrap: wrap;
	}
	.serves {
		min-width: 2ch;
		text-align: center;
	}
	.warn,
	.quiet,
	.tip {
		margin: 0;
	}
	.tip {
		font: var(--ed-t-voice);
		font-style: italic;
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-secondary);
		text-wrap: pretty;
	}
	.quiet {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	/* Ingredients beside the steps; the ingredients stay in view while a long method scrolls */
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		align-items: start;
		gap: var(--space-6);
	}
	.part {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.ingredients {
		position: sticky;
		top: var(--space-4);
	}
	/* a narrow pane (the Gardener open beside it) reads top to bottom: the ingredients, then the steps */
	@container (max-width: 36rem) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
		.ingredients {
			position: static;
		}
	}
	.part-title {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	/* One ingredient to a line: the amount in its own column, what it is, then where it stands */
	.lines {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: var(--space-2) var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.line {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: baseline;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.amount {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
		text-align: right;
		white-space: nowrap;
	}
	.line-note {
		color: var(--text-secondary);
	}
	.steps {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.step {
		display: grid;
		grid-template-columns: var(--space-6) minmax(0, 1fr);
		align-items: baseline;
		gap: var(--space-3);
	}
	.numeral {
		font: var(--ed-t-display-md);
		letter-spacing: var(--ed-t-display-md-tracking);
		font-variation-settings: var(--ed-t-display-md-opsz);
		font-variant-numeric: tabular-nums;
		color: var(--brand-primary);
		text-align: right;
	}
	.step-text {
		font: var(--ed-t-body-lg);
		letter-spacing: var(--ed-t-body-lg-tracking);
		text-wrap: pretty;
	}
	.foot {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-4);
		border-top: 1px solid var(--ed-card-border);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
