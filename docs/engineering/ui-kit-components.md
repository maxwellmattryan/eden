---
title: UI kit components
status: draft
summary: The contract for every component in `@eden/ui-kit`: purpose, props with the bindable ones marked, callbacks, snippets, platform behaviour and the stories each ships, grouped by the wave it is built in.
read-this-if: You are building, changing or consuming a kit component.
depends-on: [engineering/ui-kit, design/ux-patterns]
updated: 2026-09-28
---

## How to read this

Props are listed by name; `*` marks a bindable prop; every component also takes `class` and, when its root is a native element, the element's attributes. Callbacks are props named `on…`. Each row names the stories the component ships; every story runs in both platform frames unless the row says desktop or mobile only. The don'ts are in each component's section of `design/ux-patterns.md` and `design/visual-language.md`; they are not repeated here. Names and prop shapes come from the handoff and are final unless a row says otherwise.

## Foundations

| component | purpose | props | notes | stories |
|---|---|---|---|---|
| `Icon` | one Lucide glyph, normalised to one visual box | `name`, `size` (sm, md, lg), `label` | `label` makes it `role="img"`; otherwise decorative | Sizes, Every icon, Domain stand-ins, Live swap |
| `UiKitProvider` | provides translated strings | `strings` (partial `UiStrings`), `children` | pass a new object on locale change | Japanese strings |

## Wave 1, primitives

| component | purpose | props | callbacks / snippets | platform | stories |
|---|---|---|---|---|---|
| `Button` | one action; primary at most once per view | `label` or `aria-label` (one is required), `variant` (primary, secondary, quiet, danger, ai, honey), `size` (md, lg, auto), `icon`, `iconRight`, `disabled`, `type` | `onclick` | `auto` is 44 px on mobile; filled variants press under the raised relief (OQ-21) | Variants, Sizes, Icon only, Disabled, With icons, Keyboard, Relief comparison |
| `IconButton` | an icon control with a required name; hover and press on a circle | `icon`, `label` (required), `count`, `fab`, `size` (sm, md), `active`, `pressed`, `tooltip` (true shows the label, a string shows that string) | `onclick` | `fab` is mobile only and presses under the raised relief | Default, With count, Fab, Active, Pressed, Sizes |
| `Chip` | a pill: unit, filter, integration, model | `label`, `tone` (neutral, accent, ai, honey, grey, outline), `icon`, `count`, `status` (healthy, stale, failed, off; the word is read out), `meter`, `selectable`, `selected*`, `mono` | `onclick`, `onselect(selected)` | | Tones, With icon and count, Status, Meter, Selectable, Mono |
| `Badge` | access levels and row qualifiers | `kind` (read, write-draft, write, act-external, tier, estimated, origin, warning, ai, danger, neutral), `label` | | `read` renders nothing | All kinds, In a row |
| `Field` | a labelled input whose border becomes the focus ring (on the internal `InputWrap`) | `label`, `value*`, `placeholder`, `unit`, `helper`, `error`, `icon`, `mono`, `large`, `type`, `id`; the input's attributes pass through | `oninput`, `onkeydown`; `trailing` snippet | | Default, Unit, Helper, Error, With icon, Large, Mono, Trailing |
| `Segmented` | tabs inside a domain, with a sliding pill | `items` (strings or `{ id, label, icon }`), `selected*`, `iconPosition`, `label` | `onchange` (only on a real change) | | Text, Icons, In a header |
| `Skeleton` | loading rows matching the final layout | `rows`, `icon` | | one fade-in, no loop | Default, Compact |
| `Stat` | a headline figure | `value`, `unit` | | | Default, Unit |
| `DailyLine` | the italic line and its source | `line`, `source`, `large` (the `daily-line-lg` style) | | | Default, Large, Japanese |
| `Wordmark` | "eden" in the display face | `name`, `size` (xl, md) | splash and About at xl; the sidebar's head at md (D-55) | | Default, Sidebar size, Splash |
| `AppMark` (new) | the app mark: the icon's placeholder in brand ground and on-brand ink, decorative | | always beside a `Wordmark`; the one place to swap when the icon is drawn | | Default, With wordmark |
| `Breeze` | the one-shot specks (D-42) | `count`, `size` | `onend` | renders nothing under reduced motion | Once |
| `Sparkline` | a numeric trend with a dashed reference | `values`, `reference`, `width`, `height`, `label`, `legend`, `referenceLabel` | | | Default, Reference, Empty, Single |
| `SkyGlyph` | Sky's live glyph until the family is drawn | `condition`, `night`, `size`, `label`; module `iconFor`, `CONDITIONS` | | | All conditions, Live |
| `Toggle` (new) | an on/off switch | `checked*`, `label`, `description`, `disabled` | `onchange` | 44 px on mobile | On and off, Disabled, In a settings row |
| `Tooltip` (new) | the collapsed subtitle, an icon's name | attachment `tooltip(text, { side, delay })` on any control, and a `Tooltip` wrapper for markup | | never on touch; shown on hover and keyboard focus only | On an icon button, On a sidebar item, Wrapper, Delay |
| `Stepper` (new) | the onboarding step indicator | `steps`, `current`, `labels`, `label`, `shape` (bars, dots, auto) | | dots on mobile and when the row is too narrow | Steps, With labels, Compact |
| `BackButton` (new) | the quiet back arrow with its breadcrumb | `breadcrumb`, `label` | `onback` | hidden without `onback` | Default, Breadcrumb |

## Wave 2, overlays and feedback

| component | purpose | props | callbacks / snippets | platform | stories |
|---|---|---|---|---|---|
| `Sheet` (new) | the modal base: a `<dialog>` with `showModal()`, a focus trap for Tab cycling, Escape on keydown | `open*`, `placement` (auto, bottom, center, side), `size` (sm, md, lg, full), `label`, `labelledby`, `dismissible` | `onclose(reason: escape, scrim, api)`; `header`, `footer`, `children` | `auto` is a bottom sheet on mobile | Center, Bottom, Side, Auto, Sizes, Not dismissible, Keyboard |
| `Popover` | an anchored panel in the top layer (`popover="manual"`), placed by the anchor attachment, focus returned to the anchor on every close | `anchor` (an element or a rect), `open*`, `align`, `side`, `gap`, `role` (dialog by default; the trap applies only then), `label` | `onclose(reason: escape, outside, api)`; `children` | inline frame | Below, Above (flips), Align end, As dialog, At a point |
| `Menu` | the action and context menu: a popover menu on desktop, a bottom sheet on mobile; destructive items last behind a separator | `items` (`{ id, label, icon, destructive, shortcut, disabled, onselect }`), `open*`, `anchor`, `align`, `label`, `presentation` (auto, menu, sheet) | `onselect(item)` | roving focus, Home and End, first-letter typeahead; Tab closes | Basic, With icons and shortcuts, Destructive last, Disabled item, Action sheet, Auto |
| `Toast`, `ToastHost`, `toast` | the one toast, for errors and undo; one live region per toast | `toast({ message, action: { label, icon, onclick }, error, duration })`; `ToastHost` `store`; the host only dismisses the toast that asked | `ondismiss` | above the tab bar on mobile; paused while hovered or focused | Undo, Error, Replace, Paused, Times out |
| `ConfirmSheet` | confirm an irreversible or external write | `open*`, `title`, `text` (the consequence, in the voice), `subject`, `resource`, `destination`, `payload` (verbatim, mono), `verb`, `danger` | `onconfirm`, `oncancel` (once per path, including Escape and the scrim) | composes `Sheet` | Delete, External, Mobile, Keyboard |
| `QuickLogSheet` | one-field logging (D-12), per-tab drafts, focus lands in the field | `open*`, `logs` (`QuickLog`: id, label, icon, kind, unit, placeholder, helper, options, value, last, series, reference), `selected*`, `embedded` | `onsave(log, value)` | composes `Sheet`; the status bar embeds it | Number, Text, Check, Tabs, Embedded, Mobile |
| `CaptureSheet` | verify a capture before commit (D-13); rows aligned on a subgrid, stacked on mobile | `open*`, `provider`, `cost`, `rows` (`CaptureRow`), `image`, `layout` (auto, wide, stacked) | `oncommit(rows)`, `onclose` | a full-height bottom sheet on mobile | Haul, With merges, All removed, Mobile |
| `InlineError` | the plain error with the last good time | `message`, `lastGood`, `live` (`role="alert"` only when true) | `onretry` (may return a promise; the button reads Retrying while it is pending) | | Default, Last good, Retrying, Live |
| `EmptyState` | title, sentence, action, sample link, the frond | `title`, `text`, `action` (`{ label, icon, onclick }`), `sample` (`{ label, onclick }`), `motif` | | | Default, No motif, With sample, Mobile |
| `Banner` (new) | the status-bar strip and the top bar; the tone colours only the icon and an edge | `tone` (info, warning, danger), `icon`, `message`, `action`, `dismissible`, `placement` (inline, top) | `ondismiss` | `top` pads under the safe-area inset | Offline, Stale, Error, Top |

## Wave 3, composites

| component | purpose | props | callbacks / snippets | platform | stories |
|---|---|---|---|---|---|
| `QuickAdd` | the natural-language add field with parsed chips, on `InputWrap` | `placeholder`, `value*`, `parse`, `id`; module `defaultParse`, `ParsedChip`, `QuickAddParser` | `onadd(text, parsed)` (Enter or the + button) | chips trail the field on desktop, sit beneath on mobile | Empty, Parsed, Weekday and time, Custom parser, Mobile |
| `ListRow` | one row: primary, detail, meta, actions | `id`, `primary`, `secondary`, `chips`, `badges`, `meta`, `metaWarn`, `icon`, `selecting`, `selected*`, `done`, `actions` | `onopen`, `onaction(item)`, `onselect(selected)` | 44 px rows on mobile | Default, Detail, Done, Selecting, Actions |
| `List` | rows on a card with a select mode (D-41) | `header`, `count`, `rows`, `compact`, `selectable`, `selecting*` | `onopen(row)`, `onaction(item, row)`, `onselect(ids)`; `children` | | Fridge, Select mode, Compact, Empty |
| `DataTable` | numbers only | `columns` (`{ label, numeric, muted }`), `rows`, `label` (the caption), `showCaption` | | | Egress ledger, Quantities, Muted column |
| `Widget` | a Garden tile, a named region (titles must be unique in a view) | `title`, `icon`, `domain` (not drawn at size s, where the glyph stands for it and the title may take two lines), `size` (s, m, l), `empty`, `action`, `editing` | `children` | | Sizes, Small, Empty, Editing, With action |
| `WidgetGrid` (new, layout only) | the four-column layout, packed densely | `columns` (defaults to the `widget-columns` token), `children` | | two columns on mobile | Phase-1 layout, Mobile |
| `PageHeader` | glyph, name with the brand rule, subtitle, actions, filters | `name`, `subtitle`, `icon`, `back` (true or the breadcrumb), `actions` (`{ id, label, icon, variant, disabled, onclick }`, the first primary) | `onback`; `filters` snippet | actions wrap under the name on mobile | Hearth, With back, No actions, Japanese, Mobile |
| `InboxCard` | a notification | `icon`, `line`, `when`, `domain`, `unread` (a dot and a spoken word, no weight change), `actions` (`{ id, label, icon, onclick }`) | | | Unread, Read, With actions, Two cards, Mobile |
| `GardenerMessage`, `Thread` | a Gardener or owner bubble (D-40), and the `role="log"` column that lays them out | `text` (a string or paragraphs), `owner`, `name`; `Thread` `label` | `children` | | Reply, Owner, With a tool card, Streaming, A thread |
| `CanSee` | the literal "can see" row; one id open at a time into a labelled region | `items` (`{ id, count }`), `locked` | `onexpand(item)`, `onaudit`; `expanded(item)` snippet | | Default, With locked, Expanded |
| `ToolCard` | a tool call in honey (D-40), on the shared tool chrome that settles once done | `name`, `access`, `text`, `payload`, `confirm` (the verb; buttons only for write and act-external), `state*` (pending, done, cancelled) | `onconfirm`, `oncancel` | | Read, Write draft, Write, Act external, Confirmed, Cancelled |
| `ProposalCard` | an inferred fact to accept or dismiss, in green | `fact`, `value`, `text`, `state*` (pending, accepted, dismissed) | `onaccept`, `ondismiss` | | Pending, Accepted, Dismissed |

## Wave 4, shell pieces

| component | purpose | props | callbacks / snippets | platform | stories |
|---|---|---|---|---|---|
| `SidebarItem` | one nav entry: a link with `href`, a button without; becoming current fades the ground in and settles the leaf bar | `id`, `name`, `subtitle`, `icon`, `current`, `shortcut`, `showSubtitle` (otherwise the subtitle is the tooltip), `showShortcut`, `href` | `onclick` | desktop; reduced motion keeps only the fade | Default, Current, With subtitle, With shortcut, Subtitle as tooltip, As a link |
| `Sidebar` | domain nav with a brand head, grouped items under rules and pinned items, one tab stop (D-55) | `groups` (`SidebarEntry[][]`), `pinned` (`SidebarEntry`), `brand` (the app name; shows the mark and wordmark), `subtitles`, `shortcuts`, `current*` (an id), `label` | `onselect(id)` | desktop only | Phase-1, Subtitles on, Shortcuts on, Without brand, Japanese |
| `StatusBar` | sync, integration chips with detail dialogs, the Gardener chip with its meter, the bell with the inbox, + with the embedded Quick Log | `sync`, `banner`, `integrations` (`StatusBarIntegration`: id, label, status, detail, onconnect), `gardener` (`StatusBarGardener`: label, budget, noKey, onopen), `inbox`, `logs` | `onlog`, `oninboxaction`, `onsync` | desktop only | Default, Offline banner, No key, Granted not connected here, Stale, With unread |
| `BottomTabBar` (new) | the mobile navigation landmark | `items` (`BottomTab`: id, label, icon, badge), `current*`, `label` | `onselect(id)` (also on the current tab) | mobile only; safe-area padding | Five tabs, With badge, Japanese |
| `SwipeRow` (new) | leading and trailing actions revealed by a horizontal drag; real buttons, so Tab and Enter work too | `leading` (`SwipeLeading`), `trailing` (`SwipeTrailing`), `children` | | mobile; a long press under reduced motion; desktop renders children unchanged | Leading done, Trailing delete, Both, Desktop passthrough |

## Deferred

Composer, ThreadList, ActivityFeed, CouncilColumns, CommandPalette, SettingsModal, onboarding pages and WidgetGrid's edit mode are app compositions built from the rows above; see `engineering/ui-kit.md`, "Not in the kit".
