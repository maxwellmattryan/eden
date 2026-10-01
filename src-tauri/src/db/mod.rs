//! The workspace database: one SQLCipher file, opened once, migrated on open (docs/engineering/data-layer.md).

pub mod handle;
mod key_provider;
pub mod schema;
pub mod secret_store;

use rusqlite::Connection;
use std::path::Path;

use crate::error::Result;

pub use handle::Db;

/// The database file inside the app data dir. Under WAL, `eden.db-wal` and `eden.db-shm` sit beside it while the app
/// runs; the exit checkpoint folds them back in.
pub const DB_FILE: &str = "eden.db";

/// Opens the database in `dir`, creating the file and its key on first launch, and brings the schema up to date.
pub fn open(dir: &Path) -> Result<Db> {
    std::fs::create_dir_all(dir)?;
    let key = key_provider::for_platform(dir).get_or_create_key()?;

    let conn = Connection::open(dir.join(DB_FILE))?;
    configure_connection(&conn, &key)?;
    run_migrations(&conn)?;
    Ok(Db::new(conn))
}

/// The per-connection pragmas. The SQLCipher `key` MUST be the first statement on a connection; the statement after
/// it is the first to read the file, so a wrong key fails there.
fn configure_connection(conn: &Connection, key: &str) -> Result<()> {
    conn.pragma_update(None, "key", key)?;
    let mode: String =
        conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get(0))?;
    if mode.eq_ignore_ascii_case("wal") {
        // Safe under WAL, and it skips the fsync of the main file on every commit.
        conn.pragma_update(None, "synchronous", "NORMAL")?;
    } else {
        log::warn!("db: journal_mode=WAL not applied (got {mode})");
    }
    conn.pragma_update(None, "busy_timeout", 5000)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}

/// Applies the pending migrations, in order, each exactly once.
///
/// A migration and its `schema_version` row commit in one transaction, so a run that is interrupted rolls back and is
/// tried again on the next launch; the schema is never left half applied.
pub(crate) fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)",
        [],
    )?;
    let current = schema_version(conn)?;

    for (index, sql) in schema::get_migrations().iter().enumerate() {
        let version = index as i64 + 1;
        if version > current {
            log::info!("db: running migration {version}");
            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(sql)?;
            tx.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                [version],
            )?;
            tx.commit()?;
        }
    }
    Ok(())
}

/// The version of the last migration applied; 0 before the first.
pub fn schema_version(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |row| row.get(0),
    )?)
}

/// What the tests of this crate share: a migrated in-memory database and a directory of their own.
#[cfg(test)]
pub(crate) mod testing {
    use super::*;

    /// A plain in-memory database with the whole schema. It has no key: the tests exercise the SQL, not the cipher.
    pub fn memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    /// An empty directory under the system's temp dir; the test removes it when it is done.
    pub fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("eden-{name}-{}", uuid::Uuid::new_v4().as_simple()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table_exists(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [name],
            |row| row.get::<_, i64>(0),
        )
        .unwrap()
            == 1
    }

    #[test]
    fn a_fresh_database_migrates_to_the_latest_and_reruns_cleanly() {
        let conn = testing::memory();
        let latest = schema::get_migrations().len() as i64;
        assert_eq!(schema_version(&conn).unwrap(), latest);
        for table in [
            "meta",
            "entities",
            "tasks",
            "events",
            "places",
            "attachments",
            "links",
            "grants",
            "egress",
            "facts",
            "fact_history",
            "schedules",
            "signals",
            "inbox",
            "audit_entries",
            "usage_days",
            "threads",
            "messages",
            "policy",
        ] {
            assert!(table_exists(&conn, table), "expected the table `{table}`");
        }

        run_migrations(&conn).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), latest);
    }

    /// Migration 9 sums the entries the log already held into their days, and leaves out what never left.
    #[test]
    fn the_usage_rollup_is_backfilled_from_the_log() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE schema_version (version INTEGER PRIMARY KEY)")
            .unwrap();
        for (index, sql) in schema::get_migrations().iter().take(8).enumerate() {
            conn.execute_batch(sql).unwrap();
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                [index as i64 + 1],
            )
            .unwrap();
        }
        // noon UTC on 2026-09-10, so the device's day is that one in any zone within twelve hours of it
        let noon = 1_789_041_600_000_i64;
        let insert = "INSERT INTO audit_entries
                (id, at, surface, parent_request_id, tool, domain, grade, provider, model, reads, entities, tools,
                 grants, tokens_in, tokens_out, cache_read, cache_write, cost_usd, outcome)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'anthropic', 'm', '[]', '[]', '[]', '[]', 100, 10, 5, 2, ?8, ?9)";
        let none = None::<String>;
        for (id, surface, parent, tool, domain, grade, cost, outcome) in [
            (
                "A",
                "global-chat",
                none.clone(),
                none.clone(),
                none.clone(),
                Some("light"),
                0.5,
                "ok",
            ),
            (
                "B",
                "global-chat",
                none.clone(),
                none.clone(),
                none.clone(),
                Some("light"),
                0.25,
                "error",
            ),
            (
                "C",
                "delegated",
                Some("x".to_string()),
                Some("plan".to_string()),
                Some("kitchen".to_string()),
                None,
                1.0,
                "ok",
            ),
            (
                "D",
                "global-chat",
                none.clone(),
                none.clone(),
                none.clone(),
                Some("light"),
                0.0,
                "budget",
            ),
        ] {
            conn.execute(
                insert,
                rusqlite::params![
                    format!("{id:0>26}"),
                    noon,
                    surface,
                    parent,
                    tool,
                    domain,
                    grade,
                    cost,
                    outcome
                ],
            )
            .unwrap();
        }
        run_migrations(&conn).unwrap();

        let rows: Vec<(String, String, String, String, i64, i64, i64, f64)> = conn
            .prepare(
                "SELECT day, grade, kind, tool, requests, tokens_in, cache_write, cost_usd
                 FROM usage_days ORDER BY kind",
            )
            .unwrap()
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                ))
            })
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(
            rows,
            vec![
                (
                    "2026-09-10".into(),
                    "light".into(),
                    "conversation".into(),
                    "".into(),
                    2,
                    200,
                    4,
                    0.75
                ),
                (
                    "2026-09-10".into(),
                    "".into(),
                    "tool".into(),
                    "plan".into(),
                    1,
                    100,
                    2,
                    1.0
                ),
            ]
        );
    }

    #[test]
    fn a_database_from_a_newer_build_is_left_alone() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
             CREATE TABLE marker (id INTEGER PRIMARY KEY);
             INSERT INTO schema_version (version) VALUES (9999);",
        )
        .unwrap();

        run_migrations(&conn).unwrap();
        assert!(table_exists(&conn, "marker"));
        assert!(!table_exists(&conn, "entities"));
        assert_eq!(schema_version(&conn).unwrap(), 9999);
    }

    #[test]
    fn the_local_calendar_source_is_seeded() {
        let conn = testing::memory();
        let kind: String = conn
            .query_row(
                "SELECT json_extract(payload, '$.kind') FROM entities WHERE type = 'calendar-source'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(kind, "local");
    }

    #[test]
    fn only_one_live_home_place_is_allowed() {
        let conn = testing::memory();
        let insert = "INSERT INTO places (id, kind, name, created_at, updated_at) VALUES (?1, 'home', 'Home', 's', 's')";
        conn.execute(insert, ["0000000000000000000000000A"])
            .unwrap();
        assert!(conn
            .execute(insert, ["0000000000000000000000000B"])
            .is_err());

        conn.execute("UPDATE places SET deleted_at = 's'", [])
            .unwrap();
        conn.execute(insert, ["0000000000000000000000000B"])
            .unwrap();
    }

    #[test]
    fn a_mirror_needs_its_source_and_is_unique_by_it() {
        let conn = testing::memory();
        let insert =
            "INSERT INTO entities (id, type, created_at, updated_at, mirror, source, external_id)
                      VALUES (?1, 'forecast', 's', 's', 1, ?2, ?3)";
        assert!(conn
            .execute(
                insert,
                rusqlite::params!["0000000000000000000000000A", None::<String>, None::<String>]
            )
            .is_err());
        conn.execute(insert, ["0000000000000000000000000A", "open-meteo", "x"])
            .unwrap();
        assert!(conn
            .execute(insert, ["0000000000000000000000000B", "open-meteo", "x"])
            .is_err());
    }

    /// The whole path on a real file: the key is created, the file is encrypted, and a second open reads it back.
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    #[test]
    fn the_file_is_encrypted_and_reopens_with_its_key() {
        let dir = testing::temp_dir("db-open");

        let db = open(&dir).unwrap();
        db.write(|conn| {
            conn.execute("INSERT INTO meta (key, value) VALUES ('probe', 'kept')", [])?;
            Ok(())
        })
        .unwrap();
        db.checkpoint().unwrap();
        drop(db);

        let bytes = std::fs::read(dir.join(DB_FILE)).unwrap();
        assert!(!bytes.starts_with(b"SQLite format 3\0"));
        assert!(dir.join("db.key").exists());

        let value: String = open(&dir)
            .unwrap()
            .read(|conn| {
                Ok(
                    conn.query_row("SELECT value FROM meta WHERE key = 'probe'", [], |row| {
                        row.get(0)
                    })?,
                )
            })
            .unwrap();
        assert_eq!(value, "kept");

        // Without the key the file is not a database.
        let plain = Connection::open(dir.join(DB_FILE)).unwrap();
        assert!(plain
            .query_row("SELECT COUNT(*) FROM meta", [], |row| row.get::<_, i64>(0))
            .is_err());

        std::fs::remove_dir_all(&dir).ok();
    }
}
