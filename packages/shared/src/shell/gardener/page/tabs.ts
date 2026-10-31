// The Gardener's page (D-113): what it came to, its conversations, the audit log and the tools, a tab each. The tab
// lives in the address, as a domain's does, so `/gardener/audit` and `/gardener/tools` are what they always were.
import type { IconName } from '@eden/ui-kit'

export const GARDENER_TABS = ['usage', 'conversations', 'audit', 'tools'] as const
export type GardenerTab = (typeof GARDENER_TABS)[number]

export const GARDENER_TAB_ICONS: Record<GardenerTab, IconName> = {
	usage: 'chart-column',
	conversations: 'messages-square',
	audit: 'clipboard-list',
	tools: 'wrench',
}
