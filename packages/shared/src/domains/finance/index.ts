// Orchard's shapes, its rules, its rows and its words, shared so they are tested here (`*.test.ts`) and both apps
// read one definition. The store, the provider seam and the page with its sheets are here too, so both apps mount the
// same ones. The document reader (D-190) is here as well: its rules, the call into the crate and the session behind the
// kit's `DocumentSheet`.
export * from './accounts.js'
export * from './categories.js'
export * from './classify.js'
export * from './csv.js'
export * from './edits.js'
export * from './merchants.js'
export * from './ofx.js'
export * from './rows.js'
export * from './statement.js'
export * from './sync.js'
export * from './tabs.js'
export * from './types.js'
export * from './words.js'
export { bindProvider, provider, type FinanceProvider } from './provider.svelte.js'
export { finance, type AssetDraft, type EditAnswer, type SyncChange } from './store.svelte.js'
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
export { bindPlaid, plaid, syncAll } from './plaid.svelte.js'
