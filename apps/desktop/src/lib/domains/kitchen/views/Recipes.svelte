<script lang="ts">
	// Hearth's Recipes view (Domains/Hearth/Recipes): the recipes on the left, the ones tonight's stock suggests first,
	// and the selected one in the pane on the right with each ingredient marked in stock or missing. From the pane a
	// recipe is cooked (the stock is decremented, product/domains/kitchen.md "Cooking decrements stock"), its missing
	// ingredients go to the grocery list, and it is edited. A recipe on its way in (pasted, linked, photographed, or
	// drafted by the Gardener) opens in the pane as a form and is stored only when it is saved there. Everything the
	// pane says of the stock is worked out here, locally; a recipe that names something the owner avoids says so (D-25).
	import {
		Badge,
		Button,
		Chip,
		Dropzone,
		EmptyState,
		IconButton,
		List,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import {
		cookPlan,
		cookTonight,
		formatIngredient,
		ingredientStatus,
		isSafe,
		normaliseName,
		type CookLine,
	} from '@eden/shared/domains/kitchen'
	import { t } from '@eden/shared/i18n'
	import { undoToast } from '$lib/shell/undo'
	import { toast } from '@eden/ui-kit'
	import { recipeDrafts, recipeImport } from '../recipe-draft.svelte'
	import { forbidden } from '../safety.svelte'
	import { CAPTURE_ACCEPT } from '../staging.svelte'
	import { kitchen, type Recipe, type RecipeDraft } from '../store.svelte'
	import RecipeForm from './RecipeForm.svelte'

	const uid = $props.id()

	void forbidden.read()

	const textsOf = (recipe: Pick<Recipe, 'name' | 'tags' | 'ingredients'>) => [
		recipe.name,
		...recipe.tags,
		...recipe.ingredients.map((line) => line.name),
	]
	/** Names something the owner avoids: said only once the profile has been read and has something to say. */
	const avoided = (recipe: Recipe) => !!forbidden.words?.length && !isSafe(textsOf(recipe), forbidden.words)

	// Tonight's order first: what uses up the expiring stock, then what misses least; the rest follow by name.
	const tonight = $derived(cookTonight(kitchen.recipes, kitchen.stock, forbidden.words))
	const ordered = $derived.by(() => {
		const picked = tonight.map((pick) => pick.recipe)
		const rest = kitchen.recipes
			.filter((recipe) => !picked.some((entry) => entry.id === recipe.id))
			.sort((a, b) => a.name.localeCompare(b.name))
		return [...picked, ...rest]
	})

	const actionsFor = (): MenuItem[] => [
		{ id: 'edit', label: $t('domains.kitchen.recipes.actions.edit'), icon: 'pencil' },
		{ id: 'delete', label: $t('domains.kitchen.recipes.actions.delete'), icon: 'trash', destructive: true },
	]
	const toRow = (recipe: Recipe): ListRowData => {
		const pick = tonight.find((entry) => entry.recipe.id === recipe.id)
		const missing = ingredientStatus(recipe, kitchen.stock).filter((line) => line.state === 'missing').length
		return {
			id: recipe.id,
			primary: recipe.name,
			hint: recipe.tip,
			secondary: pick?.uses.length
				? $t('domains.kitchen.recipes.usesUp', { values: { names: pick.uses.join(', ') } })
				: undefined,
			chips: [
				...(recipe.minutes
					? [{ label: $t('domains.kitchen.recipes.minutes', { values: { minutes: recipe.minutes } }), mono: true }]
					: []),
				...recipe.tags.map((tag) => ({ label: tag })),
			],
			badges: avoided(recipe) ? [{ kind: 'danger' as const, label: $t('domains.kitchen.recipes.avoided') }] : [],
			meta: recipe.ingredients.length
				? missing
					? $t('domains.kitchen.recipes.missingCount', { values: { count: missing } })
					: $t('domains.kitchen.recipes.allInStock')
				: undefined,
			actions: actionsFor(),
		}
	}

	let selected = $state<string>()
	const detail = $derived(kitchen.recipes.find((recipe) => recipe.id === selected) ?? ordered[0])
	const status = $derived(detail ? ingredientStatus(detail, kitchen.stock) : [])
	const missing = $derived(status.filter((line) => line.state === 'missing'))

	// The pane's modes over a saved recipe: read, edit, or the questions cooking it asks.
	let mode = $state<'view' | 'edit' | 'cook'>('view')
	function open(id: string) {
		selected = id
		mode = 'view'
	}

	function onaction(menuItem: MenuItem, row: ListRowData) {
		if (menuItem.id === 'edit') {
			open(row.id)
			mode = 'edit'
		} else if (menuItem.id === 'delete') remove(row.id)
	}
	function remove(id: string) {
		const { recipe, undo } = kitchen.removeRecipe(id)
		mode = 'view'
		if (recipe) undoToast($t('domains.kitchen.recipes.toast.removed', { values: { name: recipe.name } }), undo)
	}
	function saveDraft(draft: RecipeDraft) {
		const { recipe, undo } = kitchen.addRecipe(draft)
		recipeDrafts.saved()
		open(recipe.id)
		undoToast($t('domains.kitchen.recipes.toast.saved', { values: { name: recipe.name } }), undo)
	}
	function saveEdit(recipe: Recipe, draft: RecipeDraft) {
		const { undo } = kitchen.updateRecipe(recipe.id, draft)
		mode = 'view'
		undoToast($t('domains.kitchen.recipes.toast.edited', { values: { name: draft.name } }), undo)
	}

	function addMissing(recipe: Recipe) {
		// what is already on the list, and not yet bought, is not added again
		const listed = new Set(kitchen.grocery.items.filter((item) => !item.done).map((item) => normaliseName(item.name)))
		const wanted = missing.filter((line) => !listed.has(normaliseName(line.ingredient.name)))
		if (!wanted.length) {
			toast({ message: $t('domains.kitchen.recipes.toast.alreadyListed') })
			return
		}
		const { items, undo } = kitchen.addGroceryItems(
			wanted.map(({ ingredient }) => ({
				name: ingredient.name,
				qty: [ingredient.qty, ingredient.unit].filter(Boolean).join(' '),
				note: recipe.name,
			})),
			'recipe'
		)
		undoToast($t('domains.kitchen.recipes.toast.missingAdded', { values: { count: items.length } }), undo)
	}

	// Cooking: what is taken where the units agree, and a question where they do not (cloves from a head).
	let plan = $state<CookLine[]>([])
	/** The owner's answer to each question, by the ingredient's place in the plan: the item was used up, or left. */
	let usedUp = $state<Record<number, boolean>>({})
	function cook(recipe: Recipe) {
		plan = cookPlan(recipe, kitchen.stock)
		usedUp = {}
		if (plan.some((line) => line.state === 'ask')) mode = 'cook'
		else cooked(recipe)
	}
	function cooked(recipe: Recipe) {
		// one change per item: where two ingredients draw on one, the last line holds what both left
		const changes: Record<string, string> = {}
		plan.forEach((line, index) => {
			if (!line.stockId) return
			if (line.state === 'subtract' && line.afterQty !== undefined) changes[line.stockId] = line.afterQty
			else if (line.state === 'ask' && usedUp[index]) changes[line.stockId] = '0'
		})
		mode = 'view'
		if (!Object.keys(changes).length) {
			toast({ message: $t('domains.kitchen.recipes.toast.nothingTaken', { values: { name: recipe.name } }) })
			return
		}
		const { undo } = kitchen.cookRecipe(
			recipe.id,
			Object.entries(changes).map(([stockId, qty]) => ({ stockId, qty }))
		)
		undoToast($t('domains.kitchen.recipes.toast.cooked', { values: { name: recipe.name } }), undo)
	}

	function seed() {
		undoToast($t('common.sampleAdded'), kitchen.seed($t('domains.kitchen.name')))
	}
	const host = (url: string) => {
		try {
			return new URL(url).hostname.replace(/^www\./, '')
		} catch {
			return url
		}
	}
</script>

<Dropzone accept={[...CAPTURE_ACCEPT]} disabled={recipeImport.open} ondrop={(accepted) => recipeImport.start(accepted)}>
	{#if kitchen.recipes.length === 0 && !recipeDrafts.current}
		<EmptyState
			title={$t('domains.kitchen.recipes.empty.title')}
			text={$t('domains.kitchen.recipes.empty.text')}
			action={{ label: $t('domains.kitchen.recipes.add'), icon: 'plus', onclick: () => recipeImport.start() }}
			sample={{ onclick: seed }}
		/>
	{:else}
		<div class="body">
			<div class="lists">
				{#if ordered.length}
					<List
						header={$t('domains.kitchen.tabs.recipes')}
						count={ordered.length}
						rows={ordered.map(toRow)}
						onopen={(row) => open(row.id)}
						{onaction}
					/>
				{/if}
			</div>

			{#if recipeDrafts.current}
				{#key recipeDrafts.current}
					<aside class="detail" aria-labelledby="{uid}-detail">
						<RecipeForm
							id="{uid}-detail"
							recipe={recipeDrafts.current}
							title={$t('domains.kitchen.recipes.draft.title')}
							note={$t('domains.kitchen.recipes.draft.note')}
							cancelLabel={$t('domains.kitchen.recipes.draft.discard')}
							onsave={saveDraft}
							oncancel={() => recipeDrafts.discard()}
						/>
					</aside>
				{/key}
			{:else if detail && mode === 'edit'}
				{#key detail.id}
					<aside class="detail" aria-labelledby="{uid}-detail">
						<RecipeForm
							id="{uid}-detail"
							recipe={detail}
							title={$t('domains.kitchen.recipes.editing')}
							cancelLabel={$t('common.cancel')}
							onsave={(draft) => saveEdit(detail, draft)}
							oncancel={() => (mode = 'view')}
						/>
					</aside>
				{/key}
			{:else if detail && mode === 'cook'}
				<aside class="detail" aria-labelledby="{uid}-detail">
					<h2 class="detail-title" id="{uid}-detail">
						{$t('domains.kitchen.recipes.cook.title', { values: { name: detail.name } })}
					</h2>
					<p class="quiet">{$t('domains.kitchen.recipes.cook.text')}</p>
					<ul class="lines">
						{#each plan as line, index (index)}
							<li class="line">
								<span class="line-text">{formatIngredient(line.ingredient)}</span>
								{#if line.state === 'subtract'}
									<span class="line-change">
										{line.stockName}: {line.held} → {line.empty ? $t('domains.kitchen.recipes.cook.none') : line.after}
									</span>
								{:else if line.state === 'ask'}
									<span class="line-change">
										{$t('domains.kitchen.recipes.cook.ask', {
											values: { name: line.stockName ?? '', held: line.held ?? '' },
										})}
									</span>
									<span class="choices" role="radiogroup" aria-label={line.stockName}>
										<Chip
											label={$t('domains.kitchen.recipes.cook.leave')}
											tone={usedUp[index] ? 'outline' : 'accent'}
											role="radio"
											aria-checked={!usedUp[index]}
											onclick={() => (usedUp[index] = false)}
										/>
										<Chip
											label={$t('domains.kitchen.recipes.cook.usedUp')}
											tone={usedUp[index] ? 'accent' : 'outline'}
											role="radio"
											aria-checked={!!usedUp[index]}
											onclick={() => (usedUp[index] = true)}
										/>
									</span>
								{:else}
									<span class="line-change quiet">
										{line.stockId
											? $t('domains.kitchen.recipes.cook.noAmount')
											: $t('domains.kitchen.recipes.cook.notInStock')}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
					<div class="detail-actions">
						<Button
							label={$t('domains.kitchen.recipes.cook.confirm')}
							variant="primary"
							icon="check"
							onclick={() => cooked(detail)}
						/>
						<Button label={$t('common.cancel')} variant="quiet" onclick={() => (mode = 'view')} />
					</div>
				</aside>
			{:else if detail}
				<aside class="detail" aria-labelledby="{uid}-detail">
					<div class="detail-head">
						<h2 class="detail-title" id="{uid}-detail">{detail.name}</h2>
						{#if detail.tip}
							<IconButton
								icon="info"
								size="xs"
								label={$t('domains.kitchen.recipes.tipFor', { values: { name: detail.name } })}
								tooltip={detail.tip}
							/>
						{/if}
					</div>
					<div class="chips">
						<Chip label={$t('domains.kitchen.recipes.serves', { values: { count: detail.serves } })} />
						{#if detail.minutes}
							<Chip
								label={$t('domains.kitchen.recipes.minutes', { values: { minutes: detail.minutes } })}
								icon="clock"
							/>
						{/if}
						{#each detail.tags as tag (tag)}
							<Chip label={tag} tone="outline" />
						{/each}
						{#if detail.sourceUrl}
							<Chip
								label={host(detail.sourceUrl)}
								tone="outline"
								icon="external-link"
								onclick={() => void openExternal(detail.sourceUrl!)}
							/>
						{/if}
					</div>
					{#if avoided(detail)}
						<p class="warn"><Badge kind="danger" label={$t('domains.kitchen.recipes.avoided')} /></p>
					{/if}
					{#if detail.ingredients.length}
						<section class="part" aria-labelledby="{uid}-ingredients">
							<h3 class="part-title" id="{uid}-ingredients">{$t('domains.kitchen.recipes.ingredients')}</h3>
							<ul class="lines">
								{#each status as line, index (index)}
									<li class="line">
										<span class="line-text">{formatIngredient(line.ingredient)}</span>
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
					{#if detail.steps.length}
						<section class="part" aria-labelledby="{uid}-steps">
							<h3 class="part-title" id="{uid}-steps">{$t('domains.kitchen.recipes.steps')}</h3>
							<ol class="steps">
								{#each detail.steps as step, index (index)}
									<li>{step}</li>
								{/each}
							</ol>
						</section>
					{/if}
					<div class="detail-actions">
						<Button
							label={$t('domains.kitchen.recipes.actions.cook')}
							icon="cooking-pot"
							disabled={!detail.ingredients.length}
							onclick={() => cook(detail)}
						/>
						<Button
							label={$t('domains.kitchen.recipes.actions.addMissing', { values: { count: missing.length } })}
							icon="plus"
							disabled={!missing.length}
							onclick={() => addMissing(detail)}
						/>
						<Button label={$t('domains.kitchen.recipes.actions.edit')} icon="pencil" onclick={() => (mode = 'edit')} />
						<Button
							label={$t('domains.kitchen.recipes.actions.delete')}
							variant="quiet"
							onclick={() => remove(detail.id)}
						/>
					</div>
				</aside>
			{/if}
		</div>
	{/if}
</Dropzone>

<style>
	/* The recipes on the left and the one that is open on the right */
	.body {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		align-items: start;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
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
		align-items: center;
		gap: var(--space-2);
	}
	.detail-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
	}
	.chips,
	.detail-actions,
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.warn,
	.quiet {
		margin: 0;
	}
	.quiet {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.part {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.part-title {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	/* One ingredient to a line: what it is, then where it stands */
	.lines {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.line-text {
		flex: 1 1 auto;
		min-width: 0;
	}
	.line-change {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}
	.steps {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding-left: var(--space-6);
		list-style: decimal outside;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		text-wrap: pretty;
	}
</style>
