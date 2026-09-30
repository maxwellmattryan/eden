---
title: Data layer
status: draft
summary: The workspace database and everything over it: the SQLCipher file and its key on each platform, the schema and its conventions, the append-only migrations, stamps and ids, the registry, the grant store, the egress ledger, the profile, the tables of the scheduler and of signals, the IPC boundary command by command, the frontend module and its browser fallback, how a store sits on rows, the export bundle, the import, and how it is tested.
read-this-if: You are reading or writing the owner's data from Rust or from an app, adding a table, a migration, a command, an entity type or a fact type, moving a store onto rows, or touching export, import or the database key.
depends-on: [product/substrate/data, product/substrate/primitives, product/substrate/registry, engineering/app-scaffold]
updated: 2026-09-30
---

## Where it stands

| built | not yet |
|---|---|
| the encrypted database and its key providers; the schema; stamps, ids and URIs; entities, the four primitives, links, snapshots, batches; the commands and `@eden/shared/data`; Hearth and Toolbench on rows; export and import, full and per domain; Settings → Sync and data; the grant store and the egress ledger, and Settings → Privacy; the profile with its history, and "What Eden knows about me"; the scheduler, signals and the inbox (`engineering/signals.md`) | audit and the Vault (their own issues); the substrate's own signals from the changes seam; "used by N requests" on the profile page, which waits on the audit log; the grants ledger UI with revoke and history (Phase 2); scheduled backups (the scheduler is there; the backup is not); sync (Phase 3); the mobile interface for export and import; a recovery screen for a database that will not open |

The Garden's feed and Sky's mirror stay in the document store (`engineering/app-scaffold.md`, "Persistence"): they are this device's, and out of every export.

## Storage and key

One SQLCipher database per workspace (`product/substrate/data.md`), at `<app data dir>/eden.db`. The app data dir follows the identifier, so each channel has its own workspace. Beside the database: `db.key` (desktop), `attachments/<id>`, `exports/` and `backups/`.

| file | holds |
|---|---|
| `src-tauri/src/db/mod.rs` | `open(dir)`: creates the dir, fetches the key, opens, sets the pragmas, migrates |
| `db/handle.rs` | `Db`: the one writer connection behind a mutex, with `read`, `write` and `checkpoint` |
| `db/schema.rs` | the migrations |
| `db/key_provider.rs` | the key, per platform |
| `src-tauri/src/substrate/` | the workspace and what is kept in it (below) |
| `src-tauri/src/commands/data.rs` | the commands |

`rusqlite` is built with `bundled-sqlcipher-vendored-openssl`, so SQLCipher and its OpenSSL compile from source for every target and nothing depends on a system library. The first build of a target takes minutes and about a gigabyte; Windows needs Perl and Android the NDK's clang, both already set up in CI.

Every connection runs the same pragmas, in this order: `key` (it must be the first statement), `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`, `foreign_keys = ON`. A wrong key fails on the statement after `key`, the first to read the file. Under WAL the files `eden.db-wal` and `eden.db-shm` sit beside the database while the app runs; on exit the app runs `PRAGMA wal_checkpoint(TRUNCATE)`, so the one file holds everything. Anything that copies the file while the app runs must checkpoint first.

`Workspace` (`substrate/mod.rs`) is the managed state every data command takes. It opens in `setup`; a workspace that will not open stops the launch, and the reason is in the log. `Workspace::write` runs a closure in one transaction, all or nothing; `Workspace::read` runs one that writes nothing. All access is synchronous behind the mutex; the commands that copy files or read every row run on a blocking thread. `Db::read` and `Db::write` take the same connection today, and the two names exist so that a pool of read-only connections can sit behind `read` later without a change to any caller. Nothing that stamps a row may run inside a read.

### The key on each platform

The provider follows the target system, not the cargo feature.

| platform | store | notes |
|---|---|---|
| desktop | `db.key` beside the database, 64 hex characters, mode `0600` | the encryption is only as strong as the file's permissions until a keychain provider replaces it |
| iOS | the Keychain, service `eden.sqlcipher`, account `db_key`, readable after the first unlock, this device only | no entitlement needed; the service is not the identifier, so changing the identifier (D-52) does not orphan the key |
| Android | a passphrase wrapped by an AES-256-GCM key the Keystore will not export, kept in app-private SharedPreferences | through `EdenDbKey`, called over JNI; see the checklist below |

One rule holds on all three: a key that exists and cannot be read is an error, never a reason to generate another. A second key would not open the database the first one encrypted. The key never leaves the device, so a database file copied elsewhere is unreadable; moving a workspace is what the export bundle is for.

### The Android checklist

The Android project does not exist yet (`src-tauri/gen/android` is generated by `tauri android init`), so the Kotlin half is staged at `src-tauri/android/EdenDbKey.kt` and the provider has been compiled but never run. When the project is generated:

1. Copy `EdenDbKey.kt` into `gen/android/app/src/main/java/<namespace path>/`.
2. Make its `package` line and `DB_KEY_CLASS` in `db/key_provider.rs` match the Android namespace. Both carry the placeholder identifier today (D-52).
3. In `AndroidManifest.xml`, set `android:allowBackup="false"` and data extraction rules that exclude everything. A restored SharedPreferences blob without its Keystore key would leave a database that cannot be opened.
4. If release builds minify, keep the class: `-keep class <namespace>.EdenDbKey { *; }`.
5. Launch on a device twice and confirm the second launch opens the same database.

## Schema

| table | holds |
|---|---|
| `schema_version` | one row per migration applied |
| `meta` | this device's own state as key and value: its node id, its clock, the markers of what was done once. Never exported, never synced |
| `entities` | every domain entity (D-67): `id`, `type` (a registry id), `payload` (JSON), and the common columns |
| `tasks`, `events`, `places`, `attachments` | the primitives (`product/substrate/primitives.md`), with their fields as columns and the common columns |
| `links` | typed entity links, keyed by owner, target URI and relation |
| `grants` | the grant store (D-70): `subject`, `resource`, `resource_type`, `access`, `lifetime`, `narrowing` (JSON), `origin`, and the stamps with a tombstone |
| `egress` | the egress ledger (D-71): `requests` and `bytes_out` per `destination` and local `day`. This device's: never exported, never synced |
| `facts` | the profile (D-72): `type` (a registry fact id), `value` (JSON), `provenance`, `confidence`, `valid_from`, `valid_until`, `source`, `note`, and the stamps with a tombstone |
| `fact_history` | what a fact held before each edit, thirty days: `fact_id`, `value`, `note`, the window and `replaced_at`. This device's: never exported, never synced |
| `schedules` | the scheduler (D-73): `name`, `kind` (`once`, `daily`, `every`), `daily_at`, `every_s` and `next_at`, the instant it is next due. This device's: never exported, never synced |
| `signals` | what happened (D-73), thirty days: `name`, `payload` (JSON), `tier`, `dedupe_key` and `created_at`. This device's: never exported, never synced |
| `inbox` | one rule's card for one signal: `signal_id`, `rule`, `channel`, `read`. Swept with its signal. This device's: never exported, never synced |

The common columns are `created_at`, `updated_at`, `deleted_at`, `mirror`, `source`, `external_id` and `snapshot`.

- **Stamps** are hybrid logical clock stamps as fixed-width hex text, so comparing text compares clocks. `updated_at` is the row's version. A delete is a tombstone: it sets `deleted_at` and `updated_at` to the same new stamp and the row stays, with what it held, so an undo can bring it back. Wall-clock times are read from the stamp and not stored a second time. An instant only the code reads (`schedules.next_at`) is an integer of milliseconds since the epoch.
- **Fields that are lists or small structures** (`recurrence`, `items`, `reminders`, `captured`, `snapshot`) are JSON text, checked with `json_valid`. Fields the substrate filters or sorts by are columns.
- **Times the owner sees** (`due`, `start_at`) are ISO 8601 text: an instant in UTC when there is a time, `YYYY-MM-DD` when there is only a date.
- **Booleans** are `INTEGER` 0 or 1 with a `CHECK`.
- **No foreign keys between data tables.** An import inserts rows in any order, and a link may outlive its target (it degrades to its label). The code validates what the schema does not.
- **Mirrors** (D-32) carry `mirror = 1` with `source` and `external_id`, and are unique by that pair. An overlay is an ordinary row with the same pair and `mirror = 0`, unique among the live rows of its type.
- **One home** (D-38): a partial unique index allows a single live Place of kind `home`.
- **The local calendar source** is an `entities` row of type `calendar-source`, seeded by the first migration at a fixed id with the lowest stamp, so every device has the same row and any edit to it wins. An Event that names no source belongs to it.
- A Task's link to what created it and an Event's place are rows in `links` (relations `from` and `at`). The `source` column is the mirror's source only.

### Why one table for entities

A domain's entity is a row of `entities` with the domain's own shape in `payload` (D-67). The TypeScript type is the schema of the payload: adding a field, or a whole entity type, needs no migration and no Rust. The substrate needs of a row only what the common columns say. The primitives are different: the substrate itself asks for tasks due this week and events at a place, so their fields are columns.

## Migrations

`db/schema.rs` returns the migrations as a list of SQL strings. **The list is append-only**: a migration that has shipped is never edited, reordered or removed, and a change to the schema is a new entry at the end. The version of a migration is its position, from 1.

On open, each pending migration runs in its own transaction together with its `schema_version` row. A run that is interrupted rolls back and is tried again at the next launch, so the schema is never half applied. A database from a newer build (a version above the list's length) is left as it is.

## Stamps, ids and URIs

| what | form | where |
|---|---|---|
| stamp | `{wall ms:016x}-{counter:08x}-{node:08x}` | `substrate/hlc.rs`, `data/hlc.ts` |
| id | a ULID in its canonical form, 26 characters | `substrate/ids.rs`, `data/ulid.ts` |
| URI | `eden://<type>/<id>` (D-24) | `substrate/ids.rs`, `data/uri.ts` |

The clock lives in `meta` and ticks once for each logical write, inside the write, where the writer's mutex makes read, tick and persist one step. When the wall clock stalls or runs backwards the counter carries the order. The node is a random 32 bits made on the first write. An import takes in the latest stamp of its bundle (`receive`), so every stamp made after it is later.

Ids made within one process only ever grow, so the order of ids is the order of creation, and a query returns rows by id. A create accepts an id the caller made: that is how a store shows a row before the write returns. The Rust and the TypeScript implementations are tested against the same vectors.

## The registry

`substrate/registry.rs` answers from the rows in `substrate/registry_generated.rs`, which `yarn registry` writes from the domains' manifests and checks against `product/substrate/registry.md` (`engineering/domain-module.md`): every fact type, entity type and kind, with its owner, its tier and its phase. A create names a live type or kind, one of Phase 1, or is refused. A per-domain bundle holds what the registry says the domain owns. An import accepts any well-formed id, so a bundle from a newer build loses nothing; the types this build does not know are named in the import's summary.

## Grants

`substrate/grants.rs` is the store of `product/substrate/grants.md`; `@eden/shared/grants` carries the same types and, in `rules.ts`, the same rules, which the browser engine applies. Every read of a T2 resource and every confirm asks `check` first.

| access asked | registry T0, T1 | registry T2, `by-kind`, `by-source` | registry T3 | scope, tool, capability |
|---|---|---|---|---|
| `read` | allowed, `default` | a live grant, or `no-grant` | `never` | a live grant, or `no-grant` |
| `write-draft` | allowed, `default` | allowed, `default` | `never` | allowed, `default` |
| `write` | a live grant, or `no-grant` | a live grant, or `no-grant` | `never` | a live grant, or `no-grant` |
| `act-external` | `no-grant`, always | `no-grant`, always | `never` | `no-grant`, always |

A resource on the never-automated list (`NEVER_AUTOMATED`, the same seven ids in both languages) is `never` for every subject. A live grant is one with no tombstone and a lifetime of `standing` or `session` whose subject, resource type, resource and access all match; the decision carries its id, which an audit entry links to. `write-draft` is refused as a grant (nothing is stored until the owner commits), `act-external` is stored only as `per-request`, and a `registry` resource must be a row of the registry, of any phase (D-31).

- **Renewal.** A unique partial index holds one live standing-or-session grant per key; granting again renews that row (lifetime, narrowing, origin, stamp) and records `Updated`. A `per-request` grant is a record of one confirm and a new row each time.
- **Revocation** is the tombstone, with `Deleted` recorded through the changes seam, so the history stays and a merge can carry the ending to another device.
- **What stays on this device** (D-37, D-70): capability grants, which the OS grants per device, and session grants, which `Workspace::open` ends before anything else runs. Neither is exported or synced.

## The egress ledger

`substrate/egress.rs` keeps one row per destination and local day with the count of requests and the bytes out. Bytes out are what Eden hands over: for a WebView request the encoded URL and the body (`requestBytes` in `@eden/shared/egress`), never the headers, which are the platform's and not visible; for WeatherKit the rounded coordinates and the day counts, recorded by `weatherkit_forecast` itself; for the updater its endpoint, which `get_app_info` reads from the build's config as `updaterEndpoint` so the frontend wrapper can count the check. Recording is fire-and-forget from the frontend: a request is not held up, and a ledger that cannot be written is not an error the caller sees.

The ledger is this device's (D-71): `Workspace::open` sweeps days older than ninety, no bundle carries it and no replace clears it. The destination `vault-ai` is refused by the store and by the schema, and Settings → Privacy draws that row at zero.

A new destination is four edits: the CSP's `connect-src` in `src-tauri/tauri.conf.json`, `DESTINATIONS` in `packages/shared/src/egress/types.ts`, and its label under `settings.privacy.destinations` in `en.json` and `ja.json`. In the browser the engine keeps both the grants and the ledger in its document, so `yarn dev:web` shows the tab as the app does.

## The profile

`substrate/facts.rs` is the store of `product/substrate/profile.md` (D-72); `@eden/shared/profile` carries the same types and, in `rules.ts`, the same rules, which the browser engine applies. A fact is a row with stamps and a tombstone like any other, so it exports, syncs and merges. The registry names its type, its owner and its tier; the value's shape is the frontend's table in `shapes.ts` (`FACT_SHAPES`, one entry per live fact type, with `multi` for the types that hold one row per value), checked by the client before a write is sent, under Tauri and in the browser alike. The crate holds any JSON that is not `null`.

| rule | what holds |
|---|---|
| type | a fact type of Phase 1, else `fact:invalid`; a T3 tier is `fact:never` |
| confidence | required for `domain-derived` and `ai-inferred`, allowed for `system-derived`, refused for `user-asserted` and `integration`; 0 to 1 |
| source | required for `integration`; an entity URI or an integration id otherwise |
| `system-derived` | the substrate's own types only (`home-area`); one live row per type, which `assert` renews in place |
| window | `validFrom` and `validUntil` are days, `from <= until`; a fact holds on a day from the first to the last, inclusive |
| a patch | names `value`, `confidence`, `validFrom`, `validUntil`, `source`, `note`, or `provenance` only as `user-asserted`, which drops the confidence: the owner's word beats what was inferred |
| the effective set | live rows inside their window on the day, by type, `user-asserted` first, then the latest stamp |
| history | an edit that changes the value, the note or the window keeps what the fact held, under the edit's stamp, thirty days; `Workspace::open` sweeps the rest |
| delete and restore | the tombstone, and its lifting: what an undo calls |

`home-area` derives from the home the owner chose in Sky: `HomePlace.area` (city, region, country from the geocoder) becomes the one `system-derived` row, renewed when the home moves, through the shell's profile store. It moves onto the home Place when the Place picker exists. A Gardener proposal is shell state (`FactProposal`), never a row: the page shows it as a `ProposalCard`, and only an accept writes the fact, as `ai-inferred` with its confidence.

## The IPC boundary

Every command is one read or one write of the workspace; a write is one transaction. Names are the Rust names; `@eden/shared/data` wraps each in a function of the same name in camelCase. A row crosses as a JSON object with camelCase keys: `uri`, `id`, `type`, its fields (or `payload`), `createdAt`, `updatedAt`, `deletedAt`, `mirror`, `source`, `externalId`, `snapshot`, and `links`, its live links.

| command | arguments | answers |
|---|---|---|
| `create_entity` | `input`: `{ id?, type, payload, mirror?, source?, externalId?, snapshot? }` | the row |
| `update_entity` | `id`, `payload` | the row; the payload is replaced whole |
| `query_entities` | `filter`: `{ type, ids?, linkedTo?, includeDeleted? }` | the rows of the type, by id |
| `create_task`, `create_event`, `create_place` | `input`: the fields, and any of `id`, `mirror`, `source`, `externalId`, `snapshot`, `links` | the row |
| `attach` | `input`: `{ id?, kind, path, fileName?, mime?, captured?, links? }` | the row; the file at `path` is copied in and hashed |
| `update_task`, `update_event`, `update_place`, `update_attachment` | `id`, `patch` | the row; a value sets a field, `null` clears it, an absent field is left |
| `query_tasks`, `query_events`, `query_places`, `query_attachments` | `filter`: `{ kinds?, from?, to?, place?, linkedTo?, relation?, includeDeleted? }` | the rows, by id |
| `get_row` | `uri` | the row, deleted or not, or `null` |
| `delete_rows` | `uris` | `{ uri, updatedAt }` for each row that changed |
| `restore_rows` | `uris` | the same; what an undo of a delete calls |
| `snapshot` | `uri`, `snapshot` | the row |
| `link` | `owner`, `link`: `{ uri, relation, label? }` | the link; linking again renews the label and brings back a removed link |
| `unlink` | `owner`, `uri`, `relation` | nothing |
| `query_links` | `filter`: `{ owner?, target?, relation? }` | the live links |
| `apply_batch` | `ops`, `marker?` | `{ applied, rows }` |
| `export_bundle` | `request`: `{ scope, path?, settings?, extras? }` | `{ path, counts, bytes }` |
| `inspect_bundle` | `path` | the manifest, once every file is checked against its hash |
| `import_bundle` | `path`, `mode` | the summary |
| `remove_domain_document` | `domain` | nothing; removes an old document after its import |
| `grant` | `input`: `{ id?, subject, resource, resourceType, access, lifetime, narrowing?, origin }` | the grant; a standing or session grant already there is renewed |
| `revoke` | `id` | the grant, ended |
| `query_grants` | `filter`: `{ subject?, resource?, resourceType?, includeRevoked? }` | the grants, by id |
| `check_grant` | `query`: `{ subject, resource, resourceType, access }` | `{ allowed, reason, grantId? }` |
| `record_egress` | `destination`, `bytesOut` | nothing |
| `query_egress` | `filter`: `{ from?, to? }` | the rows, latest day first |
| `assert_fact` | `input`: `{ id?, type, value, provenance, confidence?, validFrom?, validUntil?, source?, note? }` | the fact; a `system-derived` fact of the type already there is renewed in place |
| `update_fact` | `id`, `patch` | the fact; what it held goes to the history |
| `delete_fact` | `id` | the fact, tombstoned |
| `restore_fact` | `id` | the fact, live again; what an undo of a delete calls |
| `query_facts` | `filter`: `{ types?, owner?, includeExpired?, includeDeleted?, at? }` | the effective set, by type, the owner's own word first |
| `query_fact_history` | `factId` | what the fact held before each edit, latest first |

The commands of the scheduler, the signals and the inbox (`declare_schedules`, `set_schedule`, `cancel_schedule`, `take_due_schedules`, `emit_signal`, `query_inbox`, `mark_inbox_read`, `show_notification`) are in `engineering/signals.md`, wrapped by `@eden/shared/scheduler` and `@eden/shared/signals`.

These are the substrate API of `product/substrate/primitives.md` (D-33). Notes on what is not obvious:

- **A patch that names a field it does not have is an error**, as is a create with one; a misspelt field is never silently dropped. What describes an attachment's bytes (`mime`, `size`, `hash`, `store`) cannot be patched.
- **A time range** matches a Task by `due`, or by `at` when it has no `due`, and an Event while any of it falls inside. A row with no time is outside every range.
- **`place`** is the URI of a Place, and matches rows linked `at` it.
- **A batch** is a list of operations (`createEntity`, `updateEntity`, `createPrimitive`, `updatePrimitive`, `delete`, `restore`, `link`) applied whole or not at all. With a `marker` it is applied once: the marker is written with the batch, and a batch whose marker is there answers `applied: false`. An attachment has a file and is not written in a batch.
- **There is no optimistic concurrency.** A workspace has one owner and one writer; the row's latest stamp stands.
- **An error crosses as its message.** The ones the interface tells apart start with a stable code: `not-found`; under `bundle:` the codes `unreadable`, `version`, `hash-mismatch` and `backup`; under `grant:` the codes `never` and `invalid`; under `egress:` and `fact:` the same two; under `schedule:` and `signal:` the code `invalid`. `dataErrorCode(error)` reads it.

### The seam for signals

Every write records what it changed (`substrate/changes.rs`: the URI and one of created, updated, deleted, restored), and the changes are published once the transaction has committed, never for a write that failed. Signals exist and the domains emit theirs from the frontend (`engineering/signals.md`), but publishing still only logs at debug level: the substrate's own signals are not emitted yet (D-73). Three things are settled first, with the issues that consume them. Whether a write is one signal or one per change, since a seed or a legacy import is a single batch of dozens of creates. What an import emits, since a bundle is applied without recording changes. And what a change carries, since `task.completed` needs the transition and `attachment.added` the kind. When they are, `publish` is where `event.created` and `task.completed` are emitted, and no write changes.

## The frontend module

`@eden/shared/data` (`packages/shared/src/data/`) is what the apps call.

| file | holds |
|---|---|
| `call.ts` | the one dispatcher: the command under Tauri, the engine elsewhere; `grants/`, `egress/` and `profile/` share it |
| `client.ts`, `bundle.ts` | one function for each command |
| `types.ts` | the shapes, mirrored from the crate by hand |
| `ulid.ts`, `hlc.ts`, `uri.ts` | ids, stamps and URIs, as in the crate |
| `engine.ts` | the same API in a plain browser |
| `queue.ts` | `WriteQueue`, the order of a store's writes |
| `errors.ts` | `DataError`, `dataErrorCode` |
| `legacy.ts` | the one-time import of an old document |
| `text.ts` | CSV and Markdown for the formats made for reading |

**The browser fallback.** `yarn dev:web` serves the app without the crate. There each call goes to the engine, which keeps one JSON document in localStorage under `eden:data:v1` and follows the crate's rules with real ids and stamps, so a store cannot tell the difference. It reads the same registry (`@eden/shared/registry`), so it refuses the types and the kinds the crate refuses, and the same grant rules (`@eden/shared/grants`), so it grants and checks as the crate does, and the same profile rules (`@eden/shared/profile`), so it asserts, edits and keeps history as the crate does. It differs in two ways: it cannot attach a file, and it cannot write or read a bundle (both reject with `unavailable`). It is a second implementation of the API, so a rule added to the crate is added to the engine and to both test suites.

### A store on rows

SQLite is where the owner's data is; a store is what a page sees of it, in memory. localStorage holds settings and what a view remembers, never a copy of the data.

- `load()` reads the rows of the store's types once and builds its `$state`. `reload()` reads them again, after an import changed them under it.
- A write changes the store at once and is queued on the store's `WriteQueue`, which sends the writes one at a time in the order they were made. The page never waits for a write.
- When a write fails the queue stops with it at the head and `saveFailed` is set; the page shows its `InlineError`, and the retry (`flush()`) sends it again and then what is behind it.
- Every write hands back an undo (D-12). The undo of a create is a delete, of a delete a restore, of an edit the previous payload written back.
- The shapes, their mapping to rows and their formats for reading live in `@eden/shared/domains/<id>` as plain modules, so they are tested in Node; the store, a rune module, stays in the app.

| domain | type | payload |
|---|---|---|
| Hearth | `stock-item` | the item; its storage tip stays a line of text |
| | `recipe` | name, serves, minutes, tags |
| | `grocery-list` | name, store, shop day; made with the first item put on it |
| | `grocery-item` | the item, and `listId` |
| Toolbench | `idea` | the idea with its log and its brainstorm thread, and `projectId` |
| | `project` | the project with its next steps and its parts |

Left as they are, for the issues that own them: storage tips, brainstorm sessions and parts lists as rows of their own, the shop day as an Event, a project's next steps as Tasks, and the home place, which is still a setting.

### The one-time import

Before the data layer a store kept one JSON document (`<app data dir>/domains/<id>.json`). On its first load a store that moved reads its old document, turns it into a batch and applies it with the marker `legacy-import:<id>`; only once that transaction has committed is the document removed. Every record takes a new id, whatever id it had, and an idea's `projectId` follows its project. If anything fails before the commit, nothing was written, the document is still there and the next launch tries again. With no document the marker is still set.

## The bundle

A zip archive a person can open (`substrate/bundle.rs`; `product/substrate/data.md`, "Export").

| path | holds |
|---|---|
| `manifest.json` | `format` (`eden-bundle`), `formatVersion` (1), `schemaVersion`, `app`, `createdAt`, `node`, `scope`, `counts` (the live rows of each type) and `files`: every other file with its `sha256` and `bytes`, and for a file of rows its `rows` and `tombstones` |
| `README.md` | what each file is, the counts, how to read a row and how to check a hash |
| `primitives/<type>.jsonl` | one row a line; a full bundle names all four, even one with no rows |
| `entities/<type>.jsonl` | one row a line, for each type that has rows |
| `attachments/<id>` | the files of the live attachments |
| `grants.json` | full scope only: `{ "grants": [...] }` by id with their stamps, revocations included; never a capability or a session grant. The manifest counts the live ones under `grant` |
| `facts.jsonl` | full scope only: one fact a line by id, tombstones included as their id, type, provenance and stamps with nothing of what they held. The manifest counts the live ones under `fact`. The history never leaves |
| `settings.json` | full scope only: the settings, which live in the frontend and are passed in |
| `friendly/` | per domain: the same data as CSV and Markdown, written by the frontend, which owns the shapes |

- **Scope** is `{ kind: 'full' }` or `{ kind: 'domain', domain }`: the entity types and the kinds the registry says the domain owns.
- **A row** is written as it crosses the IPC boundary, with every link of its own, removed ones included: a merge needs them.
- **Mirrors never leave** (D-32). An overlay is an ordinary row and does.
- **A deleted row leaves as its tombstone and nothing of what it held**: its id, its type, its kind and its stamps.
- **Never in a bundle**: `meta`, keys and secrets, diagnostics.
- **The bytes are fixed by the rows.** Rows are written by id and links by target, so two workspaces that hold the same rows write the same files. This is what the round trip is checked by.
- The `vault/` section waits for the Vault.

## Import

`import_bundle` reads and checks everything before it writes anything: the format and its version (a later one is refused), every file against its hash, every line of every file. Then the attachment files are written, and the rows in one transaction.

**Merge** compares `updatedAt` as text.

| the row here | the row in the bundle | what happens |
|---|---|---|
| absent | any | inserted as it is |
| older | later | replaced; if the bundle's is a tombstone, the row here is stamped deleted and keeps what it held |
| later | older | kept |
| the same stamp, the same state | | skipped: it is the same row |
| the same stamp, one of them deleted | | an entity stays deleted; a link stays (`product/substrate/data.md`, "Sync") |

A row that arrives live may find its place taken: a second home, or a second overlay of one mirror. Of the two the later one stays and the other is stamped deleted; the summary counts them.

A grant merges by the same rule, and a live grant whose key another live grant holds yields the same way: the later stamp stays, the other is ended. A bundle whose `grants.json` names a capability or a session grant is refused as `bundle:unreadable`. A fact merges by the same rule too, and a live `system-derived` fact of a type another live one holds yields the same way; a line of `facts.jsonl` that the rules refuse is `bundle:unreadable`, while a type this build does not know is kept and named in the summary.

**Replace** first writes a bundle of the whole workspace to `backups/pre-replace-<time>.zip` and stops if that fails. Then it clears what the bundle's scope holds, mirrors apart (a full replace clears the grants too, the device's capability grants apart, and the facts with their history; the egress ledger is never touched), and inserts the bundle's rows as they are. It deletes rows outright, which is right while there is one device; with sync another device would bring them back, so Phase 3 revisits it.

Settings are applied only by a replace from a full bundle; a merge leaves the ones here alone, because a setting has no stamp to compare.

## Settings → Sync and data

`apps/desktop/src/lib/settings/tabs/SyncTab.svelte`: export everything, export one domain (the domains that declare `extras` in their manifest), and import. An archive is inspected before the owner chooses merge or replace; a replace asks through `ConfirmSheet` and names its backup afterwards. After an import every domain's store is read again (`reload` in the manifest), and the shell's grant and profile stores with them. Outside the app the tab says that export and import work in the installed app.

## Testing

| command | runs |
|---|---|
| `yarn test:rust` | the crate's tests with the desktop feature, as CI does |
| `yarn workspace @eden/shared run test` | the shared package's, in Node |

The Rust tests are inline modules over a workspace in memory with no key (`Workspace::in_memory()`), because they exercise the SQL and not the cipher; one test opens a real file to prove it is encrypted, reopens with its key and does not open without it. The key providers for iOS and Android cannot run on a desktop host and have no tests.

**The Phase 1 done criterion** is `an_export_round_trips_through_a_merge` in `substrate/bundle.rs`: a workspace with rows in every table, tombstones, links live and removed, an overlay, a mirror and an attachment is exported, imported into an empty workspace and exported again. The two bundles hold the same paths, every file but the manifest is the same bytes, and the manifests are equal once `createdAt`, `node` and `app` are taken out. `an_export_round_trips_through_a_replace` does the same into a workspace that had rows of its own. The grant store's rules are pinned by `the_decision_table_holds` and the tests beside it in `substrate/grants.rs`, and in `grants/rules.test.ts` on the frontend; `the_vault_ai_row_cannot_be_written` in `substrate/egress.rs` proves the row that is always zero cannot be written, through the store or around it. The profile's rules are pinned by `confidence_and_source_follow_the_provenance`, `a_system_derived_fact_is_one_row_renewed_in_place` and the tests beside them in `substrate/facts.rs`, by `profile/rules.test.ts` and `profile/shapes.test.ts` on the frontend, and in the bundle by `two_derived_facts_of_one_type_keep_the_later` and `a_replace_clears_facts_and_their_history`. The tests of the scheduler, the signals and the inbox are listed in `engineering/signals.md`.
