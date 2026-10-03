// What the Garden's quick-log tile draws: the first numeric quick action a domain's store has values for.
import type { QuickLog } from '@eden/ui-kit'
import { quickLogEntries } from '../../quick-log/quick-log.js'

export function numericLog(tr: Parameters<typeof quickLogEntries>[0]): QuickLog | undefined {
	return quickLogEntries(tr).find((log) => log.kind === 'number' && log.series?.length)
}
