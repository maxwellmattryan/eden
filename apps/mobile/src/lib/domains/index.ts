// The enabled domains, in the order the shell declares (`@eden/shared/manifest`, `shell.domains`). The tab bar, More
// and the Garden read this list and nothing else. Every folder beside this file is a domain, named by its plain id,
// and holds the phone's surface for it; the domain's logic is in `@eden/shared/domains/<id>`.
import { declarations, type DomainManifest, type WidgetDeclaration } from '@eden/shared/domains'
import { pinnedPair, shell, tabBar, type TabBar } from '@eden/shared/manifest'
import { settings } from '@eden/shared/settings'
import { kitchenManifest } from './kitchen/manifest.js'
import { placesManifest } from './places/manifest.js'
import { toolbenchManifest } from './toolbench/manifest.js'
import { weatherManifest } from './weather/manifest.js'

const bound: DomainManifest[] = [kitchenManifest, toolbenchManifest, weatherManifest, placesManifest]

export const manifests: DomainManifest[] = shell.domains.flatMap((id) => bound.filter((manifest) => manifest.id === id))

export function manifestFor(id: string): DomainManifest | undefined {
	return manifests.find((manifest) => manifest.id === id)
}

export function widgetFor(domain: string, widget: string): WidgetDeclaration | undefined {
	return manifestFor(domain)?.widgets.find((declaration) => declaration.id === widget)
}

/** A domain can hold a tab when the phone has a page for it. */
export const routable = (id: string): boolean => !!manifestFor(id)?.routes.open

/**
 * The tab bar and More as this device has them: Garden and Today, the two domains the owner pinned here (the
 * declared pair until they choose, D-160), then More with the rest. Reads `settings.pinnedTabs`, so a
 * `$derived` over it follows the picker.
 */
export function phoneTabBar(): TabBar {
	return tabBar(declarations, shell, pinnedPair(settings.pinnedTabs, declarations, shell, routable))
}

/** What the enabled domains declare, which is what the shell's composition functions take. */
export { declarations }
export type {
	DomainManifest,
	DomainSurface,
	QuickAction,
	QuickActionHandler,
	QuickLogReadout,
	WidgetBinding,
	WidgetDeclaration,
} from '@eden/shared/domains'
