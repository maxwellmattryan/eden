// The Quick Log strip's one entry point (D-12; product/substrate/tasks.md, "Today view"): the enabled domains'
// quick actions, and what a chip on Today does with one. Until the Quick Log sheet is built (issue 27), a chip
// opens its domain's page; the sheet replaces the body of `quickLog` and nothing else.
import type { IconName } from '@eden/ui-kit'
import { quickActions, type QuickAction } from '@eden/shared/manifest'
import { declarations, manifestFor } from '$lib/domains'

export interface QuickLogAction extends QuickAction {
	icon: IconName
}

/** The strip's entries: the quick actions of the enabled domains, in the domains' order. */
export function quickLogActions(): QuickLogAction[] {
	// the registry builder checked each icon against the kit's list
	return quickActions(declarations).map((action) => ({ ...action, icon: action.icon as IconName }))
}

/** What a chip does: opens the action's domain. */
export function quickLog(action: QuickAction): void {
	manifestFor(action.domain)?.routes.open()
}
