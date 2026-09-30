//! The schema, as an append-only list of migrations.
//!
//! **Append only.** A migration that has shipped is never edited, reordered or removed: a change is a new entry at the
//! end. Each runs exactly once, in order, in its own transaction (`run_migrations`). The version of a migration is its
//! position in the list, starting at 1.
//!
//! Conventions (docs/engineering/data-layer.md, "Schema"):
//! - Stamps (`created_at`, `updated_at`, `deleted_at`) are hybrid logical clock stamps as fixed-width hex text, so
//!   text order is clock order. `updated_at` is the row's version; a delete sets `deleted_at` to the same stamp.
//! - Booleans are `INTEGER` 0 or 1. Times the owner sees (`due`, `start_at`) are ISO 8601 text; an instant only the
//!   code reads (`next_at`) is an `INTEGER` of milliseconds since the epoch.
//! - No foreign keys between data tables: an import inserts rows in any order and the code validates.

pub fn get_migrations() -> Vec<&'static str> {
    vec![
        // Migration 1: the device's own state, the entities table, the four primitives and links. The local calendar
        // source is seeded at a fixed id with the lowest stamp, so every device has the same row and any edit wins.
        r#"
        CREATE TABLE meta (
            key   TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE entities (
            id          TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            type        TEXT NOT NULL,
            payload     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload)),
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            deleted_at  TEXT,
            mirror      INTEGER NOT NULL DEFAULT 0 CHECK (mirror IN (0, 1)),
            source      TEXT,
            external_id TEXT,
            snapshot    TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)),
            CHECK ((source IS NULL) = (external_id IS NULL)),
            CHECK (mirror = 0 OR source IS NOT NULL)
        );
        CREATE INDEX entities_type_live ON entities (type, id) WHERE deleted_at IS NULL;
        CREATE UNIQUE INDEX entities_mirror_key ON entities (type, source, external_id) WHERE mirror = 1;
        CREATE UNIQUE INDEX entities_overlay_key ON entities (type, source, external_id)
            WHERE mirror = 0 AND source IS NOT NULL AND deleted_at IS NULL;

        CREATE TABLE tasks (
            id           TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            kind         TEXT NOT NULL,
            title        TEXT NOT NULL,
            notes        TEXT,
            due          TEXT,
            priority     TEXT NOT NULL DEFAULT 'none' CHECK (priority IN ('none', 'low', 'high')),
            at           TEXT,
            time_of_day  TEXT,
            recurrence   TEXT CHECK (recurrence IS NULL OR json_valid(recurrence)),
            items        TEXT CHECK (items IS NULL OR json_valid(items)),
            target       TEXT CHECK (target IS NULL OR json_valid(target)),
            grace        INTEGER,
            streak       INTEGER NOT NULL DEFAULT 0,
            progress     TEXT CHECK (progress IS NULL OR json_valid(progress)),
            done         INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
            completed_at TEXT,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL,
            deleted_at   TEXT,
            mirror       INTEGER NOT NULL DEFAULT 0 CHECK (mirror IN (0, 1)),
            source       TEXT,
            external_id  TEXT,
            snapshot     TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)),
            CHECK ((source IS NULL) = (external_id IS NULL)),
            CHECK (mirror = 0 OR source IS NOT NULL)
        );
        CREATE INDEX tasks_kind_live ON tasks (kind, id) WHERE deleted_at IS NULL;
        CREATE INDEX tasks_due ON tasks (due) WHERE deleted_at IS NULL AND due IS NOT NULL;
        CREATE UNIQUE INDEX tasks_mirror_key ON tasks (source, external_id) WHERE mirror = 1;

        CREATE TABLE events (
            id                 TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            kind               TEXT NOT NULL,
            title              TEXT NOT NULL,
            start_at           TEXT NOT NULL,
            end_at             TEXT,
            all_day            INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
            timezone           TEXT,
            recurrence         TEXT CHECK (recurrence IS NULL OR json_valid(recurrence)),
            status             TEXT NOT NULL DEFAULT 'confirmed'
                               CHECK (status IN ('tentative', 'confirmed', 'cancelled')),
            notes              TEXT,
            reminders          TEXT CHECK (reminders IS NULL OR json_valid(reminders)),
            attendees          TEXT CHECK (attendees IS NULL OR json_valid(attendees)),
            calendar_source_id TEXT NOT NULL,
            created_at         TEXT NOT NULL,
            updated_at         TEXT NOT NULL,
            deleted_at         TEXT,
            mirror             INTEGER NOT NULL DEFAULT 0 CHECK (mirror IN (0, 1)),
            source             TEXT,
            external_id        TEXT,
            snapshot           TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)),
            CHECK ((source IS NULL) = (external_id IS NULL)),
            CHECK (mirror = 0 OR source IS NOT NULL),
            CHECK (mirror = 1 OR attendees IS NULL)
        );
        CREATE INDEX events_kind_live ON events (kind, id) WHERE deleted_at IS NULL;
        CREATE INDEX events_start ON events (start_at) WHERE deleted_at IS NULL;
        CREATE INDEX events_calendar_source ON events (calendar_source_id) WHERE deleted_at IS NULL;
        CREATE UNIQUE INDEX events_mirror_key ON events (source, external_id) WHERE mirror = 1;

        CREATE TABLE places (
            id          TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            kind        TEXT NOT NULL,
            name        TEXT NOT NULL,
            lat         REAL,
            lng         REAL,
            address     TEXT,
            category    TEXT,
            phone       TEXT,
            url         TEXT,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            deleted_at  TEXT,
            mirror      INTEGER NOT NULL DEFAULT 0 CHECK (mirror IN (0, 1)),
            source      TEXT,
            external_id TEXT,
            snapshot    TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)),
            CHECK ((lat IS NULL) = (lng IS NULL)),
            CHECK ((source IS NULL) = (external_id IS NULL)),
            CHECK (mirror = 0 OR source IS NOT NULL)
        );
        CREATE INDEX places_kind_live ON places (kind, id) WHERE deleted_at IS NULL;
        CREATE UNIQUE INDEX places_one_home ON places (kind)
            WHERE kind = 'home' AND mirror = 0 AND deleted_at IS NULL;
        CREATE UNIQUE INDEX places_mirror_key ON places (source, external_id) WHERE mirror = 1;

        CREATE TABLE attachments (
            id          TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            kind        TEXT NOT NULL,
            file_name   TEXT NOT NULL,
            mime        TEXT NOT NULL,
            size        INTEGER NOT NULL CHECK (size >= 0),
            hash        TEXT NOT NULL,
            store       TEXT NOT NULL DEFAULT 'workspace' CHECK (store IN ('workspace', 'vault')),
            thumbnail   TEXT,
            ocr_text    TEXT,
            captured    TEXT CHECK (captured IS NULL OR json_valid(captured)),
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            deleted_at  TEXT,
            mirror      INTEGER NOT NULL DEFAULT 0 CHECK (mirror IN (0, 1)),
            source      TEXT,
            external_id TEXT,
            snapshot    TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)),
            CHECK ((source IS NULL) = (external_id IS NULL)),
            CHECK (mirror = 0 OR source IS NOT NULL),
            CHECK (store = 'workspace' OR thumbnail IS NULL)
        );
        CREATE INDEX attachments_kind_live ON attachments (kind, id) WHERE deleted_at IS NULL;
        CREATE UNIQUE INDEX attachments_mirror_key ON attachments (source, external_id) WHERE mirror = 1;

        CREATE TABLE links (
            owner_id   TEXT NOT NULL,
            owner_type TEXT NOT NULL,
            target_uri TEXT NOT NULL,
            relation   TEXT NOT NULL
                       CHECK (relation IN ('about', 'at', 'from', 'for', 'part-of', 'see-also')),
            label      TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            PRIMARY KEY (owner_id, target_uri, relation)
        ) WITHOUT ROWID;
        CREATE INDEX links_target ON links (target_uri) WHERE deleted_at IS NULL;

        INSERT INTO entities (id, type, payload, created_at, updated_at)
        VALUES ('00000000000000000000000001', 'calendar-source', '{"kind":"local"}',
                '0000000000000000-00000000-00000000', '0000000000000000-00000000-00000000');
        "#,
        // Migration 2: the grant store (docs/product/substrate/grants.md, D-70) and the egress ledger (D-71). A grant
        // is workspace policy with stamps and a tombstone like any row; the ledger is this device's alone, one row per
        // destination and local day, and no row of it is ever the Vault's.
        r#"
        CREATE TABLE grants (
            id            TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            subject       TEXT NOT NULL CHECK (length(subject) > 0),
            resource      TEXT NOT NULL CHECK (length(resource) > 0),
            resource_type TEXT NOT NULL CHECK (resource_type IN ('registry', 'scope', 'tool', 'capability')),
            access        TEXT NOT NULL CHECK (access IN ('read', 'write-draft', 'write', 'act-external')),
            lifetime      TEXT NOT NULL CHECK (lifetime IN ('standing', 'session', 'per-request')),
            narrowing     TEXT CHECK (narrowing IS NULL OR json_valid(narrowing)),
            origin        TEXT NOT NULL CHECK (origin IN ('onboarding', 'settings', 'confirm')),
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL,
            deleted_at    TEXT,
            CHECK (access <> 'act-external' OR lifetime = 'per-request')
        );
        CREATE INDEX grants_subject_live ON grants (subject, resource_type, resource) WHERE deleted_at IS NULL;
        CREATE UNIQUE INDEX grants_live_key ON grants (subject, resource_type, resource, access)
            WHERE deleted_at IS NULL AND lifetime <> 'per-request';

        CREATE TABLE egress (
            destination TEXT NOT NULL CHECK (length(destination) > 0 AND destination <> 'vault-ai'),
            day         TEXT NOT NULL CHECK (length(day) = 10),
            requests    INTEGER NOT NULL DEFAULT 0 CHECK (requests >= 0),
            bytes_out   INTEGER NOT NULL DEFAULT 0 CHECK (bytes_out >= 0),
            PRIMARY KEY (destination, day)
        ) WITHOUT ROWID;
        "#,
        // Migration 3: the profile (docs/product/substrate/profile.md, D-72). A fact is a row with stamps and a
        // tombstone like any other, so it exports, syncs and merges; its type is a registry fact id and its value is
        // JSON the frontend shapes. Who wrote it and how sure it was are code's rules, not the schema's, so a
        // tombstone stripped of what it held can still be put back. The history keeps each replaced value thirty
        // days and is this device's: never exported, never synced.
        r#"
        CREATE TABLE facts (
            id          TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            type        TEXT NOT NULL CHECK (length(type) > 0),
            value       TEXT NOT NULL CHECK (json_valid(value) AND json_type(value) <> 'null'),
            provenance  TEXT NOT NULL CHECK (provenance IN
                            ('user-asserted', 'domain-derived', 'system-derived', 'integration', 'ai-inferred')),
            confidence  REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
            valid_from  TEXT CHECK (valid_from IS NULL OR length(valid_from) = 10),
            valid_until TEXT CHECK (valid_until IS NULL OR length(valid_until) = 10),
            source      TEXT,
            note        TEXT,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            deleted_at  TEXT,
            CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until)
        );
        CREATE INDEX facts_type_live ON facts (type, id) WHERE deleted_at IS NULL;
        CREATE UNIQUE INDEX facts_system_key ON facts (type)
            WHERE provenance = 'system-derived' AND deleted_at IS NULL;

        CREATE TABLE fact_history (
            seq         INTEGER PRIMARY KEY,
            fact_id     TEXT NOT NULL CHECK (length(fact_id) = 26),
            type        TEXT NOT NULL,
            value       TEXT NOT NULL CHECK (json_valid(value)),
            note        TEXT,
            valid_from  TEXT,
            valid_until TEXT,
            replaced_at TEXT NOT NULL
        );
        CREATE INDEX fact_history_fact ON fact_history (fact_id, replaced_at);
        "#,
        // Migration 4: the scheduler (docs/product/substrate/signals-notifications.md, D-73). One row per named
        // schedule with the instant it is next due; a one-shot is gone once taken. The schedules are this device's:
        // never exported, never synced, and the repeating ones are declared again from the manifests at every start.
        r#"
        CREATE TABLE schedules (
            name     TEXT PRIMARY KEY NOT NULL CHECK (length(name) > 0),
            kind     TEXT NOT NULL CHECK (kind IN ('once', 'daily', 'every')),
            daily_at TEXT CHECK (daily_at IS NULL OR length(daily_at) = 5),
            every_s  INTEGER CHECK (every_s IS NULL OR every_s >= 60),
            next_at  INTEGER NOT NULL CHECK (next_at >= 0),
            CHECK ((kind = 'daily') = (daily_at IS NOT NULL)),
            CHECK ((kind = 'every') = (every_s IS NOT NULL))
        ) WITHOUT ROWID;
        "#,
        // Migration 5: signals and the inbox (docs/product/substrate/signals-notifications.md, D-73). A signal is what
        // happened, with a small payload and the tier of what it names; its key, when it has one, lets it be emitted
        // only once. An inbox row is one rule's card for one signal and carries nothing of its own but whether it was
        // read: the words come from the signal. Both are this device's and kept thirty days.
        r#"
        CREATE TABLE signals (
            id         TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            name       TEXT NOT NULL CHECK (length(name) > 0),
            payload    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload) AND json_type(payload) = 'object'),
            tier       TEXT NOT NULL CHECK (tier IN ('T0', 'T1', 'T2', 'T3')),
            dedupe_key TEXT,
            created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX signals_dedupe ON signals (name, dedupe_key) WHERE dedupe_key IS NOT NULL;
        CREATE INDEX signals_created ON signals (created_at);

        CREATE TABLE inbox (
            id        TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            signal_id TEXT NOT NULL CHECK (length(signal_id) = 26),
            rule      TEXT NOT NULL CHECK (length(rule) > 0),
            channel   TEXT NOT NULL CHECK (channel IN ('in-app', 'os')),
            read      INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0, 1))
        );
        CREATE UNIQUE INDEX inbox_once ON inbox (signal_id, rule);
        "#,
        // Migration 6: the Gardener's audit log, threads, messages and policy (docs/engineering/gardener.md, D-76).
        // An audit entry is one request to a model as the owner may see it afterwards: what was read, by which
        // grants, what it cost and how it ended. It is this device's: never exported, never cleared by a replace,
        // swept at ninety days. A thread and its messages are stamped rows with tombstones like any other, and so is
        // a policy row, keyed by name; all three export, sync and merge.
        r#"
        CREATE TABLE audit_entries (
            id                TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            at                INTEGER NOT NULL CHECK (at >= 0),
            surface           TEXT NOT NULL CHECK (length(surface) > 0),
            thread_id         TEXT,
            parent_request_id TEXT,
            tool              TEXT,
            domain            TEXT,
            declared_grade    TEXT CHECK (declared_grade IS NULL OR declared_grade IN ('light', 'standard', 'deep')),
            grade             TEXT CHECK (grade IS NULL OR grade IN ('light', 'standard', 'deep')),
            source            TEXT CHECK (source IS NULL OR source IN ('tool-override', 'domain-override', 'map')),
            provider          TEXT NOT NULL CHECK (length(provider) > 0),
            model             TEXT NOT NULL CHECK (length(model) > 0),
            reads             TEXT NOT NULL CHECK (json_valid(reads) AND json_type(reads) = 'array'),
            entities          TEXT NOT NULL CHECK (json_valid(entities) AND json_type(entities) = 'array'),
            tools             TEXT NOT NULL CHECK (json_valid(tools) AND json_type(tools) = 'array'),
            grants            TEXT NOT NULL CHECK (json_valid(grants) AND json_type(grants) = 'array'),
            confirm_outcome   TEXT CHECK (confirm_outcome IS NULL OR confirm_outcome IN ('confirmed', 'cancelled')),
            tokens_in         INTEGER NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
            tokens_out        INTEGER NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
            cache_read        INTEGER NOT NULL DEFAULT 0 CHECK (cache_read >= 0),
            cost_usd          REAL NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
            outcome           TEXT NOT NULL CHECK (outcome IN
                                  ('ok', 'refusal', 'max-tokens', 'error', 'cancelled', 'declined', 'budget',
                                   'interrupted')),
            image             TEXT CHECK (image IS NULL OR json_valid(image))
        );
        CREATE INDEX audit_at ON audit_entries (at);
        CREATE INDEX audit_thread ON audit_entries (thread_id, at) WHERE thread_id IS NOT NULL;

        CREATE TABLE threads (
            id         TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            domain     TEXT,
            title      TEXT NOT NULL,
            tier       TEXT NOT NULL CHECK (tier IN ('T0', 'T1', 'T2')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE INDEX threads_live ON threads (updated_at DESC, id) WHERE deleted_at IS NULL;

        CREATE TABLE messages (
            id         TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 26),
            thread_id  TEXT NOT NULL CHECK (length(thread_id) = 26),
            role       TEXT NOT NULL CHECK (role IN ('owner', 'gardener')),
            blocks     TEXT NOT NULL CHECK (json_valid(blocks) AND json_type(blocks) = 'array'),
            request_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE INDEX messages_thread ON messages (thread_id, id) WHERE deleted_at IS NULL;

        CREATE TABLE policy (
            key        TEXT PRIMARY KEY NOT NULL CHECK (length(key) > 0),
            value      TEXT NOT NULL CHECK (json_valid(value)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        ) WITHOUT ROWID;
        "#,
    ]
}
