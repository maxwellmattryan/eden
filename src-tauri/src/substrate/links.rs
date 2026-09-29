//! Typed entity links (docs/product/substrate/primitives.md): `{uri, relation, label}` from an owner to a target.
//! A link is the one way a row points at another domain's entity. It carries the target's label and none of its
//! data, and it outlives its target: the target is not checked, and a link to something gone reads as its label.

use std::collections::HashMap;

use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

use super::hlc;
use super::ids::Uri;
use super::rows;
use super::WriteCtx;
use crate::error::{EdenError, Result};

const RELATIONS: &[&str] = &["about", "at", "from", "for", "part-of", "see-also"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    /// The owner's URI.
    pub owner: String,
    /// The target's URI.
    pub uri: String,
    pub relation: String,
    pub label: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkInput {
    pub uri: String,
    pub relation: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkQuery {
    pub owner: Option<String>,
    pub target: Option<String>,
    pub relation: Option<String>,
}

const COLUMNS: &str =
    "owner_id, owner_type, target_uri, relation, label, created_at, updated_at, deleted_at";

fn from_row(row: &Row<'_>) -> rusqlite::Result<Link> {
    let owner_id: String = row.get(0)?;
    let owner_type: String = row.get(1)?;
    Ok(Link {
        owner: Uri::new(&owner_type, &owner_id).to_string(),
        uri: row.get(2)?,
        relation: row.get(3)?,
        label: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        deleted_at: row.get(7)?,
    })
}

fn check_relation(relation: &str) -> Result<()> {
    if RELATIONS.contains(&relation) {
        Ok(())
    } else {
        Err(EdenError::InvalidOperation(format!(
            "not a relation: {relation:?}"
        )))
    }
}

/// Links the owner to a target. Linking again renews the label, and brings back a link that was removed.
pub fn link(ctx: &mut WriteCtx, owner: &str, input: &LinkInput) -> Result<Link> {
    let owner_uri = Uri::parse(owner)?;
    Uri::parse(&input.uri)?;
    check_relation(&input.relation)?;
    rows::require_live(ctx.conn, &owner_uri)?;

    let stamp = hlc::next(ctx.conn)?;
    ctx.conn.execute(
        "INSERT INTO links (owner_id, owner_type, target_uri, relation, label, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT (owner_id, target_uri, relation) DO UPDATE
         SET label = excluded.label, updated_at = excluded.updated_at, deleted_at = NULL",
        rusqlite::params![
            owner_uri.id,
            owner_uri.type_id,
            input.uri,
            input.relation,
            input.label,
            stamp
        ],
    )?;
    Ok(ctx.conn.query_row(
        &format!(
            "SELECT {COLUMNS} FROM links WHERE owner_id = ?1 AND target_uri = ?2 AND relation = ?3"
        ),
        [&owner_uri.id, &input.uri, &input.relation],
        from_row,
    )?)
}

/// Removes a link, as a tombstone. Removing one that is not there changes nothing.
pub fn unlink(ctx: &mut WriteCtx, owner: &str, target: &str, relation: &str) -> Result<()> {
    let owner_uri = Uri::parse(owner)?;
    let live: i64 = ctx.conn.query_row(
        "SELECT COUNT(*) FROM links
         WHERE owner_id = ?1 AND target_uri = ?2 AND relation = ?3 AND deleted_at IS NULL",
        [&owner_uri.id, target, relation],
        |row| row.get(0),
    )?;
    if live == 0 {
        return Ok(());
    }
    let stamp = hlc::next(ctx.conn)?;
    ctx.conn.execute(
        "UPDATE links SET updated_at = ?1, deleted_at = ?1
         WHERE owner_id = ?2 AND target_uri = ?3 AND relation = ?4",
        [&stamp, &owner_uri.id, target, relation],
    )?;
    Ok(())
}

/// The live links that match, by owner, target and relation; any of the three may be left out.
pub fn query(conn: &Connection, filter: &LinkQuery) -> Result<Vec<Link>> {
    let mut clauses = vec!["deleted_at IS NULL".to_string()];
    let mut params: Vec<String> = Vec::new();
    if let Some(owner) = &filter.owner {
        params.push(Uri::parse(owner)?.id);
        clauses.push(format!("owner_id = ?{}", params.len()));
    }
    if let Some(target) = &filter.target {
        params.push(target.clone());
        clauses.push(format!("target_uri = ?{}", params.len()));
    }
    if let Some(relation) = &filter.relation {
        params.push(relation.clone());
        clauses.push(format!("relation = ?{}", params.len()));
    }
    let sql = format!(
        "SELECT {COLUMNS} FROM links WHERE {} ORDER BY owner_id, target_uri, relation",
        clauses.join(" AND ")
    );
    let links = conn
        .prepare(&sql)?
        .query_map(rusqlite::params_from_iter(params), from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(links)
}

/// The links of every row of one type, by the owner's id. A query attaches the live ones to the rows it returns; a
/// bundle carries the removed ones too, which a merge needs.
pub(crate) fn by_owner(
    conn: &Connection,
    owner_type: &str,
    include_deleted: bool,
) -> Result<HashMap<String, Vec<Link>>> {
    let mut map: HashMap<String, Vec<Link>> = HashMap::new();
    let mut statement = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM links WHERE owner_type = ?1 AND (?2 OR deleted_at IS NULL)
         ORDER BY target_uri, relation"
    ))?;
    let rows = statement.query_map(rusqlite::params![owner_type, include_deleted], |row| {
        Ok((row.get::<_, String>(0)?, from_row(row)?))
    })?;
    for row in rows {
        let (owner_id, link) = row?;
        map.entry(owner_id).or_default().push(link);
    }
    Ok(map)
}

/// The stamp of a link and whether it is removed, if there is one.
pub(crate) fn state(conn: &Connection, link: &Link) -> Result<Option<(String, bool)>> {
    use rusqlite::OptionalExtension;
    let owner = Uri::parse(&link.owner)?;
    Ok(conn
        .query_row(
            "SELECT updated_at, deleted_at IS NOT NULL FROM links
             WHERE owner_id = ?1 AND target_uri = ?2 AND relation = ?3",
            [&owner.id, &link.uri, &link.relation],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?)
}

/// Writes a link as it is, stamps and all: what an import does with a link of its bundle.
pub(crate) fn put(conn: &Connection, link: &Link) -> Result<()> {
    let owner = Uri::parse(&link.owner)?;
    Uri::parse(&link.uri)?;
    check_relation(&link.relation)?;
    conn.execute(
        "INSERT OR REPLACE INTO links
         (owner_id, owner_type, target_uri, relation, label, created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            owner.id,
            owner.type_id,
            link.uri,
            link.relation,
            link.label,
            link.created_at,
            link.updated_at,
            link.deleted_at
        ],
    )?;
    Ok(())
}
