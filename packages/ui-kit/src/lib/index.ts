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

// Primitives
export { default as Field } from './components/Field/Field.svelte'
export { default as Segmented } from './components/Segmented/Segmented.svelte'
export type { SegmentedItem } from './components/Segmented/Segmented.svelte'
export { default as Toggle } from './components/Toggle/Toggle.svelte'
export { default as Skeleton } from './components/Skeleton/Skeleton.svelte'
export { default as Stat } from './components/Stat/Stat.svelte'
export { default as Sparkline } from './components/Sparkline/Sparkline.svelte'

// Brand
export { default as DailyLine } from './components/DailyLine/DailyLine.svelte'
export { default as Wordmark } from './components/Wordmark/Wordmark.svelte'
export { default as Breeze } from './components/Breeze/Breeze.svelte'
export { default as SkyGlyph } from './components/SkyGlyph/SkyGlyph.svelte'
export { CONDITIONS, iconFor, type SkyCondition } from './components/SkyGlyph/SkyGlyph.svelte'

// Actions and data
export { default as Button } from './components/Button/Button.svelte'
export { default as IconButton } from './components/IconButton/IconButton.svelte'
export { default as BackButton } from './components/BackButton/BackButton.svelte'
export { default as Chip } from './components/Chip/Chip.svelte'
export type { ChipStatus, ChipTone } from './components/Chip/Chip.svelte'
export { default as Badge } from './components/Badge/Badge.svelte'
export type { BadgeKind } from './components/Badge/Badge.svelte'
export { default as Stepper } from './components/Stepper/Stepper.svelte'
export { default as Tooltip } from './components/Tooltip/Tooltip.svelte'
export { tooltip } from './components/Tooltip/tooltip.js'

// Feedback
export { default as Toast } from './toast/Toast.svelte'
export { default as ToastHost } from './toast/ToastHost.svelte'
export { default as InlineError } from './components/InlineError/InlineError.svelte'
export { default as EmptyState } from './components/EmptyState/EmptyState.svelte'
export { default as Banner } from './components/Banner/Banner.svelte'
export type { BannerPlacement, BannerTone } from './components/Banner/Banner.svelte'

// Inputs, data and the Garden
export { default as QuickAdd } from './components/QuickAdd/QuickAdd.svelte'
export { defaultParse, type ParsedChip, type QuickAddParser } from './components/QuickAdd/QuickAdd.svelte'
export { default as DataTable } from './components/DataTable/DataTable.svelte'
export type { DataTableColumn } from './components/DataTable/DataTable.svelte'
export { default as Widget } from './components/Widget/Widget.svelte'
export type { WidgetAction, WidgetSize } from './components/Widget/Widget.svelte'
export { default as WidgetGrid } from './components/WidgetGrid/WidgetGrid.svelte'
export { default as PageHeader } from './components/PageHeader/PageHeader.svelte'
export type { PageHeaderAction } from './components/PageHeader/PageHeader.svelte'
