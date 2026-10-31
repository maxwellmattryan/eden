<script lang="ts">
	// The grocery quick-add tile (product/domains/kitchen.md, "Garden widgets"): one line that puts an item on the
	// list of the store it was last bought at, read as the Grocery view's own line is ("4 limes"), with how many are still to buy beneath. The write is
	// the store's, so it carries the same undo.
	import { QuickAdd } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { kitchen } from '../store.svelte.js'

	const open = $derived(kitchen.grocery.items.filter((item) => !item.done).length)

	function add(text: string) {
		const { item, store, undo } = kitchen.addGrocery(text)
		const message = store
			? $t('domains.kitchen.grocery.toast.addedTo', { values: { name: item.name, store: store.name } })
			: $t('domains.kitchen.grocery.toast.added', { values: { name: item.name } })
		undoToast(message, undo)
	}
</script>

<div class="tile">
	<QuickAdd placeholder={$t('domains.kitchen.grocery.addPlaceholder')} onadd={add} />
	<p class="count">{$t('domains.kitchen.grocery.toBuy', { values: { count: open } })}</p>
</div>

<style>
	.tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.count {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
