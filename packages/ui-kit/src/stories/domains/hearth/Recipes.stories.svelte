<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { haul, recipeDraft, recipes, sidebar } from '../../sample-data.js'
	import Recipes from './Recipes.svelte'

	const hearth = sidebar.items.find((entry) => entry.id === 'kitchen')!
	const [salmon, tacos] = recipes

	const { Story } = defineMeta({
		title: 'Domains/Hearth/Recipes',
		component: Recipes,
		tags: ['autodocs'],
		parameters: {
			platforms: ['desktop'],
			docs: {
				description: {
					component:
						'Hearth’s Recipes view (product/domains/kitchen.md), mocked from kit components under D-54; desktop only in Phase 1. The header carries the domain’s three tabs and one action, Add a recipe. The recipes sit on the left in tonight’s order, each with its minutes and tags, what it uses up of the expiring stock and how much of it is missing; the pane on the right is the open recipe: its tip as the info button beside its name (D-87), chips for serves, minutes, tags and source, every ingredient marked in stock, missing or not enough, the numbered steps, and Cook this, Add missing to grocery, Edit and Delete. A draft or an edit shows the form in the pane; cooking a recipe whose unit an item’s cannot be taken from asks Leave it or Used it up; Add a recipe is a sheet that takes text, a link or a photo.',
				},
			},
		},
		args: {
			onadd: fn(),
			onopen: fn(),
			onaction: fn(),
			oncook: fn(),
			oncooked: fn(),
			onmissing: fn(),
			onsave: fn(),
			ondiscard: fn(),
			onread: fn(),
			onfiles: fn(),
			onsource: fn(),
			onsample: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Recipes>)}
	<Recipes {...args} />
{/snippet}

<!-- The three recipes in tonight's order; the salmon open, which uses up the spinach and has everything in stock -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const main = within(canvas.getByRole('main'))
		await expect(canvas.getByRole('heading', { level: 1, name: hearth.name })).toBeVisible()
		await expect(main.getAllByRole('tab')).toHaveLength(3)
		await expect(main.getByRole('tab', { name: 'Recipes' })).toHaveAttribute('aria-selected', 'true')
		await expect(main.getByRole('button', { name: 'Add a recipe' })).toBeVisible()
		const rows = within(main.getByRole('grid', { name: 'Recipes' })).getAllByRole('row')
		await expect(rows).toHaveLength(recipes.length)
		await expect(rows[0]).toHaveTextContent(salmon.name)
		await expect(rows[0]).toHaveTextContent('Uses up Spinach')
		await expect(rows[0]).toHaveTextContent('in stock')
		await expect(rows[1]).toHaveTextContent('1 missing')
		const pane = within(main.getByRole('complementary', { name: salmon.name }))
		await expect(pane.getByRole('button', { name: `A tip for ${salmon.name}` })).toBeVisible()
		await expect(pane.getByText('Serves 2')).toBeVisible()
		const ingredients = within(pane.getByRole('region', { name: 'Ingredients' }))
		await expect(ingredients.getAllByRole('listitem')).toHaveLength(salmon.ingredients.length)
		await expect(ingredients.getAllByText('in stock')).toHaveLength(salmon.ingredients.length)
		await expect(within(pane.getByRole('region', { name: 'Steps' })).getAllByRole('listitem')).toHaveLength(
			salmon.steps.length
		)
		await expect(pane.getByRole('button', { name: 'Cook this' })).toBeEnabled()
		await expect(pane.getByRole('button', { name: 'Add missing to grocery' })).toBeDisabled()
		await expect(pane.getByRole('button', { name: 'Edit' })).toBeVisible()
		await expect(pane.getByRole('button', { name: 'Delete' })).toBeVisible()
	}}
/>

<!-- The tacos open: the limes are not in stock, so the line says missing and the pane offers to list them -->
<Story
	name="Missing an ingredient"
	{template}
	args={{ selected: 'r-02' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const pane = within(canvas.getByRole('complementary', { name: tacos.name }))
		await expect(pane.getAllByText('missing')).toHaveLength(1)
		await expect(pane.queryByRole('button', { name: `A tip for ${tacos.name}` })).toBeNull()
		await userEvent.click(pane.getByRole('button', { name: 'Add 1 missing to grocery' }))
		await expect(args.onmissing).toHaveBeenCalledWith('r-02', ['limes'])
	}}
/>

<!-- A recipe read from a link, in the pane as a form: not saved until it is checked and saved there -->
<Story
	name="Draft"
	{template}
	args={{ draft: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const pane = within(canvas.getByRole('complementary', { name: 'New recipe' }))
		await expect(pane.getByText('Not saved yet. Check it over, then save it.')).toBeVisible()
		await expect(pane.getByRole('textbox', { name: 'Name' })).toHaveValue(recipeDraft.name)
		await expect(pane.getByRole('textbox', { name: 'Serves' })).toHaveValue(String(recipeDraft.serves))
		await expect(pane.getByRole('textbox', { name: 'Time' })).toHaveValue(String(recipeDraft.minutes))
		const ingredients = pane.getByRole<HTMLTextAreaElement>('textbox', { name: 'Ingredients' })
		await expect(ingredients.value.split('\n')).toHaveLength(recipeDraft.ingredients.length)
		await expect(ingredients.value).toContain('500 g chicken thighs')
		await expect(pane.getByRole('textbox', { name: 'Source' })).toHaveValue(recipeDraft.sourceUrl)
		await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
		await expect(pane.getByRole('button', { name: 'Discard' })).toBeVisible()
		await expect(args.onsave).not.toHaveBeenCalled()
		// the draft is not in the list yet
		await expect(within(canvas.getByRole('grid', { name: 'Recipes' })).getAllByRole('row')).toHaveLength(recipes.length)
	}}
/>

<!-- Cook this on the salmon: what each line takes from the stock, and a question where a clove cannot be taken from a head -->
<Story
	name="Cooking"
	{template}
	args={{ mode: 'cook' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const pane = within(canvas.getByRole('complementary', { name: `Cooking ${salmon.name}` }))
		await expect(pane.getAllByRole('listitem')).toHaveLength(salmon.ingredients.length)
		await expect(pane.getByText('Salmon fillets: 2 → none left')).toBeVisible()
		await expect(pane.getByText('Short-grain rice: 2 kg → 1.85 kg')).toBeVisible()
		await expect(pane.getByText('Garlic: 1 head in stock')).toBeVisible()
		const garlic = within(pane.getByRole('radiogroup', { name: 'Garlic' }))
		await expect(garlic.getByRole('radio', { name: 'Leave it' })).toBeChecked()
		await expect(garlic.getByRole('radio', { name: 'Used it up' })).not.toBeChecked()
		// tablespoons cannot be taken from grams either, so the miso asks too
		await expect(pane.getAllByRole('radiogroup')).toHaveLength(2)
		await expect(pane.getByRole('button', { name: 'I cooked this' })).toBeVisible()
		await expect(args.oncooked).not.toHaveBeenCalled()
	}}
/>

<!-- No recipes: the EmptyState with Add a recipe and the sample-data link; the header's action steps back -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const main = within(canvas.getByRole('main'))
		await expect(main.getByRole('heading', { level: 2, name: 'No recipes yet' })).toBeVisible()
		await expect(main.getAllByRole('button', { name: 'Add a recipe' })).toHaveLength(2)
		await expect(main.queryByRole('grid')).toBeNull()
		await expect(main.queryByRole('complementary')).toBeNull()
		main.getByRole('button', { name: 'Add sample data' }).click()
		await expect(args.onsample).toHaveBeenCalledTimes(1)
	}}
/>

<!-- Add a recipe: the sheet with a link pasted, who would read it and for about how much beside Read -->
<Story
	name="Import"
	{template}
	args={{ importing: true }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const page = within(canvasElement.ownerDocument.body)
		const sheet = within(await page.findByRole('dialog', { name: 'Add a recipe' }))
		await expect(sheet.getByRole('textbox', { name: 'The recipe, or a link to it' })).toHaveValue(recipeDraft.sourceUrl)
		// the panel unfurls before its text can be seen
		await waitFor(() => expect(sheet.getByText(/^The page is fetched first\./)).toBeVisible())
		await expect(sheet.getByRole('button', { name: 'Choose a photo or a file' })).toBeVisible()
		await expect(sheet.getByText(`${haul.provider} · ${haul.model} · ${haul.cost}`)).toBeVisible()
		await expect(sheet.getByRole('button', { name: 'Read' })).toBeEnabled()
		await expect(args.onread).not.toHaveBeenCalled()
	}}
/>
