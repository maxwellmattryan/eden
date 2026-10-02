// The domain manifests as code (docs/engineering/domain-module.md): the declarations the registry builder writes
// from each domain's manifest.json, and the functions the shell composes itself with.
import { DECLARATIONS, SHELL } from '../registry/generated.js'
import type { BuiltDomainId, DeclarationOf, DomainDeclaration, ShellDeclaration } from './types.js'

export { DECLARATIONS }

/** What the shell declares for itself. */
export const shell: ShellDeclaration = SHELL

/** The built domains' declarations, in the Phase 1 order. */
export const declarations: readonly DomainDeclaration[] = SHELL.domains.map((id) => DECLARATIONS[id])

/** One domain's declaration, with its literal ids. */
export function declarationOf<D extends BuiltDomainId>(id: D): DeclarationOf<D> {
	return DECLARATIONS[id]
}

export function isBuiltDomain(id: string): id is BuiltDomainId {
	return Object.hasOwn(DECLARATIONS, id)
}

export * from './compose.js'
export * from './garden.js'
export type * from './types.js'
