<script lang="ts">
	// The Recipes view's left column: the search, the filters and the order, then the recipes they leave, each a row
	// with its picture (D-93). A click picks a recipe and the page beside the list shows it (D-94). What is typed and
	// switched on is the session's (`recipeBrowse`), so it is still there after a look at another tab. The search
	// reads "spinach, tofu" as every recipe that has both (`browse.ts`).
	import {
		Button,
		Chip,
		EmptyState,
		Field,
		IconButton,
		List,
		Menu,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { RECIPE_SORTS, filtering, recipeTags, type RecipeSort } from '../browse.js'
	import { ingredientStatus, type TonightPick } from '../cook.js'
	import { t } from '../../../i18n/index.js'
	import { recipeBrowse } from '../recipe-browse.svelte.js'
	import { kitchen } from '../store.svelte.js'
	import { type Recipe } from '../types.js'

	type Props = {
		/** The recipes the search and the filters leave, in the order asked for. */
		recipes: Recipe[]
		/** Tonight's picks, which say what each recipe uses up and how much it misses. */
		tonight: readonly TonightPick[]
		/** The id of the recipe the page shows. */
		current?: string
		/** Whether a recipe names something the owner avoids. */
		avoided: (recipe: Recipe) => boolean
		onpick: (id: string) => void
		onaction: (item: MenuItem, row: ListRowData) => void
	}
	let { recipes, tonight, current, avoided, onpick, onaction }: Props = $props()

	const QUICK_MINUTES = 30
	const active = $derived(filtering(recipeBrowse.filters))

	const tags = $derived(recipeTags(kitchen.recipes))
	const tagItems = $derived<MenuItem[]>(
		tags.map((tag) => ({ id: tag, label: tag, checked: recipeBrowse.filters.tags.includes(tag) }))
	)
	let tagAnchor = $state<HTMLElement>()
	let tagOpen = $state(false)
	function toggleTag(tag: string | undefined) {
		if (!tag) return
		const held = recipeBrowse.filters.tags
		recipeBrowse.filters.tags = held.includes(tag) ? held.filter((entry) => entry !== tag) : [...held, tag]
	}

	const sortItems = $derived<MenuItem[]>(
		RECIPE_SORTS.map((id) => ({
			id,
			label: $t(`domains.kitchen.recipes.sort.${id}`),
			checked: recipeBrowse.sort === id,
		}))
	)
	let sortAnchor = $state<HTMLElement>()
	let sortOpen = $state(false)

	const actionsFor = (): MenuItem[] => [
		{ id: 'edit', label: $t('domains.kitchen.recipes.actions.edit'), icon: 'pencil' },
		{ id: 'delete', label: $t('domains.kitchen.recipes.actions.delete'), icon: 'trash', destructive: true },
	]
	const toRow = (recipe: Recipe): ListRowData => {
		const pick = tonight.find((entry) => entry.recipe.id === recipe.id)
		const missing =
			pick?.missing ?? ingredientStatus(recipe, kitchen.stock).filter((line) => line.state === 'missing').length
		const standing = pick?.uses.length
			? $t('domains.kitchen.recipes.usesUp', { values: { names: pick.uses.join(', ') } })
			: !recipe.ingredients.length
				? undefined
				: missing
					? $t('domains.kitchen.recipes.missingCount', { values: { count: missing } })
					: $t('domains.kitchen.recipes.allInStock')
		return {
			id: recipe.id,
			primary: recipe.name,
			secondary:
				[
					recipe.minutes ? $t('domains.kitchen.recipes.minutes', { values: { minutes: recipe.minutes } }) : undefined,
					standing,
				]
					.filter(Boolean)
					.join(' · ') || undefined,
			thumbnail: kitchen.recipeThumb(recipe),
			icon: 'cooking-pot',
			tile: true,
			badges: avoided(recipe) ? [{ kind: 'danger' as const, label: $t('domains.kitchen.recipes.avoided') }] : [],
			actions: actionsFor(),
		}
	}
</script>

<div class="browser">
	<Field
		icon="search"
		enterkeyhint="search"
		aria-label={$t('domains.kitchen.recipes.search')}
		placeholder={$t('domains.kitchen.recipes.searchPlaceholder')}
		bind:value={recipeBrowse.filters.search}
	>
		{#snippet trailing()}
			{#if recipeBrowse.filters.search}
				<IconButton
					icon="x"
					size="xs"
					label={$t('domains.kitchen.recipes.clearSearch')}
					tooltip
					onclick={() => (recipeBrowse.filters.search = '')}
				/>
			{/if}
		{/snippet}
	</Field>

	<div class="filters">
		<Chip
			label={$t('domains.kitchen.recipes.filters.inStock')}
			tone="outline"
			selectable
			bind:selected={recipeBrowse.filters.inStock}
		/>
		<Chip
			label={$t('domains.kitchen.recipes.filters.quick', { values: { minutes: QUICK_MINUTES } })}
			tone="outline"
			icon="clock"
			selectable
			selected={recipeBrowse.filters.maxMinutes === QUICK_MINUTES}
			onselect={(selected) => (recipeBrowse.filters.maxMinutes = selected ? QUICK_MINUTES : 0)}
		/>
		<Chip
			label={$t('domains.kitchen.recipes.filters.expiring')}
			tone="outline"
			selectable
			bind:selected={recipeBrowse.filters.expiring}
		/>
		{#if tags.length}
			<span class="anchor" bind:this={tagAnchor}>
				<Chip
					label={recipeBrowse.filters.tags.length
						? $t('domains.kitchen.recipes.filters.tagsChosen', {
								values: { tags: recipeBrowse.filters.tags.join(', ') },
							})
						: $t('domains.kitchen.recipes.filters.tags')}
					tone={recipeBrowse.filters.tags.length ? 'accent' : 'outline'}
					icon="chevron-down"
					aria-haspopup="menu"
					aria-expanded={tagOpen}
					onclick={() => (tagOpen = !tagOpen)}
				/>
			</span>
			<Menu
				bind:open={tagOpen}
				anchor={tagAnchor}
				align="start"
				label={$t('domains.kitchen.recipes.filters.tagsLabel')}
				items={tagItems}
				onselect={(item) => toggleTag(item.id)}
			/>
		{/if}
		<span class="anchor" bind:this={sortAnchor}>
			<Chip
				label={$t('domains.kitchen.recipes.sortBy', {
					values: { sort: $t(`domains.kitchen.recipes.sort.${recipeBrowse.sort}`) },
				})}
				tone="outline"
				icon="chevron-down"
				aria-haspopup="menu"
				aria-expanded={sortOpen}
				onclick={() => (sortOpen = !sortOpen)}
			/>
		</span>
		<Menu
			bind:open={sortOpen}
			anchor={sortAnchor}
			align="start"
			label={$t('domains.kitchen.recipes.sortLabel')}
			items={sortItems}
			onselect={(item) => (recipeBrowse.sort = (item.id as RecipeSort | undefined) ?? 'tonight')}
		/>
		{#if active}
			<Button
				label={$t('domains.kitchen.recipes.filters.clear')}
				variant="quiet"
				onclick={() => recipeBrowse.clear()}
			/>
		{/if}
	</div>

	{#if recipes.length}
		<List
			header={$t('domains.kitchen.tabs.recipes')}
			count={active
				? $t('domains.kitchen.recipes.countOf', { values: { shown: recipes.length, total: kitchen.recipes.length } })
				: recipes.length}
			rows={recipes.map(toRow)}
			{current}
			onpick={(row) => onpick(row.id)}
			{onaction}
		/>
	{:else}
		<EmptyState
			inline
			title={$t('domains.kitchen.recipes.noMatch.title')}
			text={$t('domains.kitchen.recipes.noMatch.text')}
			action={{ label: $t('domains.kitchen.recipes.noMatch.clear'), onclick: () => recipeBrowse.clear() }}
		/>
	{/if}
</div>

<style>
	.browser {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.anchor {
		display: inline-flex;
	}
</style>
