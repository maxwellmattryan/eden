<script lang="ts">
	// A recipe's fields, in the Recipes view's detail pane (docs/design/ux-patterns.md: forms open in the pane, never
	// in a modal): where a draft is checked before it is saved, and where a saved recipe is changed. The ingredients
	// and the steps are text, one to a line, read the way a quick-add line is: "200 g spinach, washed" is an amount, a
	// name and a note. The form is filled once, from the recipe it is given; a new recipe is a new form.
	import { Button, Field } from '@eden/ui-kit'
	import { formatIngredient, parseIngredient } from '@eden/shared/domains/kitchen'
	import { t } from '@eden/shared/i18n'
	import type { RecipeDraft } from '../store.svelte'

	type Props = {
		recipe: RecipeDraft
		/** The pane's heading: a draft says it is not saved yet. */
		title: string
		/** What the draft says beneath its heading, when it has something to say. */
		note?: string
		id: string
		/** The quiet action beside Save: Discard for a draft, Cancel for an edit. */
		cancelLabel: string
		onsave: (recipe: RecipeDraft) => void
		oncancel: () => void
	}
	let { recipe, title, note, id, cancelLabel, onsave, oncancel }: Props = $props()

	// svelte-ignore state_referenced_locally
	let form = $state({
		name: recipe.name,
		serves: String(recipe.serves || ''),
		minutes: recipe.minutes ? String(recipe.minutes) : '',
		tags: recipe.tags.join(', '),
		ingredients: recipe.ingredients.map(formatIngredient).join('\n'),
		steps: recipe.steps.join('\n'),
		sourceUrl: recipe.sourceUrl ?? '',
		tip: recipe.tip ?? '',
	})

	const lines = (text: string) =>
		text
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
	const whole = (text: string, fallback: number) => {
		const value = Math.round(Number(text))
		return Number.isFinite(value) && value > 0 ? value : fallback
	}
	const ready = $derived(form.name.trim().length > 0 && lines(form.ingredients).length > 0)

	function save() {
		if (!ready) return
		onsave({
			name: form.name.trim(),
			serves: whole(form.serves, 2),
			minutes: whole(form.minutes, 0),
			tags: form.tags
				.split(',')
				.map((tag) => tag.trim().toLowerCase())
				.filter(Boolean),
			ingredients: lines(form.ingredients).map(parseIngredient),
			steps: lines(form.steps).map((step) => step.replace(/^\d+[.)]\s*/, '')),
			...(form.sourceUrl.trim() ? { sourceUrl: form.sourceUrl.trim() } : {}),
			...(form.tip.trim() ? { tip: form.tip.trim() } : {}),
		})
	}
</script>

<h2 class="title" {id}>{title}</h2>
{#if note}<p class="note">{note}</p>{/if}
<form
	class="form"
	onsubmit={(event) => {
		event.preventDefault()
		save()
	}}
>
	<Field label={$t('domains.kitchen.recipes.form.name')} bind:value={form.name} />
	<div class="pair">
		<Field label={$t('domains.kitchen.recipes.form.serves')} bind:value={form.serves} mono inputmode="numeric" />
		<Field
			label={$t('domains.kitchen.recipes.form.minutes')}
			unit={$t('domains.kitchen.recipes.form.minutesUnit')}
			bind:value={form.minutes}
			mono
			inputmode="numeric"
		/>
	</div>
	<Field
		label={$t('domains.kitchen.recipes.form.ingredients')}
		helper={$t('domains.kitchen.recipes.form.ingredientsHelp')}
		bind:value={form.ingredients}
		multiline
		rows={6}
	/>
	<Field
		label={$t('domains.kitchen.recipes.form.steps')}
		helper={$t('domains.kitchen.recipes.form.stepsHelp')}
		bind:value={form.steps}
		multiline
		rows={6}
	/>
	<Field
		label={$t('domains.kitchen.recipes.form.tags')}
		helper={$t('domains.kitchen.recipes.form.tagsHelp')}
		bind:value={form.tags}
	/>
	<Field label={$t('domains.kitchen.recipes.form.tip')} bind:value={form.tip} multiline rows={2} />
	<Field label={$t('domains.kitchen.recipes.form.source')} bind:value={form.sourceUrl} type="url" />
	<div class="actions">
		<Button label={$t('common.save')} variant="primary" type="submit" disabled={!ready} />
		<Button label={cancelLabel} variant="quiet" onclick={oncancel} />
	</div>
</form>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
	}
	.note {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
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
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
