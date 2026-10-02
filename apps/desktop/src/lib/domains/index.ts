// The enabled domains, in the order the shell declares (`@eden/shared/manifest`, `shell.domains`). The sidebar, the
// Garden and the palette's index read this list and nothing else; the owner's order and the disabled domains arrive
// with the Domains tab. Every folder beside this file is a domain, named by its plain id.
import { shell, type DomainDeclaration } from '@eden/shared/manifest'
import { kitchenManifest } from './kitchen/manifest.js'
import type { DomainManifest, WidgetDeclaration } from './manifest.js'
import { placesManifest } from './places/manifest.js'
import { toolbenchManifest } from './toolbench/manifest.js'
import { weatherManifest } from './weather/manifest.js'

const bound: DomainManifest[] = [kitchenManifest, toolbenchManifest, weatherManifest, placesManifest]

export const manifests: DomainManifest[] = shell.domains.flatMap((id) => bound.filter((manifest) => manifest.id === id))

/** What the enabled domains declare, which is what the shell's composition functions take. */
export const declarations: readonly DomainDeclaration[] = manifests.map((manifest) => manifest.declaration)

export function manifestFor(id: string): DomainManifest | undefined {
	return manifests.find((manifest) => manifest.id === id)
}

export function widgetFor(domain: string, widget: string): WidgetDeclaration | undefined {
	return manifestFor(domain)?.widgets.find((declaration) => declaration.id === widget)
}

export type {
	DomainBindings,
	DomainManifest,
	DomainRoute,
	QuickAction,
	QuickActionHandler,
	WidgetBinding,
	WidgetDeclaration,
} from './manifest.js'
