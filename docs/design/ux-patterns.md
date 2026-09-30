---
title: UX patterns
status: draft
summary: The reusable interaction patterns every screen is built from: navigation, page anatomy, lists and cards, forms and quick-add, the Quick Log sheet, the Capture verification sheet, states, confirmation and risk patterns, Gardener surfaces, notifications, widgets, context menus, mobile adaptations, keyboard and focus.
read-this-if: You are designing a screen or a component and want to reuse what exists.
depends-on: [visual-language, product/substrate/shell, product/substrate/grants, product/substrate/ai]
updated: 2026-09-30
---

## Navigation

The sidebar for domains, ⌘K for everything, a history stack with a quiet back arrow at the top left of content, entity URIs as deep links (`product/substrate/shell.md`). Tabs inside a domain are a segmented control under the page header, never a second sidebar.

## Page anatomy

Header: the domain glyph, the themed name with its subtitle in `--text-tertiary`, the primary action on the right, a filter row beneath when the page is a list. The top right is also where a page's notices sit: what the owner should know before reading the page, such as a weather alert, each with what it is first, what it means beneath, and who said so quietly. Content: a list or grid on the left and a detail pane on the right on wide screens; the detail becomes a pushed view below 1100 pixels. Footer: none; the status bar is global.

## Lists, tables, cards

Lists are the default; tables only for numeric data (stock quantities, metrics). Cards for things with an image (recipes, places, renders). Row height 40 comfortable, 32 compact. Each row has one primary text, one secondary line, trailing metadata in mono for numbers, and a hover action cluster. Selection is a mode (D-41): rows show no mark outside select mode; "Select" in the list header or a row's menu turns it on, Space toggles a row, and "Done" leaves it. There are no checkboxes.

## Forms and quick-add

Every list has a quick-add field at its top that parses natural language where it can ("2 lb chicken thighs fridge", "dentist thursday 3pm") and shows the parsed fields as chips before saving. Full forms open in the detail pane, never in modals, except on mobile where they are sheets. Required fields are few; defaults are visible.

## Quick Log sheet (D-12)

One field, the unit as a chip, the last value and time beneath, a seven-day sparkline for numeric logs, and Enter to save. Saving closes the sheet and shows an undo toast for eight seconds. Opens from the **+** button, the floating button, ⌘K's `log` verb, the Today strip and the Garden widget. Each domain's quick actions appear as tabs across the top when more than one is enabled.

## Capture verification sheet (D-13)

A wide sheet: the image or receipt thumbnail on the left with the provider that will process it named under it and a cost estimate, and the draft rows on the right. Each row: name, quantity, unit, category, location chips (fridge, freezer, pantry, counter), expiry with an "estimated" badge, and a merge indicator when an existing item matches. Rows can be edited inline, removed, or split. The footer shows the count that will be created and merged and one **Commit** button. Nothing is stored before commit; closing the sheet discards the draft and the image.

## States

| state | pattern |
|---|---|
| empty | display-serif title, one sentence, one primary action, an optional "add sample data" link, a small motif |
| loading | skeleton rows matching the final layout; no spinners over 300 ms |
| error | inline, plain, with the time of the last good data and a retry |
| offline | a status-bar banner; mirrors show "last updated" |
| no Gardener key | the chat shows a one-line explanation and a key-entry button |
| Vault locked | a count and a lock glyph; the biometric prompt on tap |
| budget exhausted | the Gardener declines with a link to budgets |

## Confirmation and risk patterns

Access levels have badges: `read` shows nothing, `write-draft` shows a pencil, `write` a check, `act-external` an arrow leaving a box in the warning colour. The confirm sheet names the subject, the resource, the destination for external actions, and shows the exact payload; the confirm button repeats the verb ("Create event", "Send to Google"). Undo toasts replace confirms for reversible writes. Never-automated actions are simply absent from the UI.

## Gardener surfaces

The panel: a thread list on the left when wide, the conversation, and the composer: one bordered box that holds the message, with the "can see" chip at its foot showing the row count and the round send button at the foot's end, Stop while the reply streams; the field has no chrome of its own, the box's stroke is the ring. The chip opens a popover that lists what the request read by name with its rows (an id with nothing to read is not listed) and what was not shared with the grant one tap away (D-78); the audit log opens an entry to the same list. A model chip with the budget meter sits in the status bar, and a cost preview appears when the request is unusual (an image, the Council). Replies stream and are drawn as Markdown; the owner's words are plain. Under each message a quiet foot says when it was sent or received and carries a copy glyph; message text selects, unlike the app's chrome. Tool calls render as compact cards with their access badge; `write` and `act-external` cards carry their confirm inline. A card's state is a glyph at the end of its title line: a spinner while the tool runs (D-79), a success check once it is done, which arrives with the Breeze and stays, a danger x when it failed, with what went wrong in the card. A tool the Gardener runs as its own request (D-74) has no entry of its own in the thread: its tool card is its place, so a request never shows two spinners. Proposal cards for facts carry accept and dismiss. The Council view shows one column per model with the chair synthesis, when enabled, above them. Gardener surfaces use the Gardener's colours so they are never mistaken for the owner's own data: green when it speaks (replies, proposal cards, the "can see" chip), honey when it acts (tool cards, the model chip) (D-40).

## Notifications

Inbox cards: domain glyph, one line, time, inline actions, swipe to snooze on mobile. Toasts only for errors and undo, bottom center, eight seconds, one at a time.

## Widgets

Sizes S (1×1), M (2×1), L (2×2) on a 4-column grid. Each widget has a title row with the domain glyph, a body, and an optional footer action. Edit mode dims content, shows drag handles and resize corners, and opens a catalog sheet grouped by domain. Empty widgets show a one-line prompt rather than hiding.

## Context menus

Right-click and long-press menus follow Crate's convention: the same items as the row's hover actions, in the same order, with destructive items last and separated. Keyboard: Shift+F10.

## Mobile adaptations

Bottom tabs (the kit's `BottomTabBar`), sheets for anything modal (`Sheet`), a floating button for Quick Log and Capture, swipe actions on rows (`SwipeRow`; leading: done or check; trailing: delete), safe-area insets respected, and an Android back handler that closes the top-most sheet first.

## Keyboard and focus

Every action reachable by keyboard; ⌘K is the escape hatch. Focus rings are always visible when navigating by keyboard. Lists support arrow keys, Enter to open, Space to select, and type-ahead. Sheets are the kit's `Sheet`, a `<dialog>`, which traps focus and returns it on close.

Nothing steals focus. A layer that opens (a sheet, a confirm, a popover) moves focus into itself, as it must, but onto the layer, never onto a button: a confirm never opens with Cancel pressed-looking or ringed. The one exception is a layer whose purpose is typing: a form or a field focuses its first text control, so the owner can type at once. A menu focuses its list, not its first item; the first arrow key lands on the item. The kit's `trapFocus` does this by default (`initial: 'auto'`); a component asks for `first` only when its purpose is a choice made by keyboard. The crash card, the one `<dialog>` outside the kit's `Sheet`, follows the same rule by hand: it focuses itself, and Tab reaches its buttons.
