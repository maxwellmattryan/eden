// The domain manifest as code, on the phone (docs/engineering/domain-module.md). What a domain declares is the same
// data the desktop reads, from `@eden/shared/manifest`; what is bound to it here is the phone's: the route, when the
// domain has a surface on the phone, and the glyph that follows its state. The widgets' bodies are bound when the
// phone's Garden is built.
import type { ResolvedPathname } from '$app/types'
import { declarationOf, type BuiltDomainId, type DomainDeclaration } from '@eden/shared/manifest'
import { domainGlyph, type IconName } from '@eden/ui-kit'

export interface DomainBindings {
	/**
	 * The domain's page: its href through `resolve()`, and `open()` for a tab or a row (a `goto` with the `resolve()`
	 * call inline, which is what the navigation lint accepts). A domain without one has no surface on the phone yet
	 * and waits behind More.
	 */
	routes?: { href: ResolvedPathname; open: () => void }
	/** A glyph that follows the domain's state, in place of its own, while there is one. */
	liveGlyph?: () => IconName | undefined
	/** Loads the domain's store. */
	load?: () => Promise<void>
	/**
	 * Binds what the domain hears: its schedules and the signals it answers (`@eden/shared/signals`). The shell calls
	 * it once when it starts, and the answer unbinds.
	 */
	subscribe?: () => () => void
}

export interface DomainManifest extends DomainBindings {
	declaration: DomainDeclaration
	/** The plain, permanent id (`kitchen`), never the display name. */
	id: BuiltDomainId
	/** The locale keys of the themed name and its plain subtitle (D-2). */
	name: string
	subtitle: string
	glyph: IconName
}

export function defineDomain(id: BuiltDomainId, bindings: DomainBindings = {}): DomainManifest {
	const declaration: DomainDeclaration = declarationOf(id)
	return {
		...bindings,
		declaration,
		id,
		name: declaration.name,
		subtitle: declaration.subtitle,
		glyph: domainGlyph(id),
	}
}
