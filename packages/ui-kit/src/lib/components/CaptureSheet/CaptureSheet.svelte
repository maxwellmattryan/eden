<script module lang="ts">
	export type CaptureLocation = 'fridge' | 'freezer' | 'pantry' | 'counter'

	/** One recognised item, as the provider returned it; the sheet edits a copy and commits the copies. */
	export interface CaptureRow {
		id: string
		name: string
		qty: number | string
		unit?: string
		location: CaptureLocation
		/** As the label shows it: "10-02". */
		expiry?: string
		/** The expiry was guessed, not read. */
		estimated?: boolean
		/** The stock item this row merges into, when one matches. */
		merge?: string
	}

	/** The four locations, in the order the chips show them. */
	export const LOCATIONS: readonly CaptureLocation[] = ['fridge', 'freezer', 'pantry', 'counter']
</script>

<script lang="ts">
	// The verification step of Capture (D-13; docs/design/ux-patterns.md, "Capture verification sheet"): the image
	// with the provider and its cost named beneath, and the draft rows beside it, each editable inline: name, quantity,
	// the location as a radio group of chips, the expiry with its estimated badge, a merge line when a stock item
	// matches, and remove. The rows are a working copy of `rows`, taken once; nothing is stored until Commit, which
	// hands the kept rows back. Discard, Escape and the scrim call `onclose`. On mobile the sheet is full height and
	// the thumbnail sits above the rows; `layout` reads the platform once unless it is forced.
	import type { HTMLDialogAttributes } from 'svelte/elements'
	import { untrack } from 'svelte'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { platformOf } from '../../internal/platform.js'
	import { roving } from '../../internal/roving.js'
	import Badge from '../Badge/Badge.svelte'
	import Button from '../Button/Button.svelte'
	import Chip from '../Chip/Chip.svelte'
	import Field from '../Field/Field.svelte'
	import IconButton from '../IconButton/IconButton.svelte'
	import Sheet, { type SheetCloseReason } from '../Sheet/Sheet.svelte'

	type Props = Omit<HTMLDialogAttributes, 'open' | 'oncancel' | 'onclose' | 'onkeydown'> & {
		/** Bindable. Set it to open; every close path sets it back to false. */
		open?: boolean
		/** Who processes the image: "Anthropic". */
		provider: string
		/** The cost estimate, as text: "0.6 ¢". */
		cost: string
		/** The recognised rows. Copied once into the draft; remount the sheet for a new capture. */
		rows: CaptureRow[]
		/** The thumbnail's URL. Without it a neutral block stands in. */
		image?: string
		/** wide puts the image beside the rows, stacked above them at full height; auto follows data-platform. */
		layout?: 'auto' | 'wide' | 'stacked'
		/** Called with the kept rows when Commit is pressed; the sheet then closes. */
		oncommit?: (rows: CaptureRow[]) => void
		/** Called when the draft is discarded: the Discard button, Escape or the scrim. */
		onclose?: () => void
	}
	const uid = $props.id()
	let {
		open = $bindable(false),
		provider,
		cost,
		rows,
		image,
		layout = 'auto',
		oncommit,
		onclose,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const titleId = `${uid}-title`
	// The working copy: what the owner edits and removes, and what Commit hands back.
	// svelte-ignore state_referenced_locally
	let draft = $state<CaptureRow[]>(rows.map((row) => ({ ...row })))
	const created = $derived(draft.filter((row) => !row.merge).length)
	const merged = $derived(draft.length - created)

	let body = $state<HTMLElement>()
	const stacked = $derived(layout === 'auto' ? !!body && platformOf(body) === 'mobile' : layout === 'stacked')

	function remove(id: string) {
		draft = draft.filter((row) => row.id !== id)
	}
	function discard() {
		onclose?.()
		open = false
	}
	function commit() {
		if (!draft.length) return
		oncommit?.($state.snapshot(draft))
		open = false
	}
	// Escape and the scrim close the dialog themselves and report here; a close through `open` has been accounted for.
	function closed(reason: SheetCloseReason) {
		if (reason !== 'api') onclose?.()
	}
</script>

<Sheet
	bind:open
	size={stacked ? 'full' : 'lg'}
	labelledby={titleId}
	onclose={closed}
	class="ed-capture {className}"
	{...rest}
>
	{#snippet header()}
		<h2 class="ed-capture-title" id={titleId}>{s.capture.title}</h2>
	{/snippet}
	<div class={['ed-capture-body', { 'ed-capture-stacked': stacked }]} bind:this={body}>
		<div class="ed-capture-media">
			<div class="ed-capture-image">
				{#if image}<img src={image} alt={s.capture.image} />{:else}<Icon name="camera" size="lg" />{/if}
			</div>
			<p class="ed-capture-provider">{s.capture.processedBy(provider, cost)}</p>
		</div>
		<ul class="ed-capture-rows" aria-label={s.capture.draftRows}>
			{#each draft as row (row.id)}
				<li class={['ed-capture-row', { 'ed-capture-row-merge': !!row.merge }]}>
					<div class="ed-capture-name">
						<Field bind:value={row.name} aria-label={s.capture.rowName} />
					</div>
					{#if row.merge}
						<span class="ed-capture-merge"><Badge kind="neutral" label={s.capture.mergesWith(row.merge)} /></span>
					{/if}
					<div class="ed-capture-qty">
						<Field
							value={String(row.qty)}
							mono
							inputmode="decimal"
							aria-label={s.capture.rowQty}
							oninput={(e) => (row.qty = e.currentTarget.value)}
						/>
					</div>
					<span class="ed-capture-unit">{row.unit ?? ''}</span>
					<div
						class="ed-capture-locations"
						role="radiogroup"
						aria-label={s.capture.location(row.name)}
						{@attach roving(() => ({
							selector: '[role="radio"]',
							orientation: 'horizontal',
							current: () => untrack(() => LOCATIONS.indexOf(row.location)),
							onMove: (_, index) => (row.location = LOCATIONS[index]!),
						}))}
					>
						{#each LOCATIONS as location (location)}
							<Chip
								label={s.capture.locations[location]}
								tone={row.location === location ? 'accent' : 'neutral'}
								role="radio"
								aria-checked={row.location === location}
								onclick={() => (row.location = location)}
							/>
						{/each}
					</div>
					<span class="ed-capture-expiry">
						{#if row.expiry}
							<span class={['ed-capture-key', { 'ed-sr-only': !stacked }]}>{s.capture.expires}</span>
							<span class="ed-capture-date">{row.expiry}</span>
						{/if}
						{#if row.estimated}<Badge kind="estimated" />{/if}
					</span>
					<span class="ed-capture-remove">
						<IconButton
							icon="trash"
							label={s.remove(row.name)}
							size={stacked ? 'md' : 'sm'}
							onclick={() => remove(row.id)}
						/>
					</span>
				</li>
			{/each}
		</ul>
	</div>
	{#snippet footer()}
		<p class="ed-capture-note" role="status">
			{draft.length ? s.capture.footer(created, merged) : s.capture.everyRowRemoved}
		</p>
		<Button label={s.discard} variant="quiet" onclick={discard} />
		<Button label={s.commit} variant="primary" disabled={!draft.length} onclick={commit} />
	{/snippet}
</Sheet>

<style>
	.ed-capture-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
		color: var(--text-primary);
	}
	.ed-capture-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 3fr);
		gap: var(--space-4);
		align-items: start;
	}
	.ed-capture-media {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.ed-capture-image {
		aspect-ratio: 1;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-2);
		color: var(--text-tertiary);
		display: grid;
		place-items: center;
		overflow: hidden;
	}
	.ed-capture-image img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.ed-capture-provider {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	/* The list owns the column tracks and each row subgrids into them, so quantities, units and chips align down the
	   list. The chip and expiry tracks are auto, so under pressure they wrap before the name field gives way. */
	.ed-capture-rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns:
			minmax(calc(var(--space-8) * 3), 1fr) calc(var(--space-8) + var(--space-6)) max-content auto auto
			max-content;
		column-gap: var(--space-2);
		min-width: 0;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-0);
		overflow: hidden;
	}
	.ed-capture-rows:empty {
		display: none;
	}
	.ed-capture-row {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		grid-template-areas:
			'name qty unit locations expiry remove'
			'merge merge merge merge merge merge';
		align-items: center;
		min-height: var(--ed-row);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--ed-card-border);
		transition: background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-capture-row:last-child {
		border-bottom: 0;
	}
	.ed-capture-row-merge {
		background: var(--brand-muted);
	}
	.ed-capture-name {
		grid-area: name;
		min-width: 0;
	}
	.ed-capture-merge {
		grid-area: merge;
		margin-top: var(--space-1);
		min-width: 0;
	}
	.ed-capture-qty {
		grid-area: qty;
		min-width: 0;
	}
	.ed-capture-unit {
		grid-area: unit;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-primary);
	}
	.ed-capture-locations {
		grid-area: locations;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.ed-capture-expiry {
		grid-area: expiry;
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		white-space: nowrap;
	}
	.ed-capture-key {
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.ed-capture-date {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-primary);
	}
	.ed-capture-remove {
		grid-area: remove;
		justify-self: end;
		display: inline-flex;
	}
	.ed-capture-note {
		margin: 0 auto 0 0;
		align-self: center;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}

	/* stacked: the mobile sheet, full height, the thumbnail a strip above the rows and each row on three lines */
	.ed-capture-stacked {
		grid-template-columns: minmax(0, 1fr);
	}
	.ed-capture-stacked .ed-capture-media {
		flex-direction: row;
		align-items: center;
		gap: var(--space-3);
	}
	.ed-capture-stacked .ed-capture-image {
		width: calc(var(--space-8) * 2);
		flex: none;
	}
	.ed-capture-stacked .ed-capture-rows {
		grid-template-columns: minmax(0, 1fr) calc(var(--space-8) * 2 + var(--space-2)) max-content max-content;
	}
	.ed-capture-stacked .ed-capture-row {
		grid-template-areas:
			'name qty unit remove'
			'merge merge merge merge'
			'locations locations locations locations'
			'expiry expiry expiry expiry';
	}
	.ed-capture-stacked .ed-capture-locations,
	.ed-capture-stacked .ed-capture-expiry {
		margin-top: var(--space-2);
	}
	.ed-capture-stacked .ed-capture-expiry {
		white-space: normal;
	}
</style>
