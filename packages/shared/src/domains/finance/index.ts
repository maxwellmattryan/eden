// Orchard's shapes, its rules, its rows and its words, shared so they are tested here (`*.test.ts`) and both apps
// read one definition. The store, the provider seam and the page with its sheets are here too, so both apps mount the
// same ones.
export * from './accounts.js'
export * from './rows.js'
export * from './sync.js'
export * from './tabs.js'
export * from './types.js'
export * from './words.js'
export { bindProvider, provider, type FinanceProvider } from './provider.svelte.js'
export { finance, type AssetDraft } from './store.svelte.js'
export { bindPlaid, plaid, syncAll } from './plaid.svelte.js'
