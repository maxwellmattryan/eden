// Orchard's tabs, in the order its manifest declares them: Accounts alone until Overview, Activity, Bills and Budget
// arrive with their issues. The tab lives in the address; anything that is not a tab is Accounts.
import { declarationOf } from '../../manifest/index.js'
import type { TabId } from '../../manifest/types.js'

export type FinanceTab = TabId<'finance'>

export const FINANCE_TABS: readonly FinanceTab[] = declarationOf('finance').tabs.map((tab) => tab.id)

/** The tab an address asks for, or Accounts. */
export function financeTab(requested: string | undefined): FinanceTab {
	return (FINANCE_TABS as readonly string[]).includes(requested ?? '') ? (requested as FinanceTab) : 'accounts'
}
