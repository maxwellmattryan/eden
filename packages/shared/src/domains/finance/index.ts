// Orchard's shared code (product/domains/finance.md). So far the document reader (D-190): its rules, the call into the
// crate and the session behind the kit's `DocumentSheet`. No manifest yet, so the registry builder skips the folder
// until #71 gives Orchard its tools and routes.
export {
	READ_ACCEPT,
	canSendPicture,
	choiceOf,
	mimeOf,
	phaseOf,
	refuses,
	type DocumentChoice,
	type DocumentOutcome,
	type HeldDocument,
	type ReadOptions,
	type ReaderFailure,
} from './reader.js'
export { fingerprint, readDocument } from './read.js'
export { DocumentRead, documentRead } from './reader.svelte.js'
