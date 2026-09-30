//! The Gardener's threads and their messages (docs/product/substrate/ai.md, "Threads"; docs/engineering/gardener.md;
//! D-76). A thread is a conversation the owner had with the Gardener: a title, the domain it was opened from, and
//! the highest tier of anything it read. A message is one turn of it, the owner's or the Gardener's, as the blocks
//! the frontend shapes and this crate never reads beyond their being an array.
//!
//! Both are rows with stamps and tombstones like any other, so they export, sync and merge. Deleting a thread
//! tombstones its live messages at the same stamp, and restoring it brings back exactly those.

use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::changes::ChangeOp;
use super::entities::json_column;
use super::hlc;
use super::ids;
use super::text::{text_column, text_enum};
use super::WriteCtx;
use crate::error::{EdenError, Result};

const THREAD_TYPE: &str = "thread";
const MESSAGE_TYPE: &str = "message";
/// The fields a thread patch may name.
const PATCHABLE: &[&str] = &["title", "tier", "domain"];

/// The tier of a thread: the highest tier of anything it read, `T0` until it reads something. Its text is the
/// registry's, capitals and all, so it is not a `text_enum!`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Tier {
    T0,
    T1,
    T2,
}

impl Tier {
    pub fn as_str(self) -> &'static str {
        match self {
            Tier::T0 => "T0",
            Tier::T1 => "T1",
            Tier::T2 => "T2",
        }
    }

    pub(crate) fn parse(text: &str) -> Option<Self> {
        match text {
            "T0" => Some(Tier::T0),
            "T1" => Some(Tier::T1),
            "T2" => Some(Tier::T2),
            _ => None,
        }
    }
}

text_enum! {
    /// Who wrote a message.
    Role { Owner = "owner", Gardener = "gardener" }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub uri: String,
    pub id: String,
    #[serde(default)]
    pub domain: Option<String>,
    pub title: String,
    pub tier: Tier,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadInput {
    /// A ULID the caller made; one is made when it is left out.
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub domain: Option<String>,
    pub title: String,
    #[serde(default)]
    pub tier: Option<Tier>,
}

/// A patch is a JSON object: a value sets a field, `null` clears `domain`, an absent field is left as it is.
pub type ThreadPatch = Map<String, Value>;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadQuery {
    pub domain: Option<String>,
    #[serde(default)]
    pub include_deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub uri: String,
    pub id: String,
    pub thread_id: String,
    pub role: Role,
    pub blocks: Value,
    /// The audit entry of the request that produced a Gardener's message.
    #[serde(default)]
    pub request_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageInput {
    #[serde(default)]
    pub id: Option<String>,
    pub thread_id: String,
    pub role: Role,
    pub blocks: Value,
    #[serde(default)]
    pub request_id: Option<String>,
}

const THREAD_COLUMNS: &str = "id, domain, title, tier, created_at, updated_at, deleted_at";
const MESSAGE_COLUMNS: &str =
    "id, thread_id, role, blocks, request_id, created_at, updated_at, deleted_at";

fn refused(detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("thread:invalid: {detail}"))
}

fn thread_from_row(row: &Row<'_>) -> rusqlite::Result<Thread> {
    let id: String = row.get(0)?;
    Ok(Thread {
        uri: ids::Uri::new(THREAD_TYPE, &id).to_string(),
        id,
        domain: row.get(1)?,
        title: row.get(2)?,
        tier: text_column(row, 3, Tier::parse)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        deleted_at: row.get(6)?,
    })
}

fn message_from_row(row: &Row<'_>) -> rusqlite::Result<Message> {
    let id: String = row.get(0)?;
    Ok(Message {
        uri: ids::Uri::new(MESSAGE_TYPE, &id).to_string(),
        id,
        thread_id: row.get(1)?,
        role: text_column(row, 2, Role::parse)?,
        blocks: json_column(row, 3)?.unwrap_or(Value::Array(Vec::new())),
        request_id: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        deleted_at: row.get(7)?,
    })
}

fn check_domain(domain: Option<&str>) -> Result<()> {
    match domain {
        Some(domain) if !ids::is_resource_id(domain) => {
            Err(refused(format!("not a domain: {domain:?}")))
        }
        _ => Ok(()),
    }
}

fn check_blocks(blocks: &Value) -> Result<()> {
    if blocks.is_array() {
        Ok(())
    } else {
        Err(refused("the blocks of a message are an array"))
    }
}

fn check_request_id(request_id: Option<&str>) -> Result<()> {
    match request_id {
        Some(request_id) if !ids::is_ulid(request_id) => {
            Err(refused(format!("not a request id: {request_id:?}")))
        }
        _ => Ok(()),
    }
}

fn stamps_ok(created_at: &str, updated_at: &str, deleted_at: Option<&str>) -> bool {
    hlc::Hlc::parse(created_at).is_ok()
        && hlc::Hlc::parse(updated_at).is_ok()
        && deleted_at.is_none_or(|deleted| deleted == updated_at)
}

// Threads.

/// One thread by id, deleted or not.
pub fn get_thread(conn: &Connection, id: &str) -> Result<Option<Thread>> {
    Ok(conn
        .query_row(
            &format!("SELECT {THREAD_COLUMNS} FROM threads WHERE id = ?1"),
            [id],
            thread_from_row,
        )
        .optional()?)
}

fn require_thread(conn: &Connection, id: &str) -> Result<Thread> {
    get_thread(conn, id)?.ok_or_else(|| EdenError::NotFound(format!("thread {id}")))
}

pub fn create_thread(ctx: &mut WriteCtx, input: ThreadInput) -> Result<Thread> {
    check_domain(input.domain.as_deref())?;
    let conn = ctx.conn;
    let id = ids::id_or_new(input.id)?;
    if get_thread(conn, &id)?.is_some() {
        return Err(refused(format!("the id is taken: {id}")));
    }
    let stamp = hlc::next(conn)?;
    conn.execute(
        "INSERT INTO threads (id, domain, title, tier, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        rusqlite::params![
            id,
            input.domain,
            input.title,
            input.tier.unwrap_or(Tier::T0).as_str(),
            stamp
        ],
    )?;
    let thread = require_thread(conn, &id)?;
    ctx.record(&thread.uri, ChangeOp::Created);
    Ok(thread)
}

/// Edits a live thread in place: its `title`, its `tier` and its `domain`.
pub fn update_thread(ctx: &mut WriteCtx, id: &str, patch: &ThreadPatch) -> Result<Thread> {
    let conn = ctx.conn;
    let before = require_thread(conn, id)?;
    if before.deleted_at.is_some() {
        return Err(EdenError::NotFound(format!("thread {id}")));
    }
    if let Some(key) = patch.keys().find(|key| !PATCHABLE.contains(&key.as_str())) {
        return Err(refused(format!("not a field of a thread: {key}")));
    }
    let mut after = before.clone();
    match patch.get("title") {
        None => {}
        Some(Value::String(title)) => after.title = title.clone(),
        Some(_) => return Err(refused("a title is text")),
    }
    match patch.get("tier") {
        None => {}
        Some(Value::String(tier)) => {
            after.tier =
                Tier::parse(tier).ok_or_else(|| refused(format!("not a tier: {tier:?}")))?;
        }
        Some(_) => return Err(refused("a tier is text")),
    }
    match patch.get("domain") {
        None => {}
        Some(Value::Null) => after.domain = None,
        Some(Value::String(domain)) => after.domain = Some(domain.clone()),
        Some(_) => return Err(refused("a domain is text")),
    }
    check_domain(after.domain.as_deref())?;

    let stamp = hlc::next(conn)?;
    conn.execute(
        "UPDATE threads SET title = ?1, tier = ?2, domain = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![after.title, after.tier.as_str(), after.domain, stamp, id],
    )?;
    let thread = require_thread(conn, id)?;
    ctx.record(&thread.uri, ChangeOp::Updated);
    Ok(thread)
}

/// Deletes a thread and its live messages at one stamp: readers stop seeing them at once, and the rows stay as
/// tombstones so an undo can bring them back together. Deleting a deleted thread changes nothing.
pub fn delete_thread(ctx: &mut WriteCtx, id: &str) -> Result<Thread> {
    let conn = ctx.conn;
    let thread = require_thread(conn, id)?;
    if thread.deleted_at.is_some() {
        return Ok(thread);
    }
    let stamp = hlc::next(conn)?;
    let messages: Vec<String> = conn
        .prepare("SELECT id FROM messages WHERE thread_id = ?1 AND deleted_at IS NULL")?
        .query_map([id], |row| row.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    conn.execute(
        "UPDATE messages SET updated_at = ?1, deleted_at = ?1 WHERE thread_id = ?2 AND deleted_at IS NULL",
        [&stamp, id],
    )?;
    conn.execute(
        "UPDATE threads SET updated_at = ?1, deleted_at = ?1 WHERE id = ?2",
        [&stamp, id],
    )?;
    for message_id in &messages {
        ctx.record(
            &ids::Uri::new(MESSAGE_TYPE, message_id).to_string(),
            ChangeOp::Deleted,
        );
    }
    ctx.record(&thread.uri, ChangeOp::Deleted);
    Ok(Thread {
        updated_at: stamp.clone(),
        deleted_at: Some(stamp),
        ..thread
    })
}

/// Lifts a thread's tombstone, and those of the messages deleted with it: what an undo of a delete calls.
/// Restoring a live thread changes nothing.
pub fn restore_thread(ctx: &mut WriteCtx, id: &str) -> Result<Thread> {
    let conn = ctx.conn;
    let thread = require_thread(conn, id)?;
    let Some(deleted_at) = thread.deleted_at.clone() else {
        return Ok(thread);
    };
    let stamp = hlc::next(conn)?;
    let messages: Vec<String> = conn
        .prepare("SELECT id FROM messages WHERE thread_id = ?1 AND deleted_at = ?2")?
        .query_map([id, deleted_at.as_str()], |row| row.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    conn.execute(
        "UPDATE messages SET updated_at = ?1, deleted_at = NULL WHERE thread_id = ?2 AND deleted_at = ?3",
        [&stamp, id, &deleted_at],
    )?;
    conn.execute(
        "UPDATE threads SET updated_at = ?1, deleted_at = NULL WHERE id = ?2",
        [&stamp, id],
    )?;
    for message_id in &messages {
        ctx.record(
            &ids::Uri::new(MESSAGE_TYPE, message_id).to_string(),
            ChangeOp::Restored,
        );
    }
    ctx.record(&thread.uri, ChangeOp::Restored);
    Ok(Thread {
        updated_at: stamp,
        deleted_at: None,
        ..thread
    })
}

/// The threads, the latest touched first: of one domain if asked, live unless the query asks for the deleted too.
pub fn query_threads(conn: &Connection, filter: &ThreadQuery) -> Result<Vec<Thread>> {
    let mut clauses = vec!["1".to_string()];
    let mut params: Vec<String> = Vec::new();
    if let Some(domain) = &filter.domain {
        params.push(domain.clone());
        clauses.push(format!("domain = ?{}", params.len()));
    }
    if !filter.include_deleted {
        clauses.push("deleted_at IS NULL".to_string());
    }
    let sql = format!(
        "SELECT {THREAD_COLUMNS} FROM threads WHERE {} ORDER BY updated_at DESC, id DESC",
        clauses.join(" AND ")
    );
    Ok(conn
        .prepare(&sql)?
        .query_map(rusqlite::params_from_iter(params), thread_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

// Messages.

/// One message by id, deleted or not.
pub fn get_message(conn: &Connection, id: &str) -> Result<Option<Message>> {
    Ok(conn
        .query_row(
            &format!("SELECT {MESSAGE_COLUMNS} FROM messages WHERE id = ?1"),
            [id],
            message_from_row,
        )
        .optional()?)
}

fn require_message(conn: &Connection, id: &str) -> Result<Message> {
    get_message(conn, id)?.ok_or_else(|| EdenError::NotFound(format!("message {id}")))
}

/// Appends a message to a live thread, which is touched so it surfaces first. A missing or deleted thread refuses
/// the message.
pub fn append_message(ctx: &mut WriteCtx, input: MessageInput) -> Result<Message> {
    check_blocks(&input.blocks)?;
    check_request_id(input.request_id.as_deref())?;
    let conn = ctx.conn;
    let thread = match get_thread(conn, &input.thread_id)? {
        Some(thread) if thread.deleted_at.is_none() => thread,
        _ => {
            return Err(refused(format!(
                "no live thread by the id {}",
                input.thread_id
            )))
        }
    };
    let id = ids::id_or_new(input.id)?;
    if get_message(conn, &id)?.is_some() {
        return Err(refused(format!("the id is taken: {id}")));
    }
    let stamp = hlc::next(conn)?;
    conn.execute(
        "INSERT INTO messages (id, thread_id, role, blocks, request_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        rusqlite::params![
            id,
            input.thread_id,
            input.role.as_str(),
            input.blocks.to_string(),
            input.request_id,
            stamp
        ],
    )?;
    conn.execute(
        "UPDATE threads SET updated_at = ?1 WHERE id = ?2",
        [&stamp, &thread.id],
    )?;
    let message = require_message(conn, &id)?;
    ctx.record(&message.uri, ChangeOp::Created);
    ctx.record(&thread.uri, ChangeOp::Updated);
    Ok(message)
}

/// Replaces the blocks of a live message whole, under a new stamp.
pub fn update_message(ctx: &mut WriteCtx, id: &str, blocks: Value) -> Result<Message> {
    check_blocks(&blocks)?;
    let conn = ctx.conn;
    let before = require_message(conn, id)?;
    if before.deleted_at.is_some() {
        return Err(EdenError::NotFound(format!("message {id}")));
    }
    let stamp = hlc::next(conn)?;
    conn.execute(
        "UPDATE messages SET blocks = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![blocks.to_string(), stamp, id],
    )?;
    let message = require_message(conn, id)?;
    ctx.record(&message.uri, ChangeOp::Updated);
    Ok(message)
}

/// Deletes one message of a thread. Deleting a deleted message changes nothing. No command calls it yet: the
/// contract deletes threads whole.
#[cfg_attr(not(test), allow(dead_code))]
pub fn delete_message(ctx: &mut WriteCtx, id: &str) -> Result<Message> {
    let conn = ctx.conn;
    let message = require_message(conn, id)?;
    if message.deleted_at.is_some() {
        return Ok(message);
    }
    let stamp = hlc::next(conn)?;
    conn.execute(
        "UPDATE messages SET updated_at = ?1, deleted_at = ?1 WHERE id = ?2",
        [&stamp, id],
    )?;
    ctx.record(&message.uri, ChangeOp::Deleted);
    Ok(Message {
        updated_at: stamp.clone(),
        deleted_at: Some(stamp),
        ..message
    })
}

/// The live messages of a thread in the order they were made: ids sort by time.
pub fn query_messages(conn: &Connection, thread_id: &str) -> Result<Vec<Message>> {
    Ok(conn
        .prepare(&format!(
            "SELECT {MESSAGE_COLUMNS} FROM messages WHERE thread_id = ?1 AND deleted_at IS NULL ORDER BY id"
        ))?
        .query_map([thread_id], message_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

// What the bundle needs.

/// Every thread, by id, tombstones included: a merge needs them.
pub(crate) fn exportable_threads(conn: &Connection) -> Result<Vec<Thread>> {
    Ok(conn
        .prepare(&format!("SELECT {THREAD_COLUMNS} FROM threads ORDER BY id"))?
        .query_map([], thread_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Every message, by id, tombstones included.
pub(crate) fn exportable_messages(conn: &Connection) -> Result<Vec<Message>> {
    Ok(conn
        .prepare(&format!(
            "SELECT {MESSAGE_COLUMNS} FROM messages ORDER BY id"
        ))?
        .query_map([], message_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

/// A tombstone as it leaves: its id, its tier and its stamps, and no title.
pub(crate) fn stripped_thread(thread: &Thread) -> Thread {
    Thread {
        title: String::new(),
        domain: None,
        ..thread.clone()
    }
}

/// A tombstone as it leaves: its id, its thread, its role and its stamps, and no blocks.
pub(crate) fn stripped_message(message: &Message) -> Message {
    Message {
        blocks: Value::Array(Vec::new()),
        request_id: None,
        ..message.clone()
    }
}

pub(crate) fn validate_imported_thread(thread: &Thread) -> std::result::Result<(), String> {
    if !ids::is_ulid(&thread.id) {
        return Err(format!("not an id: {:?}", thread.id));
    }
    if thread.uri != ids::Uri::new(THREAD_TYPE, &thread.id).to_string() {
        return Err(format!(
            "a URI that is not the thread's own: {}",
            thread.uri
        ));
    }
    check_domain(thread.domain.as_deref()).map_err(|e| format!("{}: {e}", thread.id))?;
    if !stamps_ok(
        &thread.created_at,
        &thread.updated_at,
        thread.deleted_at.as_deref(),
    ) {
        return Err(format!("stamps that cannot be read on {}", thread.id));
    }
    Ok(())
}

pub(crate) fn validate_imported_message(message: &Message) -> std::result::Result<(), String> {
    if !ids::is_ulid(&message.id) {
        return Err(format!("not an id: {:?}", message.id));
    }
    if message.uri != ids::Uri::new(MESSAGE_TYPE, &message.id).to_string() {
        return Err(format!(
            "a URI that is not the message's own: {}",
            message.uri
        ));
    }
    if !ids::is_ulid(&message.thread_id) {
        return Err(format!("{} is of no thread", message.id));
    }
    check_blocks(&message.blocks).map_err(|e| format!("{}: {e}", message.id))?;
    check_request_id(message.request_id.as_deref()).map_err(|e| format!("{}: {e}", message.id))?;
    if !stamps_ok(
        &message.created_at,
        &message.updated_at,
        message.deleted_at.as_deref(),
    ) {
        return Err(format!("stamps that cannot be read on {}", message.id));
    }
    Ok(())
}

/// Writes a thread as it is, stamps and all.
pub(crate) fn put_thread(conn: &Connection, thread: &Thread) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO threads (id, domain, title, tier, created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            thread.id,
            thread.domain,
            thread.title,
            thread.tier.as_str(),
            thread.created_at,
            thread.updated_at,
            thread.deleted_at,
        ],
    )?;
    Ok(())
}

/// Writes a message as it is, stamps and all.
pub(crate) fn put_message(conn: &Connection, message: &Message) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO messages (id, thread_id, role, blocks, request_id, created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            message.id,
            message.thread_id,
            message.role.as_str(),
            message.blocks.to_string(),
            message.request_id,
            message.created_at,
            message.updated_at,
            message.deleted_at,
        ],
    )?;
    Ok(())
}

/// What a replace clears: every thread and every message.
pub(crate) fn clear(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM messages", [])?;
    conn.execute("DELETE FROM threads", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::substrate::Workspace;

    fn thread(title: &str, domain: Option<&str>) -> ThreadInput {
        ThreadInput {
            id: None,
            domain: domain.map(str::to_string),
            title: title.into(),
            tier: None,
        }
    }

    fn message(thread_id: &str, role: Role, text: &str) -> MessageInput {
        MessageInput {
            id: None,
            thread_id: thread_id.into(),
            role,
            blocks: json!([{ "type": "text", "text": text }]),
            request_id: None,
        }
    }

    fn code<T: std::fmt::Debug>(result: Result<T>) -> String {
        let message = result.expect_err("refused").to_string();
        message.split(": ").next().unwrap().to_string()
    }

    fn patch(fields: Value) -> ThreadPatch {
        fields.as_object().unwrap().clone()
    }

    fn live(ws: &Workspace) -> Vec<Thread> {
        ws.read(|conn| query_threads(conn, &ThreadQuery::default()))
            .unwrap()
    }

    #[test]
    fn a_thread_is_opened_edited_and_listed_latest_first() {
        let ws = Workspace::in_memory();
        let first = ws
            .write(|ctx| create_thread(ctx, thread("Dinner", Some("kitchen"))))
            .unwrap();
        assert_eq!(first.uri, format!("eden://thread/{}", first.id));
        assert_eq!(first.tier, Tier::T0);
        assert_eq!(first.created_at, first.updated_at);
        let second = ws
            .write(|ctx| create_thread(ctx, thread("Untitled", None)))
            .unwrap();
        assert_eq!(live(&ws), vec![second.clone(), first.clone()]);

        let edited = ws
            .write(|ctx| {
                update_thread(
                    ctx,
                    &first.id,
                    &patch(json!({ "title": "Dinner plan", "tier": "T1", "domain": null })),
                )
            })
            .unwrap();
        assert_eq!(edited.title, "Dinner plan");
        assert_eq!(edited.tier, Tier::T1);
        assert_eq!(edited.domain, None);
        assert!(edited.updated_at > second.updated_at);
        assert_eq!(live(&ws), vec![edited.clone(), second.clone()]);
        let of_kitchen = ws
            .read(|conn| {
                query_threads(
                    conn,
                    &ThreadQuery {
                        domain: Some("kitchen".into()),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        assert!(of_kitchen.is_empty());

        for bad in [
            json!({ "tier": "T3" }),
            json!({ "domain": "Kitchen" }),
            json!({ "title": 3 }),
            json!({ "colour": "green" }),
        ] {
            assert_eq!(
                code(ws.write(|ctx| update_thread(ctx, &first.id, &patch(bad)))),
                "thread:invalid"
            );
        }
        assert_eq!(
            code(ws.write(|ctx| create_thread(ctx, thread("x", Some("a.b"))))),
            "thread:invalid"
        );
    }

    #[test]
    fn messages_are_appended_in_order_and_refused_without_a_live_thread() {
        let ws = Workspace::in_memory();
        let opened = ws
            .write(|ctx| create_thread(ctx, thread("Dinner", None)))
            .unwrap();
        let (asked, answered) = ws
            .write(|ctx| {
                let asked =
                    append_message(ctx, message(&opened.id, Role::Owner, "What is for dinner?"))?;
                let answered = append_message(
                    ctx,
                    MessageInput {
                        request_id: Some(ids::new_id()),
                        ..message(&opened.id, Role::Gardener, "Dal.")
                    },
                )?;
                Ok((asked, answered))
            })
            .unwrap();
        assert_eq!(asked.uri, format!("eden://message/{}", asked.id));
        assert!(answered.request_id.is_some());
        assert_eq!(
            ws.read(|conn| query_messages(conn, &opened.id)).unwrap(),
            vec![asked.clone(), answered.clone()]
        );
        // The thread was touched by the messages.
        assert!(live(&ws)[0].updated_at > opened.updated_at);

        let edited = ws
            .write(|ctx| {
                update_message(
                    ctx,
                    &answered.id,
                    json!([{ "type": "text", "text": "Dal tadka." }]),
                )
            })
            .unwrap();
        assert_eq!(edited.blocks[0]["text"], "Dal tadka.");
        assert!(edited.updated_at > answered.updated_at);

        for bad in [
            message(&ids::new_id(), Role::Owner, "x"),
            MessageInput {
                blocks: json!({ "type": "text" }),
                ..message(&opened.id, Role::Owner, "x")
            },
            MessageInput {
                request_id: Some("req-1".into()),
                ..message(&opened.id, Role::Gardener, "x")
            },
        ] {
            assert_eq!(
                code(ws.write(|ctx| append_message(ctx, bad))),
                "thread:invalid"
            );
        }
        assert_eq!(
            code(ws.write(|ctx| update_message(ctx, &asked.id, json!("text")))),
            "thread:invalid"
        );
        assert!(matches!(
            ws.write(|ctx| update_message(ctx, &ids::new_id(), json!([]))),
            Err(EdenError::NotFound(_))
        ));
    }

    #[test]
    fn a_deleted_thread_takes_its_messages_and_a_restore_brings_them_back() {
        let ws = Workspace::in_memory();
        let opened = ws
            .write(|ctx| create_thread(ctx, thread("Dinner", None)))
            .unwrap();
        let (kept, gone) = ws
            .write(|ctx| {
                let first = append_message(ctx, message(&opened.id, Role::Owner, "one"))?;
                let second = append_message(ctx, message(&opened.id, Role::Gardener, "two"))?;
                delete_message(ctx, &second.id)?;
                Ok((first, second))
            })
            .unwrap();

        let deleted = ws.write(|ctx| delete_thread(ctx, &opened.id)).unwrap();
        assert_eq!(deleted.deleted_at, Some(deleted.updated_at.clone()));
        assert!(live(&ws).is_empty());
        assert!(ws
            .read(|conn| query_messages(conn, &opened.id))
            .unwrap()
            .is_empty());
        let stamped = ws
            .read(|conn| get_message(conn, &kept.id))
            .unwrap()
            .unwrap();
        assert_eq!(stamped.deleted_at, Some(deleted.updated_at.clone()));
        assert_eq!(
            ws.write(|ctx| delete_thread(ctx, &opened.id)).unwrap(),
            deleted
        );
        assert_eq!(
            code(ws.write(|ctx| append_message(ctx, message(&opened.id, Role::Owner, "x")))),
            "thread:invalid"
        );
        assert!(matches!(
            ws.write(|ctx| update_thread(ctx, &opened.id, &patch(json!({ "title": "x" })))),
            Err(EdenError::NotFound(_))
        ));

        let restored = ws.write(|ctx| restore_thread(ctx, &opened.id)).unwrap();
        assert!(restored.updated_at > deleted.updated_at);
        assert_eq!(restored.deleted_at, None);
        assert_eq!(live(&ws), vec![restored.clone()]);
        // The message deleted with the thread is back; the one deleted before stays gone.
        let back = ws.read(|conn| query_messages(conn, &opened.id)).unwrap();
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].id, kept.id);
        assert_eq!(back[0].updated_at, restored.updated_at);
        assert!(ws
            .read(|conn| get_message(conn, &gone.id))
            .unwrap()
            .unwrap()
            .deleted_at
            .is_some());
        assert_eq!(
            ws.write(|ctx| restore_thread(ctx, &opened.id)).unwrap(),
            restored
        );
        assert!(matches!(
            ws.write(|ctx| delete_thread(ctx, &ids::new_id())),
            Err(EdenError::NotFound(_))
        ));
    }

    #[test]
    fn a_tombstone_leaves_stripped_and_is_taken_back() {
        let ws = Workspace::in_memory();
        let (thread, message) = ws
            .write(|ctx| {
                let opened = create_thread(ctx, thread("Secret dinner", Some("kitchen")))?;
                let message = append_message(ctx, message(&opened.id, Role::Owner, "the words"))?;
                let thread = delete_thread(ctx, &opened.id)?;
                let message = get_message(ctx.conn, &message.id)?.unwrap();
                Ok((thread, message))
            })
            .unwrap();
        let gone = stripped_thread(&thread);
        assert_eq!(gone.title, "");
        assert_eq!(gone.domain, None);
        assert_eq!(validate_imported_thread(&gone), Ok(()));
        let gone = stripped_message(&message);
        assert_eq!(gone.blocks, json!([]));
        assert_eq!(validate_imported_message(&gone), Ok(()));

        assert!(validate_imported_thread(&Thread {
            uri: "eden://fact/x".into(),
            ..thread.clone()
        })
        .is_err());
        assert!(validate_imported_thread(&Thread {
            deleted_at: Some("0000000000000002-00000000-00000001".into()),
            ..thread.clone()
        })
        .is_err());
        assert!(validate_imported_message(&Message {
            blocks: json!({}),
            ..message.clone()
        })
        .is_err());
        assert!(validate_imported_message(&Message {
            thread_id: "t-1".into(),
            ..message.clone()
        })
        .is_err());
    }
}
