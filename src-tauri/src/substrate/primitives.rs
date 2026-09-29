//! The four primitives (D-23): Task, Event, Place, Attachment. Each has a table of its own with its fields as columns
//! (docs/product/substrate/primitives.md, tasks.md), and one description here of what those fields are. Creating,
//! patching, reading and querying are written once over that description, so the four cannot drift apart.
//!
//! A row crosses the IPC boundary as a JSON object with camelCase keys; `@eden/shared/data` holds the typed shapes.

use rusqlite::types::Value as Sql;
use rusqlite::{Connection, OptionalExtension, Row};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use super::changes::ChangeOp;
use super::hlc;
use super::ids::{self, Uri};
use super::links::{self, LinkInput};
use super::registry;
use super::WriteCtx;
use crate::error::{EdenError, Result};

/// The id of the local calendar source, seeded by the first migration. An Event without a source belongs to it.
pub const LOCAL_CALENDAR_SOURCE: &str = "00000000000000000000000001";

#[derive(Clone, Copy, PartialEq)]
enum Column {
    Text,
    Integer,
    Real,
    Bool,
    /// A list or a small structure, kept as JSON text.
    Json,
}

struct Field {
    /// The key in the JSON object.
    name: &'static str,
    /// The column in the table.
    column: &'static str,
    kind: Column,
    required: bool,
    /// Whether a patch may change it. What describes a file's bytes is fixed when the file is attached.
    patchable: bool,
}

const fn field(name: &'static str, column: &'static str, kind: Column) -> Field {
    Field {
        name,
        column,
        kind,
        required: false,
        patchable: true,
    }
}

const fn required(name: &'static str, column: &'static str, kind: Column) -> Field {
    Field {
        name,
        column,
        kind,
        required: true,
        patchable: true,
    }
}

const fn fixed(name: &'static str, column: &'static str, kind: Column) -> Field {
    Field {
        name,
        column,
        kind,
        required: true,
        patchable: false,
    }
}

pub struct Primitive {
    pub type_id: &'static str,
    table: &'static str,
    fields: &'static [Field],
}

use Column::{Bool, Integer, Json, Real, Text};

pub const TASK: Primitive = Primitive {
    type_id: "task",
    table: "tasks",
    fields: &[
        required("kind", "kind", Text),
        required("title", "title", Text),
        field("notes", "notes", Text),
        field("due", "due", Text),
        field("priority", "priority", Text),
        field("at", "at", Text),
        field("timeOfDay", "time_of_day", Text),
        field("recurrence", "recurrence", Json),
        field("items", "items", Json),
        field("target", "target", Json),
        field("grace", "grace", Integer),
        field("streak", "streak", Integer),
        field("progress", "progress", Json),
        field("done", "done", Bool),
        field("completedAt", "completed_at", Text),
    ],
};

pub const EVENT: Primitive = Primitive {
    type_id: "event",
    table: "events",
    fields: &[
        required("kind", "kind", Text),
        required("title", "title", Text),
        required("startAt", "start_at", Text),
        field("endAt", "end_at", Text),
        field("allDay", "all_day", Bool),
        field("timezone", "timezone", Text),
        field("recurrence", "recurrence", Json),
        field("status", "status", Text),
        field("notes", "notes", Text),
        field("reminders", "reminders", Json),
        field("attendees", "attendees", Json),
        field("calendarSourceId", "calendar_source_id", Text),
    ],
};

pub const PLACE: Primitive = Primitive {
    type_id: "place",
    table: "places",
    fields: &[
        required("kind", "kind", Text),
        required("name", "name", Text),
        field("lat", "lat", Real),
        field("lng", "lng", Real),
        field("address", "address", Text),
        field("category", "category", Text),
        field("phone", "phone", Text),
        field("url", "url", Text),
    ],
};

pub const ATTACHMENT: Primitive = Primitive {
    type_id: "attachment",
    table: "attachments",
    fields: &[
        required("kind", "kind", Text),
        required("fileName", "file_name", Text),
        fixed("mime", "mime", Text),
        fixed("size", "size", Integer),
        fixed("hash", "hash", Text),
        fixed("store", "store", Text),
        field("thumbnail", "thumbnail", Text),
        field("ocrText", "ocr_text", Text),
        field("captured", "captured", Json),
    ],
};

pub const ALL: [&Primitive; 4] = [&TASK, &EVENT, &PLACE, &ATTACHMENT];

/// The primitive a type names, if it names one.
pub fn of_type(type_id: &str) -> Option<&'static Primitive> {
    ALL.into_iter()
        .find(|primitive| primitive.type_id == type_id)
}

/// The keys of an input that every row takes, beside the primitive's own fields.
const COMMON_KEYS: &[&str] = &["id", "mirror", "source", "externalId", "snapshot", "links"];

const COMMON_COLUMNS: &str =
    "created_at, updated_at, deleted_at, mirror, source, external_id, snapshot";

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Query {
    pub kinds: Option<Vec<String>>,
    /// The start of a time range, as ISO 8601 text. Tasks answer by `due` or `at`, Events by when they run.
    pub from: Option<String>,
    pub to: Option<String>,
    /// The URI of a Place: only rows that are `at` it.
    pub place: Option<String>,
    /// Only rows with a live link to this URI, of `relation` when it is given.
    pub linked_to: Option<String>,
    pub relation: Option<String>,
    #[serde(default)]
    pub include_deleted: bool,
}

fn invalid(message: String) -> EdenError {
    EdenError::InvalidOperation(message)
}

impl Primitive {
    fn field(&self, name: &str) -> Option<&Field> {
        self.fields.iter().find(|field| field.name == name)
    }

    fn check_kind(&self, kind: &Value) -> Result<()> {
        match kind.as_str() {
            Some(kind) if registry::is_kind(self.type_id, kind) => Ok(()),
            _ => Err(invalid(format!(
                "not a registered {} kind: {kind}",
                self.type_id
            ))),
        }
    }

    /// The value as the column takes it, or an error that names the field.
    fn bind(&self, field: &Field, value: &Value) -> Result<Sql> {
        let mismatch = |expected: &str| {
            invalid(format!(
                "{}.{} takes {expected}, not {value}",
                self.type_id, field.name
            ))
        };
        if value.is_null() {
            return if field.required {
                Err(invalid(format!(
                    "{}.{} is required",
                    self.type_id, field.name
                )))
            } else {
                Ok(Sql::Null)
            };
        }
        Ok(match field.kind {
            Text => Sql::Text(value.as_str().ok_or_else(|| mismatch("text"))?.to_string()),
            Integer => Sql::Integer(value.as_i64().ok_or_else(|| mismatch("a whole number"))?),
            Real => Sql::Real(value.as_f64().ok_or_else(|| mismatch("a number"))?),
            Bool => Sql::Integer(value.as_bool().ok_or_else(|| mismatch("true or false"))? as i64),
            Json => Sql::Text(value.to_string()),
        })
    }

    fn select(&self) -> String {
        let fields: Vec<&str> = self.fields.iter().map(|field| field.column).collect();
        format!("id, {}, {COMMON_COLUMNS}", fields.join(", "))
    }

    fn read_row(&self, row: &Row<'_>) -> rusqlite::Result<(String, Map<String, Value>)> {
        let id: String = row.get(0)?;
        let mut object = Map::new();
        object.insert("uri".into(), json!(Uri::new(self.type_id, &id).to_string()));
        object.insert("id".into(), json!(id));
        object.insert("type".into(), json!(self.type_id));
        for (index, field) in self.fields.iter().enumerate() {
            object.insert(field.name.into(), read(row, index + 1, field.kind)?);
        }
        let common = self.fields.len() + 1;
        object.insert("createdAt".into(), read(row, common, Text)?);
        object.insert("updatedAt".into(), read(row, common + 1, Text)?);
        object.insert("deletedAt".into(), read(row, common + 2, Text)?);
        object.insert("mirror".into(), read(row, common + 3, Bool)?);
        object.insert("source".into(), read(row, common + 4, Text)?);
        object.insert("externalId".into(), read(row, common + 5, Text)?);
        object.insert("snapshot".into(), read(row, common + 6, Json)?);
        Ok((id, object))
    }
}

fn read(row: &Row<'_>, index: usize, kind: Column) -> rusqlite::Result<Value> {
    Ok(match (row.get::<_, Sql>(index)?, kind) {
        (Sql::Null, _) => Value::Null,
        (Sql::Integer(number), Bool) => json!(number != 0),
        (Sql::Integer(number), _) => json!(number),
        (Sql::Real(number), _) => json!(number),
        (Sql::Text(text), Json) => serde_json::from_str(&text).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                index,
                rusqlite::types::Type::Text,
                Box::new(e),
            )
        })?,
        (Sql::Text(text), _) => json!(text),
        (Sql::Blob(_), _) => Value::Null,
    })
}

fn optional_text(object: &Map<String, Value>, key: &str) -> Result<Option<String>> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) => Ok(Some(text.clone())),
        Some(other) => Err(invalid(format!("{key} takes text, not {other}"))),
    }
}

/// Creates a row from a JSON object: the primitive's fields, and any of `id`, `mirror`, `source`, `externalId`,
/// `snapshot` and `links`. A key it does not know is an error, so a misspelt field is not silently dropped.
pub fn create(ctx: &mut WriteCtx, primitive: &Primitive, input: Value) -> Result<Value> {
    let Value::Object(mut input) = input else {
        return Err(invalid(format!("a {} is a JSON object", primitive.type_id)));
    };
    if let Some(unknown) = input
        .keys()
        .find(|key| primitive.field(key).is_none() && !COMMON_KEYS.contains(&key.as_str()))
    {
        return Err(invalid(format!(
            "{} has no field {unknown:?}",
            primitive.type_id
        )));
    }
    primitive.check_kind(input.get("kind").unwrap_or(&Value::Null))?;
    if input.get("store").is_some_and(|store| store != "workspace") {
        return Err(invalid(
            "the Vault does not exist yet; an attachment is stored in the workspace".to_string(),
        ));
    }
    if primitive.type_id == EVENT.type_id && !input.contains_key("calendarSourceId") {
        input.insert("calendarSourceId".into(), json!(LOCAL_CALENDAR_SOURCE));
    }

    let id = ids::id_or_new(optional_text(&input, "id")?)?;
    let stamp = hlc::next(ctx.conn)?;
    let mut columns = vec!["id", "created_at", "updated_at"];
    let mut values = vec![
        Sql::Text(id.clone()),
        Sql::Text(stamp.clone()),
        Sql::Text(stamp),
    ];

    for field in primitive.fields {
        match input.get(field.name) {
            Some(value) => {
                columns.push(field.column);
                values.push(primitive.bind(field, value)?);
            }
            None if field.required => {
                return Err(invalid(format!(
                    "{}.{} is required",
                    primitive.type_id, field.name
                )))
            }
            // Left out: the column takes its default.
            None => {}
        }
    }
    if let Some(mirror) = input.get("mirror").filter(|value| !value.is_null()) {
        columns.push("mirror");
        let mirror = mirror
            .as_bool()
            .ok_or_else(|| invalid(format!("mirror takes true or false, not {mirror}")))?;
        values.push(Sql::Integer(mirror as i64));
    }
    for (key, column) in [("source", "source"), ("externalId", "external_id")] {
        if let Some(text) = optional_text(&input, key)? {
            columns.push(column);
            values.push(Sql::Text(text));
        }
    }
    if let Some(snapshot) = input.get("snapshot").filter(|value| !value.is_null()) {
        columns.push("snapshot");
        values.push(Sql::Text(snapshot.to_string()));
    }

    let marks: Vec<String> = (1..=columns.len()).map(|n| format!("?{n}")).collect();
    ctx.conn.execute(
        &format!(
            "INSERT INTO {} ({}) VALUES ({})",
            primitive.table,
            columns.join(", "),
            marks.join(", ")
        ),
        rusqlite::params_from_iter(values),
    )?;

    let uri = Uri::new(primitive.type_id, &id).to_string();
    if let Some(links) = input.remove("links").filter(|value| !value.is_null()) {
        for link in serde_json::from_value::<Vec<LinkInput>>(links)? {
            links::link(ctx, &uri, &link)?;
        }
    }
    ctx.record(&uri, ChangeOp::Created);
    get(ctx.conn, primitive, &id)?.ok_or(EdenError::NotFound(uri))
}

/// Changes the fields the patch names and leaves the rest: a value sets the field, `null` clears it.
pub fn update(ctx: &mut WriteCtx, primitive: &Primitive, id: &str, patch: Value) -> Result<Value> {
    let Value::Object(patch) = patch else {
        return Err(invalid("a patch is a JSON object".to_string()));
    };
    let stamp = hlc::next(ctx.conn)?;
    let mut sets = vec!["updated_at = ?1".to_string()];
    let mut values = vec![Sql::Text(stamp)];

    for (key, value) in &patch {
        let field = primitive
            .field(key)
            .filter(|field| field.patchable)
            .ok_or_else(|| {
                invalid(format!(
                    "{} has no field {key:?} to change",
                    primitive.type_id
                ))
            })?;
        if field.name == "kind" {
            primitive.check_kind(value)?;
        }
        values.push(primitive.bind(field, value)?);
        sets.push(format!("{} = ?{}", field.column, values.len()));
    }
    values.push(Sql::Text(id.to_string()));

    let changed = ctx.conn.execute(
        &format!(
            "UPDATE {} SET {} WHERE id = ?{} AND deleted_at IS NULL",
            primitive.table,
            sets.join(", "),
            values.len()
        ),
        rusqlite::params_from_iter(values),
    )?;
    let uri = Uri::new(primitive.type_id, id).to_string();
    if changed == 0 {
        return Err(EdenError::NotFound(uri));
    }
    ctx.record(&uri, ChangeOp::Updated);
    get(ctx.conn, primitive, id)?.ok_or(EdenError::NotFound(uri))
}

/// One row by id, deleted or not, with its live links.
pub fn get(conn: &Connection, primitive: &Primitive, id: &str) -> Result<Option<Value>> {
    let found = conn
        .query_row(
            &format!(
                "SELECT {} FROM {} WHERE id = ?1",
                primitive.select(),
                primitive.table
            ),
            [id],
            |row| primitive.read_row(row),
        )
        .optional()?;
    let Some((_, mut object)) = found else {
        return Ok(None);
    };
    let owner = Uri::new(primitive.type_id, id).to_string();
    let links = links::query(
        conn,
        &links::LinkQuery {
            owner: Some(owner),
            ..Default::default()
        },
    )?;
    object.insert("links".into(), serde_json::to_value(links)?);
    Ok(Some(Value::Object(object)))
}

/// The rows that match, in the order they were created.
pub fn query(conn: &Connection, primitive: &Primitive, filter: &Query) -> Result<Vec<Value>> {
    let table = primitive.table;
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<String> = Vec::new();
    let mut bind = |value: &str| {
        params.push(value.to_string());
        format!("?{}", params.len())
    };

    if !filter.include_deleted {
        clauses.push("deleted_at IS NULL".into());
    }
    if let Some(kinds) = &filter.kinds {
        let marks: Vec<String> = kinds.iter().map(|kind| bind(kind)).collect();
        clauses.push(if marks.is_empty() {
            "0".into()
        } else {
            format!("kind IN ({})", marks.join(", "))
        });
    }
    // The start and the end of what the row covers in time; a row with no time is outside every range.
    let span = match primitive.type_id {
        "task" => Some(("COALESCE(due, at)", "COALESCE(due, at)")),
        "event" => Some(("start_at", "COALESCE(end_at, start_at)")),
        _ => None,
    };
    if let Some((start, end)) = span {
        if let Some(from) = &filter.from {
            clauses.push(format!("{end} >= {}", bind(from)));
        }
        if let Some(to) = &filter.to {
            clauses.push(format!("{start} <= {}", bind(to)));
        }
    }
    let mut linked = |target: &str, relation: Option<&str>| {
        let mut clause = format!(
            "EXISTS (SELECT 1 FROM links WHERE links.owner_id = {table}.id
                     AND links.owner_type = '{}' AND links.deleted_at IS NULL
                     AND links.target_uri = {}",
            primitive.type_id,
            bind(target)
        );
        if let Some(relation) = relation {
            clause.push_str(&format!(" AND links.relation = {}", bind(relation)));
        }
        clause.push(')');
        clause
    };
    if let Some(place) = &filter.place {
        clauses.push(linked(place, Some("at")));
    }
    if let Some(target) = &filter.linked_to {
        clauses.push(linked(target, filter.relation.as_deref()));
    }

    let filter_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", clauses.join(" AND "))
    };
    let rows = conn
        .prepare(&format!(
            "SELECT {} FROM {table}{filter_sql} ORDER BY id",
            primitive.select()
        ))?
        .query_map(rusqlite::params_from_iter(params), |row| {
            primitive.read_row(row)
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut links = links::by_owner(conn, primitive.type_id, false)?;
    rows.into_iter()
        .map(|(id, mut object)| {
            let own = links.remove(&id).unwrap_or_default();
            object.insert("links".into(), serde_json::to_value(own)?);
            Ok(Value::Object(object))
        })
        .collect()
}

impl Primitive {
    pub(crate) fn table(&self) -> &'static str {
        self.table
    }

    /// Empties a tombstone of what it held, for a bundle: a deleted row leaves as its id, its kind and its stamps.
    /// A field that must have a value takes an empty one; the others are left out, and take their defaults back
    /// where the row is imported.
    pub(crate) fn strip(&self, row: &mut Map<String, Value>) {
        for field in self.fields {
            if field.name == "kind" || field.name == "store" {
                continue;
            }
            if field.required {
                let empty = match field.kind {
                    Text => json!(""),
                    Integer | Real => json!(0),
                    Bool => json!(false),
                    Json => Value::Null,
                };
                row.insert(field.name.into(), empty);
            } else {
                row.remove(field.name);
            }
        }
        for key in ["source", "externalId", "snapshot"] {
            row.insert(key.into(), Value::Null);
        }
    }
}

/// Writes a row as it is, stamps and all: what an import does with a row of its bundle. A field the row does not
/// name takes the column's default.
pub(crate) fn put(
    conn: &Connection,
    primitive: &Primitive,
    row: &Map<String, Value>,
) -> Result<()> {
    let text =
        |key: &str| -> Result<Sql> { Ok(optional_text(row, key)?.map_or(Sql::Null, Sql::Text)) };
    let mut columns = vec![
        "id",
        "created_at",
        "updated_at",
        "deleted_at",
        "mirror",
        "source",
        "external_id",
        "snapshot",
    ];
    let mut values = vec![
        text("id")?,
        text("createdAt")?,
        text("updatedAt")?,
        text("deletedAt")?,
        Sql::Integer(row.get("mirror").and_then(Value::as_bool).unwrap_or(false) as i64),
        text("source")?,
        text("externalId")?,
        row.get("snapshot")
            .filter(|snapshot| !snapshot.is_null())
            .map_or(Sql::Null, |snapshot| Sql::Text(snapshot.to_string())),
    ];
    for field in primitive.fields {
        if let Some(value) = row.get(field.name) {
            columns.push(field.column);
            values.push(primitive.bind(field, value)?);
        } else if field.name == "calendarSourceId" {
            columns.push(field.column);
            values.push(Sql::Text(LOCAL_CALENDAR_SOURCE.to_string()));
        }
    }
    let marks: Vec<String> = (1..=columns.len()).map(|n| format!("?{n}")).collect();
    conn.execute(
        &format!(
            "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
            primitive.table,
            columns.join(", "),
            marks.join(", ")
        ),
        rusqlite::params_from_iter(values),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::substrate::rows;
    use crate::substrate::Workspace;

    fn make(workspace: &Workspace, primitive: &Primitive, input: Value) -> Result<Value> {
        workspace.write(|ctx| create(ctx, primitive, input))
    }

    fn titles(rows: &[Value]) -> Vec<&str> {
        rows.iter()
            .map(|row| row["title"].as_str().unwrap())
            .collect()
    }

    #[test]
    fn a_task_round_trips_with_its_defaults() {
        let workspace = Workspace::in_memory();
        let task = make(
            &workspace,
            &TASK,
            json!({
                "kind": "checklist",
                "title": "Cook the dal",
                "due": "2026-10-01",
                "items": [{ "text": "Soak", "done": true }, { "text": "Temper", "done": false }],
            }),
        )
        .unwrap();

        assert_eq!(
            task["uri"],
            format!("eden://task/{}", task["id"].as_str().unwrap())
        );
        assert_eq!(task["type"], "task");
        assert_eq!(task["items"][1]["text"], "Temper");
        // What was left out took the column's default, or is null.
        assert_eq!(task["priority"], "none");
        assert_eq!(task["done"], false);
        assert_eq!(task["streak"], 0);
        assert_eq!(task["notes"], Value::Null);
        assert_eq!(task["mirror"], false);
        assert_eq!(task["deletedAt"], Value::Null);
        assert_eq!(task["links"], json!([]));
        assert_eq!(task["createdAt"], task["updatedAt"]);
    }

    #[test]
    fn an_event_belongs_to_the_local_source_unless_it_names_one() {
        let workspace = Workspace::in_memory();
        let event = make(
            &workspace,
            &EVENT,
            json!({ "kind": "shop-day", "title": "Shop", "startAt": "2026-10-03", "allDay": true }),
        )
        .unwrap();
        assert_eq!(event["calendarSourceId"], LOCAL_CALENDAR_SOURCE);
        assert_eq!(event["status"], "confirmed");
        assert_eq!(event["allDay"], true);
    }

    #[test]
    fn a_patch_sets_what_it_names_clears_with_null_and_leaves_the_rest() {
        let workspace = Workspace::in_memory();
        let task = make(
            &workspace,
            &TASK,
            json!({ "kind": "todo", "title": "Call", "notes": "after lunch", "due": "2026-10-01" }),
        )
        .unwrap();
        let id = task["id"].as_str().unwrap();

        let patched = workspace
            .write(|ctx| {
                update(
                    ctx,
                    &TASK,
                    id,
                    json!({ "done": true, "completedAt": "2026-10-01T13:00:00Z", "notes": null }),
                )
            })
            .unwrap();
        assert_eq!(patched["done"], true);
        assert_eq!(patched["notes"], Value::Null);
        assert_eq!(patched["due"], "2026-10-01");
        assert_eq!(patched["title"], "Call");
        assert!(patched["updatedAt"].as_str() > task["updatedAt"].as_str());

        for bad in [
            json!({ "title": null }),
            json!({ "colour": "red" }),
            json!({ "kind": "spaceship" }),
            json!({ "done": "yes" }),
            json!({ "createdAt": "x" }),
        ] {
            assert!(
                workspace
                    .write(|ctx| update(ctx, &TASK, id, bad.clone()))
                    .is_err(),
                "{bad} should be refused"
            );
        }
        assert!(matches!(
            workspace.write(|ctx| update(ctx, &TASK, &ids::new_id(), json!({ "done": true }))),
            Err(EdenError::NotFound(_))
        ));
    }

    #[test]
    fn what_describes_a_file_cannot_be_patched() {
        let workspace = Workspace::in_memory();
        let attachment = make(
            &workspace,
            &ATTACHMENT,
            json!({ "kind": "photo", "fileName": "a.png", "mime": "image/png", "size": 3, "hash": "h", "store": "workspace" }),
        )
        .unwrap();
        let id = attachment["id"].as_str().unwrap();
        assert!(workspace
            .write(|ctx| update(ctx, &ATTACHMENT, id, json!({ "hash": "other" })))
            .is_err());
        let patched = workspace
            .write(|ctx| update(ctx, &ATTACHMENT, id, json!({ "ocrText": "Rice 2 kg" })))
            .unwrap();
        assert_eq!(patched["ocrText"], "Rice 2 kg");
    }

    #[test]
    fn a_create_is_refused_for_what_is_malformed() {
        let workspace = Workspace::in_memory();
        for (primitive, bad) in [
            (&TASK, json!({ "kind": "todo" })),
            (&TASK, json!({ "kind": "spaceship", "title": "x" })),
            (&TASK, json!({ "title": "no kind" })),
            (
                &TASK,
                json!({ "kind": "todo", "title": "x", "colour": "red" }),
            ),
            (
                &TASK,
                json!({ "kind": "todo", "title": "x", "priority": "urgent" }),
            ),
            (&TASK, json!({ "kind": "todo", "title": 7 })),
            (&TASK, json!({ "kind": "todo", "title": "x", "id": "t-01" })),
            (&TASK, json!("a string")),
            (
                &EVENT,
                json!({ "kind": "local-event", "title": "no start" }),
            ),
            (
                &EVENT,
                json!({ "kind": "local-event", "title": "x", "startAt": "2026-10-01", "attendees": ["a"] }),
            ),
            (
                &PLACE,
                json!({ "kind": "venue", "name": "Half a point", "lat": 30.3 }),
            ),
            (
                &PLACE,
                json!({ "kind": "venue", "name": "x", "mirror": true }),
            ),
            (
                &ATTACHMENT,
                json!({ "kind": "document", "fileName": "p.pdf", "mime": "application/pdf", "size": 1, "hash": "h", "store": "vault" }),
            ),
        ] {
            assert!(
                make(&workspace, primitive, bad.clone()).is_err(),
                "{bad} should be refused"
            );
        }
        for primitive in ALL {
            let rows = workspace
                .read(|conn| query(conn, primitive, &Query::default()))
                .unwrap();
            assert!(rows.is_empty());
        }
    }

    #[test]
    fn there_is_one_home() {
        let workspace = Workspace::in_memory();
        let home = json!({ "kind": "home", "name": "Home", "lat": 30.3, "lng": -97.7, "address": "1 Elm St" });
        let first = make(&workspace, &PLACE, home.clone()).unwrap();
        assert!(make(&workspace, &PLACE, home.clone()).is_err());

        // Once the first is deleted there is room for another, and then the first cannot come back.
        let uri = first["uri"].as_str().unwrap();
        workspace.write(|ctx| rows::delete(ctx, uri)).unwrap();
        make(&workspace, &PLACE, home).unwrap();
        assert!(workspace.write(|ctx| rows::restore(ctx, uri)).is_err());
    }

    #[test]
    fn a_query_filters_by_kind_time_place_and_link() {
        let workspace = Workspace::in_memory();
        let market = make(
            &workspace,
            &PLACE,
            json!({ "kind": "venue", "name": "Market" }),
        )
        .unwrap();
        let market_uri = market["uri"].as_str().unwrap();
        let at_market = json!([{ "uri": market_uri, "relation": "at", "label": "Market" }]);
        let about_market = json!([{ "uri": market_uri, "relation": "about", "label": "Market" }]);

        for input in [
            json!({ "kind": "todo", "title": "early", "due": "2026-09-30" }),
            json!({ "kind": "todo", "title": "inside", "due": "2026-10-02", "links": at_market }),
            json!({ "kind": "reminder", "title": "timed", "at": "2026-10-03T09:00:00Z", "links": about_market }),
            json!({ "kind": "todo", "title": "late", "due": "2026-10-09" }),
            json!({ "kind": "todo", "title": "undated" }),
        ] {
            make(&workspace, &TASK, input).unwrap();
        }
        let find = |filter: Value| -> Vec<Value> {
            let filter: Query = serde_json::from_value(filter).unwrap();
            workspace.read(|conn| query(conn, &TASK, &filter)).unwrap()
        };

        assert_eq!(find(json!({})).len(), 5);
        assert_eq!(titles(&find(json!({ "kinds": ["reminder"] }))), ["timed"]);
        assert!(find(json!({ "kinds": [] })).is_empty());
        assert_eq!(
            titles(&find(
                json!({ "from": "2026-10-01", "to": "2026-10-03T23:59:59Z" })
            )),
            ["inside", "timed"]
        );
        assert_eq!(titles(&find(json!({ "to": "2026-09-30" }))), ["early"]);
        assert_eq!(titles(&find(json!({ "place": market_uri }))), ["inside"]);
        assert_eq!(
            titles(&find(json!({ "linkedTo": market_uri }))),
            ["inside", "timed"]
        );
        assert_eq!(
            titles(&find(
                json!({ "linkedTo": market_uri, "relation": "about" })
            )),
            ["timed"]
        );

        // An Event is in a range while any of it is.
        make(
            &workspace,
            &EVENT,
            json!({ "kind": "local-event", "title": "trip", "startAt": "2026-10-01", "endAt": "2026-10-05" }),
        )
        .unwrap();
        let events = |from: &str, to: &str| {
            let filter = Query {
                from: Some(from.to_string()),
                to: Some(to.to_string()),
                ..Default::default()
            };
            workspace
                .read(|conn| query(conn, &EVENT, &filter))
                .unwrap()
                .len()
        };
        assert_eq!(events("2026-10-04", "2026-10-08"), 1);
        assert_eq!(events("2026-10-06", "2026-10-08"), 0);
    }

    #[test]
    fn a_row_is_found_by_its_uri_and_takes_a_snapshot() {
        let workspace = Workspace::in_memory();
        let event = make(
            &workspace,
            &EVENT,
            json!({ "kind": "local-event", "title": "Market day", "startAt": "2026-10-03" }),
        )
        .unwrap();
        let uri = event["uri"].as_str().unwrap();

        let essentials = json!({ "title": "Market day", "placeName": "Market" });
        let snapped = workspace
            .write(|ctx| rows::snapshot(ctx, uri, &essentials))
            .unwrap();
        assert_eq!(snapped["snapshot"], essentials);
        assert!(snapped["updatedAt"].as_str() > event["updatedAt"].as_str());
        assert_eq!(
            workspace.read(|conn| rows::get(conn, uri)).unwrap(),
            Some(snapped)
        );

        let source = format!("eden://calendar-source/{LOCAL_CALENDAR_SOURCE}");
        let found = workspace
            .read(|conn| rows::get(conn, &source))
            .unwrap()
            .unwrap();
        assert_eq!(found["payload"], json!({ "kind": "local" }));
        let missing = format!("eden://task/{}", ids::new_id());
        assert_eq!(
            workspace.read(|conn| rows::get(conn, &missing)).unwrap(),
            None
        );
    }
}
