<script lang="ts">
	// The asset form, the one for every kind of thing owned: its name and kind, the value the owner gives it in a
	// currency and the day it was valued, a quantity with its unit when it is counted (0.0412 BTC), and the owner's
	// share. A crypto asset with a quantity is priced daily (D-201). On the desktop, where crypto is bound, a crypto
	// asset may instead watch one Bitcoin or Ethereum address or a Bitcoin extended public key, read from the chain once
	// a day: no value is asked, the crate checks what was typed, and an extended key goes to the device's secure store
	// under the asset's id, never into the row. A private key is refused here and sent nowhere. A watched asset keeps
	// what it watches: only its name and share can change.
	import { Button, Field, Segmented, Select, Sheet, Spinner } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { cryptoErrorCode, watchAddressCheck, watchXpubSet, type WatchScript } from '../../../api/crypto.js'
	import { newId } from '../../../data/index.js'
	import { todayIso } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { currencyOptions, parseMoney, toDecimal } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { isPrivateKey, shortAddress, watchedAsset } from '../crypto.js'
	import { crypto } from '../crypto.svelte.js'
	import { finance, type AssetDraft } from '../store.svelte.js'
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
		chain: 'bitcoin',
		address: '',
		xpub: '',
		script: 'p2wpkh',
	})
	type Key = 'name' | 'address' | 'xpub' | 'value' | 'valuedOn' | 'quantity' | 'unit' | 'share'
	let errors = $state<Partial<Record<Key, string>>>({})
	let checking = $state(false)

	const MODES = ['quantity', 'address', 'xpub'] as const
	let mode = $state(0)
	// svelte-ignore state_referenced_locally
	const watched = asset?.watch
	/** What this form counts by: a watch only for a new crypto asset where the crate is. */
	const counted = $derived(crypto.bound && form.kind === 'crypto' && !watched ? MODES[mode]! : 'quantity')
	const valued = $derived(counted === 'quantity' && !watched)

	const kinds = $derived(ASSET_KINDS.map((id) => ({ value: id, label: assetKindLabel(id, $t) })))
	const currencies = $derived(currencyOptions(lang, settings.homeCurrency))
	const modes = $derived(MODES.map((id) => $t(`domains.finance.assetForm.modes.${id}`)))
	const chains = $derived(
		(['bitcoin', 'ethereum'] as const).map((id) => ({ value: id, label: $t(`domains.finance.assetForm.chains.${id}`) }))
	)
	const SCRIPTS: WatchScript[] = ['p2wpkh', 'p2sh-p2wpkh', 'p2pkh']
	const scripts = $derived(SCRIPTS.map((id) => ({ value: id, label: $t(`domains.finance.assetForm.scripts.${id}`) })))
	/** Only a plain `xpub` leaves the address type open; `ypub` and `zpub` say theirs. */
	const scriptOpen = $derived(form.xpub.trim().startsWith('xpub'))
	const privateKey = $derived(isPrivateKey(form.xpub) ? $t('domains.finance.assetForm.errors.privateKey') : undefined)
	const watchingLine = $derived.by(() => {
		if (!watched) return undefined
		if (watched.address)
			return $t('domains.finance.assetForm.watching', { values: { address: shortAddress(watched.address) } })
		const type = $t(`domains.finance.assetForm.scripts.${watched.script ?? 'p2wpkh'}`)
		return $t('domains.finance.assetForm.watchingKey', { values: { type } })
	})

	/** The crate's refusal of an address or an extended key, as the field's words. */
	function refusal(error: unknown, chain: string): string {
		const code = cryptoErrorCode(error)
		if (code === 'private-key') return $t('domains.finance.assetForm.errors.privateKey')
		if (code === 'unsupported') return $t('domains.finance.assetForm.errors.unsupported')
		if (code === 'invalid-address')
			return counted === 'xpub'
				? $t('domains.finance.assetForm.errors.invalidXpub')
				: $t(`domains.finance.assetForm.errors.${chain === 'ethereum' ? 'ethereum' : 'bitcoin'}`)
		return $t('domains.finance.assetForm.errors.other')
	}

	async function focusFirst(next: typeof errors) {
		const order: Key[] = ['name', 'address', 'xpub', 'value', 'valuedOn', 'quantity', 'unit', 'share']
		const first = order.find((key) => next[key])
		if (!first) return false
		await tick()
		document.getElementById(`${uid}-${first}`)?.focus()
		return true
	}

	function saved(draft: AssetDraft) {
		const { created, undo } = finance.saveAsset(draft)
		undoToast($t(created ? 'domains.finance.toasts.assetAdded' : 'domains.finance.toasts.assetSaved'), undo)
		open = false
	}

	async function save(event: SubmitEvent) {
		event.preventDefault()
		if (checking) return
		const next: typeof errors = {}
		if (!form.name.trim()) next.name = $t('domains.finance.errors.name')
		const share = parseShare(form.share)
		if (share === undefined) next.share = $t('domains.finance.errors.share')

		if (watched && asset) {
			errors = next
			if (await focusFirst(next)) return
			return saved({ ...asset, name: form.name, share: share ?? WHOLE })
		}

		if (counted !== 'quantity') {
			const home = settings.homeCurrency
			if (counted === 'address' && !form.address.trim()) next.address = $t('domains.finance.assetForm.errors.address')
			if (counted === 'xpub') {
				if (!form.xpub.trim()) next.xpub = $t('domains.finance.assetForm.errors.xpub')
				else if (privateKey) next.xpub = privateKey
			}
			errors = next
			if (await focusFirst(next)) return
			checking = true
			try {
				if (counted === 'address') {
					const chain = form.chain === 'ethereum' ? 'ethereum' : 'bitcoin'
					let address: string
					try {
						address = await watchAddressCheck(chain, form.address.trim())
					} catch (error) {
						errors = { address: refusal(error, chain) }
						await focusFirst(errors)
						return
					}
					return saved(watchedAsset({ id: asset?.id, name: form.name, share: share ?? WHOLE, home, chain, address }))
				}
				// the key is stored under the asset's id before the row is written
				const id = asset?.id ?? newId()
				let script: WatchScript
				try {
					;({ script } = await watchXpubSet(
						id,
						form.xpub.trim(),
						scriptOpen ? (form.script as WatchScript) : undefined
					))
				} catch (error) {
					errors = { xpub: refusal(error, 'bitcoin') }
					await focusFirst(errors)
					return
				}
				return saved(watchedAsset({ id, name: form.name, share: share ?? WHOLE, home, chain: 'bitcoin', script }))
			} finally {
				checking = false
			}
		}

		const value = parseMoney(form.value, form.currency, lang)
		if ('error' in value) next.value = moneyError(value.error, form.currency, $t, lang)
		if (!/^\d{4}-\d{2}-\d{2}$/.test(form.valuedOn)) next.valuedOn = $t('domains.finance.errors.day')
		const quantity = form.quantity.trim().replace(',', '.')
		if (quantity && !/^\d+(\.\d+)?$/.test(quantity)) next.quantity = $t('domains.finance.errors.quantity')
		if (quantity && !form.unit.trim()) next.unit = $t('domains.finance.errors.unit')
		errors = next
		if ((await focusFirst(next)) || 'error' in value) return
		const kind = (ASSET_KINDS as readonly string[]).includes(form.kind) ? (form.kind as AssetKind) : 'other'
		saved({
			id: asset?.id,
			name: form.name,
			kind,
			value,
			valuedOn: form.valuedOn,
			...(quantity ? { quantity, unit: form.unit.trim() } : {}),
			share: share ?? WHOLE,
		})
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
		{#if watched}
			<p class="watching">{watchingLine}</p>
		{:else}
			<div class="pair">
				<Select label={$t('domains.finance.assetForm.kind')} options={kinds} bind:value={form.kind} />
				{#if valued}
					<Select label={$t('domains.finance.assetForm.currency')} options={currencies} bind:value={form.currency} />
				{/if}
			</div>
			{#if crypto.bound && form.kind === 'crypto'}
				<div class="counted">
					<Segmented items={modes} bind:selected={mode} label={$t('domains.finance.assetForm.countedBy')} />
				</div>
			{/if}
		{/if}
		{#if counted === 'address'}
			<Select label={$t('domains.finance.assetForm.chain')} options={chains} bind:value={form.chain} />
			<Field
				id="{uid}-address"
				label={$t('domains.finance.assetForm.address')}
				bind:value={form.address}
				error={errors.address}
				autocomplete="off"
				spellcheck="false"
				disabled={checking}
				mono
			/>
		{:else if counted === 'xpub'}
			<Field
				id="{uid}-xpub"
				type="password"
				label={$t('domains.finance.assetForm.xpub')}
				bind:value={form.xpub}
				helper={$t('domains.finance.assetForm.xpubHelp')}
				error={privateKey ?? errors.xpub}
				autocomplete="off"
				spellcheck="false"
				disabled={checking}
				mono
			/>
			{#if scriptOpen}
				<Select label={$t('domains.finance.assetForm.script')} options={scripts} bind:value={form.script} />
			{/if}
		{:else if valued}
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
		{/if}
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
		{#if checking}<Spinner size="sm" />{/if}
		<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button label={$t('domains.finance.save')} variant="primary" type="submit" form="{uid}-form" disabled={checking} />
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
	/* the Counted by choice spans the form, its three choices sharing the width */
	.counted :global(.ed-seg) {
		display: flex;
	}
	.counted :global(.ed-seg-tab) {
		flex: 1;
		justify-content: center;
	}
	.watching {
		margin: 0;
		font: var(--ed-t-body);
		color: var(--text-secondary);
	}
</style>
