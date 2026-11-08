// Orchard's tabs, in the order its manifest declares them: Activity (#83), Accounts, Bills (#78), Budget (#84) and
// Investments (#76) until Overview arrives with #87. The tab lives in the address; anything that is not a tab is
// Accounts, until #87 makes Overview the default.
import { declarationOf } from '../../manifest/index.js'
import type { TabId } from '../../manifest/types.js'

export type FinanceTab = TabId<'finance'>

export const FINANCE_TABS: readonly FinanceTab[] = declarationOf('finance').tabs.map((tab) => tab.id)

/** The tab an address asks for, or Accounts. */
export function financeTab(requested: string | undefined): FinanceTab {
	return (FINANCE_TABS as readonly string[]).includes(requested ?? '') ? (requested as FinanceTab) : 'accounts'
}
