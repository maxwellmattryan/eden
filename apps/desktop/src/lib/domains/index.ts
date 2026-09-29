// The enabled domains in the Phase 1 order (docs/product/substrate/shell.md, "Sidebar"). The sidebar, the Garden's
// quick-nav row and its widget grid read this list and nothing else; the owner's order arrives with the Domains tab.
import type { DomainManifest, WidgetDeclaration } from './manifest.js'

export const manifests: DomainManifest[] = []

export function manifestFor(id: string): DomainManifest | undefined {
	return manifests.find((manifest) => manifest.id === id)
}

export function widgetFor(domain: string, widget: string): WidgetDeclaration | undefined {
	return manifestFor(domain)?.widgets.find((declaration) => declaration.id === widget)
}

export type { DomainManifest, DomainRoute, QuickAction, WidgetDeclaration } from './manifest.js'
