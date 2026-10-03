// Toolbench's five tabs, in the order its manifest declares them (product/domains/toolbench.md, "Surfaces"). The
// tab lives in the address: each app's route hands its `tab` parameter to the page, and anything that is not a tab
// is Ideas.
import { declarationOf } from '../../manifest/index.js'
import type { TabId } from '../../manifest/types.js'

export type ToolbenchTab = TabId<'toolbench'>

export const TOOLBENCH_TABS: readonly ToolbenchTab[] = declarationOf('toolbench').tabs.map((tab) => tab.id)

/** The tab an address asks for, or Ideas. */
export function toolbenchTab(requested: string | undefined): ToolbenchTab {
	return (TOOLBENCH_TABS as readonly string[]).includes(requested ?? '') ? (requested as ToolbenchTab) : 'ideas'
}
