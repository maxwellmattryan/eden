# Changelog

All notable changes to Eden will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The data layer: the workspace is one encrypted database (SQLCipher) with its key in a file on desktop, the Keychain on iOS and the Keystore on Android; tasks, events, places, attachments, domain entities and typed links as rows with hybrid logical clock stamps and tombstones; the substrate API as commands behind `@eden/shared/data`, with the same API over localStorage in the browser
- Export and import in Settings, Sync and data: the whole workspace or one domain as a zip archive of plain files with a manifest of hashes and a README, the domain's data as CSV and Markdown beside the rows; import by merge (the newer row stays) or by replace (after a backup of the workspace)

- Toolbench on desktop: Ideas (status chips with counts, quick-add that files a trailing area, the list with the days an idea has rested, the detail pane with the log and the stored brainstorm thread); Projects, Lab, Studio and Notes show their empty states
- Sky on desktop: the current reading, a scrolling strip of the next twelve hours, the week, sun and moon computed on-device, active NWS alerts and the home chip, live from Open-Meteo for the home place (a setting until Places exist); offline shows the last good forecast with the time it is from and the status-bar banner. Temperature units are a General setting
- Hearth on desktop: Stock (the four locations sorted by expiry, the Expiring and Low stock filters, quick-add, the detail pane with the storage tip, select mode) and Grocery (grouped by store, check off, origin badges, quick-add, Clear checked). Every write has an undo toast and lands in the Garden feed
- Capture a haul in Hearth: the Stock action, a drop or a paste opens a sheet in two steps. The first collects up to ten sources in any mix (photos, HEIC included, a receipt, an order's PDF, a saved page, an email file, text files, pasted text), names the provider, the model and the estimated cost, and Read sends them in one request. The second shows the rows to check, each with its location, expiry, category and tip, and a merge into what is already in stock that can be turned off. Commit is one write with one undo, and only the photos are kept, linked to the stock they made (D-86). A haul read in a conversation with the Gardener opens the same sheet at its rows
- Take stock in Hearth: photos of the fridge, the freezer, the pantry or the counter as they stand become the stock through the capture sheet. Items land where the photo shows them, no expiry is guessed, and an item already in stock has its quantity set, not added to, so a second look counts nothing twice (D-89)
- Pictures in Hearth: an item seen in a photo gets its picture cut from it, an item's pane takes a picture of the owner's own, and an item with neither shows its category's glyph. Pictures are kept on the device with their items (D-90). A link gives a picture too: an H-E-B product link pasted in the quick-add line adds the item with H-E-B's picture of it, and the item's pane takes a product link or any picture's address (D-91)
- Recipes in Hearth: a recipe arrives from pasted text, a link, a photo or a file, or from the Gardener, and opens as a draft to check before it is saved. The detail pane marks each ingredient in stock, missing or not enough; Cook this takes what was used out of stock with one undo and asks where the units do not agree; Add missing to grocery puts the rest on the list. The list is in tonight's order, and a recipe that names something the owner avoids is marked
- A recipe by link: the app fetches the page the owner pasted the address of, public `https` pages only, and a page that describes its recipe in schema.org data is read with no model asked (D-88). The fetch is counted in the egress ledger as a web page
- Stock in Hearth: an item is edited in its pane (name, quantity, unit, location, expiry, category, low-stock threshold, tip); the sort is a menu (expiry, name, newest); select mode moves the selection, deletes it or adds it to the grocery list, each with one undo; a tip shows as an info button on the item; what is low is said once a week in the inbox
- Grocery in Hearth: an item is edited in its pane (name, quantity, store, note) and grouped by its own store; the list has a name, a default store and a shop day, which sets the shop-day reminder; the grocery quick-add widget on the Garden
- The Garden on desktop, from the approved mockup: the quick-navigation row and the widget grid composed from the domain manifests, the activity feed, the neutral daily line; "Edit layout" waits for edit mode. Widgets no longer clip their titles at 1×1
- The interim domain document store: one JSON document per domain under the app data directory through `load_domain_document` and `save_domain_document`, localStorage in the browser, behind `@eden/shared/persistence`; the domain manifest seed the shell composes from
- The desktop and mobile app scaffolds on the UI kit: the sidebar shell with the five Phase 1 routes, the settings sheet with General, Appearance and About, the bottom tab bar on mobile, English and Japanese, the channel-guarded updater, diagnostics and the crash screen

### Changed

- The bundle identifier is `com.palekodama.eden` (`.dev` and `.staging` for the channels) and the download page is `eden.palekodama.studio`, now that the studio has a name (D-69)
- Hearth and Toolbench keep their data in the workspace database, one row for each record. What they held before is brought over once on first launch and the old document is removed. A write that fails is held and sent again on retry, with the writes behind it in order
- Hearth has no Tips tab: a tip is a line on a stock item or a recipe, shown as an info button beside its name (D-87)
- Cook tonight on the Garden is worked out on the device from the recipes, the stock and the allergy filter, with no model asked
