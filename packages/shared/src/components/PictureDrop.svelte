<script lang="ts">
	// Around a form that holds a picture: a picture dropped on the form, or pasted while it is open, is the one the
	// owner chose, the same as a file picked through the button. Only a file is taken: text pasted into a field lands
	// in the field, and a link goes through the button's menu. The drag is kept from a zone the page has around it
	// (the Recipes page takes dropped files as a recipe to import), so one drop is never read twice.
	import type { Snippet } from 'svelte'
	import { Dropzone } from '@eden/ui-kit'
	import { PICTURE_ACCEPT } from '../api/index.js'

	type Props = {
		onfile: (file: File) => void
		children: Snippet
	}
	let { onfile, children }: Props = $props()

	const held = (event: DragEvent) => event.stopPropagation()

	function paste(event: ClipboardEvent) {
		const file = Array.from(event.clipboardData?.files ?? []).find((entry) => entry.type.startsWith('image/'))
		if (!file) return
		event.preventDefault()
		// the page behind may take pasted files as its own (Stock starts a capture with them): this one is the form's
		event.stopPropagation()
		onfile(file)
	}
</script>

<div role="presentation" ondragenter={held} ondragover={held} ondragleave={held} ondrop={held} onpaste={paste}>
	<Dropzone accept={PICTURE_ACCEPT} maxFiles={1} ondrop={(accepted) => accepted[0] && onfile(accepted[0])}>
		{@render children()}
	</Dropzone>
</div>
