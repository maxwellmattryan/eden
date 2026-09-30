---
title: Shell
status: draft
summary: The frame everything sits in: layout regions, the sidebar, the Garden dashboard and its widgets, the command palette, navigation history and the back affordance, the status bar, Quick Log surfaces, the notification center, mobile structure, keyboard model and global states.
read-this-if: You are designing navigation, layout, the dashboard, or anything that appears on every screen.
depends-on: [domain-manifest, tasks, signals-notifications]
updated: 2026-09-29
---

## Layout regions

**Desktop**: a collapsible left sidebar; the main content area with a subtle back affordance at its top left; an optional right panel for the Gardener; a bottom status bar. Modals (settings, confirm sheets, Capture verification) overlay the whole window.

**Mobile**: a bottom tab bar (Garden, Today, two pinned domains, More); sheets for the Gardener, settings and Quick Log; a floating **+** button; no sidebar.

## Sidebar (Phase 1)

The app mark and wordmark at the head, then three groups under rules: Today; Garden, Gardener and Toolbench; the enabled domains in the owner's order. Settings is pinned at the bottom and opens its sheet without becoming the current item (D-55, D-64). Each domain shows its glyph, themed name and plain subtitle; the subtitle collapses to a tooltip once the owner turns it off (D-2). Domains can be reordered by drag and hidden without being disabled (`substrate/domain-manifest.md`). Badges are rare: unread inbox count on the bell, nothing on domains by default.

## The Garden (Phase 1)

The dashboard (OQ-1). A four-column widget grid with tiles of size S (1×1), M (2×1) and L (2×2), an edit mode to add, remove, drag and resize, and a catalog built from manifests. A widget declares in the manifest the registry ids it reads and computes locally; a widget that needs the Gardener calls one of its domain's tools, so nothing runs a model just because the Garden opened. A quick-navigation row of domain tiles sits above the grid, and the activity feed occupies a column on wide screens.

Default layout in Phase 1: weather-now (Sky), today (Tasks), expiring-soon and cook-tonight (Hearth), resurfaced-idea and active-projects (Toolbench), sun-and-moon (Sky), the daily line (neutral until Sanctuary), the activity feed. Widgets render their empty state until data exists.

## Command palette (Phase 1)

⌘K on desktop, a search icon on mobile. A verb grammar: **go to** (domains, entities, settings tabs), **create** (a task, an idea, a stock item, a place), **ask** (opens the Gardener with the text), **log** (Quick Log entries: "log weight 82.4"), **run** (quick actions and intents). Domains contribute index entries and verbs through the manifest. Recents float to the top; matching is fuzzy; everything is reachable by keyboard.

## Navigation history and back

Every view push goes on a history stack with back and forward, like a browser. The back affordance is a small arrow at the top left of the main area that appears only when there is somewhere to go back to, with a breadcrumb on hover. Entity URIs are deep links: opening `eden://recipe/<id>` from the feed, a notification or ⌘K pushes the recipe view. The last place restores on launch; restoring the stack itself is later.

## Status bar (Phase 1)

Left: sync state and one chip per integration. Right: the Gardener chip (model name, budget meter, grey when no key on this device), the notification bell with unread count, and the **+** button. On mobile these live behind More and the floating button.

## Quick Log surfaces (D-12)

The **+** button and floating button open the Quick Log sheet listing the enabled domains' quick actions. ⌘K's **log** verb parses a one-liner. The Today view shows a Quick Log strip. The Garden has a quick-log widget with a sparkline for numeric logs (weight). Every quick log is a `write` with undo and an activity-feed entry, never a confirm sheet.

## Capture entry points (D-13)

Capture opens from a domain's primary action (Hearth's "capture a haul"), from the Quick Log sheet, from the share sheet on mobile (Phase 2), and from ⌘K **run**. The verification sheet is specified in `design/ux-patterns.md`.

## Notification center

The bell opens the inbox described in `substrate/signals-notifications.md`. Cards group by domain and day and carry inline actions.

## Mobile (Phase 2)

Tabs: Garden, Today, and two domains the owner pins (Hearth and Sky by default), with the rest under More. Phase 2 surfaces: grocery list, stock by location, capture a haul, Today, Gardener chat, weather, the inbox and settings. Everything else opens as a read-only view until its domain gains a mobile surface.

## Keyboard model (Phase 1 defaults, customisable in Phase 2)

⌘K palette, ⌘1–9 sidebar positions, ⌘, settings, ⌘G Gardener panel, ⌘N create in the current domain, ⌘⇧L Quick Log, ⌘[ and ⌘] back and forward, Esc closes the top-most sheet. Customisation lives in Settings → Shortcuts.

## Global states

| state | behaviour |
|---|---|
| offline | banner in the status bar; mirrors show "last updated"; cloud models unavailable, local models work |
| Vault locked | the Vault tile shows a count and a lock; opening asks for biometrics |
| no Gardener key on this device | grey chip; chats offer key entry or a local model |
| granted, not connected here | grey integration chip with one-tap connect |
| first run | onboarding wizard, then every domain's empty state |
| budget exhausted | the Gardener declines with a link to budgets |
