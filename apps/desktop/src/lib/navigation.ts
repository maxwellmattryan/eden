// The desktop's half of the navigation seam (`@eden/shared/navigation`): shared views and stores name a place, and
// this resolves it over the desktop's route tree. A module with a side effect, imported first by the root layout, so
// the seam is bound before any child's script runs.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { page } from '$app/state'
import { bindNavigation, type PlaceId } from '@eden/shared/navigation'

const paths: Record<PlaceId, ((tab?: string) => string) | undefined> = {
	garden: () => resolve('/garden'),
	today: () => resolve('/today'),
	profile: () => resolve('/garden/profile'),
	gardener: (tab) => resolve('/gardener/[[tab]]', tab ? { tab } : {}),
	kitchen: (tab) => resolve('/kitchen/[[tab]]', tab ? { tab } : {}),
	toolbench: (tab) => resolve('/toolbench/[[tab]]', tab ? { tab } : {}),
	weather: () => resolve('/weather'),
	places: (tab) => resolve('/places/[[tab]]', tab ? { tab } : {}),
	// the phone's own place
	more: undefined,
}

bindNavigation({
	resolve: (target) => paths[target.place]?.(target.tab),
	goto: (href, options) =>
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- every href comes from `paths`, resolved above
		goto(href, { replaceState: options?.replace, noScroll: options?.noScroll, keepFocus: options?.keepFocus }),
	page: () => page,
})
