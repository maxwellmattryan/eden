//! The egress ledger (docs/product/substrate/privacy.md, "The owner's controls"; D-71): every byte that leaves this
//! device has a destination the owner can see afterwards. One row per destination and local day, counting requests
//! and the bytes Eden handed over. The ledger is this device's: never exported, never synced, never cleared by a
//! replace, and swept past its retention when the workspace opens. No row is ever the Vault's: `vault-ai` is refused
//! here and drawn by the interface at zero, which is the point of the row.

use chrono::{Duration, NaiveDate};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use super::ids;
use crate::error::{EdenError, Result};

/// The destination that never has a row: the Vault's contents on their way to a model.
pub const VAULT_AI: &str = "vault-ai";
/// How long a day stays in the ledger.
pub const RETENTION_DAYS: i64 = 90;

const DAY: &str = "%Y-%m-%d";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EgressRow {
    pub destination: String,
    /// The local calendar day, `YYYY-MM-DD`.
    pub day: String,
    pub requests: u64,
    pub bytes_out: u64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EgressQuery {
    /// The first day, inclusive.
    pub from: Option<String>,
    /// The last day, inclusive.
    pub to: Option<String>,
}

fn refused(code: &str, detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("egress:{code}: {detail}"))
}

fn parse_day(day: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(day, DAY)
        .map_err(|_| refused("invalid", format!("not a day: {day:?}")))
}

/// Today where the device is: the day the owner would say a request happened on.
pub fn today() -> String {
    chrono::Local::now().format(DAY).to_string()
}

/// Counts one request to the destination today, with the bytes Eden handed it.
pub fn record(conn: &Connection, destination: &str, bytes_out: u64) -> Result<()> {
    record_on(conn, destination, bytes_out, &today())
}

/// The most requests one entry may stand for: a batch is a few seconds of map tiles, never a day's worth.
pub const MAX_BATCH: u64 = 10_000;

/// Counts several requests to the destination today in one write, with the bytes Eden handed over across them
/// (D-131): a map asks for tiles by the dozen, and a write for each would be the ledger's own load. A batch of none
/// is one, and a batch is never more than `MAX_BATCH`.
pub fn record_many(
    conn: &Connection,
    destination: &str,
    bytes_out: u64,
    requests: u64,
) -> Result<()> {
    record_many_on(conn, destination, bytes_out, requests, &today())
}

pub(crate) fn record_on(
    conn: &Connection,
    destination: &str,
    bytes_out: u64,
    day: &str,
) -> Result<()> {
    record_many_on(conn, destination, bytes_out, 1, day)
}

pub(crate) fn record_many_on(
    conn: &Connection,
    destination: &str,
    bytes_out: u64,
    requests: u64,
    day: &str,
) -> Result<()> {
    if destination == VAULT_AI {
        return Err(refused("never", "nothing in the Vault goes to a model"));
    }
    if !ids::is_resource_id(destination) {
        return Err(refused(
            "invalid",
            format!("not a destination: {destination:?}"),
        ));
    }
    parse_day(day)?;
    conn.execute(
        "INSERT INTO egress (destination, day, requests, bytes_out) VALUES (?1, ?2, ?4, ?3)
         ON CONFLICT(destination, day) DO UPDATE
         SET requests = requests + excluded.requests, bytes_out = bytes_out + excluded.bytes_out",
        rusqlite::params![
            destination,
            day,
            bytes_out as i64,
            requests.clamp(1, MAX_BATCH) as i64
        ],
    )?;
    Ok(())
}

/// The rows within the days asked for, the latest day first and the destinations in order within it.
pub fn query(conn: &Connection, filter: &EgressQuery) -> Result<Vec<EgressRow>> {
    let mut clauses = vec!["1".to_string()];
    let mut params: Vec<String> = Vec::new();
    for (column, bound) in [(">=", &filter.from), ("<=", &filter.to)] {
        if let Some(day) = bound {
            parse_day(day)?;
            params.push(day.clone());
            clauses.push(format!("day {column} ?{}", params.len()));
        }
    }
    let sql = format!(
        "SELECT destination, day, requests, bytes_out FROM egress WHERE {}
         ORDER BY day DESC, destination ASC",
        clauses.join(" AND ")
    );
    Ok(conn
        .prepare(&sql)?
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(EgressRow {
                destination: row.get(0)?,
                day: row.get(1)?,
                requests: row.get::<_, i64>(2)? as u64,
                bytes_out: row.get::<_, i64>(3)? as u64,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Removes the days past their retention, counted from `today`. Answers how many rows went.
pub(crate) fn sweep(conn: &Connection, today: &str) -> Result<usize> {
    let cutoff = (parse_day(today)? - Duration::days(RETENTION_DAYS))
        .format(DAY)
        .to_string();
    Ok(conn.execute("DELETE FROM egress WHERE day < ?1", [cutoff])?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::substrate::Workspace;

    fn rows(ws: &Workspace, filter: EgressQuery) -> Vec<(String, String, u64, u64)> {
        ws.read(|conn| query(conn, &filter))
            .unwrap()
            .into_iter()
            .map(|row| (row.destination, row.day, row.requests, row.bytes_out))
            .collect()
    }

    #[test]
    fn a_request_adds_to_its_destination_and_day() {
        let ws = Workspace::in_memory();
        ws.write(|ctx| {
            record_on(ctx.conn, "open-meteo", 120, "2020-03-01")?;
            record_on(ctx.conn, "open-meteo", 80, "2020-03-01")?;
            record_on(ctx.conn, "open-meteo", 5, "2020-03-02")?;
            record_on(ctx.conn, "nws", 0, "2020-03-01")
        })
        .unwrap();
        assert_eq!(
            rows(&ws, EgressQuery::default()),
            vec![
                ("open-meteo".into(), "2020-03-02".into(), 1, 5),
                ("nws".into(), "2020-03-01".into(), 1, 0),
                ("open-meteo".into(), "2020-03-01".into(), 2, 200),
            ]
        );
        // The day is the device's; `record` takes today's.
        ws.write(|ctx| record(ctx.conn, "updater", 60)).unwrap();
        let latest = &rows(&ws, EgressQuery::default())[0];
        assert_eq!(
            (latest.0.as_str(), latest.1.as_str()),
            ("updater", today().as_str())
        );
    }

    #[test]
    fn a_batch_counts_its_requests_in_one_write() {
        let ws = Workspace::in_memory();
        ws.write(|ctx| {
            record_many_on(ctx.conn, "openfreemap", 4_200, 24, "2026-10-01")?;
            record_many_on(ctx.conn, "openfreemap", 800, 6, "2026-10-01")?;
            // a batch of none is one request, and a batch is never more than the cap
            record_many_on(ctx.conn, "photon", 90, 0, "2026-10-01")?;
            record_many_on(ctx.conn, "overpass", 1, MAX_BATCH + 5, "2026-10-01")
        })
        .unwrap();
        assert_eq!(
            rows(&ws, EgressQuery::default()),
            vec![
                ("openfreemap".into(), "2026-10-01".into(), 30, 5_000),
                ("overpass".into(), "2026-10-01".into(), MAX_BATCH, 1),
                ("photon".into(), "2026-10-01".into(), 1, 90),
            ]
        );
    }

    #[test]
    fn the_vault_ai_row_cannot_be_written() {
        let ws = Workspace::in_memory();
        let error = ws
            .write(|ctx| record_on(ctx.conn, VAULT_AI, 1, "2026-09-29"))
            .expect_err("refused");
        assert!(error.to_string().starts_with("egress:never: "));
        assert!(matches!(error, EdenError::Refused(_)));
        // Nor can the schema be talked around.
        let direct = ws.write(|ctx| {
            ctx.conn.execute(
                "INSERT INTO egress (destination, day) VALUES ('vault-ai', '2026-09-29')",
                [],
            )?;
            Ok(())
        });
        assert!(matches!(direct, Err(EdenError::Database(_))));
        assert!(rows(&ws, EgressQuery::default()).is_empty());

        let bad = ws
            .write(|ctx| record_on(ctx.conn, "Open Meteo", 1, "2026-09-29"))
            .expect_err("refused");
        assert!(bad.to_string().starts_with("egress:invalid: "));
    }

    #[test]
    fn old_days_are_swept() {
        let ws = Workspace::in_memory();
        ws.write(|ctx| {
            record_on(ctx.conn, "open-meteo", 1, "2026-06-30")?;
            record_on(ctx.conn, "open-meteo", 1, "2026-07-01")?;
            record_on(ctx.conn, "open-meteo", 1, "2026-09-29")
        })
        .unwrap();
        // Ninety days before 2026-09-29 is 2026-07-01, which stays.
        assert_eq!(ws.read(|conn| sweep(conn, "2026-09-29")).unwrap(), 1);
        let days: Vec<String> = rows(&ws, EgressQuery::default())
            .into_iter()
            .map(|row| row.1)
            .collect();
        assert_eq!(days, vec!["2026-09-29", "2026-07-01"]);
        assert_eq!(ws.read(|conn| sweep(conn, "2026-09-29")).unwrap(), 0);
    }

    #[test]
    fn a_query_is_by_day_then_destination_within_a_range() {
        let ws = Workspace::in_memory();
        ws.write(|ctx| {
            for day in ["2026-09-27", "2026-09-28", "2026-09-29"] {
                record_on(ctx.conn, "weatherkit", 10, day)?;
                record_on(ctx.conn, "nws", 10, day)?;
            }
            Ok(())
        })
        .unwrap();
        let within = rows(
            &ws,
            EgressQuery {
                from: Some("2026-09-28".into()),
                to: Some("2026-09-28".into()),
            },
        );
        assert_eq!(within.len(), 2);
        assert_eq!(
            (within[0].0.as_str(), within[1].0.as_str()),
            ("nws", "weatherkit")
        );
        let since = rows(
            &ws,
            EgressQuery {
                from: Some("2026-09-28".into()),
                to: None,
            },
        );
        assert_eq!(since.len(), 4);
        assert_eq!(since[0].1, "2026-09-29");
        assert!(matches!(
            ws.read(|conn| query(
                conn,
                &EgressQuery {
                    from: Some("yesterday".into()),
                    to: None
                }
            )),
            Err(EdenError::Refused(_))
        ));
    }
}
