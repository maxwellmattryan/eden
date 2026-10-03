<script lang="ts">
	// The way to pick files without dragging them: an icon button that opens the platform's file picker, in the
	// browser and in the app alike, and hands back the files chosen. It filters the picker by `accept` and holds the
	// files to nothing else: the app runs them through the same `checkFiles` a drop goes through. The same file can be
	// picked twice in a row. Where a file is one of several places the thing may come from (a link, say), the app names
	// the others as `sources` and the press opens a menu instead: the picker first, then the app's own rows. With
	// `camera`, on the phone, the camera is one of those places (D-170): the menu leads with "Take a
	// photo", a second file input that carries `capture`, so the system opens the camera at once, and the picker's
	// row reads "From the library or files", the input without `capture`, where the system offers its own chooser.
	// On desktop `camera` does nothing.
	import type { ComponentProps } from 'svelte'
	import type { IconName } from '../../icons/icons.js'
	import { useStrings } from '../../i18n/context.js'
	import { platformOf } from '../../internal/platform.js'
	import IconButton from '../IconButton/IconButton.svelte'
	import Menu, { type MenuItem } from '../Menu/Menu.svelte'

	type Props = Omit<ComponentProps<typeof IconButton>, 'icon' | 'onclick' | 'type'> & {
		/** The glyph; a paperclip unless the button attaches something more particular. */
		icon?: IconName
		/** What the picker offers: `image/*`, an exact MIME type or an extension (`.pdf`). Absent, everything. */
		accept?: readonly string[]
		/** More than one file may be chosen. */
		multiple?: boolean
		/** Called with the files chosen, or the photo taken; never with none. */
		onfiles: (files: File[]) => void
		/** The other places it may come from. Given, the press opens a menu: "From a file", then these, each with its own `onselect`. */
		sources?: MenuItem[]
		/**
		 * On the phone the press opens a menu that leads with "Take a photo", which opens the camera directly; the
		 * photo comes back through `onfiles`, one at a time. Nothing changes on desktop.
		 */
		camera?: boolean
	}
	let {
		icon = 'paperclip',
		accept,
		multiple = true,
		disabled,
		onfiles,
		sources,
		camera = false,
		...rest
	}: Props = $props()

	const s = useStrings()
	let input = $state<HTMLInputElement>()
	let shot = $state<HTMLInputElement>()
	let anchor = $state<HTMLElement>()
	let menuOpen = $state(false)
	/** The camera is offered: asked for, and on the phone. The picker's input is always there to read the platform from. */
	const shoots = $derived(camera && !!input && platformOf(input) === 'mobile')
	const items = $derived<MenuItem[]>([
		...(shoots
			? [{ id: 'camera', label: s.file.takePhoto, icon: 'camera' as const, onselect: () => shot?.click() }]
			: []),
		{
			id: 'file',
			label: shoots ? s.file.fromLibrary : s.file.fromFile,
			icon: shoots ? 'image' : 'file',
			onselect: () => input?.click(),
		},
		...(sources ?? []),
	])

	function onchange(e: Event & { currentTarget: HTMLInputElement }) {
		const from = e.currentTarget
		const files = Array.from(from.files ?? [])
		// cleared so that choosing the same file again is a change
		from.value = ''
		if (files.length) onfiles(files)
	}
</script>

{#if sources || shoots}
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
{#if shoots}
	<!-- the camera's own input: `capture` sends the system straight to the camera, and a camera takes pictures -->
	<input
		bind:this={shot}
		class="ed-file-input"
		type="file"
		accept="image/*"
		capture="environment"
		{disabled}
		tabindex="-1"
		aria-hidden="true"
		hidden
		{onchange}
	/>
{/if}

<style>
	.ed-file-anchor {
		display: inline-flex;
	}
	.ed-file-input {
		display: none;
	}
</style>
