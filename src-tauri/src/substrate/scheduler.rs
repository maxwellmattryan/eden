//! The scheduler's store (docs/product/substrate/signals-notifications.md, "Scheduler"; D-73): one row per named
//! schedule with the instant it is next due. A schedule is repeating, declared by a manifest (`daily` at a local
//! time, `every` so many seconds), or a one-shot a domain sets while the app runs (`once`).
//!
//! Nothing here fires anything. The shell takes what is due (`take_due`) when the alarm rings
//! (`services/scheduler.rs`), when it starts and when its window comes back, and only a take moves a schedule on, so
//! an occurrence is never lost to a webview that was not listening. A take answers each due schedule once, however
//! many of its occurrences were missed. The schedules are this device's: never exported, never synced, never cleared
//! by a replace.

use chrono::{Duration, LocalResult, NaiveDate, NaiveTime, TimeZone};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::ids;
use super::text::{text_column, text_enum};
use crate::error::{EdenError, Result};

/// The shortest period a schedule repeats at.
pub const MIN_EVERY_S: i64 = 60;

const TIME: &str = "%H:%M";
/// How far past a time the clocks skip the search for one that exists goes, in quarter hours.
const GAP_STEPS: usize = 12;

text_enum! {
    ScheduleKind { Once = "once", Daily = "daily", Every = "every" }
}

/// A repeating schedule as a manifest declares it: `daily` at a local `HH:MM`, or `every` so many seconds.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Declared {
    pub name: String,
    pub daily: Option<String>,
    pub every: Option<i64>,
}

/// A schedule that was due, and the instant it was due at, in milliseconds since the epoch.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Fired {
    pub name: String,
    pub due_at: i64,
}

fn refused(detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("schedule:invalid: {detail}"))
}

/// A schedule's name is its owner and its id, each a plain id: `weather.alerts`, `kitchen.shop-day`.
fn check_name(name: &str) -> Result<()> {
    match name.split_once('.') {
        Some((owner, id)) if ids::is_resource_id(owner) && ids::is_resource_id(id) => Ok(()),
        _ => Err(refused(format!("not a schedule name: {name:?}"))),
    }
}

fn parse_time(time: &str) -> Result<NaiveTime> {
    NaiveTime::parse_from_str(time, TIME)
        .ok()
        .filter(|_| time.len() == 5)
        .ok_or_else(|| refused(format!("not a time of day: {time:?}")))
}

/// The instant the zone's clock reads `time` on `day`. A time the clocks skip is read as the first one after it that
/// exists; a time they repeat, as the earlier of the two.
fn on_day<Tz: TimeZone>(zone: &Tz, day: NaiveDate, time: NaiveTime) -> i64 {
    let mut local = day.and_time(time);
    for _ in 0..=GAP_STEPS {
        match zone.from_local_datetime(&local) {
            LocalResult::Single(at) => return at.timestamp_millis(),
            LocalResult::Ambiguous(earlier, _) => return earlier.timestamp_millis(),
            LocalResult::None => local += Duration::minutes(15),
        }
    }
    local.and_utc().timestamp_millis()
}

fn day_of<Tz: TimeZone>(zone: &Tz, at_ms: i64) -> NaiveDate {
    zone.timestamp_millis_opt(at_ms)
        .earliest()
        .map(|at| at.date_naive())
        .unwrap_or_default()
}

/// The first time the zone's clock reads `time` after `now_ms`.
fn daily_after<Tz: TimeZone>(zone: &Tz, now_ms: i64, time: NaiveTime) -> i64 {
    let today = day_of(zone, now_ms);
    (0..3)
        .map(|days| on_day(zone, today + Duration::days(days), time))
        .find(|at| *at > now_ms)
        .unwrap_or(now_ms + Duration::days(1).num_milliseconds())
}

struct Row {
    name: String,
    kind: ScheduleKind,
    daily_at: Option<String>,
    every_s: Option<i64>,
    next_at: i64,
}

const COLUMNS: &str = "name, kind, daily_at, every_s, next_at";

fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Row> {
    Ok(Row {
        name: row.get(0)?,
        kind: text_column(row, 1, ScheduleKind::parse)?,
        daily_at: row.get(2)?,
        every_s: row.get(3)?,
        next_at: row.get(4)?,
    })
}

fn get(conn: &Connection, name: &str) -> Result<Option<Row>> {
    Ok(conn
        .query_row(
            &format!("SELECT {COLUMNS} FROM schedules WHERE name = ?1"),
            [name],
            from_row,
        )
        .optional()?)
}

fn put(conn: &Connection, row: &Row) -> Result<()> {
    conn.execute(
        "INSERT INTO schedules (name, kind, daily_at, every_s, next_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(name) DO UPDATE SET kind = excluded.kind, daily_at = excluded.daily_at,
             every_s = excluded.every_s, next_at = excluded.next_at",
        rusqlite::params![
            row.name,
            row.kind.as_str(),
            row.daily_at,
            row.every_s,
            row.next_at
        ],
    )?;
    Ok(())
}

/// Makes the repeating schedules what the manifests declare, where the device is.
pub fn declare(conn: &Connection, declared: &[Declared], now_ms: i64) -> Result<()> {
    declare_in(conn, declared, now_ms, &chrono::Local)
}

/// A schedule that is declared as it already stands keeps the instant it is due at. A new one starts today: a
/// `daily` at its time, which is due at once when that has passed, and an `every` now. A repeating schedule that is
/// no longer declared goes; the one-shots are not touched.
pub(crate) fn declare_in<Tz: TimeZone>(
    conn: &Connection,
    declared: &[Declared],
    now_ms: i64,
    zone: &Tz,
) -> Result<()> {
    let mut rows: Vec<Row> = Vec::with_capacity(declared.len());
    for schedule in declared {
        check_name(&schedule.name)?;
        if rows.iter().any(|row| row.name == schedule.name) {
            return Err(refused(format!("declared twice: {:?}", schedule.name)));
        }
        rows.push(match (&schedule.daily, schedule.every) {
            (Some(time), None) => Row {
                name: schedule.name.clone(),
                kind: ScheduleKind::Daily,
                daily_at: Some(time.clone()),
                every_s: None,
                next_at: on_day(zone, day_of(zone, now_ms), parse_time(time)?),
            },
            (None, Some(every)) if every >= MIN_EVERY_S => Row {
                name: schedule.name.clone(),
                kind: ScheduleKind::Every,
                daily_at: None,
                every_s: Some(every),
                next_at: now_ms,
            },
            (None, Some(every)) => {
                return Err(refused(format!(
                    "{:?} repeats every {every} s; the least is {MIN_EVERY_S}",
                    schedule.name
                )))
            }
            _ => {
                return Err(refused(format!(
                    "{:?} is daily or every, one of the two",
                    schedule.name
                )))
            }
        });
    }

    let standing: Vec<String> = conn
        .prepare("SELECT name FROM schedules WHERE kind <> 'once'")?
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    for name in standing {
        if !rows.iter().any(|row| row.name == name) {
            conn.execute("DELETE FROM schedules WHERE name = ?1", [&name])?;
        }
    }
    for row in rows {
        let unchanged = get(conn, &row.name)?.is_some_and(|kept| {
            kept.kind == row.kind && kept.daily_at == row.daily_at && kept.every_s == row.every_s
        });
        if !unchanged {
            put(conn, &row)?;
        }
    }
    Ok(())
}

/// Sets a one-shot for an instant, or moves it. An instant already past is due at once. A repeating schedule's name
/// is not a one-shot's to take.
pub fn set(conn: &Connection, name: &str, at_ms: i64) -> Result<()> {
    check_name(name)?;
    if at_ms < 0 {
        return Err(refused(format!("not an instant: {at_ms}")));
    }
    if get(conn, name)?.is_some_and(|row| row.kind != ScheduleKind::Once) {
        return Err(refused(format!("{name:?} is a repeating schedule")));
    }
    put(
        conn,
        &Row {
            name: name.to_string(),
            kind: ScheduleKind::Once,
            daily_at: None,
            every_s: None,
            next_at: at_ms,
        },
    )
}

/// Takes a one-shot back before it is due. Answers whether there was one.
pub fn cancel(conn: &Connection, name: &str) -> Result<bool> {
    check_name(name)?;
    Ok(conn.execute(
        "DELETE FROM schedules WHERE name = ?1 AND kind = 'once'",
        [name],
    )? > 0)
}

/// What is due now, the longest overdue first, each moved on as it is taken.
pub fn take_due(conn: &Connection, now_ms: i64) -> Result<Vec<Fired>> {
    take_due_in(conn, now_ms, &chrono::Local)
}

/// A one-shot is gone once taken; a `daily` is next due the first time its hour comes after now; an `every` a period
/// from now, so a schedule that missed ten periods is due once and not ten times.
pub(crate) fn take_due_in<Tz: TimeZone>(
    conn: &Connection,
    now_ms: i64,
    zone: &Tz,
) -> Result<Vec<Fired>> {
    let due: Vec<Row> = conn
        .prepare(&format!(
            "SELECT {COLUMNS} FROM schedules WHERE next_at <= ?1 ORDER BY next_at, name"
        ))?
        .query_map([now_ms], from_row)?
        .collect::<rusqlite::Result<_>>()?;
    let mut fired = Vec::with_capacity(due.len());
    for row in due {
        let next_at = match (row.kind, &row.daily_at, row.every_s) {
            (ScheduleKind::Daily, Some(time), _) => {
                Some(daily_after(zone, now_ms, parse_time(time)?))
            }
            (ScheduleKind::Every, _, Some(every)) => Some(now_ms + every * 1000),
            _ => None,
        };
        match next_at {
            Some(next_at) => conn.execute(
                "UPDATE schedules SET next_at = ?2 WHERE name = ?1",
                rusqlite::params![row.name, next_at],
            )?,
            None => conn.execute("DELETE FROM schedules WHERE name = ?1", [&row.name])?,
        };
        fired.push(Fired {
            name: row.name,
            due_at: row.next_at,
        });
    }
    Ok(fired)
}

/// The instant the earliest schedule is due at, when there is one.
pub fn next_due(conn: &Connection) -> Result<Option<i64>> {
    Ok(conn.query_row("SELECT MIN(next_at) FROM schedules", [], |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use chrono::{FixedOffset, Utc};
    use chrono_tz::America::Chicago;

    use super::*;
    use crate::substrate::Workspace;

    const MINUTE: i64 = 60 * 1000;
    const HOUR: i64 = 60 * MINUTE;
    const DAY: i64 = 24 * HOUR;

    /// An instant as the clock in Chicago reads it.
    fn chicago(text: &str) -> i64 {
        let local = chrono::NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M").unwrap();
        Chicago
            .from_local_datetime(&local)
            .earliest()
            .unwrap()
            .timestamp_millis()
    }

    fn daily(name: &str, time: &str) -> Declared {
        Declared {
            name: name.to_string(),
            daily: Some(time.to_string()),
            every: None,
        }
    }

    fn every(name: &str, seconds: i64) -> Declared {
        Declared {
            name: name.to_string(),
            daily: None,
            every: Some(seconds),
        }
    }

    fn rows(ws: &Workspace) -> Vec<(String, String, i64)> {
        ws.read(|conn| {
            Ok(conn
                .prepare("SELECT name, kind, next_at FROM schedules ORDER BY name")?
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
                .collect::<rusqlite::Result<_>>()?)
        })
        .unwrap()
    }

    fn code<T: std::fmt::Debug>(result: Result<T>) -> String {
        let message = result.expect_err("refused").to_string();
        message.split(": ").next().unwrap().to_string()
    }

    #[test]
    fn declaring_keeps_what_stands_and_removes_what_is_no_longer_declared() {
        let ws = Workspace::in_memory();
        let morning = chicago("2026-09-30 09:00");
        ws.write(|ctx| {
            declare_in(
                ctx.conn,
                &[
                    daily("kitchen.morning", "08:00"),
                    every("weather.alerts", 300),
                ],
                morning,
                &Chicago,
            )?;
            set(ctx.conn, "kitchen.shop-day", morning + DAY)
        })
        .unwrap();
        // Both are due: the daily's hour has passed today, and an `every` starts now.
        ws.write(|ctx| take_due_in(ctx.conn, morning, &Chicago))
            .unwrap();
        let taken = rows(&ws);

        // The same declaration an hour on moves nothing.
        ws.write(|ctx| {
            declare_in(
                ctx.conn,
                &[
                    daily("kitchen.morning", "08:00"),
                    every("weather.alerts", 300),
                ],
                morning + HOUR,
                &Chicago,
            )
        })
        .unwrap();
        assert_eq!(rows(&ws), taken);

        // A changed definition starts again; what is left out goes; the one-shot stays.
        ws.write(|ctx| {
            declare_in(
                ctx.conn,
                &[daily("kitchen.morning", "10:30")],
                morning + HOUR,
                &Chicago,
            )
        })
        .unwrap();
        assert_eq!(
            rows(&ws),
            vec![
                (
                    "kitchen.morning".into(),
                    "daily".into(),
                    chicago("2026-09-30 10:30")
                ),
                ("kitchen.shop-day".into(), "once".into(), morning + DAY),
            ]
        );
    }

    #[test]
    fn a_new_daily_starts_today_and_a_new_every_starts_now() {
        let ws = Workspace::in_memory();
        let evening = chicago("2026-09-30 21:15");
        ws.write(|ctx| {
            declare_in(
                ctx.conn,
                &[
                    daily("kitchen.morning", "08:00"),
                    daily("kitchen.night", "23:00"),
                    every("weather.alerts", 300),
                ],
                evening,
                &Chicago,
            )
        })
        .unwrap();
        assert_eq!(
            rows(&ws),
            vec![
                (
                    "kitchen.morning".into(),
                    "daily".into(),
                    chicago("2026-09-30 08:00")
                ),
                (
                    "kitchen.night".into(),
                    "daily".into(),
                    chicago("2026-09-30 23:00")
                ),
                ("weather.alerts".into(), "every".into(), evening),
            ]
        );
        // The morning's hour has passed, so it is due at once; the night's has not.
        let fired = ws
            .write(|ctx| take_due_in(ctx.conn, evening, &Chicago))
            .unwrap();
        assert_eq!(
            fired,
            vec![
                Fired {
                    name: "kitchen.morning".into(),
                    due_at: chicago("2026-09-30 08:00")
                },
                Fired {
                    name: "weather.alerts".into(),
                    due_at: evening
                },
            ]
        );
        assert_eq!(rows(&ws)[0].2, chicago("2026-10-01 08:00"));
        assert_eq!(
            ws.read(next_due).unwrap(),
            Some(evening + 300 * 1000),
            "the alerts, five minutes on"
        );
    }

    #[test]
    fn many_missed_periods_are_one_fire() {
        let ws = Workspace::in_memory();
        let start = chicago("2026-09-30 09:00");
        ws.write(|ctx| {
            declare_in(
                ctx.conn,
                &[
                    every("weather.alerts", 300),
                    daily("kitchen.morning", "08:00"),
                ],
                start,
                &Chicago,
            )?;
            take_due_in(ctx.conn, start, &Chicago)
        })
        .unwrap();

        // Ten periods of the alerts and three mornings later, each is due once.
        let later = start + 3 * DAY + 50 * MINUTE;
        let fired = ws
            .write(|ctx| take_due_in(ctx.conn, later, &Chicago))
            .unwrap();
        assert_eq!(
            fired,
            vec![
                Fired {
                    name: "weather.alerts".into(),
                    due_at: start + 5 * MINUTE
                },
                Fired {
                    name: "kitchen.morning".into(),
                    due_at: chicago("2026-10-01 08:00")
                },
            ]
        );
        // They move on from now, not from where they were.
        assert_eq!(
            rows(&ws),
            vec![
                (
                    "kitchen.morning".into(),
                    "daily".into(),
                    chicago("2026-10-04 08:00")
                ),
                ("weather.alerts".into(), "every".into(), later + 5 * MINUTE),
            ]
        );
        assert!(ws
            .write(|ctx| take_due_in(ctx.conn, later, &Chicago))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn a_one_shot_is_gone_once_taken() {
        let ws = Workspace::in_memory();
        let now = chicago("2026-09-30 09:00");
        ws.write(|ctx| set(ctx.conn, "kitchen.shop-day", now + HOUR))
            .unwrap();
        assert!(ws.write(|ctx| take_due(ctx.conn, now)).unwrap().is_empty());

        // Setting it again moves it; one that is already past is due at once.
        ws.write(|ctx| set(ctx.conn, "kitchen.shop-day", now - DAY))
            .unwrap();
        assert_eq!(
            ws.write(|ctx| take_due(ctx.conn, now)).unwrap(),
            vec![Fired {
                name: "kitchen.shop-day".into(),
                due_at: now - DAY
            }]
        );
        assert!(rows(&ws).is_empty());
        assert_eq!(ws.read(next_due).unwrap(), None);

        // A cancel takes one back, and says whether there was one.
        ws.write(|ctx| set(ctx.conn, "kitchen.shop-day", now + HOUR))
            .unwrap();
        assert!(ws
            .write(|ctx| cancel(ctx.conn, "kitchen.shop-day"))
            .unwrap());
        assert!(!ws
            .write(|ctx| cancel(ctx.conn, "kitchen.shop-day"))
            .unwrap());
    }

    #[test]
    fn a_daily_time_the_clocks_skip_or_repeat_still_comes_once() {
        let half_past_two = NaiveTime::from_hms_opt(2, 30, 0).unwrap();
        let half_past_one = NaiveTime::from_hms_opt(1, 30, 0).unwrap();

        // 8 March 2026: the clocks go from 02:00 to 03:00, so 02:30 is never read. The first time after it is 03:00.
        let before = chicago("2026-03-07 12:00");
        let skipped = daily_after(&Chicago, before + DAY / 2, half_past_two);
        assert_eq!(skipped, chicago("2026-03-08 03:00"));
        assert_eq!(
            daily_after(&Chicago, skipped, half_past_two),
            chicago("2026-03-09 02:30")
        );

        // 1 November 2026: 01:30 is read twice. The earlier one is the time, and the later one is not a second.
        let first = daily_after(&Chicago, chicago("2026-10-31 12:00"), half_past_one);
        assert_eq!(first, chicago("2026-11-01 01:30"));
        assert_eq!(
            daily_after(&Chicago, first + HOUR, half_past_one),
            chicago("2026-11-02 01:30")
        );

        // A zone that never changes reads the time plainly.
        let tokyo = FixedOffset::east_opt(9 * 3600).unwrap();
        let noon_utc = Utc
            .with_ymd_and_hms(2026, 9, 30, 12, 0, 0)
            .unwrap()
            .timestamp_millis();
        assert_eq!(
            daily_after(&tokyo, noon_utc, NaiveTime::from_hms_opt(8, 0, 0).unwrap()),
            noon_utc + 11 * HOUR
        );
    }

    #[test]
    fn what_is_malformed_is_refused() {
        let ws = Workspace::in_memory();
        let now = chicago("2026-09-30 09:00");
        for bad in [
            vec![daily("morning", "08:00")],
            vec![daily("Kitchen.morning", "08:00")],
            vec![daily("kitchen.morning", "8:00")],
            vec![daily("kitchen.morning", "24:00")],
            vec![every("weather.alerts", 30)],
            vec![Declared {
                name: "weather.alerts".into(),
                daily: None,
                every: None,
            }],
            vec![Declared {
                name: "weather.alerts".into(),
                daily: Some("08:00".into()),
                every: Some(300),
            }],
            vec![every("weather.alerts", 300), every("weather.alerts", 600)],
        ] {
            assert_eq!(
                code(ws.write(|ctx| declare_in(ctx.conn, &bad, now, &Chicago))),
                "schedule:invalid"
            );
        }
        assert!(rows(&ws).is_empty(), "a refused declaration writes nothing");

        assert_eq!(
            code(ws.write(|ctx| set(ctx.conn, "shop day", now))),
            "schedule:invalid"
        );
        assert_eq!(
            code(ws.write(|ctx| set(ctx.conn, "kitchen.shop-day", -1))),
            "schedule:invalid"
        );
        // A one-shot cannot take a repeating schedule's name, nor a cancel remove one.
        ws.write(|ctx| declare_in(ctx.conn, &[every("weather.alerts", 300)], now, &Chicago))
            .unwrap();
        assert_eq!(
            code(ws.write(|ctx| set(ctx.conn, "weather.alerts", now))),
            "schedule:invalid"
        );
        assert!(!ws.write(|ctx| cancel(ctx.conn, "weather.alerts")).unwrap());
        assert_eq!(rows(&ws).len(), 1);
    }
}
