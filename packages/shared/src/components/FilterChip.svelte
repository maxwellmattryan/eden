<script lang="ts">
	// One filter of a list: a chip that says what it is set to and opens a menu of what it may be, as Stock's sort
	// does (design/ux-patterns.md, "Lists"). Outline at rest, accent once it narrows the list. The menu closes on a
	// pick, so a filter that takes several values takes one pick per opening.
	import { Chip, Menu, type MenuItem } from '@eden/ui-kit'

	type Props = {
		/** What the chip says: the filter's name, with its value once it has one. */
		label: string
		/** The menu's accessible name. */
		menuLabel: string
		/** Whether the filter narrows the list. */
		active: boolean
		/** The choices, the set ones `checked`. */
		items: MenuItem[]
		/** Called with the id of the choice picked. */
		onpick: (id: string) => void
	}
	let { label, menuLabel, active, items, onpick }: Props = $props()

	let anchor = $state<HTMLElement>()
	let open = $state(false)
</script>

<span class="anchor" bind:this={anchor}>
	<Chip
		{label}
		tone={active ? 'accent' : 'outline'}
		icon="chevron-down"
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={() => (open = !open)}
	/>
</span>
<Menu bind:open {anchor} align="start" label={menuLabel} {items} onselect={(item) => onpick(item.id ?? item.label)} />

<style>
	.anchor {
		display: inline-flex;
	}
</style>
