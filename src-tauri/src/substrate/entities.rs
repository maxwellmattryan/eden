//! Domain entities (D-67): one table, keyed by type, each row a JSON payload the owning domain shapes. The substrate
//! knows a row's id, type, stamps and mirror columns, and nothing of what is inside the payload.

use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::changes::ChangeOp;
use super::hlc;
use super::ids::{self, Uri};
use super::links::{self, Link};
use super::registry;
use super::WriteCtx;
use crate::error::{EdenError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub uri: String,
    pub id: String,
    #[serde(rename = "type")]
    pub type_id: String,
    pub payload: Value,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub mirror: bool,
    pub source: Option<String>,
    pub external_id: Option<String>,
    pub snapshot: Option<Value>,
    pub links: Vec<Link>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityInput {
    /// A ULID the caller made, so it can show the row before the write returns; one is made when it is left out.
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub type_id: String,
    pub payload: Value,
    #[serde(default)]
    pub mirror: bool,
    pub source: Option<String>,
    pub external_id: Option<String>,
    pub snapshot: Option<Value>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityQuery {
    #[serde(rename = "type")]
    pub type_id: String,
    pub ids: Option<Vec<String>>,
    /// Only rows with a live link to this URI.
    pub linked_to: Option<String>,
    #[serde(default)]
    pub include_deleted: bool,
}

const COLUMNS: &str =
    "id, type, payload, created_at, updated_at, deleted_at, mirror, source, external_id, snapshot";

/// A JSON column. The schema checks `json_valid`, so a failure here means the row was written around it.
pub(crate) fn json_column(row: &Row<'_>, index: usize) -> rusqlite::Result<Option<Value>> {
    let text: Option<String> = row.get(index)?;
    text.map(|text| {
        serde_json::from_str(&text).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                index,
                rusqlite::types::Type::Text,
                Box::new(e),
            )
        })
    })
    .transpose()
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<Entity> {
    let id: String = row.get(0)?;
    let type_id: String = row.get(1)?;
    Ok(Entity {
        uri: Uri::new(&type_id, &id).to_string(),
        id,
        type_id,
        payload: json_column(row, 2)?.unwrap_or(Value::Null),
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        deleted_at: row.get(5)?,
        mirror: row.get(6)?,
        source: row.get(7)?,
        external_id: row.get(8)?,
        snapshot: json_column(row, 9)?,
        links: Vec::new(),
    })
}

fn check_payload(payload: &Value) -> Result<()> {
    if payload.is_object() {
        Ok(())
    } else {
        Err(EdenError::InvalidOperation(
            "an entity's payload is a JSON object".to_string(),
        ))
    }
}

pub fn create(ctx: &mut WriteCtx, input: EntityInput) -> Result<Entity> {
    if !registry::is_entity_type(&input.type_id) {
        return Err(EdenError::InvalidOperation(format!(
            "not a registered entity type: {:?}",
            input.type_id
        )));
    }
    check_payload(&input.payload)?;
    let id = ids::id_or_new(input.id)?;
    let stamp = hlc::next(ctx.conn)?;

    ctx.conn.execute(
        "INSERT INTO entities (id, type, payload, created_at, updated_at, mirror, source, external_id, snapshot)
         VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            id,
            input.type_id,
            input.payload.to_string(),
            stamp,
            input.mirror,
            input.source,
            input.external_id,
            input.snapshot.map(|snapshot| snapshot.to_string()),
        ],
    )?;
    let uri = Uri::new(&input.type_id, &id).to_string();
    ctx.record(&uri, ChangeOp::Created);
    get(ctx.conn, &id)?.ok_or(EdenError::NotFound(uri))
}

/// Replaces the payload whole. The store holds the whole row, and an undo is the previous payload written back.
pub fn update(ctx: &mut WriteCtx, id: &str, payload: Value) -> Result<Entity> {
    check_payload(&payload)?;
    let stamp = hlc::next(ctx.conn)?;
    let changed = ctx.conn.execute(
        "UPDATE entities SET payload = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
        rusqlite::params![payload.to_string(), stamp, id],
    )?;
    let entity = match get(ctx.conn, id)? {
        Some(entity) if changed == 1 => entity,
        _ => return Err(EdenError::NotFound(format!("entity {id}"))),
    };
    ctx.record(&entity.uri, ChangeOp::Updated);
    Ok(entity)
}

/// One row by id, deleted or not, with its live links.
pub fn get(conn: &Connection, id: &str) -> Result<Option<Entity>> {
    let entity = conn
        .query_row(
            &format!("SELECT {COLUMNS} FROM entities WHERE id = ?1"),
            [id],
            from_row,
        )
        .optional()?;
    Ok(match entity {
        Some(mut entity) => {
            entity.links = links::query(
                conn,
                &links::LinkQuery {
                    owner: Some(entity.uri.clone()),
                    ..Default::default()
                },
            )?;
            Some(entity)
        }
        None => None,
    })
}

/// The rows of one type, in the order they were created.
pub fn query(conn: &Connection, filter: &EntityQuery) -> Result<Vec<Entity>> {
    let mut clauses = vec!["type = ?1".to_string()];
    let mut params = vec![filter.type_id.clone()];
    if !filter.include_deleted {
        clauses.push("deleted_at IS NULL".to_string());
    }
    if let Some(ids) = &filter.ids {
        let marks: Vec<String> = ids
            .iter()
            .map(|id| {
                params.push(id.clone());
                format!("?{}", params.len())
            })
            .collect();
        // An empty list matches nothing, which `IN ()` cannot say.
        clauses.push(if marks.is_empty() {
            "0".to_string()
        } else {
            format!("id IN ({})", marks.join(", "))
        });
    }
    if let Some(target) = &filter.linked_to {
        params.push(target.clone());
        clauses.push(format!(
            "EXISTS (SELECT 1 FROM links WHERE links.owner_id = entities.id
                     AND links.target_uri = ?{} AND links.deleted_at IS NULL)",
            params.len()
        ));
    }

    let sql = format!(
        "SELECT {COLUMNS} FROM entities WHERE {} ORDER BY id",
        clauses.join(" AND ")
    );
    let mut entities = conn
        .prepare(&sql)?
        .query_map(rusqlite::params_from_iter(params), from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut links = links::by_owner(conn, &filter.type_id, false)?;
    for entity in &mut entities {
        entity.links = links.remove(&entity.id).unwrap_or_default();
    }
    Ok(entities)
}

/// Writes a row as it is, stamps and all: what an import does with a row of its bundle.
pub(crate) fn put(conn: &Connection, entity: &Entity) -> Result<()> {
    check_payload(&entity.payload)?;
    conn.execute(
        "INSERT OR REPLACE INTO entities
         (id, type, payload, created_at, updated_at, deleted_at, mirror, source, external_id, snapshot)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            entity.id,
            entity.type_id,
            entity.payload.to_string(),
            entity.created_at,
            entity.updated_at,
            entity.deleted_at,
            entity.mirror,
            entity.source,
            entity.external_id,
            entity.snapshot
                .as_ref()
                .filter(|snapshot| !snapshot.is_null())
                .map(|snapshot| snapshot.to_string()),
        ],
    )?;
    Ok(())
}
