// How an export archive leaves the app and an import archive reaches it (product/substrate/data.md, "The bundle"):
// the crate reads and writes paths, and what gives it a path is the app's. Desktop asks the system's dialogs for one
// (`target`, `choose`). The phone cannot: a picker there answers a file, or an address the crate's file calls cannot
// open, so the archive is written to Eden's own folder and then handed on (`deliver`), and a picked file is copied
// into Eden's folder first (`stage`) (D-TBD(phone-archive)). Each app passes its own to the Sync tab.
import type { BundleScope } from '../../data/index.js'

export interface ArchiveFiles {
	/** Desktop: asks where the archive goes and answers the path the crate writes; null when cancelled. */
	target?: (name: string) => Promise<string | null>
	/** Phone: hands on an archive the crate wrote to its own `exports/`; says whether it left the app's folder. */
	deliver?: (path: string, name: string) => Promise<'saved' | 'kept'>
	/** Desktop: a dialog that answers a path; null when cancelled. */
	choose?: () => Promise<string | null>
	/** Phone: puts a picked file where the crate can read it and answers that path. */
	stage?: (file: File) => Promise<string>
	/** Phone: removes a staged file once it is imported or replaced by another choice. */
	discard?: (path: string) => Promise<void>
}

/** The name an archive is offered under: its scope and the day it was made. */
export function archiveName(scope: BundleScope, now: Date = new Date()): string {
	const name = scope.kind === 'full' ? 'full' : scope.domain
	return `eden-${name}-${now.toISOString().slice(0, 10)}.zip`
}

/** The last segment of a path, on either kind of separator. */
export function fileName(path: string): string {
	return path.split(/[\\/]/).at(-1) ?? path
}
