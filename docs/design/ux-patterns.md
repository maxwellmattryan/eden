---
title: UX patterns
status: draft
summary: The reusable interaction patterns every screen is built from: navigation, page anatomy, lists and cards, forms and quick-add, buttons, the Quick Log sheet, the Capture verification sheet, states, confirmation and risk patterns, Gardener surfaces, notifications, widgets, context menus, mobile adaptations, keyboard and focus.
read-this-if: You are designing a screen or a component and want to reuse what exists.
depends-on: [visual-language, product/substrate/shell, product/substrate/grants, product/substrate/ai]
updated: 2026-10-01
---

## Navigation

The sidebar for domains, ⌘K for everything, a history stack with a quiet back arrow at the top left of content, entity URIs as deep links (`product/substrate/shell.md`). Tabs inside a domain are a segmented control under the page header, never a second sidebar.

## Page anatomy

Header: the domain glyph, the themed name with its subtitle in `--text-tertiary`, the primary action on the right, a filter row beneath when the page is a list. The top right is also where a page's notices sit: what the owner should know before reading the page, such as a weather alert, each with what it is first, what it means beneath, and who said so quietly. Content: a list or grid on the left and a detail pane on the right on wide screens; the detail becomes a pushed view below 1100 pixels. Footer: none; the status bar is global.

## Lists, tables, cards

Lists are the default; tables only for numeric data (stock quantities, metrics). Cards for things with an image (recipes, places, renders). Row height 40 comfortable, 32 compact. Each row has one primary text, one secondary line, trailing metadata in mono for numbers, and a hover action cluster. Selection is a mode (D-41): rows show no mark outside select mode; "Select" in the list header or a row's menu turns it on, Space toggles a row, and "Done" leaves it. There are no checkboxes. Actions on the selection sit in the list header beside "n selected"; acting on several rows is one write with one undo toast.

## Forms and quick-add

Every list has a quick-add field at its top that parses natural language where it can ("2 lb chicken thighs fridge", "dentist thursday 3pm") and shows the parsed fields as chips before saving; Grocery is the exception, where adding is the header's Add menu and a sheet (D-102). A full form, one that edits a whole entity across several fields, opens in a sheet over the page (the kit's `Sheet`: centred on desktop, a bottom sheet on mobile), with Cancel and the primary Save in its footer; Save writes the fields as one change with one undo, and Cancel, Escape and the scrim leave the entity as it was (D-95). The detail pane is for reading the picked item and for its actions, not for its form. Inline inputs stay where they are: the quick-add line, a single field changed in place, a row's own control. Required fields are few; defaults are visible.

## Buttons (D-96)

A destructive action is drawn in danger wherever it appears: the `danger` button, the `danger` icon button, the `destructive` menu item, the trailing swipe. It deletes or overwrites something kept, with or without an undo. It comes last in its row. Cancel, Discard on something not yet kept, and Dismiss are not destructive and stay quiet.

Icons inside labelled buttons go by the group, the buttons of one row: all of them carry a leading icon or none does.

| Group | Icons | Examples |
| --- | --- | --- |
| action row: the actions on a record or a page | every button, the glyph the action has in the row's menu | a detail pane (Edit, Add to grocery, Move, Delete), the page header, an inbox card |
| decision row: the footer of a form, a sheet or a card | none | Save and Cancel, the confirm and Cancel, Accept and Dismiss, Commit and Discard |
| a button on its own | optional, where it names the thing acted on | Save key, Check for updates, an empty state's action |

A trailing icon is outside the rule, since it says what the press does: a chevron opens a menu, an arrow leaving a box leaves the app.

## Quick Log sheet (D-12)

One field, the unit as a chip, the last value and time beneath, a seven-day sparkline for numeric logs, and Enter to save. Saving closes the sheet and shows an undo toast for eight seconds. Opens from the **+** button, the floating button, ⌘K's `log` verb, the Today strip and the Garden widget. Each domain's quick actions appear as tabs across the top when more than one is enabled.

## Capture verification sheet (D-13, D-86, D-89, D-90, D-104, D-105)

A wide sheet in two phases. First it collects the sources: photos, a receipt, an order PDF or a pasted list, dropped, picked or pasted, each waiting as a chip that can be taken back. The foot names the provider, the model and the cost estimate beside one **Read** button; when Read cannot run (no key, the budget reached) the reason stands in their place. While the provider reads, the sheet shows a spinner and Stop; a read that did not come back says so and offers Retry. Then it shows the draft rows, with the sources' thumbnails on the left and the provider named under them. Each row is edited inline: name, quantity, unit, category, location chips (fridge, freezer, pantry, counter), expiry with an "estimated" badge until the owner sets the date, a merge indicator when an existing item matches, which can be turned off so the row becomes a new item, and a tip button when there is a storage tip to show. A row can be removed, and one can be added. The footer shows the count that will be created and merged and one **Commit** button. Nothing is stored before commit; closing the sheet discards the draft and its sources. A row seen in a photo carries its picture, cut from the photo, before its name; once any row has one, a row without keeps the place so the names stay in a column. The same sheet takes stock from photos of the shelves as they stand: its titles and its invitation say so, a matching row reads "Update" and not "Merge with", and the footer counts what will be updated. Under its first line of fields a row holds the brand, the package's size and, for a haul, what one cost (D-104, D-105). A haul also names the store it was bought at, on a chip under the provider line whose menu changes it or picks none: the store learns the prices on commit, so with prices and no store the sheet says they will not be remembered, and a shop that is not one of the owner's is named there. Taking stock shows neither prices nor a store.

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

Access levels have badges: `read` shows nothing, `write-draft` shows a pencil, `write` a check, `act-external` an arrow leaving a box in the warning colour. The confirm sheet names the subject, the resource, the destination for external actions, and shows the exact payload; the confirm button repeats the verb ("Create event", "Send to Google"), in danger when the write is destructive (D-96). Undo toasts replace confirms for reversible writes. Never-automated actions are simply absent from the UI.

## Gardener surfaces

The panel: a header with the conversation's title and, after it, the list button, the audit log, the tools, new conversation and close; the conversation; and the composer. An empty conversation opens with a greeting in the middle of the panel: one line in the display face with the owner's preferred name in their accent, chosen from the locale's greetings by the hour and anew for each new conversation; it is not shown while the panel cannot answer (no key, the budget reached). The panel comes back as it was left, across a shut and a relaunch alike: open or shut, at its width, on the same conversation or on the new one it was left at. The list button swaps the conversation for the thread list, whose select mode deletes several conversations at once. The composer is one bordered box that holds the message, with the "can see" chip at its foot showing the row count and the round send button at the foot's end, Stop while the reply streams; the field has no chrome of its own, the box's stroke is the ring. The chip opens a popover that lists what the request read by name with its rows (an id with nothing to read is not listed) and what was not shared with the grant one tap away (D-78); the audit log opens an entry to the same list. A model chip with the budget meter sits in the status bar, and a cost preview appears when the request is unusual (an image, the Council). Replies stream and are drawn as Markdown; the owner's words are plain. Under each message a quiet foot says when it was sent or received and carries a copy glyph; message text selects, unlike the app's chrome. A reply is drawn in the order it happened: what the Gardener said before it used a tool stays above the tool's card, and its answer comes after, so the newest words are always at the foot of the bubble. Tool calls render as compact cards with their access badge; two or more reads in a row fold into one line that names the tool and how many times it ran, with one status for the lot and a chevron that opens the cards, closed until the owner opens it; a call that failed, one that waits on a confirm and anything that writes always stand alone, never folded. The log follows a reply as it streams only while the owner is at its foot: scrolled up to read, they are left there, and sending a message goes to the foot again. Still on cards: `write` and `act-external` cards carry their confirm inline. A card's state is a glyph at the end of its title line: a spinner while the tool runs (D-79), a success check once it is done, which arrives with the Breeze and stays, a danger x when it failed, with what went wrong in the card. A tool the Gardener runs as its own request (D-74) has no entry of its own in the thread: its tool card is its place, so a request never shows two spinners. While a reply is awaited and nothing else moves, the Gardener's bubble holds a growing sprout (D-80): alone under the name from the moment the owner's message is sent until the first words take its place, and after the cards between rounds, once the tools are through and the answer has not begun. It never shows while words stream, beside a running card's spinner, or while a confirm is owed. Proposal cards for facts carry accept and dismiss. The Council view shows one column per model with the chair synthesis, when enabled, above them. Gardener surfaces use the Gardener's colours so they are never mistaken for the owner's own data: green when it speaks (replies, proposal cards, the "can see" chip), honey when it acts (tool cards, the model chip) (D-40). A reply the app closed on says so: a warning notice inside its bubble ("This reply was interrupted.", what arrived is kept above it) with a quiet Retry while it is the conversation's last message; the same Retry sits on a network or rate-limit error. Retry fades the reply away for good and the answer comes again in a new one.

**Files on a message (D-82).** While the composer is up, the whole panel takes dropped files: a drag over it lays a light wash of the accent across the panel, rounded, with a dashed edge, and a card in its middle that says how many files are held and of what kinds ("Drop 3 files", "2 images · 1 PDF"). A drag it cannot take (too many, nothing of a type it accepts) reads as a refusal on a plain ink wash, without the accent. The wash never shows over the thread list, and a file dropped anywhere else in the app does nothing. The paperclip at the composer's foot opens the file picker for everyone who does not drag; pasting a file attaches it, and a paste of more than 4 000 characters becomes a text file instead of filling the field. Files wait above the message as chips (a thumbnail or a glyph, the name, the size, a cross to take one back) and a message may be files alone. A refusal is one toast in plain words: what cannot be attached, or which file is too large. In the sent message the files are chips under its words; one whose file is gone is dashed and says so.

**Rows between lists (D-106).** Where a page holds several lists of the same kind of thing, a row can be dragged from one to another with the pointer on desktop. The row left behind dims while it is held, and the list it is over (heading and all) takes the same wash as a file drop: the accent, rounded, with a dashed edge, and no card. A list shows nothing for its own rows, and a drop never reorders. The drop is always an action the row's menu also has (Move to), with the same undo toast, so nothing depends on dragging.

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

A control that opens a popover or a menu is a toggle: pressed again while its layer is open, it closes it, and never reopens it or leaves it standing. The one exception is a layer opened at a point (a context menu), which a new press reopens at the new point.

Nothing steals focus. A layer that opens (a sheet, a confirm, a popover) moves focus into itself, as it must, but onto the layer, never onto a button: a confirm never opens with Cancel pressed-looking or ringed. The one exception is a layer whose purpose is typing: a form or a field focuses its first text control, so the owner can type at once. A menu focuses its list, not its first item; the first arrow key lands on the item. The kit's `trapFocus` does this by default (`initial: 'auto'`); a component asks for `first` only when its purpose is a choice made by keyboard. The crash card, the one `<dialog>` outside the kit's `Sheet`, follows the same rule by hand: it focuses itself, and Tab reaches its buttons.
