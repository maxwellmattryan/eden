<script lang="ts">
	// Add a recipe (product/domains/kitchen.md, "Recipes"): paste its text or a link to it, or bring a photo of the
	// page or the card. The sheet names who will read it and about what it costs before anything is sent; Read is the
	// consent (D-86). A link's page is fetched by the app (D-88), and a page that describes its own recipe is read with
	// no model asked. What comes back opens in the Recipes view as a draft to check: nothing is stored here.
	import { Button, Dropzone, Field, FileButton, FileChip, InlineError, Sheet, Spinner } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { recipeImport } from '../recipe-draft.svelte'
	import { CAPTURE_ACCEPT, sourceDetail } from '../staging.svelte'
	import { failureOf, readerOf, refusalOf } from '../words'

	type Props = {
		/** A draft was made: the page shows it. */
		ondraft?: () => void
	}
	let { ondraft }: Props = $props()

	const uid = $props.id()
	const reader = $derived(readerOf($t, recipeImport.preview))
	const reading = $derived(recipeImport.phase === 'reading')

	async function read() {
		if (await recipeImport.read()) ondraft?.()
	}
	/** A pasted photo is staged; pasted words go into the field they land in. */
	function onpaste(event: ClipboardEvent) {
		const files = [...(event.clipboardData?.files ?? [])]
		if (!files.length) return
		event.preventDefault()
		void recipeImport.staging.add(files)
	}
</script>

<Sheet bind:open={recipeImport.open} size="md" labelledby="{uid}-title" onclose={() => recipeImport.close()}>
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.kitchen.recipes.import.title')}</h2>
	{/snippet}
	<Dropzone
		accept={[...CAPTURE_ACCEPT]}
		disabled={reading}
		ondrop={(accepted) => void recipeImport.staging.add(accepted)}
	>
		<div class="body" {onpaste}>
			<Field
				label={$t('domains.kitchen.recipes.import.label')}
				placeholder={$t('domains.kitchen.recipes.import.placeholder')}
				helper={recipeImport.insecure
					? $t('domains.kitchen.failure.not-https')
					: recipeImport.link
						? $t('domains.kitchen.recipes.import.linkHelp')
						: $t('domains.kitchen.recipes.import.help')}
				bind:value={recipeImport.text}
				multiline
				rows={6}
				disabled={reading}
				oninput={() => void recipeImport.refresh()}
			/>
			<div class="files">
				{#each recipeImport.staging.sources as source (source.key)}
					<FileChip
						name={source.name}
						detail={sourceDetail(source)}
						thumbnail={source.thumbnail}
						state={source.busy ? 'busy' : 'ready'}
						onremove={reading ? undefined : () => recipeImport.staging.remove(source.key)}
					/>
				{/each}
				<FileButton
					label={$t('domains.kitchen.recipes.import.choose')}
					icon="camera"
					accept={CAPTURE_ACCEPT}
					multiple
					tooltip
					disabled={reading}
					onfiles={(files) => void recipeImport.staging.add(files)}
				/>
			</div>
			{#if recipeImport.staging.refused.length}
				<p class="refused" role="status">{refusalOf($t, recipeImport.staging.refused)}</p>
			{/if}
			{#if recipeImport.phase === 'failed'}
				<InlineError
					message={failureOf($t, recipeImport.failure === 'empty' ? 'no-recipe' : recipeImport.failure)}
					onretry={read}
					live
				/>
			{/if}
		</div>
	</Dropzone>
	{#snippet footer()}
		<p class="reader" role="status">
			{#if reading}
				<Spinner size="sm" label={$t('domains.kitchen.recipes.import.reading')} />
				{$t('domains.kitchen.recipes.import.reading')}
			{:else if reader.blocked}
				{reader.blocked}
			{:else if reader.provider}
				{[
					reader.provider,
					reader.model,
					reader.cost && $t('domains.kitchen.capture.about', { values: { cost: reader.cost } }),
				]
					.filter(Boolean)
					.join(' · ')}
			{/if}
		</p>
		{#if reading}
			<Button label={$t('domains.kitchen.capture.stop')} variant="quiet" onclick={() => void recipeImport.stop()} />
		{:else}
			<Button label={$t('common.cancel')} variant="quiet" onclick={() => recipeImport.close()} />
			<Button
				label={$t('domains.kitchen.recipes.import.read')}
				variant="primary"
				disabled={!recipeImport.ready}
				onclick={read}
			/>
		{/if}
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.files {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.refused {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.reader {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 auto 0 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
</style>
