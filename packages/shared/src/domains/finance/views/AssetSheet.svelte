<script lang="ts">
	// The asset form, the one for every kind of thing owned: its name and kind, the value the owner gives it in a
	// currency and the day it was valued, a quantity with its unit when it is counted (0.0412 BTC), and the owner's
	// share. Pricing it from a feed comes later (#76, #81); here the value is what the owner says.
	import { Button, Field, Select, Sheet } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { todayIso } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { currencyOptions, parseMoney, toDecimal } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { finance } from '../store.svelte.js'
	import { ASSET_KINDS, WHOLE, type Asset, type AssetKind } from '../types.js'
	import { assetKindLabel, moneyError, parseShare, shareText } from '../words.js'

	type Props = {
		open: boolean
		asset?: Asset
	}
	let { open = $bindable(), asset }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	// svelte-ignore state_referenced_locally
	let form = $state({
		name: asset?.name ?? '',
		kind: (asset?.kind ?? 'vehicle') as string,
		currency: asset?.value.currency ?? settings.homeCurrency,
		value: asset ? toDecimal(asset.value) : '',
		valuedOn: asset?.valuedOn ?? todayIso(),
		quantity: asset?.quantity ?? '',
		unit: asset?.unit ?? '',
		share: shareText(asset?.share ?? WHOLE),
	})
	type Key = 'name' | 'value' | 'valuedOn' | 'quantity' | 'unit' | 'share'
	let errors = $state<Partial<Record<Key, string>>>({})

	const kinds = $derived(ASSET_KINDS.map((id) => ({ value: id, label: assetKindLabel(id, $t) })))
	const currencies = $derived(currencyOptions(lang, settings.homeCurrency))

	async function save(event: SubmitEvent) {
		event.preventDefault()
		const next: typeof errors = {}
		if (!form.name.trim()) next.name = $t('domains.finance.errors.name')
		const value = parseMoney(form.value, form.currency, lang)
		if ('error' in value) next.value = moneyError(value.error, form.currency, $t, lang)
		if (!/^\d{4}-\d{2}-\d{2}$/.test(form.valuedOn)) next.valuedOn = $t('domains.finance.errors.day')
		const quantity = form.quantity.trim().replace(',', '.')
		if (quantity && !/^\d+(\.\d+)?$/.test(quantity)) next.quantity = $t('domains.finance.errors.quantity')
		if (quantity && !form.unit.trim()) next.unit = $t('domains.finance.errors.unit')
		const share = parseShare(form.share)
		if (share === undefined) next.share = $t('domains.finance.errors.share')
		errors = next
		const first = (['name', 'value', 'valuedOn', 'quantity', 'unit', 'share'] as const).find((key) => next[key])
		if (first || 'error' in value) {
			await tick()
			document.getElementById(`${uid}-${first}`)?.focus()
			return
		}
		const kind = (ASSET_KINDS as readonly string[]).includes(form.kind) ? (form.kind as AssetKind) : 'other'
		const { created, undo } = finance.saveAsset({
			id: asset?.id,
			name: form.name,
			kind,
			value,
			valuedOn: form.valuedOn,
			...(quantity ? { quantity, unit: form.unit.trim() } : {}),
			share: share ?? WHOLE,
		})
		undoToast($t(created ? 'domains.finance.toasts.assetAdded' : 'domains.finance.toasts.assetSaved'), undo)
		open = false
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{asset ? $t('domains.finance.assetForm.titleEdit') : $t('domains.finance.assetForm.titleNew')}
		</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save} novalidate>
		<Field id="{uid}-name" label={$t('domains.finance.assetForm.name')} bind:value={form.name} error={errors.name} />
		<div class="pair">
			<Select label={$t('domains.finance.assetForm.kind')} options={kinds} bind:value={form.kind} />
			<Select label={$t('domains.finance.assetForm.currency')} options={currencies} bind:value={form.currency} />
		</div>
		<div class="pair">
			<Field
				id="{uid}-value"
				label={$t('domains.finance.assetForm.value')}
				unit={form.currency}
				bind:value={form.value}
				error={errors.value}
				mono
				inputmode="decimal"
			/>
			<Field
				id="{uid}-valuedOn"
				label={$t('domains.finance.assetForm.valuedOn')}
				type="date"
				bind:value={form.valuedOn}
				error={errors.valuedOn}
			/>
		</div>
		<div class="pair">
			<Field
				id="{uid}-quantity"
				label={$t('domains.finance.assetForm.quantity')}
				bind:value={form.quantity}
				error={errors.quantity}
				mono
				inputmode="decimal"
			/>
			<Field
				id="{uid}-unit"
				label={$t('domains.finance.assetForm.unit')}
				bind:value={form.unit}
				error={errors.unit}
				required={Boolean(form.quantity.trim())}
			/>
		</div>
		<Field
			id="{uid}-share"
			label={$t('domains.finance.accountForm.share')}
			bind:value={form.share}
			error={errors.share}
			mono
			inputmode="decimal"
		/>
	</form>
	{#snippet footer()}
		<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button label={$t('domains.finance.save')} variant="primary" type="submit" form="{uid}-form" />
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	/* two short fields side by side where the sheet is wide enough, one above the other where it is not */
	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
		gap: var(--space-3);
	}
</style>
