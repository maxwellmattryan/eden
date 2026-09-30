//! The grant store (docs/product/substrate/grants.md; D-70): every question of the form "may X see or do Y" is answered
//! here. Integrations, models, plugins and device capabilities are subjects; registry ids, connector scopes, tool ids
//! and capabilities are resources. A grant is workspace policy (D-37) with stamps and a tombstone like any row, so it
//! syncs and merges; a revocation is the tombstone, so the history stays. Capability grants are this device's and
//! never leave it, and a session grant is swept when the workspace opens again.

use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::changes::ChangeOp;
use super::entities::json_column;
use super::hlc;
use super::ids;
use super::registry::{self, Tier};
use super::text::{text_column, text_enum};
use super::WriteCtx;
use crate::error::{EdenError, Result};

/// The actions no subject is ever granted (D-8): they are `never` for everyone and appear in Settings as a read-only
/// list. `@eden/shared/grants` carries the same ids.
pub const NEVER_AUTOMATED: &[&str] = &[
    "send-message",
    "send-email",
    "pay",
    "transfer",
    "delete-external",
    "change-external-settings",
    "accept-terms",
];

/// The device capabilities a grant can name; the OS grants them per device, so these rows never sync or export.
pub const CAPABILITIES: &[&str] = &[
    "camera",
    "location-precise",
    "os-notifications",
    "healthkit",
];

const TYPE_ID: &str = "grant";

text_enum! {
    /// What kind of thing the resource names: for a model a registry id, for an integration a connector scope, for an
    /// action a tool id, for a device a capability.
    ResourceType { Registry = "registry", Scope = "scope", Tool = "tool", Capability = "capability" }
}

text_enum! {
    /// The access vocabulary of D-8. `never` is not here: it is not a grant anyone can hold.
    Access { Read = "read", WriteDraft = "write-draft", Write = "write", ActExternal = "act-external" }
}

text_enum! {
    Lifetime { Standing = "standing", Session = "session", PerRequest = "per-request" }
}

text_enum! {
    /// Where the grant was given: the wizard, Settings, or an inline confirm sheet.
    Origin { Onboarding = "onboarding", Settings = "settings", Confirm = "confirm" }
}

/// Why a check answered as it did.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Reason {
    Default,
    Grant,
    Never,
    NoGrant,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Grant {
    pub uri: String,
    pub id: String,
    pub subject: String,
    pub resource: String,
    pub resource_type: ResourceType,
    pub access: Access,
    pub lifetime: Lifetime,
    /// Optional: calendar ids, a place, a date range. A JSON object the consumer of the grant shapes.
    #[serde(default)]
    pub narrowing: Option<Value>,
    pub origin: Origin,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantInput {
    /// A ULID the caller made; one is made when it is left out.
    pub id: Option<String>,
    pub subject: String,
    pub resource: String,
    pub resource_type: ResourceType,
    pub access: Access,
    pub lifetime: Lifetime,
    pub narrowing: Option<Value>,
    pub origin: Origin,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantQuery {
    pub subject: Option<String>,
    pub resource: Option<String>,
    pub resource_type: Option<ResourceType>,
    #[serde(default)]
    pub include_revoked: bool,
}

/// The question a read or a confirm asks before it proceeds.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckQuery {
    pub subject: String,
    pub resource: String,
    pub resource_type: ResourceType,
    pub access: Access,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub allowed: bool,
    pub reason: Reason,
    /// The grant that allowed it, when one did: what an audit entry links to.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grant_id: Option<String>,
}

/// The `grants.json` of a bundle.
#[derive(Debug, Serialize, Deserialize)]
pub struct GrantsFile {
    pub grants: Vec<Grant>,
}

const COLUMNS: &str = "id, subject, resource, resource_type, access, lifetime, narrowing, origin, \
                       created_at, updated_at, deleted_at";

fn refused(code: &str, detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("grant:{code}: {detail}"))
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<Grant> {
    let id: String = row.get(0)?;
    Ok(Grant {
        uri: ids::Uri::new(TYPE_ID, &id).to_string(),
        id,
        subject: row.get(1)?,
        resource: row.get(2)?,
        resource_type: text_column(row, 3, ResourceType::parse)?,
        access: text_column(row, 4, Access::parse)?,
        lifetime: text_column(row, 5, Lifetime::parse)?,
        narrowing: json_column(row, 6)?,
        origin: text_column(row, 7, Origin::parse)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        deleted_at: row.get(10)?,
    })
}

fn is_subject(subject: &str) -> bool {
    !subject.is_empty()
        && subject.len() <= 100
        && subject.chars().all(|c| {
            c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | ':' | '-')
        })
}

/// The tier of a registry resource, once the subject and the resource are known to be well formed.
fn tier_of(resource_type: ResourceType, resource: &str) -> Option<Tier> {
    match resource_type {
        ResourceType::Registry => registry::resource(resource).map(|row| row.tier),
        _ => None,
    }
}

/// Whether the subject and the resource are things a grant can name at all.
fn check_shape(subject: &str, resource: &str, resource_type: ResourceType) -> Result<()> {
    if !is_subject(subject) {
        return Err(refused("invalid", format!("not a subject: {subject:?}")));
    }
    let fits = match resource_type {
        ResourceType::Registry => registry::resource(resource).is_some(),
        ResourceType::Tool => ids::is_resource_id(resource),
        ResourceType::Capability => CAPABILITIES.contains(&resource),
        ResourceType::Scope => !resource.is_empty() && !resource.chars().any(char::is_whitespace),
    };
    if !fits {
        return Err(refused(
            "invalid",
            format!("not a {} resource: {resource:?}", resource_type.as_str()),
        ));
    }
    Ok(())
}

/// What the store refuses to hold: the never-automated list, anything T3, a draft (which needs no grant) and an
/// external action remembered past its request.
fn validate(input: &GrantInput) -> Result<()> {
    if NEVER_AUTOMATED.contains(&input.resource.as_str()) {
        return Err(refused(
            "never",
            format!("{} is never automated", input.resource),
        ));
    }
    check_shape(&input.subject, &input.resource, input.resource_type)?;
    if tier_of(input.resource_type, &input.resource) == Some(Tier::T3) {
        return Err(refused(
            "never",
            format!("{} is T3 and cannot be granted", input.resource),
        ));
    }
    if input.access == Access::WriteDraft {
        return Err(refused(
            "invalid",
            "a draft needs no grant: nothing is stored until the owner commits",
        ));
    }
    if input.access == Access::ActExternal && input.lifetime != Lifetime::PerRequest {
        return Err(refused(
            "invalid",
            "an external action is confirmed per request and never remembered",
        ));
    }
    if input
        .narrowing
        .as_ref()
        .is_some_and(|value| !value.is_null() && !value.is_object())
    {
        return Err(refused("invalid", "a narrowing is a JSON object"));
    }
    Ok(())
}

/// The one rule of the store, apart from the data: what a subject may do with a resource given its tier, the access
/// asked for, and whether a live grant matches. `@eden/shared/grants` has the same table.
fn decide(tier: Option<Tier>, access: Access, never: bool, live: Option<String>) -> Decision {
    let answer = |allowed, reason, grant_id| Decision {
        allowed,
        reason,
        grant_id,
    };
    if never || tier == Some(Tier::T3) {
        return answer(false, Reason::Never, None);
    }
    match access {
        Access::WriteDraft => answer(true, Reason::Default, None),
        Access::ActExternal => answer(false, Reason::NoGrant, None),
        Access::Read if matches!(tier, Some(Tier::T0 | Tier::T1)) => {
            answer(true, Reason::Default, None)
        }
        _ => match live {
            Some(id) => answer(true, Reason::Grant, Some(id)),
            None => answer(false, Reason::NoGrant, None),
        },
    }
}

/// The live grant, standing or for this session, that matches the key exactly.
fn live_match(
    conn: &Connection,
    subject: &str,
    resource_type: ResourceType,
    resource: &str,
    access: Access,
) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT id FROM grants
             WHERE subject = ?1 AND resource_type = ?2 AND resource = ?3 AND access = ?4
               AND deleted_at IS NULL AND lifetime <> 'per-request'",
            [subject, resource_type.as_str(), resource, access.as_str()],
            |row| row.get(0),
        )
        .optional()?)
}

/// One grant by id, revoked or not.
pub fn get(conn: &Connection, id: &str) -> Result<Option<Grant>> {
    Ok(conn
        .query_row(
            &format!("SELECT {COLUMNS} FROM grants WHERE id = ?1"),
            [id],
            from_row,
        )
        .optional()?)
}

/// Gives a grant. A standing or session grant that is already there is renewed rather than doubled: its lifetime,
/// narrowing and origin take the new values and it is stamped again. A per-request grant is a record of one confirm,
/// and a new row every time.
pub fn grant(ctx: &mut WriteCtx, input: GrantInput) -> Result<Grant> {
    validate(&input)?;
    let conn = ctx.conn;
    let narrowing = input
        .narrowing
        .as_ref()
        .filter(|value| !value.is_null())
        .map(Value::to_string);

    if input.lifetime != Lifetime::PerRequest {
        if let Some(id) = live_match(
            conn,
            &input.subject,
            input.resource_type,
            &input.resource,
            input.access,
        )? {
            conn.execute(
                "UPDATE grants SET lifetime = ?1, narrowing = ?2, origin = ?3, updated_at = ?4 WHERE id = ?5",
                rusqlite::params![
                    input.lifetime.as_str(),
                    narrowing,
                    input.origin.as_str(),
                    hlc::next(conn)?,
                    id
                ],
            )?;
            let grant =
                get(conn, &id)?.ok_or_else(|| EdenError::NotFound(format!("grant {id}")))?;
            ctx.record(&grant.uri, ChangeOp::Updated);
            return Ok(grant);
        }
    }

    let id = ids::id_or_new(input.id)?;
    if get(conn, &id)?.is_some() {
        return Err(refused("invalid", format!("the id is taken: {id}")));
    }
    let stamp = hlc::next(conn)?;
    conn.execute(
        "INSERT INTO grants (id, subject, resource, resource_type, access, lifetime, narrowing, origin,
                             created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        rusqlite::params![
            id,
            input.subject,
            input.resource,
            input.resource_type.as_str(),
            input.access.as_str(),
            input.lifetime.as_str(),
            narrowing,
            input.origin.as_str(),
            stamp,
        ],
    )?;
    let grant = get(conn, &id)?.ok_or_else(|| EdenError::NotFound(format!("grant {id}")))?;
    ctx.record(&grant.uri, ChangeOp::Created);
    Ok(grant)
}

/// Ends a grant: future reads stop at once, and what was read under it stays as it is. Revoking a revoked grant
/// changes nothing.
pub fn revoke(ctx: &mut WriteCtx, id: &str) -> Result<Grant> {
    let conn = ctx.conn;
    let grant = get(conn, id)?.ok_or_else(|| EdenError::NotFound(format!("grant {id}")))?;
    if grant.deleted_at.is_some() {
        return Ok(grant);
    }
    let stamp = hlc::next(conn)?;
    conn.execute(
        "UPDATE grants SET updated_at = ?1, deleted_at = ?1 WHERE id = ?2",
        [&stamp, id],
    )?;
    ctx.record(&grant.uri, ChangeOp::Deleted);
    Ok(Grant {
        updated_at: stamp.clone(),
        deleted_at: Some(stamp),
        ..grant
    })
}

/// The grants, by id: the live ones unless the query asks for the revoked ones too.
pub fn query(conn: &Connection, filter: &GrantQuery) -> Result<Vec<Grant>> {
    let mut clauses = vec!["1".to_string()];
    let mut params: Vec<String> = Vec::new();
    let mut equals = |column: &str, value: Option<&str>| {
        if let Some(value) = value {
            params.push(value.to_string());
            clauses.push(format!("{column} = ?{}", params.len()));
        }
    };
    equals("subject", filter.subject.as_deref());
    equals("resource", filter.resource.as_deref());
    equals(
        "resource_type",
        filter.resource_type.map(ResourceType::as_str),
    );
    if !filter.include_revoked {
        clauses.push("deleted_at IS NULL".to_string());
    }
    let sql = format!(
        "SELECT {COLUMNS} FROM grants WHERE {} ORDER BY id",
        clauses.join(" AND ")
    );
    Ok(conn
        .prepare(&sql)?
        .query_map(rusqlite::params_from_iter(params), from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Answers whether the subject may do this now, and by what right. A question about something no grant could name
/// is an error; a question about something never granted is a `never`.
pub fn check(conn: &Connection, query: &CheckQuery) -> Result<Decision> {
    let never = NEVER_AUTOMATED.contains(&query.resource.as_str());
    if never {
        return Ok(decide(None, query.access, true, None));
    }
    check_shape(&query.subject, &query.resource, query.resource_type)?;
    let tier = tier_of(query.resource_type, &query.resource);
    let live = live_match(
        conn,
        &query.subject,
        query.resource_type,
        &query.resource,
        query.access,
    )?;
    Ok(decide(tier, query.access, false, live))
}

/// Tombstones the grants that lasted a session: what a new run does first. Answers how many it ended.
pub(crate) fn sweep_session(ctx: &mut WriteCtx) -> Result<u64> {
    let ids: Vec<String> = ctx
        .conn
        .prepare(
            "SELECT id FROM grants WHERE lifetime = 'session' AND deleted_at IS NULL ORDER BY id",
        )?
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    for id in &ids {
        revoke(ctx, id)?;
    }
    Ok(ids.len() as u64)
}

// What the bundle needs.

/// The grants a bundle carries: workspace policy, by id, revocations included. Capability grants are this device's
/// and session grants end with the run that made them, so neither leaves (D-37, D-70).
pub(crate) fn exportable(conn: &Connection) -> Result<Vec<Grant>> {
    Ok(conn
        .prepare(&format!(
            "SELECT {COLUMNS} FROM grants
             WHERE resource_type <> 'capability' AND lifetime <> 'session' ORDER BY id"
        ))?
        .query_map([], from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

/// What an import checks on each grant of a bundle before it writes any of them.
pub(crate) fn validate_imported(grant: &Grant) -> std::result::Result<(), String> {
    if !ids::is_ulid(&grant.id) {
        return Err(format!("not an id: {:?}", grant.id));
    }
    if grant.uri != ids::Uri::new(TYPE_ID, &grant.id).to_string() {
        return Err(format!("a URI that is not the grant's own: {}", grant.uri));
    }
    let stamps_ok = hlc::Hlc::parse(&grant.created_at).is_ok()
        && hlc::Hlc::parse(&grant.updated_at).is_ok()
        && grant
            .deleted_at
            .as_ref()
            .is_none_or(|deleted| *deleted == grant.updated_at);
    if !stamps_ok {
        return Err(format!("stamps that cannot be read on {}", grant.id));
    }
    if grant.resource_type == ResourceType::Capability || grant.lifetime == Lifetime::Session {
        return Err(format!(
            "{} is a grant that never leaves a device",
            grant.id
        ));
    }
    if grant.access == Access::ActExternal && grant.lifetime != Lifetime::PerRequest {
        return Err(format!("{} remembers an external action", grant.id));
    }
    if !is_subject(&grant.subject) || grant.resource.is_empty() {
        return Err(format!("{} names no subject or no resource", grant.id));
    }
    Ok(())
}

/// Writes a grant as it is, stamps and all.
pub(crate) fn put(conn: &Connection, grant: &Grant) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO grants
         (id, subject, resource, resource_type, access, lifetime, narrowing, origin, created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            grant.id,
            grant.subject,
            grant.resource,
            grant.resource_type.as_str(),
            grant.access.as_str(),
            grant.lifetime.as_str(),
            grant
                .narrowing
                .as_ref()
                .filter(|value| !value.is_null())
                .map(Value::to_string),
            grant.origin.as_str(),
            grant.created_at,
            grant.updated_at,
            grant.deleted_at,
        ],
    )?;
    Ok(())
}

/// The other live grant with the incoming one's key, which the unique index will not let it live beside.
pub(crate) fn rival(conn: &Connection, grant: &Grant) -> Result<Option<(String, String)>> {
    if grant.lifetime == Lifetime::PerRequest {
        return Ok(None);
    }
    Ok(conn
        .query_row(
            "SELECT id, updated_at FROM grants
             WHERE subject = ?1 AND resource_type = ?2 AND resource = ?3 AND access = ?4
               AND deleted_at IS NULL AND lifetime <> 'per-request' AND id != ?5",
            [
                grant.subject.as_str(),
                grant.resource_type.as_str(),
                grant.resource.as_str(),
                grant.access.as_str(),
                grant.id.as_str(),
            ],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?)
}

/// What a replace clears: every grant that a bundle could carry. The device's own stay.
pub(crate) fn clear(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM grants WHERE resource_type <> 'capability'", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::substrate::Workspace;

    fn input(
        subject: &str,
        resource: &str,
        resource_type: ResourceType,
        access: Access,
        lifetime: Lifetime,
    ) -> GrantInput {
        GrantInput {
            id: None,
            subject: subject.into(),
            resource: resource.into(),
            resource_type,
            access,
            lifetime,
            narrowing: None,
            origin: Origin::Settings,
        }
    }

    fn allergy() -> GrantInput {
        input(
            "anthropic",
            "allergy",
            ResourceType::Registry,
            Access::Read,
            Lifetime::Standing,
        )
    }

    fn ask(
        subject: &str,
        resource: &str,
        resource_type: ResourceType,
        access: Access,
    ) -> CheckQuery {
        CheckQuery {
            subject: subject.into(),
            resource: resource.into(),
            resource_type,
            access,
        }
    }

    fn code(result: Result<Grant>) -> String {
        let message = result.expect_err("refused").to_string();
        message.split(": ").next().unwrap().to_string()
    }

    #[test]
    fn a_grant_is_written_read_and_revoked() {
        let ws = Workspace::in_memory();
        let grant = ws
            .write(|ctx| {
                grant(
                    ctx,
                    GrantInput {
                        narrowing: Some(json!({ "calendars": ["work"] })),
                        origin: Origin::Onboarding,
                        ..allergy()
                    },
                )
            })
            .unwrap();
        assert_eq!(grant.uri, format!("eden://grant/{}", grant.id));
        assert_eq!(grant.narrowing, Some(json!({ "calendars": ["work"] })));
        assert_eq!(grant.origin, Origin::Onboarding);
        assert_eq!(grant.created_at, grant.updated_at);

        let live = ws.read(|conn| query(conn, &GrantQuery::default())).unwrap();
        assert_eq!(live, vec![grant.clone()]);

        let revoked = ws.write(|ctx| revoke(ctx, &grant.id)).unwrap();
        assert_eq!(revoked.deleted_at, Some(revoked.updated_at.clone()));
        assert!(revoked.updated_at > grant.updated_at);
        assert!(ws
            .read(|conn| query(conn, &GrantQuery::default()))
            .unwrap()
            .is_empty());
        let all = ws
            .read(|conn| {
                query(
                    conn,
                    &GrantQuery {
                        include_revoked: true,
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        assert_eq!(all, vec![revoked.clone()]);
        // Revoking again changes nothing.
        assert_eq!(ws.write(|ctx| revoke(ctx, &grant.id)).unwrap(), revoked);
        assert!(matches!(
            ws.write(|ctx| revoke(ctx, "01ARZ3NDEKTSV4RRFFQ69G5FAV")),
            Err(EdenError::NotFound(_))
        ));
    }

    #[test]
    fn granting_again_renews_the_live_grant() {
        let ws = Workspace::in_memory();
        let first = ws.write(|ctx| grant(ctx, allergy())).unwrap();
        let again = ws
            .write(|ctx| {
                grant(
                    ctx,
                    GrantInput {
                        lifetime: Lifetime::Session,
                        origin: Origin::Confirm,
                        ..allergy()
                    },
                )
            })
            .unwrap();
        assert_eq!(again.id, first.id);
        assert_eq!(again.lifetime, Lifetime::Session);
        assert_eq!(again.origin, Origin::Confirm);
        assert!(again.updated_at > first.updated_at);
        assert_eq!(
            ws.read(|conn| query(conn, &GrantQuery::default()))
                .unwrap()
                .len(),
            1
        );

        // A per-request grant is a record of a confirm, and a new row every time.
        let per_request = || {
            input(
                "anthropic",
                "add-stock",
                ResourceType::Tool,
                Access::Write,
                Lifetime::PerRequest,
            )
        };
        let a = ws.write(|ctx| grant(ctx, per_request())).unwrap();
        let b = ws.write(|ctx| grant(ctx, per_request())).unwrap();
        assert_ne!(a.id, b.id);
    }

    #[test]
    fn a_t3_resource_and_the_never_automated_list_are_refused() {
        let ws = Workspace::in_memory();
        let t3 = input(
            "anthropic",
            "identity-document",
            ResourceType::Registry,
            Access::Read,
            Lifetime::Standing,
        );
        assert_eq!(code(ws.write(|ctx| grant(ctx, t3))), "grant:never");
        for action in NEVER_AUTOMATED {
            let never = input(
                "anthropic",
                action,
                ResourceType::Tool,
                Access::Write,
                Lifetime::PerRequest,
            );
            assert_eq!(
                code(ws.write(|ctx| grant(ctx, never))),
                "grant:never",
                "{action}"
            );
            let decision = ws
                .read(|conn| {
                    check(
                        conn,
                        &ask("anthropic", action, ResourceType::Tool, Access::Write),
                    )
                })
                .unwrap();
            assert_eq!((decision.allowed, decision.reason), (false, Reason::Never));
        }
        let decision = ws
            .read(|conn| {
                check(
                    conn,
                    &ask(
                        "anthropic",
                        "identity-document",
                        ResourceType::Registry,
                        Access::Read,
                    ),
                )
            })
            .unwrap();
        assert_eq!((decision.allowed, decision.reason), (false, Reason::Never));
    }

    #[test]
    fn act_external_is_only_ever_per_request() {
        let ws = Workspace::in_memory();
        let standing = input(
            "github",
            "open-issue",
            ResourceType::Tool,
            Access::ActExternal,
            Lifetime::Standing,
        );
        assert_eq!(code(ws.write(|ctx| grant(ctx, standing))), "grant:invalid");
        let confirmed = input(
            "github",
            "open-issue",
            ResourceType::Tool,
            Access::ActExternal,
            Lifetime::PerRequest,
        );
        ws.write(|ctx| grant(ctx, confirmed)).unwrap();
        // The record of one confirm never authorizes the next.
        let decision = ws
            .read(|conn| {
                check(
                    conn,
                    &ask(
                        "github",
                        "open-issue",
                        ResourceType::Tool,
                        Access::ActExternal,
                    ),
                )
            })
            .unwrap();
        assert_eq!(
            (decision.allowed, decision.reason),
            (false, Reason::NoGrant)
        );
    }

    #[test]
    fn write_draft_needs_no_grant() {
        let ws = Workspace::in_memory();
        let draft = input(
            "anthropic",
            "capture-haul",
            ResourceType::Tool,
            Access::WriteDraft,
            Lifetime::Standing,
        );
        assert_eq!(code(ws.write(|ctx| grant(ctx, draft))), "grant:invalid");
        let decision = ws
            .read(|conn| {
                check(
                    conn,
                    &ask(
                        "anthropic",
                        "capture-haul",
                        ResourceType::Tool,
                        Access::WriteDraft,
                    ),
                )
            })
            .unwrap();
        assert_eq!((decision.allowed, decision.reason), (true, Reason::Default));
    }

    #[test]
    fn an_unknown_registry_id_is_refused() {
        let ws = Workspace::in_memory();
        let unknown = input(
            "anthropic",
            "secret-sauce",
            ResourceType::Registry,
            Access::Read,
            Lifetime::Standing,
        );
        assert_eq!(code(ws.write(|ctx| grant(ctx, unknown))), "grant:invalid");
        let shouting = input(
            "Anthropic",
            "allergy",
            ResourceType::Registry,
            Access::Read,
            Lifetime::Standing,
        );
        assert_eq!(code(ws.write(|ctx| grant(ctx, shouting))), "grant:invalid");
        let no_such_capability = input(
            "this-device",
            "microphone",
            ResourceType::Capability,
            Access::Read,
            Lifetime::Standing,
        );
        assert_eq!(
            code(ws.write(|ctx| grant(ctx, no_such_capability))),
            "grant:invalid"
        );
        assert!(matches!(
            ws.read(|conn| check(
                conn,
                &ask(
                    "anthropic",
                    "secret-sauce",
                    ResourceType::Registry,
                    Access::Read
                )
            )),
            Err(EdenError::Refused(_))
        ));
    }

    #[test]
    fn a_check_reads_the_tier_and_the_live_grants() {
        let ws = Workspace::in_memory();
        let read = |ws: &Workspace, resource: &str| {
            ws.read(|conn| {
                check(
                    conn,
                    &ask("anthropic", resource, ResourceType::Registry, Access::Read),
                )
            })
            .unwrap()
        };
        // T0 and T1 need nothing; T2 needs a grant; a kind whose tier is its rows' needs one too.
        assert_eq!(read(&ws, "recipe").reason, Reason::Default);
        assert_eq!(read(&ws, "task").reason, Reason::Default);
        assert_eq!(read(&ws, "event").reason, Reason::NoGrant);
        let before = read(&ws, "allergy");
        assert_eq!(
            (before.allowed, before.reason, before.grant_id),
            (false, Reason::NoGrant, None)
        );

        let granted = ws.write(|ctx| grant(ctx, allergy())).unwrap();
        let after = read(&ws, "allergy");
        assert_eq!((after.allowed, after.reason), (true, Reason::Grant));
        assert_eq!(after.grant_id, Some(granted.id.clone()));
        // A read grant is not a write grant, and another subject holds nothing.
        let write = ws
            .read(|conn| {
                check(
                    conn,
                    &ask(
                        "anthropic",
                        "allergy",
                        ResourceType::Registry,
                        Access::Write,
                    ),
                )
            })
            .unwrap();
        assert_eq!(write.reason, Reason::NoGrant);
        let other = ws
            .read(|conn| {
                check(
                    conn,
                    &ask("openai", "allergy", ResourceType::Registry, Access::Read),
                )
            })
            .unwrap();
        assert_eq!(other.reason, Reason::NoGrant);

        ws.write(|ctx| revoke(ctx, &granted.id)).unwrap();
        assert_eq!(read(&ws, "allergy").reason, Reason::NoGrant);

        // A scope and a capability need a grant whatever the access.
        let scope = ask(
            "google-calendar",
            "calendar:work:read",
            ResourceType::Scope,
            Access::Read,
        );
        assert_eq!(
            ws.read(|conn| check(conn, &scope)).unwrap().reason,
            Reason::NoGrant
        );
        ws.write(|ctx| {
            grant(
                ctx,
                input(
                    "google-calendar",
                    "calendar:work:read",
                    ResourceType::Scope,
                    Access::Read,
                    Lifetime::Standing,
                ),
            )
        })
        .unwrap();
        assert_eq!(
            ws.read(|conn| check(conn, &scope)).unwrap().reason,
            Reason::Grant
        );
    }

    #[test]
    fn a_session_grant_is_swept() {
        let ws = Workspace::in_memory();
        let session = input(
            "anthropic",
            "body-metric",
            ResourceType::Registry,
            Access::Read,
            Lifetime::Session,
        );
        let kept = ws.write(|ctx| grant(ctx, session)).unwrap();
        ws.write(|ctx| grant(ctx, allergy())).unwrap();
        assert_eq!(ws.write(sweep_session).unwrap(), 1);
        assert_eq!(ws.write(sweep_session).unwrap(), 0);
        let live = ws.read(|conn| query(conn, &GrantQuery::default())).unwrap();
        assert_eq!(live.len(), 1);
        assert_eq!(live[0].resource, "allergy");
        assert!(ws
            .read(|conn| get(conn, &kept.id))
            .unwrap()
            .unwrap()
            .deleted_at
            .is_some());
    }

    #[test]
    fn a_capability_grant_stays_on_this_device() {
        let ws = Workspace::in_memory();
        ws.write(|ctx| {
            grant(
                ctx,
                input(
                    "this-device",
                    "camera",
                    ResourceType::Capability,
                    Access::Read,
                    Lifetime::Standing,
                ),
            )?;
            grant(
                ctx,
                input(
                    "anthropic",
                    "body-metric",
                    ResourceType::Registry,
                    Access::Read,
                    Lifetime::Session,
                ),
            )?;
            grant(ctx, allergy())
        })
        .unwrap();
        // Neither the device's grant nor the session's leaves in a bundle.
        let out = ws.read(exportable).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].resource, "allergy");
        // A replace clears what a bundle could carry and leaves the device's own.
        ws.write(|ctx| clear(ctx.conn)).unwrap();
        let left = ws.read(|conn| query(conn, &GrantQuery::default())).unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].resource, "camera");
    }

    #[test]
    fn a_query_filters_by_subject_type_and_revoked() {
        let ws = Workspace::in_memory();
        let (a, _b, c) = ws
            .write(|ctx| {
                let a = grant(ctx, allergy())?;
                let b = grant(
                    ctx,
                    input(
                        "this-device",
                        "camera",
                        ResourceType::Capability,
                        Access::Read,
                        Lifetime::Standing,
                    ),
                )?;
                let c = grant(
                    ctx,
                    input(
                        "google-calendar",
                        "calendar:work:read",
                        ResourceType::Scope,
                        Access::Read,
                        Lifetime::Standing,
                    ),
                )?;
                Ok((a, b, c))
            })
            .unwrap();
        ws.write(|ctx| revoke(ctx, &c.id)).unwrap();
        let by = |filter: GrantQuery| {
            ws.read(|conn| query(conn, &filter))
                .unwrap()
                .into_iter()
                .map(|grant| grant.resource)
                .collect::<Vec<_>>()
        };
        assert_eq!(by(GrantQuery::default()), vec!["allergy", "camera"]);
        assert_eq!(
            by(GrantQuery {
                subject: Some("anthropic".into()),
                ..Default::default()
            }),
            vec!["allergy"]
        );
        assert_eq!(
            by(GrantQuery {
                resource_type: Some(ResourceType::Scope),
                include_revoked: true,
                ..Default::default()
            }),
            vec!["calendar:work:read"]
        );
        assert_eq!(
            by(GrantQuery {
                resource: Some("allergy".into()),
                ..Default::default()
            }),
            vec![a.resource]
        );
    }

    #[test]
    fn the_decision_table_holds() {
        let live = || Some("01ARZ3NDEKTSV4RRFFQ69G5FAV".to_string());
        assert_eq!(
            decide(Some(Tier::T0), Access::Read, false, None).reason,
            Reason::Default
        );
        assert_eq!(
            decide(Some(Tier::T1), Access::Read, false, None).reason,
            Reason::Default
        );
        assert_eq!(
            decide(Some(Tier::T2), Access::Read, false, None).reason,
            Reason::NoGrant
        );
        assert_eq!(
            decide(Some(Tier::T2), Access::Read, false, live()).reason,
            Reason::Grant
        );
        assert_eq!(
            decide(Some(Tier::ByKind), Access::Read, false, None).reason,
            Reason::NoGrant
        );
        assert_eq!(
            decide(Some(Tier::T3), Access::Read, false, live()).reason,
            Reason::Never
        );
        assert_eq!(
            decide(Some(Tier::T3), Access::WriteDraft, false, None).reason,
            Reason::Never
        );
        assert_eq!(
            decide(Some(Tier::T0), Access::Write, false, None).reason,
            Reason::NoGrant
        );
        assert_eq!(
            decide(Some(Tier::T0), Access::Write, false, live()).reason,
            Reason::Grant
        );
        assert_eq!(
            decide(None, Access::WriteDraft, false, None).reason,
            Reason::Default
        );
        assert_eq!(
            decide(None, Access::ActExternal, false, live()).reason,
            Reason::NoGrant
        );
        assert_eq!(
            decide(None, Access::Read, true, live()).reason,
            Reason::Never
        );
        assert_eq!(
            decide(None, Access::Read, false, None).reason,
            Reason::NoGrant
        );
        assert_eq!(
            decide(None, Access::Read, false, live()).reason,
            Reason::Grant
        );
    }
}
