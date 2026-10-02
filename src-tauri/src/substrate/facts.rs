//! The profile (docs/product/substrate/profile.md; D-72): the typed statements Eden keeps about the owner. A fact is a
//! row with stamps and a tombstone like any other, so it exports, syncs and merges. Its type is a registry fact id
//! (D-35), its value JSON the frontend shapes, and its provenance says who wrote it: the owner, a domain, the
//! substrate, an integration, or the Gardener once the owner accepted what it noticed. Readers get the effective set,
//! the live rows inside their validity window with the owner's own word first. Every edit keeps the replaced value in
//! `fact_history` for thirty days, which is this device's and never leaves it.

use chrono::NaiveDate;
use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::changes::ChangeOp;
use super::egress::today;
use super::entities::json_column;
use super::hlc;
use super::ids;
use super::registry::{self, Category, Tier};
use super::text::{text_column, text_enum};
use super::WriteCtx;
use crate::error::{EdenError, Result};

const TYPE_ID: &str = "fact";
/// How long a replaced value stays in the history.
pub const HISTORY_DAYS: u64 = 30;
const DAY: &str = "%Y-%m-%d";
/// The fields a patch may name; `type` is not one, a fact of another type is another fact.
const PATCHABLE: &[&str] = &[
    "value",
    "confidence",
    "validFrom",
    "validUntil",
    "source",
    "note",
    "provenance",
];

text_enum! {
    /// Who wrote the fact. Confidence goes with what was derived or inferred; a source with what an integration
    /// wrote; the substrate alone writes `system-derived`.
    Provenance {
        UserAsserted = "user-asserted",
        DomainDerived = "domain-derived",
        SystemDerived = "system-derived",
        Integration = "integration",
        AiInferred = "ai-inferred",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Fact {
    pub uri: String,
    pub id: String,
    #[serde(rename = "type")]
    pub type_id: String,
    pub value: Value,
    pub provenance: Provenance,
    #[serde(default)]
    pub confidence: Option<f64>,
    /// The first day the fact holds, `YYYY-MM-DD`.
    #[serde(default)]
    pub valid_from: Option<String>,
    /// The last day the fact holds, inclusive.
    #[serde(default)]
    pub valid_until: Option<String>,
    /// The entity or the integration that produced it.
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactInput {
    /// A ULID the caller made; one is made when it is left out.
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub type_id: String,
    pub value: Value,
    pub provenance: Provenance,
    pub confidence: Option<f64>,
    pub valid_from: Option<String>,
    pub valid_until: Option<String>,
    pub source: Option<String>,
    pub note: Option<String>,
}

/// A patch is a JSON object: a value sets a field, `null` clears it, an absent field is left as it is.
pub type FactPatch = Map<String, Value>;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactQuery {
    pub types: Option<Vec<String>>,
    /// A domain id or `substrate`: the fact types the registry says it owns.
    pub owner: Option<String>,
    #[serde(default)]
    pub include_expired: bool,
    #[serde(default)]
    pub include_deleted: bool,
    /// The day the validity window is judged on, `YYYY-MM-DD`; today when it is left out.
    pub at: Option<String>,
}

/// A value a fact held before an edit replaced it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FactHistoryEntry {
    pub fact_id: String,
    #[serde(rename = "type")]
    pub type_id: String,
    pub value: Value,
    pub note: Option<String>,
    pub valid_from: Option<String>,
    pub valid_until: Option<String>,
    /// The stamp of the edit that replaced it.
    pub replaced_at: String,
}

const COLUMNS: &str =
    "id, type, value, provenance, confidence, valid_from, valid_until, source, note, \
                       created_at, updated_at, deleted_at";

fn refused(code: &str, detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("fact:{code}: {detail}"))
}

fn parse_day(day: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(day, DAY)
        .map_err(|_| refused("invalid", format!("not a day: {day:?}")))
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<Fact> {
    let id: String = row.get(0)?;
    Ok(Fact {
        uri: ids::Uri::new(TYPE_ID, &id).to_string(),
        id,
        type_id: row.get(1)?,
        value: json_column(row, 2)?.unwrap_or(Value::Null),
        provenance: text_column(row, 3, Provenance::parse)?,
        confidence: row.get(4)?,
        valid_from: row.get(5)?,
        valid_until: row.get(6)?,
        source: row.get(7)?,
        note: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        deleted_at: row.get(11)?,
    })
}

/// The fields of a fact that the rules are about, whether they come from an input or from a patched row.
struct Fields<'a> {
    type_id: &'a str,
    value: &'a Value,
    provenance: Provenance,
    confidence: Option<f64>,
    valid_from: Option<&'a str>,
    valid_until: Option<&'a str>,
    source: Option<&'a str>,
}

impl<'a> From<&'a FactInput> for Fields<'a> {
    fn from(input: &'a FactInput) -> Self {
        Self {
            type_id: &input.type_id,
            value: &input.value,
            provenance: input.provenance,
            confidence: input.confidence,
            valid_from: input.valid_from.as_deref(),
            valid_until: input.valid_until.as_deref(),
            source: input.source.as_deref(),
        }
    }
}

impl<'a> From<&'a Fact> for Fields<'a> {
    fn from(fact: &'a Fact) -> Self {
        Self {
            type_id: &fact.type_id,
            value: &fact.value,
            provenance: fact.provenance,
            confidence: fact.confidence,
            valid_from: fact.valid_from.as_deref(),
            valid_until: fact.valid_until.as_deref(),
            source: fact.source.as_deref(),
        }
    }
}

/// The rules of who wrote what: confidence for what was derived or inferred and for nothing else, a source for what
/// an integration wrote, and `system-derived` for the substrate's own types only. The same rules for a row that
/// arrives by import, whose type the registry may not know.
fn check_provenance(fields: &Fields<'_>, owner: Option<&str>) -> std::result::Result<(), String> {
    let has_confidence = fields.confidence.is_some();
    match fields.provenance {
        Provenance::DomainDerived | Provenance::AiInferred if !has_confidence => {
            return Err(format!(
                "a {} fact carries its confidence",
                fields.provenance.as_str()
            ));
        }
        Provenance::UserAsserted | Provenance::Integration if has_confidence => {
            return Err(format!(
                "a {} fact carries no confidence",
                fields.provenance.as_str()
            ));
        }
        _ => {}
    }
    if fields
        .confidence
        .is_some_and(|confidence| !(0.0..=1.0).contains(&confidence))
    {
        return Err("a confidence is between 0 and 1".to_string());
    }
    if fields.provenance == Provenance::Integration && fields.source.is_none() {
        return Err("an integration names itself as the source".to_string());
    }
    if fields.provenance == Provenance::SystemDerived
        && owner.is_some_and(|owner| owner != "substrate")
    {
        return Err(format!(
            "only the substrate derives a fact, and {} is not its",
            fields.type_id
        ));
    }
    if fields
        .source
        .is_some_and(|source| source.is_empty() || source.len() > 200)
    {
        return Err("not a source".to_string());
    }
    Ok(())
}

/// What the store refuses to hold: a type that is not a live fact (D-130), anything T3, a value that is nothing, and
/// a provenance that does not fit its fields.
fn validate(fields: &Fields<'_>) -> Result<()> {
    let row = registry::resource(fields.type_id).filter(|row| row.category == Category::Fact);
    let Some(row) = row else {
        return Err(refused(
            "invalid",
            format!("not a fact type: {:?}", fields.type_id),
        ));
    };
    if row.tier == Tier::T3 {
        return Err(refused(
            "never",
            format!("{} is T3 and is never a fact", fields.type_id),
        ));
    }
    if !registry::is_fact(fields.type_id) {
        return Err(refused(
            "invalid",
            format!("not a live fact type: {}", fields.type_id),
        ));
    }
    if fields.value.is_null() {
        return Err(refused("invalid", "a fact holds a value"));
    }
    check_provenance(fields, Some(row.owner)).map_err(|detail| refused("invalid", detail))?;
    check_window(fields.valid_from, fields.valid_until)
}

fn check_window(from: Option<&str>, until: Option<&str>) -> Result<()> {
    let from = from.map(parse_day).transpose()?;
    let until = until.map(parse_day).transpose()?;
    if let (Some(from), Some(until)) = (from, until) {
        if from > until {
            return Err(refused("invalid", "a window ends after it starts"));
        }
    }
    Ok(())
}

/// One fact by id, deleted or not.
pub fn get(conn: &Connection, id: &str) -> Result<Option<Fact>> {
    Ok(conn
        .query_row(
            &format!("SELECT {COLUMNS} FROM facts WHERE id = ?1"),
            [id],
            from_row,
        )
        .optional()?)
}

fn require(conn: &Connection, id: &str) -> Result<Fact> {
    get(conn, id)?.ok_or_else(|| EdenError::NotFound(format!("fact {id}")))
}

/// The live row the substrate derived for a type, of which there is at most one.
fn live_system(conn: &Connection, type_id: &str) -> Result<Option<Fact>> {
    Ok(conn
        .query_row(
            &format!(
                "SELECT {COLUMNS} FROM facts
                 WHERE type = ?1 AND provenance = 'system-derived' AND deleted_at IS NULL"
            ),
            [type_id],
            from_row,
        )
        .optional()?)
}

/// Keeps what a fact held before an edit, under the edit's stamp.
fn record_history(conn: &Connection, before: &Fact, replaced_at: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO fact_history (fact_id, type, value, note, valid_from, valid_until, replaced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            before.id,
            before.type_id,
            before.value.to_string(),
            before.note,
            before.valid_from,
            before.valid_until,
            replaced_at,
        ],
    )?;
    Ok(())
}

/// Whether an edit changed what the history keeps: the value, the note or the window.
fn kept_changed(before: &Fact, after: &Fact) -> bool {
    before.value != after.value
        || before.note != after.note
        || before.valid_from != after.valid_from
        || before.valid_until != after.valid_until
}

fn write_fields(conn: &Connection, fact: &Fact, stamp: &str) -> Result<()> {
    conn.execute(
        "UPDATE facts SET value = ?1, provenance = ?2, confidence = ?3, valid_from = ?4, valid_until = ?5,
                          source = ?6, note = ?7, updated_at = ?8
         WHERE id = ?9",
        rusqlite::params![
            fact.value.to_string(),
            fact.provenance.as_str(),
            fact.confidence,
            fact.valid_from,
            fact.valid_until,
            fact.source,
            fact.note,
            stamp,
            fact.id,
        ],
    )?;
    Ok(())
}

/// Asserts a fact. A `system-derived` fact of a type the substrate already derived is renewed in place, so there is
/// one; every other fact is a row of its own, one per value.
pub fn assert(ctx: &mut WriteCtx, input: FactInput) -> Result<Fact> {
    validate(&Fields::from(&input))?;
    let conn = ctx.conn;

    if input.provenance == Provenance::SystemDerived {
        if let Some(before) = live_system(conn, &input.type_id)? {
            let after = Fact {
                value: input.value,
                confidence: input.confidence,
                valid_from: input.valid_from,
                valid_until: input.valid_until,
                source: input.source,
                note: input.note,
                ..before.clone()
            };
            let stamp = hlc::next(conn)?;
            if kept_changed(&before, &after) {
                record_history(conn, &before, &stamp)?;
            }
            write_fields(conn, &after, &stamp)?;
            let fact = require(conn, &before.id)?;
            ctx.record(&fact.uri, ChangeOp::Updated);
            return Ok(fact);
        }
    }

    let id = ids::id_or_new(input.id)?;
    if get(conn, &id)?.is_some() {
        return Err(refused("invalid", format!("the id is taken: {id}")));
    }
    let stamp = hlc::next(conn)?;
    conn.execute(
        "INSERT INTO facts (id, type, value, provenance, confidence, valid_from, valid_until, source, note,
                            created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
        rusqlite::params![
            id,
            input.type_id,
            input.value.to_string(),
            input.provenance.as_str(),
            input.confidence,
            input.valid_from,
            input.valid_until,
            input.source,
            input.note,
            stamp,
        ],
    )?;
    let fact = require(conn, &id)?;
    ctx.record(&fact.uri, ChangeOp::Created);
    Ok(fact)
}

fn patched_text(patch: &FactPatch, key: &str, current: &Option<String>) -> Result<Option<String>> {
    match patch.get(key) {
        None => Ok(current.clone()),
        Some(Value::Null) => Ok(None),
        Some(Value::String(text)) => Ok(Some(text.clone())),
        Some(_) => Err(refused("invalid", format!("{key} is text"))),
    }
}

/// Edits a fact in place. The fields a patch may name are `value`, `confidence`, `validFrom`, `validUntil`, `source`,
/// `note` and `provenance`, the last only to make the fact the owner's own (`user-asserted`), which drops its
/// confidence: the owner's word beats what was inferred. What the fact held goes to the history.
pub fn update(ctx: &mut WriteCtx, id: &str, patch: &FactPatch) -> Result<Fact> {
    let conn = ctx.conn;
    let before = require(conn, id)?;
    if before.deleted_at.is_some() {
        return Err(EdenError::NotFound(format!("fact {id}")));
    }
    if let Some(key) = patch.keys().find(|key| !PATCHABLE.contains(&key.as_str())) {
        return Err(refused("invalid", format!("not a field of a fact: {key}")));
    }

    let mut after = before.clone();
    match patch.get("provenance") {
        None => {}
        Some(Value::String(text)) if text == Provenance::UserAsserted.as_str() => {
            after.provenance = Provenance::UserAsserted;
            after.confidence = None;
        }
        Some(_) => {
            return Err(refused(
                "invalid",
                "a fact becomes the owner's own or keeps its provenance",
            ))
        }
    }
    if let Some(value) = patch.get("value") {
        after.value = value.clone();
    }
    match patch.get("confidence") {
        None => {}
        Some(Value::Null) => after.confidence = None,
        Some(Value::Number(number)) => after.confidence = number.as_f64(),
        Some(_) => return Err(refused("invalid", "confidence is a number")),
    }
    after.valid_from = patched_text(patch, "validFrom", &before.valid_from)?;
    after.valid_until = patched_text(patch, "validUntil", &before.valid_until)?;
    after.source = patched_text(patch, "source", &before.source)?;
    after.note = patched_text(patch, "note", &before.note)?;
    validate(&Fields::from(&after))?;

    let stamp = hlc::next(conn)?;
    if kept_changed(&before, &after) {
        record_history(conn, &before, &stamp)?;
    }
    write_fields(conn, &after, &stamp)?;
    let fact = require(conn, id)?;
    ctx.record(&fact.uri, ChangeOp::Updated);
    Ok(fact)
}

/// Deletes a fact: readers stop seeing it at once, and the row stays as its tombstone so an undo can bring it back.
/// Deleting a deleted fact changes nothing.
pub fn delete(ctx: &mut WriteCtx, id: &str) -> Result<Fact> {
    let conn = ctx.conn;
    let fact = require(conn, id)?;
    if fact.deleted_at.is_some() {
        return Ok(fact);
    }
    let stamp = hlc::next(conn)?;
    conn.execute(
        "UPDATE facts SET updated_at = ?1, deleted_at = ?1 WHERE id = ?2",
        [&stamp, id],
    )?;
    ctx.record(&fact.uri, ChangeOp::Deleted);
    Ok(Fact {
        updated_at: stamp.clone(),
        deleted_at: Some(stamp),
        ..fact
    })
}

/// Lifts a tombstone: what an undo of a delete calls. Restoring a live fact changes nothing.
pub fn restore(ctx: &mut WriteCtx, id: &str) -> Result<Fact> {
    let conn = ctx.conn;
    let fact = require(conn, id)?;
    if fact.deleted_at.is_none() {
        return Ok(fact);
    }
    if fact.provenance == Provenance::SystemDerived && live_system(conn, &fact.type_id)?.is_some() {
        return Err(refused(
            "invalid",
            format!("the substrate has derived {} again since", fact.type_id),
        ));
    }
    let stamp = hlc::next(conn)?;
    conn.execute(
        "UPDATE facts SET updated_at = ?1, deleted_at = NULL WHERE id = ?2",
        [&stamp, id],
    )?;
    ctx.record(&fact.uri, ChangeOp::Restored);
    Ok(Fact {
        updated_at: stamp,
        deleted_at: None,
        ..fact
    })
}

/// The facts a reader gets: by type, the owner's own word first, then the latest. Live rows inside their window
/// unless the query asks for the expired or the deleted ones too, which the profile page does.
pub fn query(conn: &Connection, filter: &FactQuery) -> Result<Vec<Fact>> {
    let mut clauses = vec!["1".to_string()];
    let mut params: Vec<String> = Vec::new();
    let mut of_types = |types: &[&str]| {
        let marks: Vec<String> = types
            .iter()
            .map(|type_id| {
                params.push(type_id.to_string());
                format!("?{}", params.len())
            })
            .collect();
        clauses.push(format!("type IN ({})", marks.join(", ")));
    };
    if let Some(types) = &filter.types {
        if types.is_empty() {
            return Ok(Vec::new());
        }
        of_types(&types.iter().map(String::as_str).collect::<Vec<_>>());
    }
    if let Some(owner) = &filter.owner {
        let owned = registry::facts_of(owner);
        if owned.is_empty() {
            return Ok(Vec::new());
        }
        of_types(&owned);
    }
    if !filter.include_deleted {
        clauses.push("deleted_at IS NULL".to_string());
    }
    if !filter.include_expired {
        let at = match &filter.at {
            Some(day) => {
                parse_day(day)?;
                day.clone()
            }
            None => today(),
        };
        params.push(at);
        let mark = params.len();
        clauses.push(format!(
            "(valid_from IS NULL OR valid_from <= ?{mark}) AND (valid_until IS NULL OR valid_until >= ?{mark})"
        ));
    }
    let sql = format!(
        "SELECT {COLUMNS} FROM facts WHERE {}
         ORDER BY type, (provenance <> 'user-asserted'), updated_at DESC, id",
        clauses.join(" AND ")
    );
    Ok(conn
        .prepare(&sql)?
        .query_map(rusqlite::params_from_iter(params), from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

/// What a fact held before each of its edits, the latest first.
pub fn history(conn: &Connection, fact_id: &str) -> Result<Vec<FactHistoryEntry>> {
    Ok(conn
        .prepare(
            "SELECT fact_id, type, value, note, valid_from, valid_until, replaced_at FROM fact_history
             WHERE fact_id = ?1 ORDER BY replaced_at DESC, seq DESC",
        )?
        .query_map([fact_id], |row| {
            Ok(FactHistoryEntry {
                fact_id: row.get(0)?,
                type_id: row.get(1)?,
                value: json_column(row, 2)?.unwrap_or(Value::Null),
                note: row.get(3)?,
                valid_from: row.get(4)?,
                valid_until: row.get(5)?,
                replaced_at: row.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Removes the replaced values past their retention, counted from `now_ms`. A stamp begins with its wall clock, so
/// comparing text against a stamp made of the cutoff alone does it. Answers how many rows went.
pub(crate) fn sweep_history(conn: &Connection, now_ms: u64) -> Result<usize> {
    let cutoff = now_ms.saturating_sub(HISTORY_DAYS * 24 * 60 * 60 * 1000);
    let stamp = format!("{cutoff:016x}-00000000-00000000");
    Ok(conn.execute("DELETE FROM fact_history WHERE replaced_at < ?1", [stamp])?)
}

// What the bundle needs.

/// Every fact, by id, tombstones included: a merge needs them. The history stays behind.
pub(crate) fn exportable(conn: &Connection) -> Result<Vec<Fact>> {
    Ok(conn
        .prepare(&format!("SELECT {COLUMNS} FROM facts ORDER BY id"))?
        .query_map([], from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

/// A tombstone as it leaves: its id, its type, its provenance and its stamps, and nothing of what it held.
pub(crate) fn stripped(fact: &Fact) -> Fact {
    Fact {
        value: Value::Object(Map::new()),
        confidence: None,
        valid_from: None,
        valid_until: None,
        source: None,
        note: None,
        ..fact.clone()
    }
}

/// What an import checks on each fact of a bundle before it writes any of them. The type is any well-formed id, so
/// a bundle from a newer build loses nothing; the provenance rules hold for a live row, and a tombstone holds
/// nothing they could be about.
pub(crate) fn validate_imported(fact: &Fact) -> std::result::Result<(), String> {
    if !ids::is_ulid(&fact.id) {
        return Err(format!("not an id: {:?}", fact.id));
    }
    if fact.uri != ids::Uri::new(TYPE_ID, &fact.id).to_string() {
        return Err(format!("a URI that is not the fact's own: {}", fact.uri));
    }
    if !ids::is_resource_id(&fact.type_id) {
        return Err(format!("{} is not of a fact type", fact.id));
    }
    let stamps_ok = hlc::Hlc::parse(&fact.created_at).is_ok()
        && hlc::Hlc::parse(&fact.updated_at).is_ok()
        && fact
            .deleted_at
            .as_ref()
            .is_none_or(|deleted| *deleted == fact.updated_at);
    if !stamps_ok {
        return Err(format!("stamps that cannot be read on {}", fact.id));
    }
    if fact.value.is_null() {
        return Err(format!("{} holds no value", fact.id));
    }
    if fact.deleted_at.is_none() {
        let owner = registry::resource(&fact.type_id).map(|row| row.owner);
        check_provenance(&Fields::from(fact), owner)
            .map_err(|detail| format!("{}: {detail}", fact.id))?;
    }
    check_window(fact.valid_from.as_deref(), fact.valid_until.as_deref())
        .map_err(|error| format!("{}: {error}", fact.id))
}

/// Writes a fact as it is, stamps and all.
pub(crate) fn put(conn: &Connection, fact: &Fact) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO facts
         (id, type, value, provenance, confidence, valid_from, valid_until, source, note,
          created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            fact.id,
            fact.type_id,
            fact.value.to_string(),
            fact.provenance.as_str(),
            fact.confidence,
            fact.valid_from,
            fact.valid_until,
            fact.source,
            fact.note,
            fact.created_at,
            fact.updated_at,
            fact.deleted_at,
        ],
    )?;
    Ok(())
}

/// The other live fact the substrate derived for the incoming one's type, which the unique index will not let it
/// live beside.
pub(crate) fn rival(conn: &Connection, fact: &Fact) -> Result<Option<(String, String)>> {
    if fact.provenance != Provenance::SystemDerived || fact.deleted_at.is_some() {
        return Ok(None);
    }
    Ok(conn
        .query_row(
            "SELECT id, updated_at FROM facts
             WHERE type = ?1 AND provenance = 'system-derived' AND deleted_at IS NULL AND id != ?2",
            [fact.type_id.as_str(), fact.id.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?)
}

/// What a replace clears: every fact, and the history of facts that are no longer there.
pub(crate) fn clear(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM facts", [])?;
    conn.execute("DELETE FROM fact_history", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::substrate::Workspace;

    fn input(type_id: &str, value: Value) -> FactInput {
        FactInput {
            id: None,
            type_id: type_id.into(),
            value,
            provenance: Provenance::UserAsserted,
            confidence: None,
            valid_from: None,
            valid_until: None,
            source: None,
            note: None,
        }
    }

    fn inferred(type_id: &str, value: Value, confidence: f64) -> FactInput {
        FactInput {
            provenance: Provenance::AiInferred,
            confidence: Some(confidence),
            ..input(type_id, value)
        }
    }

    fn home_area(city: &str) -> FactInput {
        FactInput {
            provenance: Provenance::SystemDerived,
            source: Some("setting:home".into()),
            ..input(
                "home-area",
                json!({ "city": city, "region": "Texas", "country": "United States" }),
            )
        }
    }

    fn code(result: Result<Fact>) -> String {
        let message = result.expect_err("refused").to_string();
        message.split(": ").next().unwrap().to_string()
    }

    fn patch(fields: Value) -> FactPatch {
        fields.as_object().unwrap().clone()
    }

    fn live(ws: &Workspace) -> Vec<Fact> {
        ws.read(|conn| query(conn, &FactQuery::default())).unwrap()
    }

    #[test]
    fn a_fact_is_asserted_read_and_edited_with_its_history() {
        let ws = Workspace::in_memory();
        let fact = ws
            .write(|ctx| {
                assert(
                    ctx,
                    FactInput {
                        note: Some("since the picnic".into()),
                        ..input(
                            "allergy",
                            json!({ "kind": "food", "substance": "tree nuts", "severity": "severe" }),
                        )
                    },
                )
            })
            .unwrap();
        assert_eq!(fact.uri, format!("eden://fact/{}", fact.id));
        assert_eq!(fact.created_at, fact.updated_at);
        assert_eq!(fact.provenance, Provenance::UserAsserted);
        assert_eq!(live(&ws), vec![fact.clone()]);

        let edited = ws
            .write(|ctx| {
                update(
                    ctx,
                    &fact.id,
                    &patch(json!({
                        "value": { "kind": "food", "substance": "tree nuts", "severity": "moderate" },
                        "note": null
                    })),
                )
            })
            .unwrap();
        assert!(edited.updated_at > fact.updated_at);
        assert_eq!(edited.created_at, fact.created_at);
        assert_eq!(edited.value["severity"], "moderate");
        assert_eq!(edited.note, None);

        let kept = ws.read(|conn| history(conn, &fact.id)).unwrap();
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].value, fact.value);
        assert_eq!(kept[0].note.as_deref(), Some("since the picnic"));
        assert_eq!(kept[0].replaced_at, edited.updated_at);

        // An edit that changes only the source keeps nothing: the history is of what the fact said.
        let sourced = ws
            .write(|ctx| {
                update(
                    ctx,
                    &fact.id,
                    &patch(json!({ "source": "eden://recipe/x" })),
                )
            })
            .unwrap();
        assert_eq!(sourced.source.as_deref(), Some("eden://recipe/x"));
        assert_eq!(ws.read(|conn| history(conn, &fact.id)).unwrap().len(), 1);
    }

    #[test]
    fn the_store_refuses_what_the_registry_does_not_know() {
        let ws = Workspace::in_memory();
        for (bad, expected) in [
            (input("spaceship", json!("x")), "fact:invalid"),
            (input("recipe", json!("x")), "fact:invalid"),
            (input("home", json!("x")), "fact:invalid"),
            (input("gym-preference", json!("x")), "fact:invalid"),
            (input("preferred-name", Value::Null), "fact:invalid"),
            (
                FactInput {
                    id: Some("not-an-id".into()),
                    ..input("preferred-name", json!("Rowan"))
                },
                "Invalid operation",
            ),
        ] {
            assert_eq!(code(ws.write(|ctx| assert(ctx, bad))), expected);
        }
        // The owner may assert a fact whose domain has not shipped, as long as the fact is live (D-130).
        ws.write(|ctx| {
            assert(
                ctx,
                input("medical-dietary-restriction", json!("low sodium")),
            )
        })
        .unwrap();
        assert_eq!(live(&ws).len(), 1);
    }

    #[test]
    fn confidence_and_source_follow_the_provenance() {
        let ws = Workspace::in_memory();
        let with = |provenance, confidence, source: Option<&str>| FactInput {
            provenance,
            confidence,
            source: source.map(String::from),
            ..input("disliked-ingredient", json!("cilantro"))
        };
        for (fine, ok) in [
            (with(Provenance::UserAsserted, None, None), true),
            (with(Provenance::UserAsserted, Some(0.5), None), false),
            (with(Provenance::AiInferred, Some(0.8), None), true),
            (with(Provenance::AiInferred, None, None), false),
            (with(Provenance::AiInferred, Some(1.5), None), false),
            (with(Provenance::DomainDerived, Some(0.6), None), true),
            (with(Provenance::DomainDerived, None, None), false),
            (
                with(Provenance::Integration, None, Some("google-calendar")),
                true,
            ),
            (with(Provenance::Integration, None, None), false),
            (with(Provenance::Integration, Some(0.5), Some("x")), false),
            (with(Provenance::SystemDerived, None, None), false),
        ] {
            let result = ws.write(|ctx| assert(ctx, fine));
            assert_eq!(result.is_ok(), ok, "{result:?}");
            if !ok {
                assert_eq!(code(result), "fact:invalid");
            }
        }
    }

    #[test]
    fn a_system_derived_fact_is_one_row_renewed_in_place() {
        let ws = Workspace::in_memory();
        let first = ws.write(|ctx| assert(ctx, home_area("Austin"))).unwrap();
        let again = ws.write(|ctx| assert(ctx, home_area("Austin"))).unwrap();
        assert_eq!(again.id, first.id);
        assert!(again.updated_at > first.updated_at);
        let moved = ws.write(|ctx| assert(ctx, home_area("Houston"))).unwrap();
        assert_eq!(moved.id, first.id);
        assert_eq!(moved.value["city"], "Houston");
        assert_eq!(live(&ws).len(), 1);
        let kept = ws.read(|conn| history(conn, &first.id)).unwrap();
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].value["city"], "Austin");

        // The owner's own home-area is a row beside it, and wins the order.
        let own = ws
            .write(|ctx| assert(ctx, input("home-area", json!({ "city": "Hyde Park" }))))
            .unwrap();
        let facts = live(&ws);
        assert_eq!(
            facts
                .iter()
                .map(|fact| fact.id.as_str())
                .collect::<Vec<_>>(),
            [own.id.as_str(), first.id.as_str()]
        );

        // Nothing but the substrate's own types is derived by it.
        let result = ws.write(|ctx| {
            assert(
                ctx,
                FactInput {
                    provenance: Provenance::SystemDerived,
                    ..input("allergy", json!({}))
                },
            )
        });
        assert_eq!(code(result), "fact:invalid");
    }

    #[test]
    fn the_effective_set_is_user_first_then_latest_and_inside_the_window() {
        let ws = Workspace::in_memory();
        let (older, newer, own, past, future) = ws
            .write(|ctx| {
                let older = assert(ctx, inferred("cuisine-preference", json!("Thai"), 0.6))?;
                let newer = assert(ctx, inferred("cuisine-preference", json!("Mexican"), 0.7))?;
                let own = assert(ctx, input("cuisine-preference", json!("Japanese")))?;
                let past = assert(
                    ctx,
                    FactInput {
                        valid_until: Some("2020-01-31".into()),
                        ..input("dietary-preference", json!("low-sodium"))
                    },
                )?;
                let future = assert(
                    ctx,
                    FactInput {
                        valid_from: Some("2999-01-01".into()),
                        ..input("dietary-preference", json!("vegan"))
                    },
                )?;
                Ok((older, newer, own, past, future))
            })
            .unwrap();
        let ids = |facts: Vec<Fact>| facts.into_iter().map(|fact| fact.id).collect::<Vec<_>>();

        assert_eq!(
            ids(live(&ws)),
            [own.id.clone(), newer.id.clone(), older.id.clone()]
        );
        let at = |day: &str, include_expired| FactQuery {
            types: Some(vec!["dietary-preference".into()]),
            at: Some(day.into()),
            include_expired,
            ..Default::default()
        };
        assert_eq!(
            ids(ws
                .read(|conn| query(conn, &at("2020-01-31", false)))
                .unwrap()),
            [past.id.clone()]
        );
        assert_eq!(
            ids(ws
                .read(|conn| query(conn, &at("2999-01-01", false)))
                .unwrap()),
            [future.id.clone()]
        );
        assert_eq!(
            ids(ws
                .read(|conn| query(conn, &at("2020-02-01", true)))
                .unwrap())
            .len(),
            2
        );
        let by_owner = FactQuery {
            owner: Some("kitchen".into()),
            include_expired: true,
            ..Default::default()
        };
        assert_eq!(ws.read(|conn| query(conn, &by_owner)).unwrap().len(), 5);
        let none = FactQuery {
            owner: Some("weather".into()),
            ..Default::default()
        };
        assert!(ws.read(|conn| query(conn, &none)).unwrap().is_empty());
        assert_eq!(
            code(ws.read(|conn| query(conn, &at("someday", false)).map(|_| own.clone()))),
            "fact:invalid"
        );
    }

    #[test]
    fn a_tombstone_hides_a_fact_and_a_restore_brings_it_back() {
        let ws = Workspace::in_memory();
        let fact = ws
            .write(|ctx| assert(ctx, input("preferred-name", json!("Rowan"))))
            .unwrap();
        let deleted = ws.write(|ctx| delete(ctx, &fact.id)).unwrap();
        assert_eq!(deleted.deleted_at, Some(deleted.updated_at.clone()));
        assert!(live(&ws).is_empty());
        let kept = ws
            .read(|conn| {
                query(
                    conn,
                    &FactQuery {
                        include_deleted: true,
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        assert_eq!(kept[0].value, json!("Rowan"));
        assert_eq!(ws.write(|ctx| delete(ctx, &fact.id)).unwrap(), deleted);
        assert!(matches!(
            ws.write(|ctx| update(ctx, &fact.id, &patch(json!({ "note": "x" })))),
            Err(EdenError::NotFound(_))
        ));

        let restored = ws.write(|ctx| restore(ctx, &fact.id)).unwrap();
        assert!(restored.updated_at > deleted.updated_at);
        assert_eq!(restored.deleted_at, None);
        assert_eq!(live(&ws), vec![restored.clone()]);
        assert_eq!(ws.write(|ctx| restore(ctx, &fact.id)).unwrap(), restored);
        assert!(matches!(
            ws.write(|ctx| delete(ctx, &ids::new_id())),
            Err(EdenError::NotFound(_))
        ));
    }

    #[test]
    fn a_patch_names_only_fields_a_fact_has() {
        let ws = Workspace::in_memory();
        let fact = ws
            .write(|ctx| assert(ctx, inferred("disliked-ingredient", json!("cilantro"), 0.8)))
            .unwrap();
        for bad in [
            json!({ "type": "allergy" }),
            json!({ "colour": "green" }),
            json!({ "provenance": "integration" }),
            json!({ "confidence": "high" }),
            json!({ "validFrom": 2020 }),
            json!({ "validFrom": "2021-01-01", "validUntil": "2020-01-01" }),
            json!({ "value": null }),
        ] {
            assert_eq!(
                code(ws.write(|ctx| update(ctx, &fact.id, &patch(bad)))),
                "fact:invalid"
            );
        }
        // The owner's word: the fact becomes theirs and its confidence goes.
        let owned = ws
            .write(|ctx| {
                update(
                    ctx,
                    &fact.id,
                    &patch(json!({ "provenance": "user-asserted", "validUntil": "2030-12-31" })),
                )
            })
            .unwrap();
        assert_eq!(owned.provenance, Provenance::UserAsserted);
        assert_eq!(owned.confidence, None);
        assert_eq!(owned.valid_until.as_deref(), Some("2030-12-31"));
        assert_eq!(
            code(ws.write(|ctx| update(ctx, &fact.id, &patch(json!({ "confidence": 0.5 }))))),
            "fact:invalid"
        );
    }

    #[test]
    fn history_is_swept_at_thirty_days() {
        let ws = Workspace::in_memory();
        let fact = ws
            .write(|ctx| assert(ctx, input("preferred-name", json!("Rowan"))))
            .unwrap();
        ws.write(|ctx| update(ctx, &fact.id, &patch(json!({ "value": "Ro" }))))
            .unwrap();
        let now = hlc::now_ms();
        let day = 24 * 60 * 60 * 1000;
        assert_eq!(
            ws.write(|ctx| sweep_history(ctx.conn, now + (HISTORY_DAYS - 1) * day))
                .unwrap(),
            0
        );
        assert_eq!(ws.read(|conn| history(conn, &fact.id)).unwrap().len(), 1);
        assert_eq!(
            ws.write(|ctx| sweep_history(ctx.conn, now + (HISTORY_DAYS + 1) * day))
                .unwrap(),
            1
        );
        assert!(ws.read(|conn| history(conn, &fact.id)).unwrap().is_empty());
    }

    #[test]
    fn a_tombstone_leaves_stripped_and_is_taken_back() {
        let ws = Workspace::in_memory();
        let fact = ws
            .write(|ctx| {
                let fact = assert(ctx, inferred("disliked-ingredient", json!("cilantro"), 0.8))?;
                delete(ctx, &fact.id)
            })
            .unwrap();
        let gone = stripped(&fact);
        assert_eq!(gone.value, json!({}));
        assert_eq!(gone.confidence, None);
        assert_eq!(gone.provenance, Provenance::AiInferred);
        assert_eq!(validate_imported(&gone), Ok(()));
        // A live row that says it was inferred and carries no confidence is not one.
        let live_gone = Fact {
            deleted_at: None,
            ..gone.clone()
        };
        assert!(validate_imported(&live_gone).is_err());
        assert!(validate_imported(&Fact {
            uri: "eden://grant/x".into(),
            ..fact.clone()
        })
        .is_err());
        // A type this build does not know is kept as it is.
        assert_eq!(
            validate_imported(&Fact {
                type_id: "favourite-planet".into(),
                ..fact.clone()
            }),
            Ok(())
        );
    }
}
