<script lang="ts">
	// The way to pick files without dragging them: an icon button that opens the platform's file picker, in the
	// browser and in the app alike, and hands back the files chosen. It filters the picker by `accept` and holds the
	// files to nothing else: the app runs them through the same `checkFiles` a drop goes through. The same file can be
	// picked twice in a row. Where a file is one of several places the thing may come from (a link, say), the app names
	// the others as `sources` and the press opens a menu instead: the picker first, then the app's own rows.
	import type { ComponentProps } from 'svelte'
	import type { IconName } from '../../icons/icons.js'
	import { useStrings } from '../../i18n/context.js'
	import IconButton from '../IconButton/IconButton.svelte'
	import Menu, { type MenuItem } from '../Menu/Menu.svelte'

	type Props = Omit<ComponentProps<typeof IconButton>, 'icon' | 'onclick' | 'type'> & {
		/** The glyph; a paperclip unless the button attaches something more particular. */
		icon?: IconName
		/** What the picker offers: `image/*`, an exact MIME type or an extension (`.pdf`). Absent, everything. */
		accept?: readonly string[]
		/** More than one file may be chosen. */
		multiple?: boolean
		/** Called with the files chosen; never with none. */
		onfiles: (files: File[]) => void
		/** The other places it may come from. Given, the press opens a menu: "From a file", then these, each with its own `onselect`. */
		sources?: MenuItem[]
	}
	let { icon = 'paperclip', accept, multiple = true, disabled, onfiles, sources, ...rest }: Props = $props()

	const s = useStrings()
	let input = $state<HTMLInputElement>()
	let anchor = $state<HTMLElement>()
	let menuOpen = $state(false)
	const items = $derived<MenuItem[]>([
		{ id: 'file', label: s.file.fromFile, icon: 'file', onselect: () => input?.click() },
		...(sources ?? []),
	])

	function onchange() {
		if (!input) return
		const files = Array.from(input.files ?? [])
		// cleared so that choosing the same file again is a change
		input.value = ''
		if (files.length) onfiles(files)
	}
</script>

{#if sources}
	<span class="ed-file-anchor" bind:this={anchor}>
		<IconButton
			{icon}
			{disabled}
			active={menuOpen}
			aria-haspopup="menu"
			aria-expanded={menuOpen}
			onclick={() => (menuOpen = !menuOpen)}
			{...rest}
		/>
	</span>
	<Menu bind:open={menuOpen} {anchor} align="start" label={rest.label} {items} />
{:else}
	<IconButton {icon} {disabled} onclick={() => input?.click()} {...rest} />
{/if}
<input
	bind:this={input}
	class="ed-file-input"
	type="file"
	accept={accept?.join(',')}
	{multiple}
	{disabled}
	tabindex="-1"
	aria-hidden="true"
	hidden
	{onchange}
/>

<style>
	.ed-file-anchor {
		display: inline-flex;
	}
	.ed-file-input {
		display: none;
	}
</style>
