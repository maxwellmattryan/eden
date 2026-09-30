import { redirect } from '@sveltejs/kit'
import { resolve } from '$app/paths'
import { lastPlace } from '@eden/shared/navigation'
import { manifests } from '$lib/domains'

// The root has no page of its own: the place the owner was last at, while it is still one, else the Garden, which is
// home (product/substrate/shell.md).
export function load() {
	const known = [
		resolve('/garden'),
		resolve('/today'),
		resolve('/more'),
		...manifests.flatMap((manifest) => (manifest.routes ? [manifest.routes.href] : [])),
	]
	redirect(307, lastPlace(known) ?? resolve('/garden'))
}
