<script lang="ts">
	// One stock item, as the owner reads it (Domains/Hearth/Stock): its picture or its category's glyph (D-90), its
	// name with its tip beside it (D-87), its fields as a definition list, then what can be done with it: Edit, Add to
	// grocery, Move (its places in a menu), Ran out and Delete. Desktop's Stock shows it in its detail pane, framed as
	// a card; the phone's in a sheet, where the sheet is the frame. The actions are the caller's: `onact` hears
	// `edit`, `grocery`, `move:<location>`, `ranOut` and `delete`, the ids of the row's menu.
	import { Badge, Button, Chip, Icon, IconButton, Menu } from '@eden/ui-kit'
	import { formatDay, formatDayTime } from '../../../dates/index.js'
	import { locale, t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { kitchen } from '../store.svelte.js'
	import { CATEGORIES, type StockItem } from '../types.js'
	import { categoryGlyph, stockMoveItems } from '../words.js'

	type Props = {
		item: StockItem
		/** An action on the item: `edit`, `grocery`, `move:<location>`, `ranOut` or `delete`. */
		onact: (action: string) => void
		/** Drawn as a card of its own: desktop's pane. In a sheet the sheet is the frame. */
		framed?: boolean
	}
	let { item, onact, framed = true }: Props = $props()

	const uid = $props.id()
	const format = $derived({ lang: $locale ?? 'en', clock: settings.clock })
	const locationLabel = (location: string) => $t(`domains.kitchen.stock.locations.${location}`)
	const quantity = (entry: StockItem) => (entry.unit ? `${entry.qty} ${entry.unit}` : entry.qty)
	/** A category as the page names it: one of the ids, or the words a row from before they were ids holds. */
	const categoryLabel = (category: string) =>
		(CATEGORIES as readonly string[]).includes(category) ? $t(`domains.kitchen.categories.${category}`) : category
	const image = $derived(kitchen.photoOf(item))

	// Move opens the same choices as the row's menu, anchored to its button.
	let moveAnchor = $state<HTMLElement>()
	let moveOpen = $state(false)
</script>

<aside class={['detail', framed && 'detail-framed']} aria-labelledby="{uid}-title">
	<div class="detail-head">
		{#if image}
			<img class="picture" src={image} alt="" />
		{:else}
			<span class="picture picture-glyph" aria-hidden="true"><Icon name={categoryGlyph(item.category)} /></span>
		{/if}
		<h2 class="detail-title" id="{uid}-title">{item.name}</h2>
		{#if item.tip}
			<IconButton
				icon="info"
				size="xs"
				label={$t('domains.kitchen.stock.detail.tipFor', { values: { name: item.name } })}
				tooltip={item.tip}
			/>
		{/if}
	</div>
	<dl class="fields">
		{#if item.brand}
			<dt>{$t('domains.kitchen.stock.detail.brand')}</dt>
			<dd>{item.brand}</dd>
		{/if}
		{#if item.size}
			<dt>{$t('domains.kitchen.stock.detail.size')}</dt>
			<dd class="mono">{item.size}</dd>
		{/if}
		<dt>{$t('domains.kitchen.stock.detail.quantity')}</dt>
		<dd class="mono">
			{#if kitchen.out(item)}
				<Badge kind="origin" label={$t('domains.kitchen.stock.badge.ranOut')} />
			{:else}
				{quantity(item)}
			{/if}
			{#if kitchen.low(item)}<Badge kind="warning" label={$t('domains.kitchen.stock.badge.lowStock')} />{/if}
		</dd>
		<dt>{$t('domains.kitchen.stock.detail.location')}</dt>
		<dd><Chip label={locationLabel(item.location)} /></dd>
		{#if item.expiry}
			<dt>{$t('domains.kitchen.stock.detail.expires')}</dt>
			<dd class="mono">
				{formatDay(item.expiry)}
				{#if item.estimated}<Badge kind="estimated" />{/if}
				{#if kitchen.soon(item)}<Badge kind="warning" label={$t('domains.kitchen.stock.badge.thisWeek')} />{/if}
			</dd>
		{/if}
		{#if item.category}
			<dt>{$t('domains.kitchen.stock.detail.category')}</dt>
			<dd>{categoryLabel(item.category)}</dd>
		{/if}
		<dt>{$t('domains.kitchen.stock.detail.source')}</dt>
		<dd>
			<Badge kind="origin" label={$t(`domains.kitchen.stock.source.${item.source}`)} />
			<span class="mono">{formatDayTime(item.sourcedAt, format)}</span>
		</dd>
		{#if item.threshold !== undefined}
			<dt>{$t('domains.kitchen.stock.detail.threshold')}</dt>
			<dd class="mono">{item.threshold}</dd>
		{/if}
	</dl>
	<div class="detail-actions">
		<Button label={$t('domains.kitchen.stock.actions.edit')} icon="pencil" onclick={() => onact('edit')} />
		<Button label={$t('domains.kitchen.stock.actions.addToGrocery')} icon="plus" onclick={() => onact('grocery')} />
		{#if !kitchen.out(item)}
			<span class="anchor" bind:this={moveAnchor}>
				<Button
					label={$t('domains.kitchen.stock.actions.move')}
					icon="arrow-right"
					aria-haspopup="menu"
					aria-expanded={moveOpen}
					onclick={() => (moveOpen = !moveOpen)}
				/>
			</span>
			<Menu
				bind:open={moveOpen}
				anchor={moveAnchor}
				align="start"
				label={$t('domains.kitchen.stock.actions.move')}
				items={stockMoveItems($t, item.location)}
				onselect={(entry) => onact(entry.id ?? '')}
			/>
			<Button label={$t('domains.kitchen.stock.actions.ranOut')} icon="circle-dashed" onclick={() => onact('ranOut')} />
		{/if}
		<Button
			label={$t('domains.kitchen.stock.actions.delete')}
			variant="danger"
			icon="trash"
			onclick={() => onact('delete')}
		/>
	</div>
</aside>

<style>
	/* The item's name with its tip beside it, its fields as a definition list, the actions */
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		box-sizing: border-box;
	}
	.detail-framed {
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.detail-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	/* the item's picture, or its category's glyph on a tile of the same size */
	.picture {
		flex: none;
		box-sizing: border-box;
		width: calc(var(--space-8) * 2);
		height: calc(var(--space-8) * 2);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-control);
		object-fit: cover;
		background: var(--surface-2);
	}
	.picture-glyph {
		display: inline-grid;
		place-items: center;
		color: var(--text-secondary);
	}
	.detail-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
	}
	.fields {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-2) var(--space-4);
		align-items: center;
		margin: 0;
	}
	.fields dt {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.fields dd {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.mono {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
	}
	.detail-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.anchor {
		display: inline-flex;
	}
</style>
