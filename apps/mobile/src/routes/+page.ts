import { redirect } from '@sveltejs/kit'
import { resolve } from '$app/paths'

// The root has no page of its own: the Garden is home (product/substrate/shell.md).
export function load() {
	redirect(307, resolve('/garden'))
}
