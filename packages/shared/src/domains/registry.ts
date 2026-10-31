// The built domains' logic, in the order the shell declares (`../manifest`, `shell.domains`). The shared shell reads
// it for what a domain does (its tools, its pack, its labels, its quick actions); what a domain looks like in an app
// is that app's, bound through `defineDomain`. A domain is added here when its `logic.ts` is written.
import { shell } from '../manifest/index.js'
import type { DomainLogic } from './define.js'
import { kitchenLogic } from './kitchen/logic.js'
import { placesLogic } from './places/logic.js'
import { toolbenchLogic } from './toolbench/logic.js'
import { weatherLogic } from './weather/logic.js'

const bound: DomainLogic[] = [kitchenLogic, toolbenchLogic, weatherLogic, placesLogic]

export const logic: readonly DomainLogic[] = shell.domains.flatMap((id) => bound.filter((entry) => entry.id === id))

export function logicFor(id: string): DomainLogic | undefined {
	return logic.find((entry) => entry.id === id)
}
