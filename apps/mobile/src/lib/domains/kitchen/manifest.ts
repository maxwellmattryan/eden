// Hearth on the phone (product/domains/kitchen.md, "Mobile"): its page, which renders the empty state until the
// approved mockup under `Domains/Hearth` in Storybook is implemented (D-54).
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain } from '../manifest.js'

export const kitchenManifest = defineDomain('kitchen', {
	routes: { href: resolve('/kitchen'), open: () => void goto(resolve('/kitchen')) },
})
