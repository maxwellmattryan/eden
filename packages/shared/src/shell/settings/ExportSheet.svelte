<script lang="ts">
	// The export sheet (docs/engineering/data-layer.md, "Settings → Sync and data"): opened by either Export button,
	// it asks whether the archive is sealed under a passphrase before the save dialog or the phone's hand-on runs.
	// Every close, Export included, remounts the protection control, so each open starts off with empty fields and no
	// passphrase outlives the sheet.
	import { Button, Sheet } from '@eden/ui-kit'
	import { t } from '../../i18n/index.js'
	import BundleProtection from './BundleProtection.svelte'

	type Props = {
		open?: boolean
		/** Names the scope: "Export the whole workspace", "Export Kitchen". */
		title: string
		/** Export was pressed; `passphrase` when the archive is to be sealed. */
		onexport: (passphrase?: string) => void
	}
	let { open = $bindable(false), title, onexport }: Props = $props()

	const uid = $props.id()
	let passphrase = $state<string>()
	let ready = $state(true)
	/** Bumped on every close, once the sheet has faded (Cancel, Escape, the scrim and Export alike): the protection
	 * control is remade from nothing. */
	let generation = $state(0)

	function reset() {
		passphrase = undefined
		ready = true
		generation += 1
	}

	function submit() {
		if (!ready) return
		const sealed = passphrase
		open = false
		onexport(sealed)
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title" onclose={reset}>
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{title}</h2>
	{/snippet}
	{#key generation}
		<BundleProtection
			label={$t('settings.sync.protect.label')}
			warning={$t('settings.sync.protect.warning')}
			bind:passphrase
			bind:ready
			onsubmit={submit}
		/>
	{/key}
	{#snippet footer()}
		<Button size="auto" label={$t('settings.sync.exportSheet.cancel')} onclick={() => (open = false)} />
		<Button
			size="auto"
			variant="primary"
			label={$t('settings.sync.exportSheet.export')}
			disabled={!ready}
			onclick={submit}
		/>
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
</style>
