<script lang="ts">
	// The passphrase on an archive (docs/engineering/data-layer.md, "Sealed bundle"): a switch, off by default, and
	// while it is off a standing warning that the file is readable by anyone who has it; on, a passphrase typed twice.
	// The export sheet and the Replace backup both use it. It answers `passphrase` only once the two match and are long
	// enough, and `ready` while it is off or valid. The parent clears it by remounting it, so nothing it held outlives
	// it; the passphrase is never stored.
	import { tick } from 'svelte'
	import { Field, Notice, Toggle } from '@eden/ui-kit'
	import { t } from '../../i18n/index.js'

	type Props = {
		/** The switch's label. */
		label: string
		/** What the warning says while the switch is off. */
		warning: string
		/** The passphrase, once it is valid; undefined while the switch is off or the fields do not hold one. */
		passphrase?: string
		/** Off, or on with a valid passphrase: what may go ahead. */
		ready?: boolean
		/** Enter in either field, when the passphrase is valid. */
		onsubmit?: () => void
	}
	// eslint-disable-next-line no-useless-assignment -- bound props: the parent reads what this component writes
	let { label, warning, passphrase = $bindable(), ready = $bindable(true), onsubmit }: Props = $props()

	/** The crate's floor too (`sealed::check_passphrase`), in characters. */
	const MIN = 8
	const uid = $props.id()

	let on = $state(false)
	let first = $state('')
	let second = $state('')
	/** The passphrase field was left; typing in it again clears this, so no error shows while typing. */
	let left = $state(false)

	const length = $derived([...first].length)
	const valid = $derived(length >= MIN && first === second)
	const shortError = $derived(left && length > 0 && length < MIN ? $t('settings.sync.protect.short') : undefined)
	const mismatchError = $derived(second !== '' && first !== second ? $t('settings.sync.protect.mismatch') : undefined)

	function sync() {
		passphrase = on && valid ? first : undefined
		ready = !on || valid
	}

	async function toggled(checked: boolean) {
		on = checked
		first = ''
		second = ''
		left = false
		sync()
		if (!checked) return
		await tick()
		document.getElementById(`${uid}-passphrase`)?.focus()
	}

	function enter(event: KeyboardEvent) {
		if (event.key !== 'Enter') return
		event.preventDefault()
		if (on && valid) onsubmit?.()
	}
</script>

<div class="protection">
	<Toggle bind:checked={on} {label} onchange={toggled} />
	{#if on}
		<Field
			id="{uid}-passphrase"
			type="password"
			autocomplete="new-password"
			label={$t('settings.sync.protect.passphrase')}
			helper={$t('settings.sync.protect.help')}
			error={shortError}
			bind:value={first}
			oninput={() => {
				left = false
				sync()
			}}
			onblur={() => (left = true)}
			onkeydown={enter}
		/>
		<Field
			id="{uid}-confirm"
			type="password"
			autocomplete="new-password"
			label={$t('settings.sync.protect.confirm')}
			error={mismatchError}
			bind:value={second}
			oninput={sync}
			onkeydown={enter}
		/>
	{:else}
		<Notice tone="warning" title={warning} />
	{/if}
</div>

<style>
	.protection {
		display: grid;
		gap: var(--space-4);
	}
</style>
