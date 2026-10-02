// The phone's half of the navigation seam (`@eden/shared/navigation`): shared views and stores name a place, and
// this resolves it over the phone's route tree. A module with a side effect, imported first by the root layout, so
// the seam is bound before any child's script runs. A place the phone has no route for yet is left undefined, and
// the seam does nothing for it.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { page } from '$app/state'
import { bindNavigation, type PlaceId } from '@eden/shared/navigation'

const paths: Record<PlaceId, ((tab?: string) => string) | undefined> = {
	garden: () => resolve('/garden'),
	today: () => resolve('/today'),
	profile: undefined,
	gardener: undefined,
	kitchen: () => resolve('/kitchen'),
	toolbench: undefined,
	weather: () => resolve('/weather'),
	places: () => resolve('/places'),
	more: () => resolve('/more'),
}

bindNavigation({
	resolve: (target) => paths[target.place]?.(target.tab),
	goto: (href, options) =>
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- every href comes from `paths`, resolved above
		goto(href, { replaceState: options?.replace, noScroll: options?.noScroll, keepFocus: options?.keepFocus }),
	page: () => page,
})
