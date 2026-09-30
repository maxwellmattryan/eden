---
title: App scaffold
status: draft
summary: The two apps and the crate they share: the workspace layout, what each package owns, the platform features, the commands, the domain module on each side, where its data lives, the pre-paint mechanism, and the placeholder identifier.
read-this-if: You are building anything under apps/*, packages/shared or src-tauri, or wiring a domain into the shell.
depends-on: [engineering/ui-kit, product/substrate/shell, product/substrate/settings-utilities]
updated: 2026-09-30
---

## Layout

One Yarn 1 workspace, one Rust crate, ported from Crate (D-43, D-51, D-53):

| path | package | what it is |
|---|---|---|
| `apps/desktop` | `@eden/desktop` | the desktop frontend: SvelteKit in SPA mode (adapter-static, `ssr = false`), the sidebar shell, the settings sheet |
| `apps/mobile` | `@eden/mobile` | the mobile frontend: the same stack with the bottom tab bar and sheets, no sidebar |
| `packages/shared` | `@eden/shared` | what both frontends share: `api` (the Tauri command wrappers behind an `isTauri()` guard), `settings` (the `$state` class behind the root attributes), `stores` (crash, splash), `data` (the data layer for the apps, `engineering/data-layer.md`), `manifest` and `registry` (the domains' declarations and the resource registry generated from them, `engineering/domain-module.md`), `domains/<id>` (a domain's `manifest.json`, and its shapes, their rows and their formats, as plain modules), `persistence` (the document store), `splash` (the splash's markup and stylesheet), `i18n` (svelte-i18n, `en` and `ja`, `en.json` the source of truth), `dates` (the pure date and time formatters, which take the language, the clock and a timezone; D-58, and the calendar days and wall times in a zone), `recurrence` (the RRULE subset a task or an event repeats by; D-75), `tasks` (the Tasks substrate: the typed task, the Today view, snooze, the quick-add parser and the task signals; D-75), `weather` (Sky's model, providers and store) and `types`. Its pure modules are unit-tested with Vitest in Node (`src/**/*.test.ts`); a tested module never imports a rune module |
| `packages/ui-kit` | `@eden/ui-kit` | the design system (`engineering/ui-kit.md`) |
| `src-tauri` | `eden-app`, lib `eden_lib` | the one Rust crate, with the cargo features `desktop` and `mobile` as equals and no default feature (D-51): `tauri ios|android` cannot pass `--no-default-features`, so a desktop default would leak desktop-only plugins into the mobile build |
| `web` | | the static download page for GitHub Pages (`engineering/release.md`) |
| `scripts` | | version bump, changelog, tag, iOS signing |

The apps and the shared package depend on the kit by exact version and consume every workspace package from source: `exports` point at `src/**`, Vite compiles them with the app, HMR crosses the boundary, and no package needs a build step before an app runs. Two consequences the kit follows: imports inside it are relative (an app's `$lib` alias is the app's own), and every Tailwind utility the kit uses is found because each app's `app.css` names the kit's source as a Tailwind `@source`.

## Platform features

| feature | desktop | mobile |
|---|---|---|
| cargo feature | `desktop`: updater with the channel guard (`src-tauri/src/updater.rs`), process, window-state | `mobile`: haptics |
| always on | opener, dialog, fs, clipboard-manager, notification, the diagnostics service, `on_web_content_process_terminate` on macOS and iOS | same |
| logging | `env_logger` on stderr | `oslog` on iOS (subsystem = the bundle identifier, `CARGO_PKG_NAME` otherwise), `android_logger` on Android |
| capabilities | `capabilities/default.json` + `desktop.json` | `default.json` + `mobile.json` |
| dev port | 1420 (HMR 1421 when `TAURI_DEV_HOST` is set) | 1421 (HMR 1430) |
| shell | `Sidebar`, `BackButton`, `StatusBar`, the settings `Sheet` with a tab rail | `BottomTabBar` pinned to the bottom, More, an Appearance-only settings sheet |

The five Phase 1 routes exist on both: `garden`, `today`, `kitchen`, `toolbench`, `weather` (mobile has `more` instead of `toolbench`, which lives behind it). A route renders its `PageHeader` and `EmptyState` from the locale until its approved mockup is implemented (D-54); on desktop the Garden, Hearth (Stock and Grocery), Sky and Toolbench (Ideas) are built from their approved mockups, and each story stays its reference; the tabs without a mockup yet (Recipes, Tips, Projects, Lab, Studio, Notes) render an `EmptyState`, and Today its placeholder.

## Commands

From the root (`package.json`):

| command | does |
|---|---|
| `yarn dev` | `tauri dev` with the dev overlay, `--features desktop --features devtools`; the window is "Eden [DEV]" |
| `yarn dev:web` | the desktop frontend alone in a browser at 1420; `invoke` calls degrade through `isTauri()` |
| `yarn dev:ios`, `yarn dev:android` | `tauri ios|android dev` with the dev overlay and `--features mobile`; `TAURI_DEV_HOST` is the Mac's LAN address so a device can reach Vite |
| `yarn workspace @eden/mobile dev` | the mobile frontend alone at 1421 |
| `yarn build` | the kit, the desktop frontend and the mobile frontend |
| `yarn build:production`, `yarn build:staging` | `tauri build` with the channel overlay |
| `yarn build:ios:adhoc`, `yarn build:android:apk` | the mobile bundles |
| `yarn check` | `registry:check`, svelte-check for the kit, `@eden/shared`, desktop and mobile, plus the kit's CSS lint |
| `yarn registry`, `yarn registry:check` | regenerates the resource registry and the declarations from the domains' manifests, or fails on drift (`engineering/domain-module.md`) |
| `yarn check:cargo`, `yarn lint:rust`, `yarn format:rust[:check]`, `yarn test:rust` | `cargo check`, clippy `-D warnings`, `cargo fmt` and the crate's tests (desktop feature): the desktop feature on the host, the mobile feature against the iOS target (a desktop host would try to resolve the desktop capability against plugins the mobile feature does not compile). Rust stays out of `yarn format` and `yarn lint` so the Node CI job needs no toolchain |
| `yarn bump`, `yarn changelog:prepare|graduate`, `./scripts/tag.sh` | the release flow (`engineering/release.md`) |

Rust is stable, pinned by `rust-toolchain.toml` (channel, `rustfmt`, `clippy` and the five targets); `cargo` installs the missing pieces on first use.

## Where a domain's code goes

| side | path | holds |
|---|---|---|
| desktop | `apps/desktop/src/lib/domains/<id>/` | views, stores and compositions; the route in `src/routes/<id>/` stays thin |
| mobile | `apps/mobile/src/lib/domains/<id>/` | the same for the mobile surfaces |
| shared | `packages/shared/src/` | only what both apps use: API wrappers, types, i18n keys under `domains.<id>.*`, and under `domains/<id>/` the domain's `manifest.json` and its pure modules |
| Rust | `src-tauri/src/domains/<id>/` | what a domain needs of the crate beyond its rows (Sky's WeatherKit bridge); `src/domains/mod.rs` lists them. A domain's rows need no Rust: they go through the data layer's commands |

Ids are the plain domain ids (`kitchen`, not Hearth). The display name and subtitle are locale strings (`domains.<id>.name`, `domains.<id>.subtitle`); the glyph comes from `domainGlyph(id)`.

A desktop domain module is laid out as:

| file | holds |
|---|---|
| `manifest.ts` | the domain's bindings, joined to what it declares by `defineDomain` (`src/lib/domains/manifest.ts`): the route id with its resolved href and its opener for a tab (a tab is an optional route parameter, `/kitchen/[[tab]]`), each built widget's body component and `hasData()`, the live glyph, and `load`, `reload`, `seed` and `extras` (what the domain adds to its export bundle). What the domain declares is its `manifest.json` in `@eden/shared`; the shell composes the sidebar, the quick-nav row and the widget grid from `src/lib/domains/index.ts` and nothing else (`engineering/domain-module.md`) |
| `store.svelte.ts` | the store: a `$state` class with the domain's records as read from its rows, its `$derived` lists and one method per write, each returning an `undo` the page turns into the toast (`src/lib/shell/undo.ts`); `engineering/data-layer.md`, "A store on rows" |
| `seed.ts` | fills the store from `@eden/ui-kit/sample-data`, behind the empty state's "Add sample data" link; the dataset's dates are shifted onto the real calendar (`@eden/shared/dates`) |
| `views/` | the page and its tabs, ported from the approved mockup |
| `widgets/` | the Garden tile bodies, on `src/lib/shell/WidgetRows.svelte` |

The Garden and the activity feed are the shell's, in `src/lib/shell/garden/` and `src/lib/shell/feed.svelte.ts`: every folder under `domains/` is a domain, and a domain never imports another.

The route under `src/routes/<id>/` renders the view and loads the store on mount. Both shells keep two records of where the owner is, through `@eden/shared/navigation`: each tab's scroll position for the session (on desktop the `<main>` scrolls, not the window, so the router's own restoration never reaches it; a tab never visited starts at the top, and a move within a tab keeps its position) and the last route under `eden:last-place`, which the root `+page.ts` redirects to on launch while it is still a known place, the Garden otherwise. Neither is a setting, so neither is in the export bundle.

## Persistence

The owner's data is in the workspace database, behind the data layer (`engineering/data-layer.md`): a store reads its rows through `@eden/shared/data` and sends each write as a command. Hearth and Toolbench are on it.

What stays on this device and out of every export is kept by the document store, `@eden/shared/persistence`: the Garden's feed until it moves onto signals, and Sky's mirror.

```ts
interface DomainDocument<T> { version: number; data: T }
load<T>(domain: string): Promise<DomainDocument<T> | null>   // null when missing or unreadable; never throws
read<T>(domain: string): Promise<DomainDocument<T> | null>   // null when missing; rejects when it cannot be read
save<T>(domain: string, document: DomainDocument<T>): Promise<void>   // rejects when nothing could be written
remove(domain: string): Promise<void>
```

Under Tauri it calls `load_domain_document`, `save_domain_document` and `remove_domain_document` (`src-tauri/src/domains/documents.rs`), which keep one JSON document per domain at `<app data dir>/domains/<id>.json` and write atomically (to `<id>.json.tmp`, then a rename); ids must match `^[a-z][a-z0-9-]*$`. In a plain browser (`yarn dev:web`) the document lives in localStorage under `eden:domain:<id>`. The store owns the document's shape and bumps `version` when it changes. A domain that moved to the data layer has its old document imported once and removed (`engineering/data-layer.md`, "The one-time import").

## External services

Sky lives in `@eden/shared/weather`, so both apps read one store; the views and the widgets stay in each app. It holds a provider-neutral forecast (`model.ts`, D-56): a `ForecastProvider` normalizes its own response into it, and the supplementary sources for air quality and allergens fill their own slots, each with its own fetch time and failure state (D-59). `registry.ts` lists them all, so a further provider or a keyed source is one more entry. Keyless sources fetch from the webview with `fetch`: Open-Meteo for the forecast, Open-Meteo Air Quality for the air and the pollen, Open-Meteo Geocoding for the search that changes home (`geocoding.ts`; it sends the name typed and nothing else), and the National Weather Service for alerts. Their origins are the only external entries in the CSP's `connect-src` in `src-tauri/tauri.conf.json`; the overlays do not override `security`, so one entry covers every channel. Coordinates leave rounded to two decimals (`coordinates.ts`, D-60). The last good forecast is a mirror in the `weather` document (D-32), version 2; an older document is dropped and fetched again, never migrated. The mirror is metric and every time in it an instant; the page converts with `units.ts` and writes times in the place's timezone on the owner's clock. The week is the calendar week from the owner's week start (`week.ts`, `view.ts`), with six past days requested so it is whole. The mappers and the view helpers are pure and unit-tested. WeatherKit is the one provider behind the crate (D-57): `src-tauri/swift/EdenWeatherKit` is a Swift package with no dependencies that `build.rs` builds and links through `swift-rs` when the target is macOS or iOS; it exposes two C functions, and `src-tauri/src/domains/weather` wraps them as the commands `weatherkit_status` and `weatherkit_forecast`, which exist on every platform (a stub answers elsewhere). The bridge blocks its caller, so the command runs it on a blocking thread. The status says whether the bridge is in the build, and the settings offer the provider only then; a refusal, which is what a build without the entitlement gets, makes the store fetch Open-Meteo and mark the forecast `fallbackFrom` (`engineering/release.md`, "WeatherKit"). Regenerating `src-tauri/gen/apple` resets the iOS deployment target to Tauri's default and drops any entitlement added by hand: set `16.0` again in `project.yml`, the `Podfile` and the project file. When Sky fetches is the refresh coordinator's and the scheduler's (D-73, `engineering/signals.md`): neither layout keeps a timer for it. The alerts are their own fetch beside the forecast, and a fetch a schedule asks for still runs in the webview, which the crate's alarm wakes, so the crate makes no requests of its own. The home place is a setting in `@eden/shared` (`settings.home`; D-38) until Places and onboarding exist. The measurement system, the week start, the clock and the weather provider are settings there too (`settings.measurement`, `settings.weekStart`, `settings.clock`, `settings.weatherProvider`; D-58, D-56).

## Pre-paint

Each app's `app.html` carries `<script>%eden.prepaint%</script>` in `<head>`, before `%sveltekit.head%`, and its `src/hooks.server.ts` replaces the placeholder in `transformPageChunk` with `import prepaint from '@eden/ui-kit/prepaint.js?raw'`. With `ssr = false` the SPA fallback is still rendered through `handle`, in dev and when adapter-static writes `build/index.html`, so the generated script is inlined into the one document the shell loads and can never drift from the generator. The result is the sequence `engineering/ui-kit.md` describes: attributes on `<html>` from localStorage, then the blocking stylesheets, then the first frame.

The shared `settings` class owns the same keys afterwards (`storage` in `packages/shared/src/settings`): `load()` at mount reads them, resolves "system", writes the attributes and follows the OS theme while the choice is "system"; every setter persists and re-applies.

## Splash and crashes

Both apps paint a splash, twice, as Crate does. The static copy is in `app.html` before any script: `hooks.server.ts` replaces `%eden.splash%` with `splashMarkup()` from `@eden/shared/splash`, which is the app mark (the kit's `app-mark.svg`) in the brand colour, the wordmark in the display face and the version (`PUBLIC_APP_VERSION`, stamped by `vite.config.ts` from the root `package.json` and `EDEN_ENV`), with a stylesheet of its own. That stylesheet is self-contained because in dev the app's stylesheet is injected by script, so the kit's variables do not exist on the first frame: every colour is resolved from the kit's tokens and keyed on the `data-theme` and `data-accent` the pre-paint script has set, the two faces are declared with the URLs Vite resolves, and `<html>` takes the page surface so nothing white shows. The Svelte copy is each app's `SplashScreen`, which wears the same classes, removes the static copy when the layout mounts and fades out over 400 ms once `dismissSplash()` (`@eden/shared/stores`) is called, which the layout does when settings and i18n are ready and never before the splash has been up for a second; the shell fades in under it. The app icons are per channel (`src-tauri/icons/{dev,staging,prod}`, from the masters in `icons/src`; `design/brand.md`); the generated `gen/apple` project carries a copy of the prod iOS set, which regenerating the project replaces with Tauri's default. Three layers catch errors, as in Crate (`product/substrate/settings-utilities.md`): `hooks.client.ts` catches an error before the layout mounts and mounts `CrashCard`, the same component `CrashScreen` renders, so the two look alike by construction (it imports `app.css` itself, so the tokens are applied by then; when the root layout cannot load, SvelteKit shows its static error page by swapping in a `<head>` of its own, which drops every stylesheet, so the handler puts the app's `<head>` back first; it draws a plain card by hand only if the component cannot be loaded or its styles still did not apply); `useGlobalErrorHandler()` logs to diagnostics and to the console (it prevents the browser's own line, so it writes one) and sets the crash store; `CrashScreen` renders it. The card is a modal `<dialog>`, so it opens in the top layer above a sheet or a menu that was open when the error came. It takes focus itself, never one of its buttons (`design/ux-patterns.md`, "Keyboard and focus"). Both handlers pass over an `error` event that is a browser notice rather than an exception (`isBenignErrorEvent` in `@eden/shared/errors`; today the ResizeObserver loop notice): the browser's own console line stays and nothing crashes. The Rust side writes panics to `eden-crash.log` in the temp dir and keeps the last hundred diagnostics entries in memory.

## The identifier

`com.palekodama.eden` in `src-tauri/tauri.conf.json` (D-69); the overlays write `com.palekodama.eden.dev` and `com.palekodama.eden.staging` whole. The iOS logger and the OTA manifest read it from the config. It is copied, not derived, in four other places that move together: the `bundleIdPrefix` and `PRODUCT_BUNDLE_IDENTIFIER` in `src-tauri/gen/apple/project.yml` and the pbxproj, the Android namespace in `src-tauri/gen/android`, and the JNI pair `EdenDbKey.kt` (its `package` line) and `DB_KEY_CLASS` in `src/db/key_provider.rs` (`engineering/data-layer.md`). `yarn dev:ios` writes the dev overlay's identifier and product name into the committed pbxproj; `git checkout` that file after a device run. Regenerating either project (`rm -rf src-tauri/gen/apple && APPLE_DEVELOPMENT_TEAM=<team> yarn tauri ios init`; `rm -rf src-tauri/gen/android && yarn tauri android init` with a JDK 17 or 21, `ANDROID_HOME` and `NDK_HOME`) copies the identifier again but loses the hand-kept parts: on Apple the iOS deployment target `16.0` and the prod icon set (copy `src-tauri/icons/prod/ios/*` over `Assets.xcassets/AppIcon.appiconset/`); on Android the `key.properties` signing block in `app/build.gradle.kts`, the Kotlin helper, the `allowBackup` and extraction rules in the manifest and the ProGuard keep rule. Diff against the committed project before keeping the result.
