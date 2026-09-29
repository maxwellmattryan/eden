---
title: App scaffold
status: draft
summary: The two apps and the crate they share: the workspace layout, what each package owns, the platform features, the commands, the domain module on each side and the interim persistence behind it, the pre-paint mechanism, and the placeholder identifier.
read-this-if: You are building anything under apps/*, packages/shared or src-tauri, or wiring a domain into the shell.
depends-on: [engineering/ui-kit, product/substrate/shell, product/substrate/settings-utilities]
updated: 2026-09-28
---

## Layout

One Yarn 1 workspace, one Rust crate, ported from Crate (D-43, D-51, D-53):

| path | package | what it is |
|---|---|---|
| `apps/desktop` | `@eden/desktop` | the desktop frontend: SvelteKit in SPA mode (adapter-static, `ssr = false`), the sidebar shell, the settings sheet |
| `apps/mobile` | `@eden/mobile` | the mobile frontend: the same stack with the bottom tab bar and sheets, no sidebar |
| `packages/shared` | `@eden/shared` | what both frontends share: `api` (the Tauri command wrappers behind an `isTauri()` guard), `settings` (the `$state` class behind the root attributes), `stores` (crash), `i18n` (svelte-i18n, `en` and `ja`, `en.json` the source of truth) and `types` |
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

The five Phase 1 routes exist on both: `garden`, `today`, `kitchen`, `toolbench`, `weather` (mobile has `more` instead of `toolbench`, which lives behind it). A route renders its `PageHeader` and `EmptyState` from the locale until its approved mockup is implemented (D-54); on desktop the Garden is built, and the story stays its reference.

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
| `manifest.ts` | the `DomainManifest` (`src/lib/domains/manifest.ts`): id, the name and subtitle keys, the glyph, the route and its tab ids, the Garden widgets (size, title and prompt keys, body component, `hasData()`), the quick actions. The seed of the manifest as code (`product/substrate/domain-manifest.md`); the shell composes the sidebar, the quick-nav row and the widget grid from `src/lib/domains/index.ts` and nothing else |
| `store.svelte.ts` | the store: a `$state` class with the domain's records, its `$derived` lists and one method per write, each returning an `undo` the page turns into the toast (`src/lib/shell/undo.ts`) |
| `seed.ts` | fills the store from `@eden/ui-kit/sample-data`, behind the empty state's "Add sample data" link; the dataset's dates are shifted onto the real calendar (`src/lib/domains/dates.ts`) |
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

## Pre-paint

Each app's `app.html` carries `<script>%eden.prepaint%</script>` in `<head>`, before `%sveltekit.head%`, and its `src/hooks.server.ts` replaces the placeholder in `transformPageChunk` with `import prepaint from '@eden/ui-kit/prepaint.js?raw'`. With `ssr = false` the SPA fallback is still rendered through `handle`, in dev and when adapter-static writes `build/index.html`, so the generated script is inlined into the one document the shell loads and can never drift from the generator. The result is the sequence `engineering/ui-kit.md` describes: attributes on `<html>` from localStorage, then the blocking stylesheets, then the first frame.

The shared `settings` class owns the same keys afterwards (`storage` in `packages/shared/src/settings`): `load()` at mount reads them, resolves "system", writes the attributes and follows the OS theme while the choice is "system"; every setter persists and re-applies.

## Splash and crashes

The desktop `app.html` paints the wordmark and the version (`%sveltekit.env.PUBLIC_APP_VERSION%`, stamped by `vite.config.ts` from the root `package.json` and `EDEN_ENV`) on the page surface before any script; the layout removes it once i18n is ready. Three layers catch errors, as in Crate (`product/substrate/settings-utilities.md`): `hooks.client.ts` draws a fallback card for an error before the layout mounts, coloured from the kit's resolved tokens; `useGlobalErrorHandler()` logs to diagnostics and sets the crash store; `CrashScreen` renders it. The Rust side writes panics to `eden-crash.log` in the temp dir and keeps the last hundred diagnostics entries in memory.

## The identifier is a placeholder

`dev.mattmaxwell.eden` in `src-tauri/tauri.conf.json` is a placeholder until the owner buys the studio domain (D-52). It appears in that one file; the overlays only append `.dev` and `.staging`, the iOS logger and the OTA manifest read it from the config, and the generated `gen/apple` and `gen/android` projects carry it only because `tauri ios|android init` copied it. Changing it means: edit `tauri.conf.json`, delete `src-tauri/gen/apple` and `src-tauri/gen/android`, run the two `init` commands again, re-apply the `key.properties` signing block to `gen/android/app/build.gradle.kts`, and register the new App IDs (`engineering/release.md`).
