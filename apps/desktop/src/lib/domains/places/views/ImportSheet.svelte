<script lang="ts">
	// Meadow's import sheet (product/domains/places.md, "Import"): a list pasted from a note becomes saved places
	// without typing one. Three steps in one sheet: the pasted text; each name looked up, row by row as it resolves;
	// and the review, where a name found several times is chosen, one not found is placed by a click on the map, and
	// the Gardener may tag vibes, each marked as suggested. No model is needed to import. Save is one change with one
	// undo. It is the domain's overlay, so it opens over whatever page is showing.
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { Button, Chip, Field, InlineError, Sheet, Spinner } from '@eden/ui-kit'
	import { FACETS, meadow, vibesByFacet } from '@eden/shared/domains/places'
	import { formatCost } from '@eden/shared/gardener'
	import { locale, t } from '@eden/shared/i18n'
	import { undoToast } from '@eden/shared/shell'
	import { placesImport, type ImportRow } from '../import.svelte'
	import { vibeNamer } from '../words'

	const uid = $props.id()
	const lang = $derived($locale ?? 'en')
	const vibeName = $derived(vibeNamer($t, meadow.vibes))
	const everyVibe = $derived(FACETS.flatMap((facet) => vibesByFacet(meadow.vibes)[facet]))
	/** The row whose vibes are being chosen: its chips unfold to every vibe. */
	let choosing = $state<string>()

	const ready = $derived(placesImport.ready.length)
	const hitLabel = (row: ImportRow, at: number) => {
		const hit = row.hits[at]
		return hit ? [hit.name, hit.addressLine, hit.locality].filter(Boolean).join(', ') : ''
	}
	const tagCost = $derived(
		placesImport.preview && !('unavailable' in placesImport.preview)
			? formatCost(placesImport.preview.estimateUsd)
			: undefined
	)
	const tagBlocked = $derived(
		placesImport.preview && 'unavailable' in placesImport.preview ? placesImport.preview.unavailable : undefined
	)

	function place(row: ImportRow) {
		placesImport.placeByHand(row.id)
		// the map is where a place is put: go there if another page is showing
		void goto(resolve('/places/[[tab]]', {}))
	}
	function save() {
		const { places, undo } = placesImport.save()
		if (!places.length) return
		undoToast($t('domains.places.import.saved', { values: { count: places.length } }), undo)
		void goto(resolve('/places/[[tab]]', {}))
	}
</script>

<Sheet
	bind:open={placesImport.open}
	size="md"
	labelledby="{uid}-title"
	onclose={() => {
		// standing aside for a click on the map is not closing
		if (!placesImport.placing) placesImport.close()
	}}
>
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.places.import.title')}</h2>
	{/snippet}
	{#if placesImport.phase === 'paste'}
		<div class="step">
			<Field
				label={$t('domains.places.import.list')}
				multiline
				rows={9}
				bind:value={placesImport.text}
				placeholder={$t('domains.places.import.placeholder')}
				helper={$t('domains.places.import.help')}
			/>
			<p class="source">{$t('domains.places.import.sends')}</p>
		</div>
	{:else}
		<div class="step">
			{#if placesImport.resolving}
				<p class="progress">
					<Spinner size="sm" label={$t('domains.places.import.looking')} />
					{$t('domains.places.import.progress', {
						values: { done: placesImport.looked, total: placesImport.rows.length },
					})}
				</p>
			{/if}
			<ul class="rows" aria-label={$t('domains.places.import.rows')}>
				{#each placesImport.rows as row (row.id)}
					<li class={['row', row.skipped && 'row-skipped']}>
						<div class="row-head">
							<span class="name">{row.name}</span>
							{#if row.state === 'waiting' || row.state === 'looking'}
								<Chip label={$t('domains.places.import.state.looking')} tone="grey" />
							{:else if row.state === 'matched'}
								<Chip label={$t('domains.places.import.state.matched')} tone="accent" icon="check" />
							{:else if row.state === 'saved'}
								<Chip label={$t('domains.places.import.state.saved')} tone="grey" icon="bookmark" />
							{:else if row.state === 'ambiguous'}
								<Chip label={$t('domains.places.import.state.ambiguous')} tone="honey" />
							{:else if row.point}
								<Chip label={$t('domains.places.import.state.placed')} tone="accent" icon="map-pin" />
							{:else}
								<Chip label={$t('domains.places.import.state.notFound')} tone="grey" />
							{/if}
						</div>
						{#if row.note}<p class="note">“{row.note}”</p>{/if}
						{#if row.state === 'matched' && row.pick !== undefined}
							<p class="match">{hitLabel(row, row.pick)}</p>
						{:else if row.state === 'ambiguous'}
							<div
								class="options"
								role="group"
								aria-label={$t('domains.places.import.matches', { values: { name: row.name } })}
							>
								{#each row.hits as hit, i (hit.externalId)}
									<Chip
										label={hitLabel(row, i)}
										tone="outline"
										icon="map-pin"
										onclick={() => placesImport.choose(row.id, i)}
									/>
								{/each}
							</div>
						{:else if row.state === 'not-found'}
							<Button
								label={$t(row.point ? 'domains.places.import.placeAgain' : 'domains.places.import.place')}
								icon="map-pin"
								onclick={() => place(row)}
							/>
						{/if}
						{#if row.state === 'matched' || (row.state === 'not-found' && row.point)}
							<div class="options">
								{#each choosing === row.id ? everyVibe.map((vibe) => vibe.id) : row.vibes as vibe (vibe)}
									<Chip
										label={vibeName(vibe)}
										tone={row.suggested ? 'ai' : 'neutral'}
										selectable
										selected={row.vibes.includes(vibe)}
										onselect={() => placesImport.toggleVibe(row.id, vibe)}
									/>
								{/each}
								<Button
									label={$t(choosing === row.id ? 'common.done' : 'domains.places.import.vibes')}
									variant="quiet"
									onclick={() => (choosing = choosing === row.id ? undefined : row.id)}
								/>
								<Button
									label={$t(row.skipped ? 'domains.places.import.keep' : 'domains.places.import.leaveOut')}
									variant="quiet"
									onclick={() => placesImport.skip(row.id, !row.skipped)}
								/>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			{#if !placesImport.resolving}
				<div class="tag">
					{#if placesImport.tagFailure}
						<InlineError
							message={$t(`domains.places.failure.${placesImport.tagFailure}`)}
							onretry={() => placesImport.tag()}
						/>
					{/if}
					<div class="tag-row">
						<Button
							label={$t(
								placesImport.tagging
									? 'domains.places.import.tagging'
									: placesImport.tagged
										? 'domains.places.import.tagged'
										: 'domains.places.import.tag'
							)}
							icon="sparkles"
							variant="ai"
							disabled={placesImport.tagging ||
								placesImport.tagged ||
								tagBlocked !== undefined ||
								!placesImport.preview}
							onclick={() => void placesImport.tag()}
						/>
						{#if placesImport.tagging}<Spinner size="sm" label={$t('domains.places.import.tagging')} />{/if}
					</div>
					<p class="source">
						{#if placesImport.tagged}
							{$t('domains.places.import.taggedHelp')}
						{:else if tagBlocked}
							{$t(`domains.places.failure.${tagBlocked}`)}
						{:else if tagCost}
							{$t('domains.places.import.tagHelp', { values: { cost: tagCost } })}
						{/if}
					</p>
				</div>
			{/if}
		</div>
	{/if}
	{#snippet footer()}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => placesImport.close()} />
		{#if placesImport.phase === 'paste'}
			<Button
				label={$t('domains.places.import.find')}
				variant="primary"
				icon="search"
				disabled={!placesImport.text.trim()}
				onclick={() => placesImport.find(lang)}
			/>
		{:else}
			<Button
				label={$t('domains.places.import.save', { values: { count: ready } })}
				variant="primary"
				disabled={placesImport.resolving || !ready}
				onclick={save}
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
	.step {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.source,
	.note,
	.match,
	.progress {
		margin: 0;
	}
	.source {
		color: var(--text-secondary);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
	}
	.progress {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.rows {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		overflow: hidden;
	}
	.row {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-2);
		padding: var(--space-3);
	}
	.row + .row {
		border-top: 1px solid var(--stroke-subtle);
	}
	.row-skipped .name,
	.row-skipped .match {
		color: var(--text-secondary);
		text-decoration: line-through;
	}
	.row-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		width: 100%;
	}
	.name {
		font: var(--ed-t-text);
		font-weight: 500;
	}
	.note,
	.match {
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.tag {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-2);
	}
	.tag-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
</style>
