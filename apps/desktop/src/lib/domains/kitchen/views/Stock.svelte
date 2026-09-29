<script lang="ts">
	// Hearth's Stock view, ported from Domains/Hearth/Stock: a quick-add line, one List per location sorted by expiry
	// with quantities in mono, `estimated` where capture guessed and a warning where stock is low, and the selected
	// item in a detail pane with its fields, its storage tip and its actions. Selection is the List's own mode (D-41).
	import {
		Badge,
		Button,
		Chip,
		EmptyState,
		List,
		Menu,
		QuickAdd,
		defaultParse,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { undoToast } from '$lib/shell/undo'
	import { formatDay, formatDayTime } from '@eden/shared/dates'
	import { LOCATIONS, kitchen, type StockItem, type StockLocation } from '../store.svelte'

	type Props = {
		/** The id the page's Add action focuses. */
		quickAddId: string
		/** The Expiring filter: only what is dated within the next two days. */
		expiring?: boolean
		/** The Low stock filter. */
		lowStock?: boolean
		/** Capture a haul, the empty state's primary action. */
		oncapture: () => void
	}
	let { quickAddId, expiring = false, lowStock = false, oncapture }: Props = $props()

	const uid = $props.id()
	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })
	const locationLabel = (location: StockLocation) => $t(`domains.kitchen.stock.locations.${location}`)
	const quantity = (item: StockItem) => (item.unit ? `${item.qty} ${item.unit}` : item.qty)

	const moveItems = (item: StockItem): MenuItem[] =>
		LOCATIONS.filter((location) => location !== item.location).map((location) => ({
			id: `move:${location}`,
			label: $t('domains.kitchen.stock.actions.moveTo', { values: { location: locationLabel(location) } }),
			icon: 'arrow-right' as const,
		}))
	const actionsFor = (item: StockItem): MenuItem[] => [
		...moveItems(item),
		{ id: 'grocery', label: $t('domains.kitchen.stock.actions.addToGrocery'), icon: 'plus' },
		{ id: 'delete', label: $t('domains.kitchen.stock.actions.delete'), icon: 'trash', destructive: true },
	]
	const toRow = (item: StockItem): ListRowData => ({
		id: item.id,
		primary: item.name,
		chips: [{ label: quantity(item), mono: true }],
		badges: [
			...(item.lowStock ? [{ kind: 'warning' as const, label: $t('domains.kitchen.stock.badge.lowStock') }] : []),
			...(item.estimated ? [{ kind: 'estimated' as const }] : []),
		],
		meta: item.expiry ? formatDay(item.expiry) : undefined,
		metaWarn: kitchen.soon(item),
		actions: actionsFor(item),
	})

	const sections = $derived(
		kitchen.sections((item) => (!expiring || kitchen.soon(item)) && (!lowStock || !!item.lowStock))
	)
	let selected = $state<string>()
	const detail = $derived(kitchen.stock.find((item) => item.id === selected) ?? sections[0]?.items[0])

	function act(action: string, id: string) {
		const item = kitchen.stock.find((entry) => entry.id === id)
		if (!item) return
		if (action.startsWith('move:')) {
			const location = action.slice('move:'.length) as StockLocation
			const label = locationLabel(location)
			const { undo } = kitchen.moveStock(id, location, label)
			undoToast($t('domains.kitchen.stock.toast.moved', { values: { name: item.name, location: label } }), undo)
		} else if (action === 'grocery') {
			const { undo } = kitchen.addToGrocery(item.name, '', 'manual')
			undoToast($t('domains.kitchen.stock.toast.addedToGrocery', { values: { name: item.name } }), undo)
		} else if (action === 'delete') {
			const { undo } = kitchen.removeStock(id)
			undoToast($t('domains.kitchen.stock.toast.removed', { values: { name: item.name } }), undo)
		}
	}
	function onaction(menuItem: MenuItem, row: ListRowData) {
		act(menuItem.id ?? '', row.id)
	}
	function add(text: string) {
		const { item, undo } = kitchen.addStock(text)
		undoToast($t('domains.kitchen.stock.toast.added', { values: { name: item.name } }), undo)
	}
	function seed() {
		undoToast($t('common.sampleAdded'), kitchen.seed($t('domains.kitchen.name')))
	}

	// The detail pane's Move opens the same choices as the row's menu, anchored to its button.
	let moveAnchor = $state<HTMLElement>()
	let moveOpen = $state(false)
</script>

{#if kitchen.stock.length === 0}
	<EmptyState
		title={$t('domains.kitchen.stock.empty.title')}
		text={$t('domains.kitchen.stock.empty.text')}
		action={{ label: $t('domains.kitchen.capture.action'), icon: 'camera', onclick: oncapture }}
		sample={{ onclick: seed }}
	/>
{:else}
	<div class={['body', { 'body-wide': detail }]}>
		<div class="lists">
			<QuickAdd
				id={quickAddId}
				placeholder={$t('domains.kitchen.stock.addPlaceholder')}
				parse={defaultParse}
				onadd={add}
			/>
			{#each sections as section (section.location)}
				<List
					header={locationLabel(section.location)}
					count={section.items.length}
					rows={section.items.map(toRow)}
					selectable
					onopen={(row) => (selected = row.id)}
					{onaction}
				/>
			{/each}
		</div>

		{#if detail}
			<aside class="detail" aria-labelledby="{uid}-detail">
				<h2 class="detail-title" id="{uid}-detail">{detail.name}</h2>
				<dl class="fields">
					<dt>{$t('domains.kitchen.stock.detail.quantity')}</dt>
					<dd class="mono">{quantity(detail)}</dd>
					<dt>{$t('domains.kitchen.stock.detail.location')}</dt>
					<dd><Chip label={locationLabel(detail.location)} /></dd>
					{#if detail.expiry}
						<dt>{$t('domains.kitchen.stock.detail.expires')}</dt>
						<dd class="mono">
							{formatDay(detail.expiry)}
							{#if detail.estimated}<Badge kind="estimated" />{/if}
							{#if kitchen.soon(detail)}<Badge kind="warning" label={$t('domains.kitchen.stock.badge.thisWeek')} />{/if}
						</dd>
					{/if}
					{#if detail.category}
						<dt>{$t('domains.kitchen.stock.detail.category')}</dt>
						<dd>{detail.category}</dd>
					{/if}
					<dt>{$t('domains.kitchen.stock.detail.source')}</dt>
					<dd>
						<Badge kind="origin" label={$t(`domains.kitchen.stock.source.${detail.source}`)} />
						<span class="mono">{formatDayTime(detail.sourcedAt, format)}</span>
					</dd>
					{#if detail.lowStock}
						<dt>{$t('domains.kitchen.stock.detail.threshold')}</dt>
						<dd class="mono">{detail.threshold ?? 10}</dd>
					{/if}
				</dl>
				{#if detail.tip}
					<section class="tip" aria-labelledby="{uid}-tip">
						<h3 class="tip-title" id="{uid}-tip">{$t('domains.kitchen.stock.detail.tip')}</h3>
						<p class="tip-text">{detail.tip}</p>
					</section>
				{/if}
				<div class="detail-actions">
					<Button
						label={$t('domains.kitchen.stock.actions.addToGrocery')}
						icon="plus"
						onclick={() => act('grocery', detail.id)}
					/>
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
						items={moveItems(detail)}
						onselect={(item) => act(item.id ?? '', detail.id)}
					/>
					<Button
						label={$t('domains.kitchen.stock.actions.delete')}
						variant="quiet"
						onclick={() => act('delete', detail.id)}
					/>
				</div>
			</aside>
		{/if}
	</div>
{/if}

<style>
	/* The lists on the left and the detail pane on the right */
	.body {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.body-wide {
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
	}
	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.anchor {
		display: inline-flex;
	}

	/* The detail pane: the item's name, its fields as a definition list, the storage tip in the voice, the actions */
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		box-sizing: border-box;
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
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
	.tip {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3);
		border-radius: var(--ed-radius-control);
		background: var(--surface-2);
	}
	.tip-title {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.tip-text {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		text-wrap: pretty;
	}
	.detail-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
