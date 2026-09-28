// @eden/ui-kit: the barrel. Components, the toast store, the strings provider and the public types are exported from
// here. This module has no side effects; the stylesheets are separate exports (theme.css, base.css, tailwind.css).

// Tokens and icons
export * from './tokens/tokens.js'
export { ICONS, iconNames, type IconDef, type IconName, type IconNode } from './icons/icons.js'
export {
	GLYPHS,
	domainGlyph,
	domainIds,
	shellIds,
	type DomainId,
	type GlyphId,
	type ShellId,
} from './icons/domain-glyphs.js'
export { default as Icon } from './icons/Icon.svelte'

// Strings
export { default as UiKitProvider } from './i18n/UiKitProvider.svelte'
export { useStrings } from './i18n/context.js'
export { defaultStrings, mergeStrings, type UiStrings, type UiStringsOverride } from './i18n/strings.js'

// Overlays and feedback
export { default as Sheet } from './components/Sheet/Sheet.svelte'
export type { SheetCloseReason, SheetPlacement } from './components/Sheet/Sheet.svelte'
export { ToastStore, TOAST_DURATION, dismissToast, toast, toastStore } from './toast/toast.svelte.js'
export type { ToastAction, ToastItem, ToastOptions } from './toast/toast.svelte.js'
