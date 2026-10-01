//! What the Gardener was used for, a day at a time (docs/engineering/gardener.md, "Usage"; D-115). The audit log goes
//! at ninety days; these sums stay, so the owner can still be told what a month, a year and the whole came to. A
//! row is one day's requests of one model at one grade, of one kind (a conversation's turn, a tool a conversation
//! ran, a tool a page ran) and one tool: how many, their tokens, their dollars.
//!
//! Like the log, the rollup is this device's: never exported, never synced, never cleared by a replace. It is
//! written with the audit entry, in the same transaction, and never swept. A request that never left the device
//! (declined at the confirm, or stopped by the budget) is not counted.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use super::audit::{AuditEntry, Outcome, SurfaceKind};
use crate::error::{EdenError, Result};

const DAY: &str = "%Y-%m-%d";

/// What the sums are grouped by. One of the four spans of time is the bucket; the rest are the row's own.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UsageGroup {
    Day,
    Week,
    Month,
    Year,
    Provider,
    Model,
    Grade,
    Kind,
    Domain,
    Tool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UsageQuery {
    /// The earliest day, inclusive, `YYYY-MM-DD`.
    pub from_day: Option<String>,
    /// The latest day, inclusive.
    pub to_day: Option<String>,
    /// Nothing sums the whole range into one row.
    pub group_by: Vec<UsageGroup>,
}

/// One group's sums. A field the query did not group by is absent; a grade, domain or tool the requests had none
/// of is the empty string.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageRow {
    /// The day, the Monday of the week, the month (`YYYY-MM`) or the year, by the span asked for.
    pub bucket: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub grade: Option<String>,
    pub kind: Option<String>,
    pub domain: Option<String>,
    pub tool: Option<String>,
    pub requests: u64,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub cost_usd: f64,
}

/// Whether the text is a day as the rollup keys it.
pub(crate) fn is_day(text: &str) -> bool {
    text.len() == 10 && chrono::NaiveDate::parse_from_str(text, DAY).is_ok()
}

/// The device's own day of a moment, for an entry that came without one.
fn local_day(at_ms: u64) -> Result<String> {
    chrono::DateTime::from_timestamp_millis(at_ms as i64)
        .map(|at| at.with_timezone(&chrono::Local).format(DAY).to_string())
        .ok_or_else(|| EdenError::Refused(format!("audit:invalid: not a moment: {at_ms}")))
}

/// Adds one recorded entry to its day. `day` is the owner's day the frontend named; without it, the device's.
pub(crate) fn add(conn: &Connection, entry: &AuditEntry, day: Option<&str>) -> Result<()> {
    if matches!(entry.outcome, Outcome::Declined | Outcome::Budget) {
        return Ok(());
    }
    let day = match day {
        Some(day) => day.to_string(),
        None => local_day(entry.at)?,
    };
    conn.execute(
        "INSERT INTO usage_days
             (day, provider, model, grade, kind, domain, tool,
              requests, tokens_in, tokens_out, cache_read, cache_write, cost_usd)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT (day, provider, model, grade, kind, domain, tool) DO UPDATE SET
             requests = requests + 1,
             tokens_in = tokens_in + excluded.tokens_in,
             tokens_out = tokens_out + excluded.tokens_out,
             cache_read = cache_read + excluded.cache_read,
             cache_write = cache_write + excluded.cache_write,
             cost_usd = cost_usd + excluded.cost_usd",
        rusqlite::params![
            day,
            entry.provider,
            entry.model,
            entry.grade.map(|grade| grade.as_str()).unwrap_or(""),
            SurfaceKind::of(&entry.surface, entry.parent_request_id.as_deref()).as_str(),
            entry.domain.as_deref().unwrap_or(""),
            entry.tool.as_deref().unwrap_or(""),
            entry.tokens_in as i64,
            entry.tokens_out as i64,
            entry.cache_read as i64,
            entry.cache_write as i64,
            entry.cost_usd,
        ],
    )?;
    Ok(())
}

/// The sums over a range of days, grouped as asked, in the order of the groups. The columns come from the enum,
/// never from a caller's word.
pub fn query(conn: &Connection, filter: &UsageQuery) -> Result<Vec<UsageRow>> {
    let has = |group: UsageGroup| filter.group_by.contains(&group);
    let bucket = filter.group_by.iter().find_map(|group| match group {
        UsageGroup::Day => Some("day"),
        // the Monday of the day's week: on to the Sunday, then back six days
        UsageGroup::Week => Some("date(day, 'weekday 0', '-6 days')"),
        UsageGroup::Month => Some("substr(day, 1, 7)"),
        UsageGroup::Year => Some("substr(day, 1, 4)"),
        _ => None,
    });
    let column = |group: UsageGroup, name: &'static str| if has(group) { name } else { "NULL" };
    let columns = [
        bucket.unwrap_or("NULL"),
        column(UsageGroup::Provider, "provider"),
        column(UsageGroup::Model, "model"),
        column(UsageGroup::Grade, "grade"),
        column(UsageGroup::Kind, "kind"),
        column(UsageGroup::Domain, "domain"),
        column(UsageGroup::Tool, "tool"),
    ];

    let mut clauses = vec!["1".to_string()];
    let mut params: Vec<rusqlite::types::Value> = Vec::new();
    for (operator, bound) in [(">=", &filter.from_day), ("<=", &filter.to_day)] {
        if let Some(day) = bound {
            if !is_day(day) {
                return Err(EdenError::Refused(format!(
                    "usage:invalid: not a day: {day:?}"
                )));
            }
            params.push(day.clone().into());
            clauses.push(format!("day {operator} ?{}", params.len()));
        }
    }
    let sql = format!(
        "SELECT {}, SUM(requests), SUM(tokens_in), SUM(tokens_out), SUM(cache_read), SUM(cache_write),
                SUM(cost_usd)
         FROM usage_days WHERE {}
         GROUP BY 1, 2, 3, 4, 5, 6, 7
         ORDER BY 1, 2, 3, 4, 5, 6, 7",
        columns.join(", "),
        clauses.join(" AND ")
    );
    Ok(conn
        .prepare(&sql)?
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(UsageRow {
                bucket: row.get(0)?,
                provider: row.get(1)?,
                model: row.get(2)?,
                grade: row.get(3)?,
                kind: row.get(4)?,
                domain: row.get(5)?,
                tool: row.get(6)?,
                requests: row.get::<_, i64>(7)? as u64,
                tokens_in: row.get::<_, i64>(8)? as u64,
                tokens_out: row.get::<_, i64>(9)? as u64,
                cache_read: row.get::<_, i64>(10)? as u64,
                cache_write: row.get::<_, i64>(11)? as u64,
                cost_usd: row.get(12)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::substrate::audit::{self, tests::input, AuditEntryInput, AuditQuery, Grade};
    use crate::substrate::Workspace;

    const DAY_MS: u64 = 24 * 60 * 60 * 1000;

    fn on(day: &str, cost: f64) -> AuditEntryInput {
        AuditEntryInput {
            day: Some(day.into()),
            cost_usd: cost,
            cache_write: 7,
            ..input(1_000, None, &[])
        }
    }

    fn all(ws: &Workspace, group_by: Vec<UsageGroup>) -> Vec<UsageRow> {
        ws.read(|conn| {
            query(
                conn,
                &UsageQuery {
                    group_by,
                    ..Default::default()
                },
            )
        })
        .unwrap()
    }

    #[test]
    fn an_entry_is_added_to_its_day_and_one_that_never_left_is_not() {
        let ws = Workspace::in_memory();
        ws.write(|ctx| {
            audit::record(ctx.conn, on("2026-09-30", 0.5))?;
            audit::record(ctx.conn, on("2026-09-30", 0.25))?;
            for outcome in [Outcome::Declined, Outcome::Budget] {
                audit::record(
                    ctx.conn,
                    AuditEntryInput {
                        outcome,
                        ..on("2026-09-30", 0.0)
                    },
                )?;
            }
            // an error was still sent, and is counted with what it reported
            audit::record(
                ctx.conn,
                AuditEntryInput {
                    outcome: Outcome::Error,
                    ..on("2026-10-01", 0.125)
                },
            )?;
            Ok(())
        })
        .unwrap();

        let total = all(&ws, Vec::new());
        assert_eq!(total.len(), 1);
        assert_eq!(total[0].bucket, None);
        assert_eq!(total[0].model, None);
        assert_eq!(total[0].requests, 3);
        assert_eq!(total[0].tokens_in, 3600);
        assert_eq!(total[0].tokens_out, 240);
        assert_eq!(total[0].cache_read, 3000);
        assert_eq!(total[0].cache_write, 21);
        assert_eq!(total[0].cost_usd, 0.875);

        let days = all(&ws, vec![UsageGroup::Day]);
        assert_eq!(
            days.iter()
                .map(|row| (row.bucket.as_deref().unwrap(), row.requests, row.cost_usd))
                .collect::<Vec<_>>(),
            vec![("2026-09-30", 2, 0.75), ("2026-10-01", 1, 0.125)]
        );
        // nothing recorded is no row, not a row of nothing
        let none = ws
            .read(|conn| {
                query(
                    conn,
                    &UsageQuery {
                        from_day: Some("2027-01-01".into()),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        assert!(none.is_empty());
    }

    #[test]
    fn the_sums_group_by_span_and_by_what_ran() {
        let ws = Workspace::in_memory();
        let chat = crate::substrate::ids::new_id();
        ws.write(|ctx| {
            // a Sunday and the Monday after it: one month, two weeks
            audit::record(ctx.conn, on("2026-09-27", 1.0))?;
            audit::record(ctx.conn, on("2026-09-28", 2.0))?;
            audit::record(
                ctx.conn,
                AuditEntryInput {
                    surface: "delegated".into(),
                    parent_request_id: Some(chat.clone()),
                    tool: Some("plan".into()),
                    grade: Some(Grade::Deep),
                    model: "claude-opus-5-5".into(),
                    ..on("2026-10-01", 4.0)
                },
            )?;
            audit::record(
                ctx.conn,
                AuditEntryInput {
                    surface: "delegated".into(),
                    tool: Some("capture-haul".into()),
                    ..on("2027-01-02", 8.0)
                },
            )?;
            Ok(())
        })
        .unwrap();
        let of = |group_by: Vec<UsageGroup>| {
            all(&ws, group_by)
                .into_iter()
                .map(|row| {
                    (
                        [row.bucket, row.model, row.grade, row.kind, row.tool]
                            .into_iter()
                            .flatten()
                            .collect::<Vec<_>>()
                            .join(" "),
                        row.cost_usd,
                    )
                })
                .collect::<Vec<_>>()
        };
        let named = |rows: &[(&str, f64)]| {
            rows.iter()
                .map(|(name, cost)| (name.to_string(), *cost))
                .collect::<Vec<_>>()
        };
        assert_eq!(
            of(vec![UsageGroup::Week]),
            named(&[
                ("2026-09-21", 1.0),
                ("2026-09-28", 6.0),
                ("2026-12-28", 8.0)
            ])
        );
        assert_eq!(
            of(vec![UsageGroup::Month]),
            named(&[("2026-09", 3.0), ("2026-10", 4.0), ("2027-01", 8.0)])
        );
        assert_eq!(
            of(vec![UsageGroup::Year]),
            named(&[("2026", 7.0), ("2027", 8.0)])
        );
        assert_eq!(
            of(vec![UsageGroup::Model]),
            named(&[
                ("claude-haiku-4-5-20251001", 11.0),
                ("claude-opus-5-5", 4.0)
            ])
        );
        assert_eq!(
            of(vec![UsageGroup::Kind, UsageGroup::Tool]),
            named(&[
                ("conversation ", 3.0),
                ("page capture-haul", 8.0),
                ("tool plan", 4.0)
            ])
        );
        assert_eq!(
            of(vec![UsageGroup::Year, UsageGroup::Grade]),
            named(&[("2026 deep", 4.0), ("2026 light", 3.0), ("2027 light", 8.0)])
        );

        let window = ws
            .read(|conn| {
                query(
                    conn,
                    &UsageQuery {
                        from_day: Some("2026-09-28".into()),
                        to_day: Some("2026-10-01".into()),
                        group_by: Vec::new(),
                    },
                )
            })
            .unwrap();
        assert_eq!(window[0].cost_usd, 6.0);
        assert!(ws
            .read(|conn| {
                query(
                    conn,
                    &UsageQuery {
                        from_day: Some("last week".into()),
                        ..Default::default()
                    },
                )
            })
            .is_err());
    }

    #[test]
    fn an_entry_without_a_day_takes_the_devices_and_the_sweep_leaves_the_rollup() {
        let ws = Workspace::in_memory();
        let now = 20_000 * DAY_MS;
        let old = now - (audit::RETENTION_DAYS + 1) * DAY_MS;
        ws.write(|ctx| {
            audit::record(ctx.conn, input(old, None, &[]))?;
            Ok(())
        })
        .unwrap();
        let days = all(&ws, vec![UsageGroup::Day]);
        assert_eq!(days.len(), 1);
        assert_eq!(
            days[0].bucket.as_deref(),
            Some(local_day(old).unwrap().as_str())
        );

        assert_eq!(ws.write(|ctx| audit::sweep(ctx.conn, now)).unwrap(), 1);
        assert!(ws
            .read(|conn| audit::query(conn, &AuditQuery::default()))
            .unwrap()
            .is_empty());
        assert_eq!(all(&ws, Vec::new())[0].requests, 1);
    }
}
