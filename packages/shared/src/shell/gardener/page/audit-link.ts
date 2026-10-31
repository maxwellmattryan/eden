// Going to the audit log as an address asks for it (D-114): the filters, the sort and the page ride in the query.
import { auditSearch, type AuditParams } from '../../../gardener/index.js'
import { navigation } from '../../../navigation/index.js'

/**
 * Opens the audit log on the params. `inPlace` is a filter, a sort or a page changing on the log itself: the view
 * keeps its scroll and its focus, and the step is one the back arrow undoes.
 */
export function gotoAudit(params: AuditParams, inPlace = false): Promise<void> {
	return navigation.open(
		{ place: 'gardener', tab: 'audit', search: auditSearch(params) },
		inPlace ? { noScroll: true, keepFocus: true } : {}
	)
}
