// How the owner is looking at the recipes (product/domains/kitchen.md, "Recipes"): what they searched for, the
// filters and the order, the recipe that is open, and how many each recipe is being cooked for (D-107). It is held
// for the session, so it is still there after a look at Stock or Grocery, and none of it is stored: a recipe keeps
// the servings it was written with.
import { SvelteMap } from 'svelte/reactivity'
import { MAX_SERVES, scalable } from './scale.js'
import { NO_FILTERS, type RecipeFilters, type RecipeSort } from './browse.js'
import { type Recipe } from './types.js'

class RecipeBrowse {
	filters = $state<RecipeFilters>({ ...NO_FILTERS })
	sort = $state<RecipeSort>('tonight')
	/** The recipe the owner picked; the page shows the first of the list until one is. */
	selected = $state<string>()
	readonly #serves = new SvelteMap<string, number>()

	/** How many a recipe is being cooked for: what the owner asked for, else what it was written for. */
	servesOf(recipe: Pick<Recipe, 'id' | 'serves' | 'scales'>): number {
		return (scalable(recipe) && this.#serves.get(recipe.id)) || recipe.serves
	}

	/** Cooks a recipe for `serves`, from one to the most a recipe is scaled to; its own number forgets the change. */
	setServes(recipe: Pick<Recipe, 'id' | 'serves' | 'scales'>, serves: number): void {
		if (!scalable(recipe)) return
		const wanted = Math.min(MAX_SERVES, Math.max(1, Math.round(serves)))
		if (wanted === recipe.serves) this.#serves.delete(recipe.id)
		else this.#serves.set(recipe.id, wanted)
	}

	/** Every filter off, the search with them; the order stays. */
	clear(): void {
		this.filters = { ...NO_FILTERS }
	}
}

export const recipeBrowse = new RecipeBrowse()
