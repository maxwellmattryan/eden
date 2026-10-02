<script lang="ts">
	// Hearth's Recipes view (Domains/Hearth/Recipes): a narrow column on the left to find a recipe in (search, filters,
	// order; `RecipeBrowser`) and the picked one on the right as a page (`RecipePage`), with each ingredient marked in
	// stock or missing for the servings shown (D-107). From the page a recipe is cooked (the stock is decremented,
	// product/domains/kitchen.md "Cooking decrements stock"), its missing ingredients go to the grocery lists, and it
	// is edited. A recipe on its way in (pasted, linked, photographed, or drafted by the Gardener) opens in the pane as
	// a form and is stored only when it is saved there, with its picture (D-93). Everything the pane says of the stock
	// is worked out here, locally; a recipe that names something the owner avoids says so (D-25).
	import { BackButton, Button, Chip, Dropzone, EmptyState, toast, type ListRowData, type MenuItem } from '@eden/ui-kit'
	import {
		browseRecipes,
		cookPlan,
		cookTonight,
		formatIngredient,
		ingredientStatus,
		isSafe,
		missingEstimate,
		normaliseName,
		scaledIngredients,
		type CookLine,
	} from '@eden/shared/domains/kitchen'
	import { t } from '@eden/shared/i18n'
	import { undoToast } from '@eden/shared/shell'
	import { showPushed } from '@eden/shared/shell'
	import { recipeBrowse } from '@eden/shared/domains/kitchen'
	import { recipeDrafts, recipeImport } from '@eden/shared/domains/kitchen'
	import { forbidden } from '@eden/shared/domains/kitchen'
	import { CAPTURE_ACCEPT, type RecipePicture } from '@eden/shared/domains/kitchen'
	import { kitchen, type Recipe, type RecipeDraft } from '@eden/shared/domains/kitchen'
	import RecipeBrowser from './RecipeBrowser.svelte'
	import RecipeForm from './RecipeForm.svelte'
	import RecipePage from './RecipePage.svelte'

	const uid = $props.id()

	void forbidden.read()

	const textsOf = (recipe: Pick<Recipe, 'name' | 'tags' | 'ingredients'>) => [
		recipe.name,
		...recipe.tags,
		...recipe.ingredients.map((line) => line.name),
	]
	/** Names something the owner avoids: said only once the profile has been read and has something to say. */
	const avoided = (recipe: Recipe) => !!forbidden.words?.length && !isSafe(textsOf(recipe), forbidden.words)

	// Tonight's order is the default: what uses up the expiring stock, then what misses least; the rest follow by name.
	const tonight = $derived(cookTonight(kitchen.recipes, kitchen.stock, forbidden.words))
	const browsed = $derived(
		browseRecipes(kitchen.recipes, kitchen.stock, tonight, recipeBrowse.filters, recipeBrowse.sort)
	)

	// The recipe the owner picked stays open even when a filter takes its row away; until one is picked the page shows
	// the first of the list.
	const detail = $derived(kitchen.recipes.find((recipe) => recipe.id === recipeBrowse.selected) ?? browsed[0])
	// What the page says and what is cooked and shopped for are the amounts for the servings shown (D-107).
	const serves = $derived(detail ? recipeBrowse.servesOf(detail) : 0)
	const scaled = $derived(detail ? { ...detail, ingredients: scaledIngredients(detail, serves) } : undefined)
	const status = $derived(scaled ? ingredientStatus(scaled, kitchen.stock) : [])
	const missing = $derived(status.filter((line) => line.state === 'missing'))
	/** About what the missing ingredients cost to buy, a package of each, from what the stores remember (D-105). */
	const toBuy = $derived(
		missingEstimate(
			missing.map((line) => line.ingredient.name),
			kitchen.grocery.stores
		)
	)

	// The pane's modes over a saved recipe: read, edit, or the questions cooking it asks.
	let mode = $state<'view' | 'edit' | 'cook'>('view')
	function open(id: string) {
		recipeBrowse.selected = id
		mode = 'view'
		void showPushed(() => back)
	}
	// In a narrow page the browser stands alone until a recipe is picked, or a draft is waiting; then the recipe takes
	// its place, under a back arrow (a pushed view). A draft has no way back but its own Save and Discard.
	const picked = $derived(kitchen.recipes.some((recipe) => recipe.id === recipeBrowse.selected))
	const pushed = $derived(!!recipeDrafts.current || picked)
	let back = $state<HTMLElement>()
	function close() {
		recipeBrowse.selected = undefined
		mode = 'view'
	}
	/**
	 * The picture chosen while a saved recipe is edited: one the owner chose, `null` for taken away, nothing for left
	 * as it is. It is kept with the recipe only when the form is saved, so Cancel leaves the picture alone.
	 */
	let edited = $state.raw<RecipePicture | null | undefined>()
	function edit(id: string) {
		open(id)
		edited = undefined
		mode = 'edit'
	}

	function onaction(menuItem: MenuItem, row: ListRowData) {
		if (menuItem.id === 'edit') edit(row.id)
		else if (menuItem.id === 'delete') remove(row.id)
	}
	function remove(id: string) {
		const { recipe, undo } = kitchen.removeRecipe(id)
		mode = 'view'
		if (recipe) undoToast($t('domains.kitchen.recipes.toast.removed', { values: { name: recipe.name } }), undo)
	}
	function saveDraft(draft: RecipeDraft) {
		const { recipe, undo } = kitchen.addRecipe(draft, recipeDrafts.picture)
		recipeDrafts.saved()
		open(recipe.id)
		undoToast($t('domains.kitchen.recipes.toast.saved', { values: { name: recipe.name } }), undo)
	}
	function saveEdit(recipe: Recipe, draft: RecipeDraft) {
		const fields = kitchen.updateRecipe(recipe.id, draft)
		// the picture is its own change in the store; one undo takes back both, the later one first
		const picture =
			edited || (edited === null && recipe.photo) ? kitchen.setRecipePhoto(recipe.id, edited ?? undefined) : undefined
		mode = 'view'
		edited = undefined
		undoToast($t('domains.kitchen.recipes.toast.edited', { values: { name: draft.name } }), () => {
			picture?.undo()
			fields.undo()
		})
	}

	function addMissing(recipe: Recipe) {
		// what is already on a list, and not yet bought, is not added again; each line is filed where it was last
		// bought (D-97), at the amount for the servings shown
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
		plan = cookPlan(scaled ?? recipe, kitchen.stock)
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
		<div class={['body', pushed && 'body-open']}>
			<div class="side">
				{#if kitchen.recipes.length}
					<RecipeBrowser
						recipes={browsed}
						{tonight}
						current={recipeDrafts.current ? undefined : detail?.id}
						{avoided}
						onpick={open}
						{onaction}
					/>
				{/if}
			</div>

			{#if !recipeDrafts.current && picked}
				<div class="back" bind:this={back}><BackButton onback={close} /></div>
			{/if}
			{#if recipeDrafts.current}
				{#key recipeDrafts.current}
					<aside class="detail" aria-labelledby="{uid}-detail">
						<RecipeForm
							id="{uid}-detail"
							recipe={recipeDrafts.current}
							title={$t('domains.kitchen.recipes.draft.title')}
							note={$t('domains.kitchen.recipes.draft.note')}
							cancelLabel={$t('domains.kitchen.recipes.draft.discard')}
							picture={recipeDrafts.picture?.thumbnail}
							fetching={recipeDrafts.fetching}
							onpicture={(picture) => recipeDrafts.setPicture(picture)}
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
							picture={edited === undefined ? kitchen.recipeThumb(detail) : edited?.thumbnail}
							onpicture={(picture) => (edited = picture ?? null)}
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
							onclick={() => cooked(detail)}
						/>
						<Button label={$t('common.cancel')} variant="quiet" onclick={() => (mode = 'view')} />
					</div>
				</aside>
			{:else if detail}
				<aside class="detail reading" aria-labelledby="{uid}-detail">
					<RecipePage
						id="{uid}-detail"
						recipe={detail}
						{serves}
						{status}
						{toBuy}
						avoided={avoided(detail)}
						onserves={(count) => recipeBrowse.setServes(detail, count)}
						oncook={() => cook(detail)}
						onaddmissing={() => addMissing(detail)}
						onedit={() => edit(detail.id)}
						ondelete={() => remove(detail.id)}
					/>
				</aside>
			{/if}
		</div>
	{/if}
</Dropzone>

<style>
	/* A narrow column to find a recipe in, and the open one on the rest of the page */
	.body {
		display: grid;
		grid-template-columns: var(--sheet-sm) minmax(0, 1fr);
		align-items: start;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	/* The column stays in view and scrolls on its own, so a long list never carries the recipe away */
	.side {
		position: sticky;
		top: var(--space-4);
		min-width: 0;
		max-height: calc(100vh - var(--space-8) * 3);
		/* a scroller clips what it holds: the room around it keeps a focus ring whole, and is taken back outside */
		margin: calc(var(--space-1) * -1);
		padding: var(--space-1);
		overflow-y: auto;
	}
	/* the way back from the open recipe, which only a narrow page needs */
	.back {
		display: none;
	}
	/* narrow page */
	@container page (max-width: 48rem) {
		/* one column: the browser until a recipe is picked, then the recipe in its place */
		.body {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-2);
		}
		.body:not(.body-open) .detail,
		.body-open .side {
			display: none;
		}
		.back {
			display: block;
		}
		.side {
			position: static;
			max-height: none;
			overflow-y: visible;
		}
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
	/* the recipe as it is read: its picture runs to the card's edges, so the page pads itself */
	.reading {
		gap: 0;
		padding: 0;
	}
	.detail-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
	}
	.detail-actions,
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.quiet {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	/* Cooking: one ingredient to a line, what it is, then what it takes from the stock */
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
</style>
