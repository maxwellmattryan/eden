// Going to the audit log as an address asks for it (D-114): the filters, the sort and the page ride in the query.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { auditSearch, type AuditParams } from '@eden/shared/gardener'

/**
 * Opens the audit log on the params. `inPlace` is a filter, a sort or a page changing on the log itself: the view
 * keeps its scroll and its focus, and the step is one the back arrow undoes.
 */
export function gotoAudit(params: AuditParams, inPlace = false): Promise<void> {
	const path = resolve('/gardener/[[tab]]', { tab: 'audit' })
	// eslint-disable-next-line svelte/no-navigation-without-resolve -- the path is resolved; only its query is appended
	return goto(path + auditSearch(params), inPlace ? { noScroll: true, keepFocus: true } : {})
}
