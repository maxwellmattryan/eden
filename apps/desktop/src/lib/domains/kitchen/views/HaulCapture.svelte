<script lang="ts">
	// The capture sheet, bound to Hearth's capture (product/domains/kitchen.md, "Capture a haul"; D-13, D-86). The
	// shell mounts it once, over whatever page is open: a haul is captured from Stock's primary action, from files
	// dropped or pasted on the page, and from a card the Gardener left in a conversation; and the stock is taken from
	// photos of the shelves through the same sheet (D-89). The kit's sheet is the picture; the state, the read and the
	// commit are `capture`'s.
	import { CaptureSheet, type CaptureFile, type CaptureRow } from '@eden/ui-kit'
	import { CATEGORIES } from '@eden/shared/domains/kitchen'
	import { MAX_FILES } from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { capture } from '../capture.svelte'
	import { kitchen } from '../store.svelte'
	import { CAPTURE_ACCEPT, sourceDetail, type CaptureRefusal } from '../staging.svelte'
	import { failureOf, readerOf, refusalOf } from '../words'

	const reader = $derived(readerOf($t, capture.preview))
	const files = $derived<CaptureFile[]>(
		capture.staging.sources.map((source) => ({
			key: source.key,
			name: source.name,
			detail: sourceDetail(source),
			thumbnail: source.thumbnail,
			busy: source.busy,
		}))
	)
	// a row's picture, cut from its photo, is the sheet's thumbnail
	const rows = $derived<CaptureRow[]>(
		capture.rows.map(({ image, seen: _seen, ...row }) => ({ ...row, thumbnail: image }))
	)
	const categories = $derived(CATEGORIES.map((id) => ({ id, label: $t(`domains.kitchen.categories.${id}`) })))
	// the stores a haul may have been bought at: the one picked learns the prices on the rows (D-105)
	const stores = $derived(kitchen.grocery.stores.map((store) => ({ id: store.id, label: store.name })))
	const rules = $derived({
		accept: [...CAPTURE_ACCEPT],
		maxFiles: MAX_FILES,
		count: capture.staging.sources.length,
	})

	/** Files the sheet's own rules refused are named with the ones staging refused. */
	function onrejected(rejected: { file: File; reason: string }[]) {
		capture.staging.refused.push(
			...rejected.map(({ file, reason }) => ({ name: file.name, reason: reason as CaptureRefusal }))
		)
	}
	function onfiles(added: File[]) {
		capture.staging.refused = []
		void capture.add(added)
	}
</script>

<CaptureSheet
	bind:open={capture.open}
	phase={capture.phase}
	kind={capture.mode}
	{files}
	{rows}
	{rules}
	{categories}
	{stores}
	store={capture.storeId}
	storeHint={capture.storeRead}
	onstorechange={(id) => capture.setStore(id)}
	provider={reader.provider}
	model={reader.model}
	cost={reader.cost}
	blocked={reader.blocked}
	error={capture.phase === 'failed' ? failureOf($t, capture.failure) : undefined}
	{onfiles}
	{onrejected}
	onpastetext={(text) => capture.addText(text, $t('domains.kitchen.capture.pastedText'))}
	onremovefile={(key) => capture.remove(key)}
	onread={() => void capture.read()}
	onstop={() => void capture.stop()}
	onrowchange={(id, patch) => capture.edit(id, patch)}
	onremoverow={(id) => capture.removeRow(id)}
	onaddrow={() => capture.addRow()}
	oncommit={() => capture.commit()}
	onclose={() => capture.close()}
>
	{#snippet notice()}
		{#if capture.staging.refused.length}
			<span role="status">{refusalOf($t, capture.staging.refused)}</span>
		{/if}
	{/snippet}
</CaptureSheet>
