<script lang="ts">
	// A recipe's fields, in the Recipes view's detail pane (docs/design/ux-patterns.md: forms open in the pane, never
	// in a modal): where a draft is checked before it is saved, and where a saved recipe is changed. The ingredients
	// and the steps are text, one to a line, read the way a quick-add line is: "200 g spinach, washed" is an amount, a
	// name and a note. The form is filled once, from the recipe it is given; a new recipe is a new form. The picture
	// (D-93) is not one of the fields: the form shows the one it is handed and says what the owner chose (a file, a
	// link, or a picture dropped or pasted, D-110), and the view keeps it with the recipe when the form is saved.
	import { Button, Field, Toggle, toast } from '@eden/ui-kit'
	import { formatIngredient, parseIngredient } from '@eden/shared/domains/kitchen'
	import { t } from '@eden/shared/i18n'
	import { linkedRecipePicture, recipePicture, type RecipePicture } from '../staging.svelte'
	import PictureDrop from './PictureDrop.svelte'
	import PictureInput from './PictureInput.svelte'
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
		/** The picture the recipe would be saved with, as a URL the page may load. */
		picture?: string
		/** The picture of the recipe's page is on its way. */
		fetching?: boolean
		/** The owner chose a picture, or took the picture away. */
		onpicture: (picture: RecipePicture | undefined) => void
		onsave: (recipe: RecipeDraft) => void
		oncancel: () => void
	}
	let { recipe, title, note, id, cancelLabel, picture, fetching = false, onpicture, onsave, oncancel }: Props = $props()

	// svelte-ignore state_referenced_locally
	let form = $state({
		name: recipe.name,
		serves: String(recipe.serves || ''),
		minutes: recipe.minutes ? String(recipe.minutes) : '',
		tags: recipe.tags.join(', '),
		ingredients: recipe.ingredients.map(formatIngredient).join('\n'),
		steps: recipe.steps.join('\n'),
		sourceUrl: recipe.sourceUrl ?? '',
		sourceName: recipe.sourceName ?? '',
		author: recipe.author ?? '',
		scales: recipe.scales !== false,
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
			...(form.sourceName.trim() ? { sourceName: form.sourceName.trim() } : {}),
			...(form.author.trim() ? { author: form.author.trim() } : {}),
			...(form.tip.trim() ? { tip: form.tip.trim() } : {}),
			...(form.scales ? {} : { scales: false }),
			...(recipe.imageUrl ? { imageUrl: recipe.imageUrl } : {}),
		})
	}

	async function choose(file: File) {
		const chosen = await recipePicture(file)
		if (chosen) onpicture(chosen)
		else toast({ message: $t('domains.kitchen.recipes.toast.pictureFailed') })
	}
	async function link(address: string) {
		const chosen = await linkedRecipePicture(address)
		if (chosen) onpicture(chosen)
		else toast({ message: $t('domains.kitchen.recipes.toast.pictureLinkFailed') })
		return !!chosen
	}
</script>

<h2 class="title" {id}>{title}</h2>
{#if note}<p class="note">{note}</p>{/if}
<PictureDrop onfile={(file) => void choose(file)}>
	<form
		class="form"
		onsubmit={(event) => {
			event.preventDefault()
			save()
		}}
	>
		<PictureInput
			{picture}
			glyph="cooking-pot"
			chooseLabel={$t('domains.kitchen.recipes.form.choosePicture')}
			removeLabel={$t('domains.kitchen.recipes.form.removePicture')}
			linkHelp={$t('domains.kitchen.recipes.form.pictureLinkHelp')}
			note={fetching ? $t('domains.kitchen.recipes.form.fetchingPicture') : undefined}
			onfile={(file) => void choose(file)}
			onlink={link}
			onremove={() => onpicture(undefined)}
		/>
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
		<Toggle
			label={$t('domains.kitchen.recipes.form.scales')}
			description={$t('domains.kitchen.recipes.form.scalesHelp')}
			bind:checked={form.scales}
		/>
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
		<div class="pair">
			<Field label={$t('domains.kitchen.recipes.form.author')} bind:value={form.author} />
			<Field
				label={$t('domains.kitchen.recipes.form.sourceName')}
				helper={$t('domains.kitchen.recipes.form.sourceNameHelp')}
				bind:value={form.sourceName}
			/>
		</div>
		<Field label={$t('domains.kitchen.recipes.form.source')} bind:value={form.sourceUrl} type="url" />
		<div class="actions">
			<Button label={$t('common.save')} variant="primary" type="submit" disabled={!ready} />
			<Button label={cancelLabel} variant="quiet" onclick={oncancel} />
		</div>
	</form>
</PictureDrop>

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
		align-items: start;
		gap: var(--space-3);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
