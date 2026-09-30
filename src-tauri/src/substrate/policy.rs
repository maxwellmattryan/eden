//! The Gardener's policy (docs/engineering/gardener.md; D-76): what the owner decided about how it runs, one JSON
//! value a key (`gardener` holds the budgets and the model map's overrides). A row is stamped and tombstoned like
//! any other, so it exports, syncs and merges; there is one row a key, renewed in place, and the crate never reads
//! a value beyond its being JSON.

use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::changes::ChangeOp;
use super::entities::json_column;
use super::hlc;
use super::ids;
use super::WriteCtx;
use crate::error::{EdenError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PolicyRow {
    pub key: String,
    pub value: Value,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub deleted_at: Option<String>,
}

const COLUMNS: &str = "key, value, created_at, updated_at, deleted_at";

fn refused(detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("policy:invalid: {detail}"))
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<PolicyRow> {
    Ok(PolicyRow {
        key: row.get(0)?,
        value: json_column(row, 1)?.unwrap_or(Value::Null),
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
        deleted_at: row.get(4)?,
    })
}

fn check_key(key: &str) -> Result<()> {
    if ids::is_resource_id(key) {
        Ok(())
    } else {
        Err(refused(format!("not a policy key: {key:?}")))
    }
}

/// The row a key names, deleted or not.
fn find(conn: &Connection, key: &str) -> Result<Option<PolicyRow>> {
    Ok(conn
        .query_row(
            &format!("SELECT {COLUMNS} FROM policy WHERE key = ?1"),
            [key],
            from_row,
        )
        .optional()?)
}

/// The live row a key names.
pub fn get(conn: &Connection, key: &str) -> Result<Option<PolicyRow>> {
    check_key(key)?;
    Ok(find(conn, key)?.filter(|row| row.deleted_at.is_none()))
}

/// Sets a key's value: a new row, or the one there renewed in place under a new stamp, its tombstone lifted if it
/// had one.
pub fn set(ctx: &mut WriteCtx, key: &str, value: Value) -> Result<PolicyRow> {
    check_key(key)?;
    if value.is_null() {
        return Err(refused("a policy holds a value"));
    }
    let conn = ctx.conn;
    let before = find(conn, key)?;
    let stamp = hlc::next(conn)?;
    conn.execute(
        "INSERT INTO policy (key, value, created_at, updated_at, deleted_at) VALUES (?1, ?2, ?3, ?3, NULL)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, deleted_at = NULL",
        rusqlite::params![key, value.to_string(), stamp],
    )?;
    let row = find(conn, key)?.ok_or_else(|| EdenError::NotFound(format!("policy {key}")))?;
    ctx.record(
        &format!("eden://policy/{key}"),
        if before.is_none() {
            ChangeOp::Created
        } else {
            ChangeOp::Updated
        },
    );
    Ok(row)
}

// What the bundle needs.

/// Every row, by key, tombstones included: a merge needs them.
pub(crate) fn exportable(conn: &Connection) -> Result<Vec<PolicyRow>> {
    Ok(conn
        .prepare(&format!("SELECT {COLUMNS} FROM policy ORDER BY key"))?
        .query_map([], from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

/// A tombstone as it leaves: its key and its stamps, and nothing of what it held.
pub(crate) fn stripped(row: &PolicyRow) -> PolicyRow {
    PolicyRow {
        value: Value::Object(Map::new()),
        ..row.clone()
    }
}

pub(crate) fn validate_imported(row: &PolicyRow) -> std::result::Result<(), String> {
    if !ids::is_resource_id(&row.key) {
        return Err(format!("not a policy key: {:?}", row.key));
    }
    if row.value.is_null() {
        return Err(format!("{} holds no value", row.key));
    }
    let stamps_ok = hlc::Hlc::parse(&row.created_at).is_ok()
        && hlc::Hlc::parse(&row.updated_at).is_ok()
        && row
            .deleted_at
            .as_ref()
            .is_none_or(|deleted| *deleted == row.updated_at);
    if !stamps_ok {
        return Err(format!("stamps that cannot be read on {}", row.key));
    }
    Ok(())
}

/// Writes a row as it is, stamps and all.
pub(crate) fn put(conn: &Connection, row: &PolicyRow) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO policy (key, value, created_at, updated_at, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            row.key,
            row.value.to_string(),
            row.created_at,
            row.updated_at,
            row.deleted_at
        ],
    )?;
    Ok(())
}

/// What a replace clears: every row.
pub(crate) fn clear(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM policy", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::substrate::Workspace;

    #[test]
    fn a_policy_is_set_read_and_renewed_in_place() {
        let ws = Workspace::in_memory();
        assert_eq!(ws.read(|conn| get(conn, "gardener")).unwrap(), None);
        let first = ws
            .write(|ctx| set(ctx, "gardener", json!({ "monthlyUsd": 10 })))
            .unwrap();
        assert_eq!(first.key, "gardener");
        assert_eq!(first.created_at, first.updated_at);
        assert_eq!(
            ws.read(|conn| get(conn, "gardener")).unwrap(),
            Some(first.clone())
        );

        let renewed = ws
            .write(|ctx| set(ctx, "gardener", json!({ "monthlyUsd": 20 })))
            .unwrap();
        assert_eq!(renewed.created_at, first.created_at);
        assert!(renewed.updated_at > first.updated_at);
        assert_eq!(renewed.value["monthlyUsd"], 20);
        assert_eq!(ws.read(exportable).unwrap().len(), 1);

        // A tombstone that arrived from elsewhere is lifted by the next set.
        ws.write(|ctx| {
            put(
                ctx.conn,
                &PolicyRow {
                    updated_at: renewed.updated_at.clone(),
                    deleted_at: Some(renewed.updated_at.clone()),
                    ..stripped(&renewed)
                },
            )
        })
        .unwrap();
        assert_eq!(ws.read(|conn| get(conn, "gardener")).unwrap(), None);
        let back = ws
            .write(|ctx| set(ctx, "gardener", json!({ "monthlyUsd": 5 })))
            .unwrap();
        assert_eq!(back.deleted_at, None);
        assert_eq!(
            ws.read(|conn| get(conn, "gardener")).unwrap(),
            Some(back.clone())
        );

        for (key, value) in [
            ("Gardener", json!(1)),
            ("a.b", json!(1)),
            ("gardener", Value::Null),
        ] {
            let message = ws
                .write(|ctx| set(ctx, key, value))
                .expect_err(key)
                .to_string();
            assert!(message.starts_with("policy:invalid: "), "{message}");
        }
        assert_eq!(validate_imported(&stripped(&back)), Ok(()));
        assert!(validate_imported(&PolicyRow {
            key: "Gardener".into(),
            ..back.clone()
        })
        .is_err());
    }
}
