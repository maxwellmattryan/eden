---
title: App scaffold
status: draft
summary: The two apps and the crate they share: the workspace layout, what each package owns, the platform features, the commands, the domain module on each side and the interim persistence behind it, the pre-paint mechanism, and the placeholder identifier.
read-this-if: You are building anything under apps/*, packages/shared or src-tauri, or wiring a domain into the shell.
depends-on: [engineering/ui-kit, product/substrate/shell, product/substrate/settings-utilities]
updated: 2026-09-29
---

## Layout

One Yarn 1 workspace, one Rust crate, ported from Crate (D-43, D-51, D-53):

| path | package | what it is |
|---|---|---|
| `apps/desktop` | `@eden/desktop` | the desktop frontend: SvelteKit in SPA mode (adapter-static, `ssr = false`), the sidebar shell, the settings sheet |
| `apps/mobile` | `@eden/mobile` | the mobile frontend: the same stack with the bottom tab bar and sheets, no sidebar |
| `packages/shared` | `@eden/shared` | what both frontends share: `api` (the Tauri command wrappers behind an `isTauri()` guard), `settings` (the `$state` class behind the root attributes), `stores` (crash, splash), `splash` (the splash's markup and stylesheet), `i18n` (svelte-i18n, `en` and `ja`, `en.json` the source of truth), `dates` (the pure date and time formatters, which take the language, the clock and a timezone; D-58), `weather` (Sky's model, providers and store) and `types`. Its pure modules are unit-tested with Vitest in Node (`src/**/*.test.ts`); a tested module never imports a rune module |
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
| `yarn check` | svelte-check for the kit, `@eden/shared`, desktop and mobile, plus the kit's CSS lint |
| `yarn check:cargo`, `yarn lint:rust`, `yarn format:rust[:check]` | `cargo check`, clippy `-D warnings` and `cargo fmt`: the desktop feature on the host, the mobile feature against the iOS target (a desktop host would try to resolve the desktop capability against plugins the mobile feature does not compile). Rust stays out of `yarn format` and `yarn lint` so the Node CI job needs no toolchain |
| `yarn bump`, `yarn changelog:prepare|graduate`, `./scripts/tag.sh` | the release flow (`engineering/release.md`) |

Rust is stable, pinned by `rust-toolchain.toml` (channel, `rustfmt`, `clippy` and the five targets); `cargo` installs the missing pieces on first use.

## Where a domain's code goes

| side | path | holds |
|---|---|---|
| desktop | `apps/desktop/src/lib/domains/<id>/` | views, stores and compositions; the route in `src/routes/<id>/` stays thin |
| mobile | `apps/mobile/src/lib/domains/<id>/` | the same for the mobile surfaces |
| shared | `packages/shared/src/` | only what both apps use: API wrappers, types, i18n keys under `domains.<id>.*` |
| Rust | `src-tauri/src/domains/<id>/` | models, services and commands; `src/domains/mod.rs` lists them |

Ids are the plain domain ids (`kitchen`, not Hearth). The display name and subtitle are locale strings (`domains.<id>.name`, `domains.<id>.subtitle`); the glyph comes from `domainGlyph(id)`.

A desktop domain module is laid out as:

| file | holds |
|---|---|
| `manifest.ts` | the `DomainManifest` (`src/lib/domains/manifest.ts`): id, the name and subtitle keys, the glyph, the route id with its resolved href and its tab ids (a tab is an optional route parameter, `/kitchen/[[tab]]`), the Garden widgets (size, title and prompt keys, body component, `hasData()`), the quick actions. The seed of the manifest as code (`product/substrate/domain-manifest.md`); the shell composes the sidebar, the quick-nav row and the widget grid from `src/lib/domains/index.ts` and nothing else |
| `store.svelte.ts` | the store: a `$state` class with the domain's records, its `$derived` lists and one method per write, each returning an `undo` the page turns into the toast (`src/lib/shell/undo.ts`) |
| `seed.ts` | fills the store from `@eden/ui-kit/sample-data`, behind the empty state's "Add sample data" link; the dataset's dates are shifted onto the real calendar (`@eden/shared/dates`) |
| `views/` | the page and its tabs, ported from the approved mockup |
| `widgets/` | the Garden tile bodies, on `src/lib/shell/WidgetRows.svelte` |

The route under `src/routes/<id>/` renders the view and loads the store on mount.

## Persistence

There is no data layer yet (`product/substrate/data.md`). Until it lands every store persists through one adapter, `@eden/shared/persistence`, whose whole surface is:

```ts
interface DomainDocument<T> { version: number; data: T }
load<T>(domain: string): Promise<DomainDocument<T> | null>   // null when missing or unreadable; never throws
save<T>(domain: string, document: DomainDocument<T>): Promise<void>   // rejects when nothing could be written
```

Under Tauri it calls `load_domain_document` and `save_domain_document` (`src-tauri/src/domains/documents.rs`), which keep one JSON document per domain at `<app data dir>/domains/<id>.json` and write atomically (to `<id>.json.tmp`, then a rename); ids must match `^[a-z][a-z0-9-]*$`. In a plain browser (`yarn dev:web`) the document lives in localStorage under `eden:domain:<id>`. The store owns the document's shape and bumps `version` when it changes. The data layer replaces this module alone; the stores keep calling `load` and `save`.

## External services

Sky lives in `@eden/shared/weather`, so both apps read one store; the views and the widgets stay in each app. It holds a provider-neutral forecast (`model.ts`, D-56): a `ForecastProvider` normalizes its own response into it, and the supplementary sources for air quality and allergens fill their own slots, each with its own fetch time and failure state (D-59). `registry.ts` lists them all, so a further provider or a keyed source is one more entry. Keyless sources fetch from the webview with `fetch`: Open-Meteo for the forecast, Open-Meteo Air Quality for the air and the pollen, Open-Meteo Geocoding for the search that changes home (`geocoding.ts`; it sends the name typed and nothing else), and the National Weather Service for alerts. Their origins are the only external entries in the CSP's `connect-src` in `src-tauri/tauri.conf.json`; the overlays do not override `security`, so one entry covers every channel. Coordinates leave rounded to two decimals (`coordinates.ts`, D-60). The last good forecast is a mirror in the `weather` document (D-32), version 2; an older document is dropped and fetched again, never migrated. The mirror is metric and every time in it an instant; the page converts with `units.ts` and writes times in the place's timezone on the owner's clock. The week is the calendar week from the owner's week start (`week.ts`, `view.ts`), with six past days requested so it is whole. The mappers and the view helpers are pure and unit-tested. WeatherKit is the one provider behind the crate (D-57): `src-tauri/swift/EdenWeatherKit` is a Swift package with no dependencies that `build.rs` builds and links through `swift-rs` when the target is macOS or iOS; it exposes two C functions, and `src-tauri/src/domains/weather` wraps them as the commands `weatherkit_status` and `weatherkit_forecast`, which exist on every platform (a stub answers elsewhere). The bridge blocks its caller, so the command runs it on a blocking thread. The status says whether the bridge is in the build, and the settings offer the provider only then; a refusal, which is what a build without the entitlement gets, makes the store fetch Open-Meteo and mark the forecast `fallbackFrom` (`engineering/release.md`, "WeatherKit"). Regenerating `src-tauri/gen/apple` resets the iOS deployment target to Tauri's default and drops any entitlement added by hand: set `16.0` again in `project.yml`, the `Podfile` and the project file. The home place is a setting in `@eden/shared` (`settings.home`; D-38) until Places and onboarding exist. The measurement system, the week start, the clock and the weather provider are settings there too (`settings.measurement`, `settings.weekStart`, `settings.clock`, `settings.weatherProvider`; D-58, D-56).

## Pre-paint

Each app's `app.html` carries `<script>%eden.prepaint%</script>` in `<head>`, before `%sveltekit.head%`, and its `src/hooks.server.ts` replaces the placeholder in `transformPageChunk` with `import prepaint from '@eden/ui-kit/prepaint.js?raw'`. With `ssr = false` the SPA fallback is still rendered through `handle`, in dev and when adapter-static writes `build/index.html`, so the generated script is inlined into the one document the shell loads and can never drift from the generator. The result is the sequence `engineering/ui-kit.md` describes: attributes on `<html>` from localStorage, then the blocking stylesheets, then the first frame.

The shared `settings` class owns the same keys afterwards (`storage` in `packages/shared/src/settings`): `load()` at mount reads them, resolves "system", writes the attributes and follows the OS theme while the choice is "system"; every setter persists and re-applies.

## Splash and crashes

Both apps paint a splash, twice, as Crate does. The static copy is in `app.html` before any script: `hooks.server.ts` replaces `%eden.splash%` with `splashMarkup()` from `@eden/shared/splash`, which is the app mark (the kit's `app-mark.svg`) in the brand colour, the wordmark in the display face and the version (`PUBLIC_APP_VERSION`, stamped by `vite.config.ts` from the root `package.json` and `EDEN_ENV`), with a stylesheet of its own. That stylesheet is self-contained because in dev the app's stylesheet is injected by script, so the kit's variables do not exist on the first frame: every colour is resolved from the kit's tokens and keyed on the `data-theme` and `data-accent` the pre-paint script has set, the two faces are declared with the URLs Vite resolves, and `<html>` takes the page surface so nothing white shows. The Svelte copy is each app's `SplashScreen`, which wears the same classes, removes the static copy when the layout mounts and fades out over 400 ms once `dismissSplash()` (`@eden/shared/stores`) is called, which the layout does when settings and i18n are ready and never before the splash has been up for a second; the shell fades in under it. The app icons are per channel (`src-tauri/icons/{dev,staging,prod}`, from the masters in `icons/src`; `design/brand.md`); the generated `gen/apple` project carries a copy of the prod iOS set, which regenerating the project replaces with Tauri's default. Three layers catch errors, as in Crate (`product/substrate/settings-utilities.md`): `hooks.client.ts` catches an error before the layout mounts and mounts `CrashCard`, the same component `CrashScreen` renders, so the two look alike by construction (it imports `app.css` itself, so the tokens are applied by then, and draws a plain card by hand only if the component cannot be loaded); `useGlobalErrorHandler()` logs to diagnostics and sets the crash store; `CrashScreen` renders it. The Rust side writes panics to `eden-crash.log` in the temp dir and keeps the last hundred diagnostics entries in memory.

## The identifier is a placeholder

`dev.mattmaxwell.eden` in `src-tauri/tauri.conf.json` is a placeholder until the owner buys the studio domain (D-52). It appears in that one file; the overlays only append `.dev` and `.staging`, the iOS logger and the OTA manifest read it from the config, and the generated `gen/apple` and `gen/android` projects carry it only because `tauri ios|android init` copied it. Changing it means: edit `tauri.conf.json`, delete `src-tauri/gen/apple` and `src-tauri/gen/android`, run the two `init` commands again, re-apply the `key.properties` signing block to `gen/android/app/build.gradle.kts`, and register the new App IDs (`engineering/release.md`).
