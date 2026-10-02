<script lang="ts">
	// Meadow's bulk import (product/domains/places.md, "Import"): a list pasted from a note becomes saved places
	// without typing one. Three steps in one sheet: the pasted text; each name looked up, row by row as it resolves;
	// and the review, where a name found twice is chosen, one not found is placed by a click on the map, and the
	// Gardener may tag vibes, marked as suggested. Looking a name up asks a geocoder and no model; Save all is one
	// change with one undo.
	import { Button, Chip, Field, Sheet, Spinner } from '$lib/index.js'
	import { meadowFacets, meadowImport } from '../../sample-data.js'

	type Props = {
		phase?: 'pasted' | 'resolving' | 'review'
		/** The Gardener has tagged the matched rows with vibes. */
		tagged?: boolean
		onfind?: () => void
		ontag?: () => void
		onchoose?: (row: string, option: string) => void
		onplace?: (row: string) => void
		onsave?: () => void
		onclose?: () => void
	}
	let { phase = 'pasted', tagged = false, onfind, ontag, onchoose, onplace, onsave, onclose }: Props = $props()

	const uid = $props.id()
	const vibeLabels = Object.fromEntries(
		meadowFacets.flatMap((facet) => facet.vibes.map((vibe) => [vibe.id, vibe.label]))
	)
	/** While resolving, the first three have come back. */
	const RESOLVED = 3
	const rows = $derived(
		meadowImport.rows.map((row, i) => ({
			...row,
			state: phase === 'resolving' && i >= RESOLVED ? 'resolving' : row.state,
		}))
	)
	const ready = $derived(rows.filter((row) => row.state === 'matched').length)
</script>

<Sheet open size="md" labelledby="{uid}-title" onclose={() => onclose?.()}>
	{#snippet header()}
		<h2 class="title" id="{uid}-title">Import a list</h2>
	{/snippet}
	{#if phase === 'pasted'}
		<div class="step">
			<Field
				label="Your list"
				multiline
				rows={8}
				value={meadowImport.text}
				helper="One place to a line. Bullets, numbers and checkboxes are read as they are; a note after a dash is kept."
			/>
			<p class="source">
				Each name is looked up near Austin, Texas with Photon, a geocoder over OpenStreetMap. No model is asked, and
				nothing is saved until you say so.
			</p>
		</div>
	{:else}
		<div class="step">
			{#if phase === 'resolving'}
				<p class="progress"><Spinner size="sm" label="Looking up" /> Looking up {RESOLVED} of {rows.length}</p>
			{/if}
			<ul class="rows" aria-label="Places in your list">
				{#each rows as row (row.id)}
					<li class="row">
						<div class="row-head">
							<span class="name">{row.name}</span>
							{#if row.state === 'resolving'}
								<Chip label="Looking up" tone="grey" />
							{:else if row.state === 'matched'}
								<Chip label="Found" tone="accent" icon="check" />
							{:else if row.state === 'saved'}
								<Chip label="Already saved" tone="grey" icon="bookmark" />
							{:else if row.state === 'ambiguous'}
								<Chip label="Which one?" tone="honey" />
							{:else}
								<Chip label="Not found" tone="grey" />
							{/if}
						</div>
						{#if 'note' in row && row.note}<p class="note">“{row.note}”</p>{/if}
						{#if row.state !== 'resolving'}
							{#if 'match' in row && row.match}<p class="match">{row.match}</p>{/if}
							{#if row.state === 'ambiguous' && 'options' in row}
								<div class="options" role="group" aria-label="Matches for {row.name}">
									{#each row.options as option, i (option)}
										<Chip label={option} selectable selected={i === 0} onselect={() => onchoose?.(row.id, option)} />
									{/each}
								</div>
							{:else if row.state === 'not-found'}
								<Button label="Place it on the map" icon="map-pin" onclick={() => onplace?.(row.id)} />
							{/if}
							{#if tagged && 'vibes' in row && row.vibes}
								<div class="options">
									{#each row.vibes as vibe (vibe)}
										<Chip label={vibeLabels[vibe] ?? vibe} tone="ai" selectable selected />
									{/each}
								</div>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
			{#if phase === 'review'}
				<div class="tag">
					<Button
						label={tagged ? 'Vibes suggested' : 'Tag vibes with the Gardener'}
						icon="sparkles"
						variant="ai"
						disabled={tagged}
						onclick={ontag}
					/>
					<p class="source">
						{#if tagged}
							Suggested by the Gardener; turn off any that are wrong.
						{:else}
							Optional. Sends the names and no more to claude-sonnet, with no search. About $0.01.
						{/if}
					</p>
				</div>
			{/if}
		</div>
	{/if}
	{#snippet footer()}
		<Button label="Cancel" variant="quiet" onclick={onclose} />
		{#if phase === 'pasted'}
			<Button label="Find these places" variant="primary" icon="search" onclick={onfind} />
		{:else}
			<Button
				label={ready === 1 ? 'Save 1 place' : `Save ${ready} places`}
				variant="primary"
				disabled={phase === 'resolving' || !ready}
				onclick={onsave}
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
		gap: var(--space-2);
	}
	.tag {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-2);
	}
</style>
