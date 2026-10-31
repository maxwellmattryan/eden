// Vigor's five tabs, in the order its manifest declares them (product/domains/fitness.md, "Surfaces"). The tab lives in
// the address: each app's route hands its `tab` parameter to the page, and anything that is not a tab is Workouts.
import { declarationOf } from '../../manifest/index.js'
import type { TabId } from '../../manifest/types.js'

export type FitnessTab = TabId<'fitness'>

export const FITNESS_TABS: readonly FitnessTab[] = declarationOf('fitness').tabs.map((tab) => tab.id)

/** The tab an address asks for, or Workouts. */
export function fitnessTab(requested: string | undefined): FitnessTab {
	return (FITNESS_TABS as readonly string[]).includes(requested ?? '') ? (requested as FitnessTab) : 'workouts'
}
