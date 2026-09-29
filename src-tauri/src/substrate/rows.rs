//! What every row shares, whatever its table: where a type lives, the tombstone, and the way back from it.

use rusqlite::Connection;
use serde::Serialize;
use serde_json::Value;

use super::changes::ChangeOp;
use super::entities;
use super::hlc;
use super::ids::Uri;
use super::primitives;
use super::WriteCtx;
use crate::error::{EdenError, Result};

/// A row's URI with the stamp a write gave it.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Stamped {
    pub uri: String,
    pub updated_at: String,
}

/// The table a type's rows live in. A primitive has its own; every other type shares `entities`, keyed by type.
pub(crate) struct Table {
    pub name: &'static str,
    pub typed: bool,
}

pub(crate) fn table_for(type_id: &str) -> Table {
    let primitive = |name| Table { name, typed: false };
    match type_id {
        "task" => primitive("tasks"),
        "event" => primitive("events"),
        "place" => primitive("places"),
        "attachment" => primitive("attachments"),
        _ => Table {
            name: "entities",
            typed: true,
        },
    }
}

/// `Some(deleted)` when the row exists.
fn find(conn: &Connection, uri: &Uri) -> Result<Option<bool>> {
    let table = table_for(&uri.type_id);
    let type_clause = if table.typed { " AND type = ?2" } else { "" };
    let sql = format!(
        "SELECT deleted_at IS NOT NULL FROM {} WHERE id = ?1{type_clause}",
        table.name
    );
    let mut statement = conn.prepare(&sql)?;
    let mut rows = if table.typed {
        statement.query([&uri.id, &uri.type_id])?
    } else {
        statement.query([&uri.id])?
    };
    Ok(match rows.next()? {
        Some(row) => Some(row.get(0)?),
        None => None,
    })
}

/// Fails with `not-found` unless the row exists and is live.
pub(crate) fn require_live(conn: &Connection, uri: &Uri) -> Result<()> {
    match find(conn, uri)? {
        Some(false) => Ok(()),
        _ => Err(EdenError::NotFound(uri.to_string())),
    }
}

/// Writes a tombstone: the row stays, stamped as deleted. A row that is already deleted is left as it is.
pub fn delete(ctx: &mut WriteCtx, uri: &str) -> Result<Option<Stamped>> {
    set_deleted(ctx, uri, true)
}

/// Lifts a tombstone, with a new stamp. A row that is live is left as it is.
pub fn restore(ctx: &mut WriteCtx, uri: &str) -> Result<Option<Stamped>> {
    set_deleted(ctx, uri, false)
}

fn set_deleted(ctx: &mut WriteCtx, uri: &str, deleted: bool) -> Result<Option<Stamped>> {
    let parsed = Uri::parse(uri)?;
    match find(ctx.conn, &parsed)? {
        None => return Err(EdenError::NotFound(uri.to_string())),
        Some(is_deleted) if is_deleted == deleted => return Ok(None),
        Some(_) => {}
    }

    let stamp = hlc::next(ctx.conn)?;
    let table = table_for(&parsed.type_id);
    ctx.conn.execute(
        &format!(
            "UPDATE {} SET updated_at = ?1, deleted_at = ?2 WHERE id = ?3",
            table.name
        ),
        rusqlite::params![stamp, deleted.then_some(&stamp), parsed.id],
    )?;
    ctx.record(
        uri,
        if deleted {
            ChangeOp::Deleted
        } else {
            ChangeOp::Restored
        },
    );
    Ok(Some(Stamped {
        uri: uri.to_string(),
        updated_at: stamp,
    }))
}

/// The row a URI names, deleted or not, as the JSON object its type crosses the IPC boundary as.
pub fn get(conn: &Connection, uri: &str) -> Result<Option<Value>> {
    let parsed = Uri::parse(uri)?;
    if let Some(primitive) = primitives::of_type(&parsed.type_id) {
        return primitives::get(conn, primitive, &parsed.id);
    }
    match entities::get(conn, &parsed.id)? {
        Some(entity) if entity.type_id == parsed.type_id => Ok(Some(serde_json::to_value(entity)?)),
        _ => Ok(None),
    }
}

/// Sets what a row copied from the mirror it was derived from, so it renders where the mirror is absent (D-37).
pub fn snapshot(ctx: &mut WriteCtx, uri: &str, snapshot: &Value) -> Result<Value> {
    let parsed = Uri::parse(uri)?;
    require_live(ctx.conn, &parsed)?;
    let stamp = hlc::next(ctx.conn)?;
    let text = (!snapshot.is_null()).then(|| snapshot.to_string());
    ctx.conn.execute(
        &format!(
            "UPDATE {} SET snapshot = ?1, updated_at = ?2 WHERE id = ?3",
            table_for(&parsed.type_id).name
        ),
        rusqlite::params![text, stamp, parsed.id],
    )?;
    ctx.record(uri, ChangeOp::Updated);
    get(ctx.conn, uri)?.ok_or_else(|| EdenError::NotFound(uri.to_string()))
}
