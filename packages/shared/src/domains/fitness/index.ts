// Vigor's shapes, its rows and its pure arithmetic, shared so they are tested here (`*.test.ts`) and both apps read one
// definition. The store, the page with its five tabs and the Garden tiles' bodies are here too, so both apps mount
// the same ones.
export * from './exercises.js'
export * from './progress.js'
export * from './quick.js'
export * from './rows.js'
export * from './tabs.js'
export * from './types.js'
export * from './units.js'
export * from './words.js'
export { fitness, type StockLink, type TemplateDraft, type Venue } from './store.svelte.js'
