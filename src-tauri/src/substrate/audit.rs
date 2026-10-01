//! The Gardener's audit log (docs/product/substrate/ai.md, "Audit"; docs/engineering/gardener.md; D-76). One entry
//! per request to a model, written by the frontend once the request has ended however it ended: which surface asked,
//! what was read and under which grants, which tools ran, what it cost in tokens and dollars, and the outcome. The
//! log is what "What Eden sent" shows and what the budgets are summed from.
//!
//! The entries are this device's: never exported, never synced, never cleared by a replace, and swept past ninety
//! days when the workspace opens. Nothing here holds the words that were sent or came back, only their shape.

use std::collections::BTreeMap;

use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

use super::entities::json_column;
use super::grants::Access;
use super::ids;
use super::text::{text_column, text_enum};
use super::usage;
use crate::error::{EdenError, Result};

/// How long an entry is kept.
pub const RETENTION_DAYS: u64 = 90;
const DEFAULT_LIMIT: u32 = 200;
const MAX_LIMIT: u32 = 1000;
/// A page of the log's table (D-114).
const DEFAULT_PAGE: u32 = 50;
const MAX_PAGE: u32 = 200;

text_enum! {
    /// How a request ended.
    Outcome {
        Ok = "ok",
        Refusal = "refusal",
        MaxTokens = "max-tokens",
        Error = "error",
        Cancelled = "cancelled",
        Declined = "declined",
        Budget = "budget",
        Interrupted = "interrupted",
    }
}

text_enum! {
    /// How much model a request was given (docs/product/substrate/ai.md, "Model grades").
    Grade { Light = "light", Standard = "standard", Deep = "deep" }
}

text_enum! {
    /// Where the grade came from when it was not the map's own.
    GradeSource { ToolOverride = "tool-override", DomainOverride = "domain-override", Map = "map" }
}

/// What a request was, told from its surface and its caller: a turn of a conversation, a tool a conversation
/// ran, or a tool a page ran with no conversation (D-86).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SurfaceKind {
    Conversation,
    Tool,
    Page,
}

/// The column a page of the log is sorted by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AuditOrder {
    At,
    Tool,
    Grade,
    Model,
    TokensIn,
    TokensOut,
    Cost,
    Outcome,
}

/// A request's kind, in SQL, over `audit_entries`.
pub(crate) const KIND_SQL: &str = "CASE WHEN surface <> 'delegated' THEN 'conversation' \
                                   WHEN parent_request_id IS NOT NULL THEN 'tool' ELSE 'page' END";
/// A request's tool as the filters name it: its owner, a dot, its id.
const TOOL_SQL: &str = "(COALESCE(domain, 'substrate') || '.' || tool)";

impl SurfaceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Conversation => "conversation",
            Self::Tool => "tool",
            Self::Page => "page",
        }
    }

    pub(crate) fn of(surface: &str, parent_request_id: Option<&str>) -> Self {
        if surface != "delegated" {
            Self::Conversation
        } else if parent_request_id.is_some() {
            Self::Tool
        } else {
            Self::Page
        }
    }
}

text_enum! {
    /// What the owner did at a confirm sheet.
    ConfirmOutcome { Confirmed = "confirmed", Cancelled = "cancelled" }
}

/// One declared read: a registry id, how many rows it matched, and which.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditRead {
    pub id: String,
    pub count: u64,
    pub rows: Vec<String>,
}

/// One tool the request ran, with its access and, for a write, what the owner said.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditTool {
    pub id: String,
    pub access: Access,
    #[serde(default)]
    pub confirm: Option<ConfirmOutcome>,
}

/// An image that went with the request: its hash and size, never its bytes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditImage {
    pub hash: String,
    pub width: u32,
    pub height: u32,
}

/// A file the owner attached to their message, as the request sent it: its hash, type and size, and an image's
/// dimensions, never its bytes (D-83).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditAttachment {
    pub hash: String,
    pub mime: String,
    pub size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: String,
    /// When the request was made, in milliseconds since the epoch.
    pub at: u64,
    pub surface: String,
    pub thread_id: Option<String>,
    pub parent_request_id: Option<String>,
    pub tool: Option<String>,
    pub domain: Option<String>,
    pub declared_grade: Option<Grade>,
    pub grade: Option<Grade>,
    pub source: Option<GradeSource>,
    pub provider: String,
    pub model: String,
    pub reads: Vec<AuditRead>,
    pub entities: Vec<String>,
    pub tools: Vec<AuditTool>,
    pub confirm_outcome: Option<ConfirmOutcome>,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub cache_read: u64,
    pub cost_usd: f64,
    pub outcome: Outcome,
    pub grants: Vec<String>,
    pub image: Option<AuditImage>,
    pub attachments: Vec<AuditAttachment>,
    /// The tokens the provider wrote to its cache, priced at their own rate (D-116).
    pub cache_write: u64,
}

/// An entry as the frontend records it: the same fields, the id optional.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntryInput {
    /// A ULID the caller made (the request's id); one is made when it is left out.
    #[serde(default)]
    pub id: Option<String>,
    pub at: u64,
    pub surface: String,
    #[serde(default)]
    pub thread_id: Option<String>,
    #[serde(default)]
    pub parent_request_id: Option<String>,
    #[serde(default)]
    pub tool: Option<String>,
    #[serde(default)]
    pub domain: Option<String>,
    #[serde(default)]
    pub declared_grade: Option<Grade>,
    #[serde(default)]
    pub grade: Option<Grade>,
    #[serde(default)]
    pub source: Option<GradeSource>,
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub reads: Vec<AuditRead>,
    #[serde(default)]
    pub entities: Vec<String>,
    #[serde(default)]
    pub tools: Vec<AuditTool>,
    #[serde(default)]
    pub confirm_outcome: Option<ConfirmOutcome>,
    #[serde(default)]
    pub tokens_in: u64,
    #[serde(default)]
    pub tokens_out: u64,
    #[serde(default)]
    pub cache_read: u64,
    #[serde(default)]
    pub cost_usd: f64,
    pub outcome: Outcome,
    #[serde(default)]
    pub grants: Vec<String>,
    #[serde(default)]
    pub image: Option<AuditImage>,
    #[serde(default)]
    pub attachments: Vec<AuditAttachment>,
    #[serde(default)]
    pub cache_write: u64,
    /// The owner's day the request was made on, `YYYY-MM-DD`, for the usage rollup (D-115); the device's own day
    /// of `at` when it is left out.
    #[serde(default)]
    pub day: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditQuery {
    pub thread_id: Option<String>,
    /// The earliest `at`, inclusive.
    pub from_ms: Option<u64>,
    /// The latest `at`, inclusive.
    pub to_ms: Option<u64>,
    pub limit: Option<u32>,
}

/// One page of the log's table: what to keep, how to sort it, and which rows of the result (D-114).
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AuditPageQuery {
    pub thread_id: Option<String>,
    /// The earliest `at`, inclusive.
    pub from_ms: Option<u64>,
    /// The latest `at`, inclusive.
    pub to_ms: Option<u64>,
    pub kinds: Vec<SurfaceKind>,
    /// Tools as `<domain or substrate>.<id>`.
    pub tools: Vec<String>,
    pub grades: Vec<Grade>,
    pub models: Vec<String>,
    pub outcomes: Vec<Outcome>,
    /// A row id: only the entries that read it.
    pub read_row: Option<String>,
    /// `at` when it is left out.
    pub order: Option<AuditOrder>,
    /// The latest, the dearest, the last of the alphabet first; so when it is left out.
    pub descending: Option<bool>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuditPage {
    pub rows: Vec<AuditEntry>,
    /// How many entries the filters keep, whatever the page.
    pub total: u64,
}

/// What the log holds that a filter may name.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditFacets {
    pub models: Vec<String>,
    /// Tools as `<domain or substrate>.<id>`.
    pub tools: Vec<String>,
}

/// What one conversation's requests came to, over the entries the log still holds.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadUsage {
    pub thread_id: String,
    pub requests: u64,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub cost_usd: f64,
    pub last_at: u64,
}

const COLUMNS: &str = "id, at, surface, thread_id, parent_request_id, tool, domain, declared_grade, grade, source, \
                       provider, model, reads, entities, tools, confirm_outcome, tokens_in, tokens_out, cache_read, \
                       cost_usd, outcome, grants, image, attachments, cache_write";

fn refused(detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("audit:invalid: {detail}"))
}

fn json_list<T: serde::de::DeserializeOwned>(
    row: &Row<'_>,
    index: usize,
) -> rusqlite::Result<Vec<T>> {
    let value = json_column(row, index)?.unwrap_or(serde_json::Value::Array(Vec::new()));
    serde_json::from_value(value).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(index, rusqlite::types::Type::Text, Box::new(e))
    })
}

fn optional_text<T>(
    row: &Row<'_>,
    index: usize,
    parse: fn(&str) -> Option<T>,
) -> rusqlite::Result<Option<T>> {
    let text: Option<String> = row.get(index)?;
    match text {
        None => Ok(None),
        Some(_) => text_column(row, index, parse).map(Some),
    }
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<AuditEntry> {
    let image: Option<serde_json::Value> = json_column(row, 22)?;
    Ok(AuditEntry {
        id: row.get(0)?,
        at: row.get::<_, i64>(1)? as u64,
        surface: row.get(2)?,
        thread_id: row.get(3)?,
        parent_request_id: row.get(4)?,
        tool: row.get(5)?,
        domain: row.get(6)?,
        declared_grade: optional_text(row, 7, Grade::parse)?,
        grade: optional_text(row, 8, Grade::parse)?,
        source: optional_text(row, 9, GradeSource::parse)?,
        provider: row.get(10)?,
        model: row.get(11)?,
        reads: json_list(row, 12)?,
        entities: json_list(row, 13)?,
        tools: json_list(row, 14)?,
        confirm_outcome: optional_text(row, 15, ConfirmOutcome::parse)?,
        tokens_in: row.get::<_, i64>(16)? as u64,
        tokens_out: row.get::<_, i64>(17)? as u64,
        cache_read: row.get::<_, i64>(18)? as u64,
        cost_usd: row.get(19)?,
        outcome: text_column(row, 20, Outcome::parse)?,
        grants: json_list(row, 21)?,
        image: image.map(serde_json::from_value).transpose().map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(22, rusqlite::types::Type::Text, Box::new(e))
        })?,
        attachments: json_list(row, 23)?,
        cache_write: row.get::<_, i64>(24)? as u64,
    })
}

/// What the log refuses: an entry with no surface, provider or model, a read or a tool with no id, a grade source
/// without a grade, a cost below nothing.
fn validate(input: &AuditEntryInput) -> Result<()> {
    for (field, value) in [
        ("surface", &input.surface),
        ("provider", &input.provider),
        ("model", &input.model),
    ] {
        if value.trim().is_empty() {
            return Err(refused(format!("an entry names its {field}")));
        }
    }
    if let Some(thread_id) = &input.thread_id {
        if !ids::is_ulid(thread_id) {
            return Err(refused(format!("not a thread id: {thread_id:?}")));
        }
    }
    if input
        .reads
        .iter()
        .any(|read| !ids::is_resource_id(&read.id))
    {
        return Err(refused("a read names a registry id"));
    }
    if input.tools.iter().any(|tool| tool.id.is_empty()) {
        return Err(refused("a tool has an id"));
    }
    if input.source.is_some() && input.grade.is_none() {
        return Err(refused("a grade source goes with a grade"));
    }
    if !(input.cost_usd.is_finite() && input.cost_usd >= 0.0) {
        return Err(refused("a cost is a number of dollars"));
    }
    if let Some(day) = &input.day {
        if !usage::is_day(day) {
            return Err(refused(format!("not a day: {day:?}")));
        }
    }
    Ok(())
}

/// Writes one entry, and adds it to its day's usage (D-115). An entry is never edited: what happened happened.
pub fn record(conn: &Connection, input: AuditEntryInput) -> Result<AuditEntry> {
    validate(&input)?;
    let day = input.day.clone();
    let id = ids::id_or_new(input.id)?;
    if get(conn, &id)?.is_some() {
        return Err(refused(format!("the id is taken: {id}")));
    }
    conn.execute(
        &format!(
            "INSERT INTO audit_entries ({COLUMNS})
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
                     ?21, ?22, ?23, ?24, ?25)"
        ),
        rusqlite::params![
            id,
            input.at as i64,
            input.surface,
            input.thread_id,
            input.parent_request_id,
            input.tool,
            input.domain,
            input.declared_grade.map(Grade::as_str),
            input.grade.map(Grade::as_str),
            input.source.map(GradeSource::as_str),
            input.provider,
            input.model,
            serde_json::to_string(&input.reads)?,
            serde_json::to_string(&input.entities)?,
            serde_json::to_string(&input.tools)?,
            input.confirm_outcome.map(ConfirmOutcome::as_str),
            input.tokens_in as i64,
            input.tokens_out as i64,
            input.cache_read as i64,
            input.cost_usd,
            input.outcome.as_str(),
            serde_json::to_string(&input.grants)?,
            input
                .image
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?,
            serde_json::to_string(&input.attachments)?,
            input.cache_write as i64,
        ],
    )?;
    let entry = get(conn, &id)?.ok_or_else(|| EdenError::NotFound(format!("audit entry {id}")))?;
    usage::add(conn, &entry, day.as_deref())?;
    Ok(entry)
}

/// One entry by id.
pub fn get(conn: &Connection, id: &str) -> Result<Option<AuditEntry>> {
    use rusqlite::OptionalExtension;
    Ok(conn
        .query_row(
            &format!("SELECT {COLUMNS} FROM audit_entries WHERE id = ?1"),
            [id],
            from_row,
        )
        .optional()?)
}

/// The entries, the latest first: of one thread, within a window of time, up to a limit.
pub fn query(conn: &Connection, filter: &AuditQuery) -> Result<Vec<AuditEntry>> {
    let mut clauses = vec!["1".to_string()];
    let mut params: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(thread_id) = &filter.thread_id {
        params.push(thread_id.clone().into());
        clauses.push(format!("thread_id = ?{}", params.len()));
    }
    for (column, bound) in [(">=", filter.from_ms), ("<=", filter.to_ms)] {
        if let Some(ms) = bound {
            params.push((ms as i64).into());
            clauses.push(format!("at {column} ?{}", params.len()));
        }
    }
    let limit = filter.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    params.push((limit as i64).into());
    let sql = format!(
        "SELECT {COLUMNS} FROM audit_entries WHERE {} ORDER BY at DESC, id DESC LIMIT ?{}",
        clauses.join(" AND "),
        params.len()
    );
    Ok(conn
        .prepare(&sql)?
        .query_map(rusqlite::params_from_iter(params), from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

fn marks(params: &mut Vec<rusqlite::types::Value>, values: impl Iterator<Item = String>) -> String {
    values
        .map(|value| {
            params.push(value.into());
            format!("?{}", params.len())
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// The WHERE of a page, with its parameters.
fn page_filter(filter: &AuditPageQuery) -> (String, Vec<rusqlite::types::Value>) {
    let mut clauses = vec!["1".to_string()];
    let mut params: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(thread_id) = &filter.thread_id {
        params.push(thread_id.clone().into());
        clauses.push(format!("thread_id = ?{}", params.len()));
    }
    for (column, bound) in [(">=", filter.from_ms), ("<=", filter.to_ms)] {
        if let Some(ms) = bound {
            params.push((ms as i64).into());
            clauses.push(format!("at {column} ?{}", params.len()));
        }
    }
    let words = |list: Vec<&'static str>| list.into_iter().map(str::to_string);
    let lists: [(&str, Vec<String>); 5] = [
        (
            KIND_SQL,
            words(filter.kinds.iter().map(|kind| kind.as_str()).collect()).collect(),
        ),
        (TOOL_SQL, filter.tools.clone()),
        (
            "grade",
            words(filter.grades.iter().map(|grade| grade.as_str()).collect()).collect(),
        ),
        ("model", filter.models.clone()),
        (
            "outcome",
            words(
                filter
                    .outcomes
                    .iter()
                    .map(|outcome| outcome.as_str())
                    .collect(),
            )
            .collect(),
        ),
    ];
    for (column, values) in lists {
        if !values.is_empty() {
            let marks = marks(&mut params, values.into_iter());
            clauses.push(format!("{column} IN ({marks})"));
        }
    }
    if let Some(row) = &filter.read_row {
        params.push(row.clone().into());
        clauses.push(format!(
            "EXISTS (SELECT 1 FROM json_each(audit_entries.reads) AS reads,
                                   json_each(reads.value ->> '$.rows') AS rows
                     WHERE rows.value = ?{})",
            params.len()
        ));
    }
    (clauses.join(" AND "), params)
}

/// One page of the log: filtered, sorted by one column and then by the latest, with how many entries the filters
/// keep in all. The column is one of the enum's, never a caller's word.
pub fn query_page(conn: &Connection, filter: &AuditPageQuery) -> Result<AuditPage> {
    let (clause, mut params) = page_filter(filter);
    let total: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM audit_entries WHERE {clause}"),
        rusqlite::params_from_iter(params.iter()),
        |row| row.get(0),
    )?;
    let direction = if filter.descending.unwrap_or(true) {
        "DESC"
    } else {
        "ASC"
    };
    let order = match filter.order.unwrap_or(AuditOrder::At) {
        AuditOrder::At => format!("at {direction}, id {direction}"),
        other => {
            let column = match other {
                AuditOrder::At => "at",
                AuditOrder::Tool => "tool",
                AuditOrder::Grade => {
                    "CASE grade WHEN 'light' THEN 0 WHEN 'standard' THEN 1 WHEN 'deep' THEN 2 END"
                }
                AuditOrder::Model => "model",
                AuditOrder::TokensIn => "tokens_in",
                AuditOrder::TokensOut => "tokens_out",
                AuditOrder::Cost => "cost_usd",
                AuditOrder::Outcome => "outcome",
            };
            format!("{column} {direction}, at DESC, id DESC")
        }
    };
    let limit = filter.limit.unwrap_or(DEFAULT_PAGE).clamp(1, MAX_PAGE);
    params.push((limit as i64).into());
    params.push((filter.offset.unwrap_or(0) as i64).into());
    let sql = format!(
        "SELECT {COLUMNS} FROM audit_entries WHERE {clause} ORDER BY {order} LIMIT ?{} OFFSET ?{}",
        params.len() - 1,
        params.len()
    );
    let rows = conn
        .prepare(&sql)?
        .query_map(rusqlite::params_from_iter(params), from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(AuditPage {
        rows,
        total: total as u64,
    })
}

/// The models and the tools the log holds, for the filters to offer.
pub fn facets(conn: &Connection) -> Result<AuditFacets> {
    let list = |sql: &str| -> Result<Vec<String>> {
        Ok(conn
            .prepare(sql)?
            .query_map([], |row| row.get(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?)
    };
    Ok(AuditFacets {
        models: list("SELECT DISTINCT model FROM audit_entries ORDER BY model")?,
        tools: list(&format!(
            "SELECT DISTINCT {TOOL_SQL} FROM audit_entries WHERE tool IS NOT NULL ORDER BY 1"
        ))?,
    })
}

/// What each conversation's requests came to, the tools it ran among them. A request that never left the device
/// (declined, or stopped by the budget) is not counted, as in the rollup.
pub fn thread_totals(conn: &Connection) -> Result<Vec<ThreadUsage>> {
    Ok(conn
        .prepare(
            "SELECT thread_id, COUNT(*), SUM(tokens_in), SUM(tokens_out), SUM(cost_usd), MAX(at)
             FROM audit_entries
             WHERE thread_id IS NOT NULL AND outcome NOT IN ('declined', 'budget')
             GROUP BY thread_id
             ORDER BY thread_id",
        )?
        .query_map([], |row| {
            Ok(ThreadUsage {
                thread_id: row.get(0)?,
                requests: row.get::<_, i64>(1)? as u64,
                tokens_in: row.get::<_, i64>(2)? as u64,
                tokens_out: row.get::<_, i64>(3)? as u64,
                cost_usd: row.get(4)?,
                last_at: row.get::<_, i64>(5)? as u64,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

/// How often each row was read: every id in any entry's `reads[].rows`, with the number of entries that read it.
pub fn usage(conn: &Connection) -> Result<BTreeMap<String, u64>> {
    Ok(conn
        .prepare(
            "SELECT rows.value, COUNT(DISTINCT audit_entries.id)
             FROM audit_entries,
                  json_each(audit_entries.reads) AS reads,
                  json_each(reads.value ->> '$.rows') AS rows
             WHERE rows.type = 'text'
             GROUP BY rows.value",
        )?
        .query_map([], |row| Ok((row.get(0)?, row.get::<_, i64>(1)? as u64)))?
        .collect::<rusqlite::Result<BTreeMap<_, _>>>()?)
}

/// What the requests since `from_ms` cost, in dollars.
pub fn spend_since(conn: &Connection, from_ms: u64) -> Result<f64> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(cost_usd), 0) FROM audit_entries WHERE at >= ?1",
        [from_ms as i64],
        |row| row.get(0),
    )?)
}

/// Removes the entries past their retention, counted from `now_ms`. Answers how many went.
pub(crate) fn sweep(conn: &Connection, now_ms: u64) -> Result<usize> {
    let cutoff = now_ms.saturating_sub(RETENTION_DAYS * 24 * 60 * 60 * 1000);
    Ok(conn.execute("DELETE FROM audit_entries WHERE at < ?1", [cutoff as i64])?)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::substrate::Workspace;

    const DAY_MS: u64 = 24 * 60 * 60 * 1000;

    pub(crate) fn input(at: u64, thread_id: Option<&str>, rows: &[&str]) -> AuditEntryInput {
        AuditEntryInput {
            id: None,
            at,
            surface: "thread".into(),
            thread_id: thread_id.map(str::to_string),
            parent_request_id: None,
            tool: None,
            domain: Some("kitchen".into()),
            declared_grade: Some(Grade::Standard),
            grade: Some(Grade::Light),
            source: Some(GradeSource::DomainOverride),
            provider: "anthropic".into(),
            model: "claude-haiku-4-5-20251001".into(),
            reads: vec![AuditRead {
                id: "recipe".into(),
                count: rows.len() as u64,
                rows: rows.iter().map(|row| row.to_string()).collect(),
            }],
            entities: Vec::new(),
            tools: vec![AuditTool {
                id: "kitchen.plan".into(),
                access: Access::WriteDraft,
                confirm: Some(ConfirmOutcome::Confirmed),
            }],
            confirm_outcome: Some(ConfirmOutcome::Confirmed),
            tokens_in: 1200,
            tokens_out: 80,
            cache_read: 1000,
            cost_usd: 0.0025,
            outcome: Outcome::Ok,
            grants: vec!["allergy".into()],
            image: None,
            attachments: Vec::new(),
            cache_write: 0,
            day: None,
        }
    }

    fn code(result: Result<AuditEntry>) -> String {
        let message = result.expect_err("refused").to_string();
        message.split(": ").next().unwrap().to_string()
    }

    #[test]
    fn attachments_round_trip_and_an_entry_without_them_reads_none() {
        let ws = Workspace::in_memory();
        let with = AuditEntryInput {
            attachments: vec![
                AuditAttachment {
                    hash: "abc".into(),
                    mime: "image/png".into(),
                    size: 840,
                    width: Some(4),
                    height: Some(3),
                },
                AuditAttachment {
                    hash: "def".into(),
                    mime: "application/pdf".into(),
                    size: 1200,
                    width: None,
                    height: None,
                },
            ],
            ..input(1_000, None, &[])
        };
        let sent = with.attachments.clone();
        let recorded = ws.write(|ctx| record(ctx.conn, with)).unwrap();
        assert_eq!(recorded.attachments, sent);
        assert_eq!(
            ws.read(|conn| get(conn, &recorded.id))
                .unwrap()
                .unwrap()
                .attachments,
            sent
        );

        // what the frontend sent before it knew of attachments still records, and reads as none
        let mut bare = serde_json::to_value(&recorded).unwrap();
        let fields = bare.as_object_mut().unwrap();
        fields.remove("attachments");
        fields.remove("id");
        let bare: AuditEntryInput = serde_json::from_value(bare).unwrap();
        let recorded = ws.write(|ctx| record(ctx.conn, bare)).unwrap();
        assert!(recorded.attachments.is_empty());
    }

    #[test]
    fn cache_writes_round_trip_and_an_entry_without_them_reads_none() {
        let ws = Workspace::in_memory();
        let with = AuditEntryInput {
            cache_write: 640,
            ..input(1_000, None, &[])
        };
        let recorded = ws.write(|ctx| record(ctx.conn, with)).unwrap();
        assert_eq!(recorded.cache_write, 640);

        let mut bare = serde_json::to_value(&recorded).unwrap();
        let fields = bare.as_object_mut().unwrap();
        fields.remove("cacheWrite");
        fields.remove("id");
        let bare: AuditEntryInput = serde_json::from_value(bare).unwrap();
        assert_eq!(
            ws.write(|ctx| record(ctx.conn, bare)).unwrap().cache_write,
            0
        );
    }

    /// Five entries that differ in every column a page sorts or filters by.
    fn varied(ws: &Workspace) -> (String, Vec<AuditEntry>) {
        let thread = ids::new_id();
        let chat = ids::new_id();
        let entries = ws
            .write(|ctx| {
                let a = record(
                    ctx.conn,
                    AuditEntryInput {
                        id: Some(chat.clone()),
                        surface: "global-chat".into(),
                        domain: None,
                        tokens_in: 500,
                        tokens_out: 50,
                        cost_usd: 0.05,
                        ..input(1_000, Some(&thread), &["r1"])
                    },
                )?;
                let b = record(
                    ctx.conn,
                    AuditEntryInput {
                        surface: "delegated".into(),
                        parent_request_id: Some(chat.clone()),
                        tool: Some("plan".into()),
                        grade: Some(Grade::Deep),
                        model: "claude-opus-5-5".into(),
                        tokens_in: 900,
                        tokens_out: 10,
                        cost_usd: 0.4,
                        ..input(2_000, Some(&thread), &[])
                    },
                )?;
                let c = record(
                    ctx.conn,
                    AuditEntryInput {
                        surface: "delegated".into(),
                        tool: Some("capture-haul".into()),
                        grade: Some(Grade::Standard),
                        model: "claude-sonnet-5-5".into(),
                        tokens_in: 100,
                        tokens_out: 400,
                        cost_usd: 0.2,
                        outcome: Outcome::Error,
                        ..input(3_000, None, &["r2"])
                    },
                )?;
                let d = record(
                    ctx.conn,
                    AuditEntryInput {
                        surface: "kitchen-chat".into(),
                        tokens_in: 0,
                        tokens_out: 0,
                        cost_usd: 0.0,
                        outcome: Outcome::Budget,
                        ..input(4_000, Some(&thread), &[])
                    },
                )?;
                let e = record(
                    ctx.conn,
                    AuditEntryInput {
                        surface: "delegated".into(),
                        domain: None,
                        tool: Some("find-similar".into()),
                        tokens_in: 300,
                        tokens_out: 30,
                        cost_usd: 0.01,
                        ..input(5_000, None, &[])
                    },
                )?;
                Ok(vec![a, b, c, d, e])
            })
            .unwrap();
        (thread, entries)
    }

    fn ids_of(page: &AuditPage) -> Vec<&str> {
        page.rows.iter().map(|entry| entry.id.as_str()).collect()
    }

    #[test]
    fn a_page_sorts_by_each_column_both_ways() {
        let ws = Workspace::in_memory();
        let (_, entries) = varied(&ws);
        let id = |index: usize| entries[index].id.as_str();
        let page = |order: AuditOrder, descending: bool| {
            ws.read(|conn| {
                query_page(
                    conn,
                    &AuditPageQuery {
                        order: Some(order),
                        descending: Some(descending),
                        ..Default::default()
                    },
                )
            })
            .unwrap()
        };
        let default = ws
            .read(|conn| query_page(conn, &AuditPageQuery::default()))
            .unwrap();
        assert_eq!(default.total, 5);
        assert_eq!(ids_of(&default), vec![id(4), id(3), id(2), id(1), id(0)]);
        assert_eq!(
            ids_of(&page(AuditOrder::At, false)),
            vec![id(0), id(1), id(2), id(3), id(4)]
        );
        assert_eq!(
            ids_of(&page(AuditOrder::Cost, true)),
            vec![id(1), id(2), id(0), id(4), id(3)]
        );
        assert_eq!(
            ids_of(&page(AuditOrder::Cost, false)),
            vec![id(3), id(4), id(0), id(2), id(1)]
        );
        assert_eq!(
            ids_of(&page(AuditOrder::TokensIn, true)),
            vec![id(1), id(0), id(4), id(2), id(3)]
        );
        assert_eq!(
            ids_of(&page(AuditOrder::TokensOut, true)),
            vec![id(2), id(0), id(4), id(1), id(3)]
        );
        // light before standard before deep, the latest first among equals
        assert_eq!(
            ids_of(&page(AuditOrder::Grade, false)),
            vec![id(4), id(3), id(0), id(2), id(1)]
        );
        assert_eq!(
            ids_of(&page(AuditOrder::Model, true)),
            vec![id(2), id(1), id(4), id(3), id(0)]
        );
        assert_eq!(
            ids_of(&page(AuditOrder::Outcome, false)),
            vec![id(3), id(2), id(4), id(1), id(0)]
        );
        // an entry with no tool sorts before the tools going up
        assert_eq!(
            ids_of(&page(AuditOrder::Tool, false)),
            vec![id(3), id(0), id(2), id(4), id(1)]
        );
    }

    #[test]
    fn a_page_filters_counts_and_offsets() {
        let ws = Workspace::in_memory();
        let (thread, entries) = varied(&ws);
        let id = |index: usize| entries[index].id.as_str();
        let page = |filter: AuditPageQuery| ws.read(|conn| query_page(conn, &filter)).unwrap();

        let of_thread = page(AuditPageQuery {
            thread_id: Some(thread.clone()),
            ..Default::default()
        });
        assert_eq!(ids_of(&of_thread), vec![id(3), id(1), id(0)]);
        for (kind, expected) in [
            (SurfaceKind::Conversation, vec![id(3), id(0)]),
            (SurfaceKind::Tool, vec![id(1)]),
            (SurfaceKind::Page, vec![id(4), id(2)]),
        ] {
            let kept = page(AuditPageQuery {
                kinds: vec![kind],
                ..Default::default()
            });
            assert_eq!(ids_of(&kept), expected);
        }
        let tools = page(AuditPageQuery {
            tools: vec!["kitchen.plan".into(), "substrate.find-similar".into()],
            ..Default::default()
        });
        assert_eq!(ids_of(&tools), vec![id(4), id(1)]);
        let grades = page(AuditPageQuery {
            grades: vec![Grade::Deep, Grade::Standard],
            ..Default::default()
        });
        assert_eq!(ids_of(&grades), vec![id(2), id(1)]);
        let models = page(AuditPageQuery {
            models: vec!["claude-opus-5-5".into()],
            ..Default::default()
        });
        assert_eq!(ids_of(&models), vec![id(1)]);
        let outcomes = page(AuditPageQuery {
            outcomes: vec![Outcome::Error, Outcome::Budget],
            ..Default::default()
        });
        assert_eq!(ids_of(&outcomes), vec![id(3), id(2)]);
        let read = page(AuditPageQuery {
            read_row: Some("r2".into()),
            ..Default::default()
        });
        assert_eq!(ids_of(&read), vec![id(2)]);
        let window = page(AuditPageQuery {
            from_ms: Some(2_000),
            to_ms: Some(4_000),
            kinds: vec![SurfaceKind::Conversation, SurfaceKind::Tool],
            ..Default::default()
        });
        assert_eq!(ids_of(&window), vec![id(3), id(1)]);

        // the total is of the filter, not of the page; a limit of nothing is one, and a wild one is clamped
        let second = page(AuditPageQuery {
            limit: Some(2),
            offset: Some(2),
            ..Default::default()
        });
        assert_eq!(second.total, 5);
        assert_eq!(ids_of(&second), vec![id(2), id(1)]);
        let one = page(AuditPageQuery {
            limit: Some(0),
            ..Default::default()
        });
        assert_eq!(one.rows.len(), 1);
        let past = page(AuditPageQuery {
            offset: Some(10),
            limit: Some(9_999),
            ..Default::default()
        });
        assert_eq!((past.rows.len(), past.total), (0, 5));
    }

    #[test]
    fn the_facets_are_distinct_and_the_threads_are_totalled() {
        let ws = Workspace::in_memory();
        let (thread, _) = varied(&ws);
        let facets = ws.read(facets).unwrap();
        assert_eq!(
            facets.models,
            vec![
                "claude-haiku-4-5-20251001",
                "claude-opus-5-5",
                "claude-sonnet-5-5"
            ]
        );
        assert_eq!(
            facets.tools,
            vec![
                "kitchen.capture-haul",
                "kitchen.plan",
                "substrate.find-similar"
            ]
        );
        // the budget's refusal never left, so the conversation is its turn and the tool it ran
        let totals = ws.read(thread_totals).unwrap();
        assert_eq!(totals.len(), 1);
        assert_eq!(totals[0].thread_id, thread);
        assert_eq!(totals[0].requests, 2);
        assert_eq!((totals[0].tokens_in, totals[0].tokens_out), (1400, 60));
        assert!((totals[0].cost_usd - 0.45).abs() < 1e-9);
        assert_eq!(totals[0].last_at, 2_000);
    }

    #[test]
    fn an_entry_is_recorded_and_queried_by_thread() {
        let ws = Workspace::in_memory();
        let thread = ids::new_id();
        let (first, second, other) = ws
            .write(|ctx| {
                let first = record(ctx.conn, input(1_000, Some(&thread), &["r1"]))?;
                let second = record(ctx.conn, input(2_000, Some(&thread), &["r1", "r2"]))?;
                let other = record(ctx.conn, input(3_000, None, &[]))?;
                Ok((first, second, other))
            })
            .unwrap();
        assert_eq!(first.reads[0].rows, vec!["r1"]);
        assert_eq!(first.tools[0].confirm, Some(ConfirmOutcome::Confirmed));
        assert_eq!(first.grade, Some(Grade::Light));
        assert_eq!(first.outcome, Outcome::Ok);

        let of_thread = ws
            .read(|conn| {
                query(
                    conn,
                    &AuditQuery {
                        thread_id: Some(thread.clone()),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        assert_eq!(of_thread, vec![second.clone(), first.clone()]);
        let all = ws.read(|conn| query(conn, &AuditQuery::default())).unwrap();
        assert_eq!(all, vec![other, second.clone(), first.clone()]);
        let window = ws
            .read(|conn| {
                query(
                    conn,
                    &AuditQuery {
                        from_ms: Some(1_500),
                        to_ms: Some(2_500),
                        limit: Some(0),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        assert_eq!(window, vec![second]);

        for bad in [
            AuditEntryInput {
                surface: " ".into(),
                ..input(1, None, &[])
            },
            AuditEntryInput {
                thread_id: Some("t-1".into()),
                ..input(1, None, &[])
            },
            AuditEntryInput {
                grade: None,
                ..input(1, None, &[])
            },
            AuditEntryInput {
                cost_usd: -1.0,
                ..input(1, None, &[])
            },
            AuditEntryInput {
                id: Some(first.id.clone()),
                ..input(1, None, &[])
            },
            AuditEntryInput {
                day: Some("yesterday".into()),
                ..input(1, None, &[])
            },
        ] {
            assert_eq!(code(ws.write(|ctx| record(ctx.conn, bad))), "audit:invalid");
        }
    }

    #[test]
    fn usage_counts_the_entries_that_read_each_row() {
        let ws = Workspace::in_memory();
        ws.write(|ctx| {
            record(ctx.conn, input(1, None, &["r1", "r2"]))?;
            record(ctx.conn, input(2, None, &["r1"]))?;
            let mut twice = input(3, None, &["r3"]);
            // One entry that reads a row under two registry ids counts once for it.
            twice.reads.push(AuditRead {
                id: "stock-item".into(),
                count: 1,
                rows: vec!["r3".into()],
            });
            record(ctx.conn, twice)?;
            Ok(())
        })
        .unwrap();
        let counts = ws.read(usage).unwrap();
        assert_eq!(
            counts,
            BTreeMap::from([
                ("r1".to_string(), 2),
                ("r2".to_string(), 1),
                ("r3".to_string(), 1)
            ])
        );
    }

    #[test]
    fn spend_is_summed_from_a_moment() {
        let ws = Workspace::in_memory();
        ws.write(|ctx| {
            for (at, cost) in [(1_000, 0.5), (2_000, 0.25), (3_000, 1.0)] {
                record(
                    ctx.conn,
                    AuditEntryInput {
                        cost_usd: cost,
                        ..input(at, None, &[])
                    },
                )?;
            }
            Ok(())
        })
        .unwrap();
        assert_eq!(ws.read(|conn| spend_since(conn, 0)).unwrap(), 1.75);
        assert_eq!(ws.read(|conn| spend_since(conn, 2_000)).unwrap(), 1.25);
        assert_eq!(ws.read(|conn| spend_since(conn, 4_000)).unwrap(), 0.0);
    }

    #[test]
    fn entries_are_swept_at_ninety_days() {
        let ws = Workspace::in_memory();
        let now = 200 * DAY_MS;
        ws.write(|ctx| {
            record(
                ctx.conn,
                input(now - (RETENTION_DAYS + 1) * DAY_MS, None, &[]),
            )?;
            record(
                ctx.conn,
                input(now - (RETENTION_DAYS - 1) * DAY_MS, None, &[]),
            )?;
            Ok(())
        })
        .unwrap();
        assert_eq!(ws.write(|ctx| sweep(ctx.conn, now)).unwrap(), 1);
        assert_eq!(
            ws.read(|conn| query(conn, &AuditQuery::default()))
                .unwrap()
                .len(),
            1
        );
    }
}
