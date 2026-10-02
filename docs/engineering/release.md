---
title: Release
status: draft
summary: The owner's checklist for shipping Eden: the GCS bucket and its service account, the updater key, Apple signing and notarization, iOS ad-hoc distribution from the BBX team, the Android keystore, GitHub Pages for the download page, the secrets the release workflow reads, and the tag-to-release flow.
read-this-if: You are setting up the release accounts and secrets, cutting a release, or changing the release workflow.
depends-on: [engineering/app-scaffold]
updated: 2026-10-02
---

## Shape

Two channels, `staging` and `production` (D-52). A tag `vX.Y.Z-staging.N` releases to staging, a tag `vX.Y.Z` to production; the tag is cut by `scripts/tag.sh`, and `.github/workflows/cd.release.yml` builds, drafts a GitHub Release and publishes to the bucket `eden-releases`. Desktop updates poll `https://storage.googleapis.com/eden-releases/<channel>/latest.json` through the channel guard in `src-tauri/src/updater.rs`, so a staging build never takes a production update and a dev build never updates. The download page at `eden.palekodama.studio` (`web/`, GitHub Pages) reads `<channel>/downloads.json`. iOS ships ad-hoc from the BBX team, never through App Store Connect; Windows is unsigned for now.

Every step below is gated in the workflow: with no secrets a run still produces unsigned desktop bundles and a draft release, skips iOS, and stops before the bucket. Set the secrets in the repository settings as they are obtained.

## Secrets the workflow reads

| secret | used by | from |
|---|---|---|
| `GCS_SERVICE_ACCOUNT_KEY` | the bucket upload and the manifests | the bucket section |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | updater artifacts on macOS and Windows | the updater key section |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` | macOS code signing | the macOS section |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | macOS notarization; `APPLE_TEAM_ID` is also the iOS team | the macOS section |
| `IOS_DIST_CERTIFICATE_P12_BASE64`, `IOS_DIST_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, `IOS_PROVISIONING_PROFILE_NAME`, `IOS_PROVISIONING_PROFILE_BASE64_STAGING`, `IOS_PROVISIONING_PROFILE_NAME_STAGING` | the iOS ad-hoc build; the `_STAGING` pair on a staging tag | the iOS section |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | the Android APK (job off until `gen/android` exists) | the Android section |

`GITHUB_TOKEN` is the workflow's own.

## The bucket

1. A GCP project (any name), billing on; the bucket is public and costs cents.
2. `gcloud storage buckets create gs://eden-releases --location=us-central1 --uniform-bucket-level-access`
3. Public reads: `gcloud storage buckets add-iam-policy-binding gs://eden-releases --member=allUsers --role=roles/storage.objectViewer`
4. CORS for the download page and local previews, from a file `cors.json` containing `[{"origin":["https://eden.palekodama.studio","http://localhost:*"],"method":["GET"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]`: `gcloud storage buckets update gs://eden-releases --cors-file=cors.json`
5. A service account `eden-releases@<project>.iam.gserviceaccount.com` with `roles/storage.objectAdmin` on the bucket only: `gcloud storage buckets add-iam-policy-binding gs://eden-releases --member=serviceAccount:<sa> --role=roles/storage.objectAdmin`
6. A JSON key: `gcloud iam service-accounts keys create key.json --iam-account=<sa>`; its contents become `GCS_SERVICE_ACCOUNT_KEY`. Delete the local file.

Layout the workflow writes: `<channel>/<version>/{macos,windows,android,ios}/…`, `<channel>/latest.json` (the Tauri updater shape: `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`), `<channel>/downloads.json` (`{ version, date, downloads: { macos.dmg, windows.msi, android.{apk,sha256}, ios.{manifest,ipa} } }`). Content types are set explicitly; the iOS manifest must be served as XML over HTTPS or Safari refuses the install.

## The updater key

1. `yarn tauri signer generate -w ~/.tauri/eden.key` (choose a password; keep the file out of every repo).
2. Paste the printed public key into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, replacing the placeholder, and commit.
3. `TAURI_SIGNING_PRIVATE_KEY` = the contents of `~/.tauri/eden.key`; `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = the password.

Both channels sign with the same key; the channel guard, not the key, keeps them apart.

## macOS signing and notarization

1. In the Apple Developer account, a Developer ID Application certificate; export it from Keychain Access as a `.p12` with a password.
2. `APPLE_CERTIFICATE` = `base64 -i cert.p12 | pbcopy`; `APPLE_CERTIFICATE_PASSWORD` = the export password; `APPLE_SIGNING_IDENTITY` = the certificate's name (`Developer ID Application: Name (TEAMID)`).
3. An app-specific password at appleid.apple.com: `APPLE_ID` = the Apple ID, `APPLE_PASSWORD` = the app-specific password, `APPLE_TEAM_ID` = the ten-character team id.

The workflow's macOS build reads them; the "verify the updater endpoint" step then proves the binary embeds its own channel's manifest URL and not the other's.

## iOS, ad-hoc from the BBX team

The identifier is `com.palekodama.eden` (D-69).

1. An Apple Distribution certificate on the BBX team (`APPLE_TEAM_ID`), exported as `.p12`: `IOS_DIST_CERTIFICATE_P12_BASE64`, `IOS_DIST_CERTIFICATE_PASSWORD`.
2. App IDs registered on the team: `com.palekodama.eden` and `com.palekodama.eden.staging` (Xcode registers `com.palekodama.eden.dev` itself the first time `yarn dev:ios` runs on a device). An App ID is unique across all of Apple: once registered on the BBX team it cannot be registered by a personal team until it is deleted here, which is why the ad-hoc route matters.
3. Every device that will install builds registered by UDID; an ad-hoc provisioning profile per App ID listing them. The profile file: `IOS_PROVISIONING_PROFILE_BASE64` (`base64 -i profile.mobileprovision`); its name as shown in the portal: `IOS_PROVISIONING_PROFILE_NAME`. The staging App ID's profile goes in the `_STAGING` pair, which a staging tag reads; with a pair absent that channel's iOS build is skipped. The build exports with `--export-method release-testing`, the name Xcode and the Tauri CLI give ad-hoc.
4. Never create an App Store Connect record for either App ID: that would tie the identifier to the BBX team's store presence. Ad-hoc installs happen from the download page on the device: Safari opens the `itms-services://` link, the manifest names the IPA in the bucket.

`scripts/write-ios-signing.mjs` rewrites the committed pbxproj on the runner to manual signing with that profile; the committed project keeps automatic signing for `yarn dev:ios`.

## WeatherKit

Sky can use Apple's WeatherKit through the native framework (D-57). The bridge and its commands are in every Apple build; what is missing until these steps are done is the entitlement, so WeatherKit refuses and Sky falls back to Open-Meteo with a note. Nothing else depends on them. The minimum systems are macOS 13 and iOS 16.

1. In the developer portal, on the BBX team, open each App ID (the base identifier, `.dev` and `.staging`) and enable WeatherKit twice: under Capabilities and under App Services.
2. iOS: add `com.apple.developer.weatherkit` (`true`) to `src-tauri/gen/apple/eden-app_iOS/eden-app_iOS.entitlements`, regenerate the ad-hoc profile so it carries the capability, and update `IOS_PROVISIONING_PROFILE_BASE64`.
3. macOS: add the same key to `src-tauri/Entitlements.plist`, create a Developer ID provisioning profile per App ID, and embed it through `bundle.macOS.files` (`embedded.provisionprofile`) in the channel overlay; CI needs the profile as a secret. The key must not be added before the profile exists: a restricted entitlement without a matching profile stops a signed app from launching.
4. Verify on a signed build on a real Mac and a real iPhone: choose Apple Weather in Settings → Integrations and confirm the forecast and Apple's attribution. The simulator is not a reliable test.

Not yet confirmed: that Apple grants WeatherKit to a Developer ID build outside the Mac App Store. If it does not, WeatherKit is iOS only until the distribution changes. An unsigned `yarn dev` build never has the entitlement and always shows the fallback.

## Android

The Android project is not generated yet: `tauri android init` needs a JDK 17 or 21 and the owner's machine has 26 (`brew install --cask temurin@17`, then `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` and the init command in `engineering/app-scaffold.md`). Until it exists the `android` job in the release workflow is `if: false` and the release treats it as skipped.

When it exists: `keytool -genkeypair -v -keystore eden-release.keystore -alias eden -keyalg RSA -keysize 4096 -validity 10000`; `ANDROID_KEYSTORE_BASE64` = `base64 -i eden-release.keystore`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` = `eden`, `ANDROID_KEY_PASSWORD`. The workflow writes `src-tauri/gen/android/app/key.properties` from them, and `build.gradle.kts` must keep Crate's `key.properties` signing block across re-inits.

## The download page

1. Repository settings → Pages → Source "GitHub Actions". `.github/workflows/cd.web.yml` deploys `web/` on every push to `develop` that touches it.
2. Custom domain `eden.palekodama.studio`: on the `palekodama.studio` zone, DNS `CNAME eden → maxwellmattryan.github.io`; `web/CNAME` already carries the name, so Pages keeps it across deploys. Enforce HTTPS once the certificate is issued.
3. The page fetches `downloads.json` from the bucket per channel (`?channel=staging`) and falls back to GitHub Releases.

The domain moves with one edit to `web/CNAME` and the DNS record (D-69).

## Cutting a release

```bash
./scripts/tag.sh minor staging       # 0.1.0 → 0.2.0-staging.1: bumps, Cargo.lock, changelog, commit, tag, push
./scripts/tag.sh prerelease          # → 0.2.0-staging.2
./scripts/tag.sh stage               # → 0.2.0, graduates the staging entries in the changelog
./scripts/tag.sh --dry-run minor staging
./scripts/tag.sh --delete v0.2.0-staging.1
```

`scripts/version.mjs` keeps `package.json`, `src-tauri/Cargo.toml` and the base, staging and dev Tauri configs in step; the changelog needs an entry under `## [Unreleased]` before `prepare`. The workflow drafts the GitHub Release; publish it by hand after checking the artifacts. `workflow_dispatch` with a version builds without a tag (useful to prove the skip paths); it never creates the tag.

## Out of scope for now

Windows code signing, TestFlight, Play uploads. Each is an issue when it is wanted.
