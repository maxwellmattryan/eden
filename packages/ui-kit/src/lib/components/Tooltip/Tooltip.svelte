<script lang="ts">
	// A wrapper for the rare host that cannot take an attachment: a component that does not spread its rest props, or a
	// run of text. Everything else puts the attachment straight on the control, `<IconButton {@attach tooltip(s.back)} />`,
	// so the bubble anchors to the control itself and no extra element enters the tree.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { tooltip } from './tooltip.js'

	type Props = HTMLAttributes<HTMLSpanElement> & {
		/** What the bubble says: an icon's name, a collapsed subtitle. Never the only place a fact lives. */
		text: string
		/** The side of the host the bubble prefers; it flips when there is no room. */
		side?: 'top' | 'bottom'
		/** The host: the control or text the tooltip describes. */
		children: Snippet
	}
	let { text, side = 'bottom', children, class: className = '', ...rest }: Props = $props()
</script>

<span class="ed-tooltip-host {className}" {@attach tooltip(() => text, { side })} {...rest}>{@render children()}</span>

<style>
	.ed-tooltip-host {
		/* a box of its own, so the bubble has a rect to anchor to whatever the children are */
		display: inline-block;
	}
</style>
