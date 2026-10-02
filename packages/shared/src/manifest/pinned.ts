// The two domains in the phone's tab bar as the owner chose them (product/substrate/shell.md, "Mobile";
// D-TBD(pinned-tabs)). The choice is this device's and is stored as it was made; what the bar shows is this
// function's answer, so a domain that has since been disabled, or one the phone has no page for, gives its tab to
// the next in line instead of leaving a gap. Pure: `tabBar(declarations, shell, pinnedPair(...))`.
import type { DomainDeclaration, ShellDeclaration } from './types.js'

/**
 * The pinned pair: the stored ids that are enabled, routable and distinct, in their order; then the declared pair;
 * then the enabled domains in their order. As long as the shell declares (two), and shorter only when fewer domains
 * qualify.
 */
export function pinnedPair(
	stored: readonly string[] | undefined,
	declarations: readonly DomainDeclaration[],
	shell: ShellDeclaration,
	routable: (id: string) => boolean = () => true
): string[] {
	const enabled = declarations.map((declaration) => declaration.id as string)
	const pair: string[] = []
	for (const id of [...(stored ?? []), ...shell.tabs.pinned, ...enabled]) {
		if (pair.length >= shell.tabs.pinned.length) break
		if (enabled.includes(id) && routable(id) && !pair.includes(id)) pair.push(id)
	}
	return pair
}

/**
 * The pair after one slot takes a domain. Choosing the domain the other slot holds swaps the two, so the pair is
 * always two different domains and the picker has no state to refuse.
 */
export function withPinned(pair: readonly string[], slot: number, id: string): string[] {
	const next = [...pair]
	const held = next.indexOf(id)
	const was = next[slot]
	if (held >= 0 && held !== slot && was !== undefined) next[held] = was
	next[slot] = id
	return next
}

/** The stored form: the ids joined by commas. Nothing, or nothing usable, reads as no choice. */
export function parsePinned(raw: string | null | undefined): string[] | undefined {
	const ids = (raw ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean)
	return ids.length ? ids : undefined
}
