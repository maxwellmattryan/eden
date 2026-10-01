<script lang="ts">
	// The way to pick files without dragging them: an icon button that opens the platform's file picker, in the
	// browser and in the app alike, and hands back the files chosen. It filters the picker by `accept` and holds the
	// files to nothing else: the app runs them through the same `checkFiles` a drop goes through. The same file can be
	// picked twice in a row.
	import type { ComponentProps } from 'svelte'
	import type { IconName } from '../../icons/icons.js'
	import IconButton from '../IconButton/IconButton.svelte'

	type Props = Omit<ComponentProps<typeof IconButton>, 'icon' | 'onclick' | 'type'> & {
		/** The glyph; a paperclip unless the button attaches something more particular. */
		icon?: IconName
		/** What the picker offers: `image/*`, an exact MIME type or an extension (`.pdf`). Absent, everything. */
		accept?: readonly string[]
		/** More than one file may be chosen. */
		multiple?: boolean
		/** Called with the files chosen; never with none. */
		onfiles: (files: File[]) => void
	}
	let { icon = 'paperclip', accept, multiple = true, disabled, onfiles, ...rest }: Props = $props()

	let input = $state<HTMLInputElement>()

	function onchange() {
		if (!input) return
		const files = Array.from(input.files ?? [])
		// cleared so that choosing the same file again is a change
		input.value = ''
		if (files.length) onfiles(files)
	}
</script>

<IconButton {icon} {disabled} onclick={() => input?.click()} {...rest} />
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
	.ed-file-input {
		display: none;
	}
</style>
