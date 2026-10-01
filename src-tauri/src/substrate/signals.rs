//! Signals and the inbox (docs/product/substrate/signals-notifications.md; D-73). A signal says something happened:
//! a name (`stock.expiring`), a small payload of URIs and a few fields, and the tier of what it names. An inbox row is
//! the card one rule made of one signal.
//!
//! The rules are the manifests' and the frontend evaluates them (`@eden/shared/signals`): an emit arrives with its
//! tier and with the cards it asks for, and the store checks their shape, keeps a signal with a key from being
//! emitted twice, and writes the signal and its cards as one. Both tables are this device's: never exported, never
//! synced, never cleared by a replace, and swept past thirty days when the workspace opens.

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::grants::{self, Access, CheckQuery, ResourceType};
use super::text::{text_column, text_enum};
use super::{hlc, ids};
use crate::error::{EdenError, Result};

/// How long a signal, and the cards made of it, are kept.
pub const RETENTION_DAYS: u64 = 30;
/// A payload names things and carries a few fields, never a whole entity.
pub const MAX_PAYLOAD_BYTES: usize = 4096;
const MAX_KEY_CHARS: usize = 200;
const TIERS: &[&str] = &["T0", "T1", "T2", "T3"];
const DEFAULT_LIMIT: u32 = 50;
const MAX_LIMIT: u32 = 200;

/// Who holds a device capability: this device, whoever asks on it.
pub const DEVICE: &str = "this-device";
/// The capability an OS notification needs (docs/product/substrate/grants.md).
pub const OS_NOTIFICATIONS: &str = "os-notifications";

text_enum! {
    /// Where a rule sends its card. An `os` card is also in the inbox.
    Channel { InApp = "in-app", Os = "os" }
}

/// One rule's card for the signal being emitted.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryInput {
    /// The domain and the notification kind: `weather.severe-alert`.
    pub rule: String,
    pub channel: Channel,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalInput {
    pub name: String,
    #[serde(default)]
    pub payload: Option<Value>,
    pub tier: String,
    /// What makes this occurrence the same one if it is emitted again: an alert's id, a day.
    #[serde(default)]
    pub dedupe_key: Option<String>,
    #[serde(default)]
    pub deliveries: Vec<DeliveryInput>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Signal {
    pub id: String,
    pub name: String,
    pub payload: Value,
    pub tier: String,
    pub dedupe_key: Option<String>,
    pub created_at: String,
    /// When it was emitted, in milliseconds since the epoch: the wall clock of its stamp.
    pub at: u64,
}

/// A card with what it is made of: the signal's name, payload, tier and time.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InboxEntry {
    pub id: String,
    pub signal_id: String,
    pub rule: String,
    pub channel: Channel,
    pub read: bool,
    pub name: String,
    pub payload: Value,
    pub tier: String,
    pub at: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Emitted {
    pub signal: Signal,
    pub deliveries: Vec<InboxEntry>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxQuery {
    #[serde(default)]
    pub unread_only: bool,
    pub limit: Option<u32>,
}

fn refused(detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("signal:invalid: {detail}"))
}

/// A signal is named by its subject and what happened to it, a rule by its domain and its kind: two plain ids.
fn is_pair(name: &str) -> bool {
    name.split_once('.')
        .is_some_and(|(first, second)| ids::is_resource_id(first) && ids::is_resource_id(second))
}

fn wall_ms(stamp: &str) -> u64 {
    hlc::Hlc::parse(stamp)
        .map(|clock| clock.wall_ms)
        .unwrap_or(0)
}

fn json(text: String) -> Value {
    serde_json::from_str(&text).unwrap_or(Value::Null)
}

fn validate(input: &SignalInput) -> Result<String> {
    if !is_pair(&input.name) {
        return Err(refused(format!("not a signal name: {:?}", input.name)));
    }
    if !TIERS.contains(&input.tier.as_str()) {
        return Err(refused(format!("not a tier: {:?}", input.tier)));
    }
    let payload = match &input.payload {
        None => "{}".to_string(),
        Some(payload) if payload.is_object() => payload.to_string(),
        Some(_) => return Err(refused("a payload is an object")),
    };
    if payload.len() > MAX_PAYLOAD_BYTES {
        return Err(refused(format!(
            "a payload of {} bytes; the most is {MAX_PAYLOAD_BYTES}",
            payload.len()
        )));
    }
    if let Some(key) = &input.dedupe_key {
        if key.is_empty() || key.chars().count() > MAX_KEY_CHARS {
            return Err(refused("not a key"));
        }
    }
    for (index, delivery) in input.deliveries.iter().enumerate() {
        if !is_pair(&delivery.rule) {
            return Err(refused(format!("not a rule: {:?}", delivery.rule)));
        }
        if input.deliveries[..index]
            .iter()
            .any(|other| other.rule == delivery.rule)
        {
            return Err(refused(format!(
                "the rule {:?} delivers once",
                delivery.rule
            )));
        }
    }
    Ok(payload)
}

/// Emits a signal with the cards its rules ask for, all of it or none. A signal whose key was already emitted under
/// the same name changes nothing and answers `None`.
pub fn emit(conn: &Connection, input: SignalInput) -> Result<Option<Emitted>> {
    let payload = validate(&input)?;
    if let Some(key) = &input.dedupe_key {
        let seen = conn
            .query_row(
                "SELECT 1 FROM signals WHERE name = ?1 AND dedupe_key = ?2",
                [&input.name, key],
                |_| Ok(()),
            )
            .optional()?;
        if seen.is_some() {
            return Ok(None);
        }
    }
    let created_at = hlc::next(conn)?;
    let signal = Signal {
        id: ids::new_id(),
        name: input.name,
        payload: json(payload),
        tier: input.tier,
        dedupe_key: input.dedupe_key,
        at: wall_ms(&created_at),
        created_at,
    };
    conn.execute(
        "INSERT INTO signals (id, name, payload, tier, dedupe_key, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            signal.id,
            signal.name,
            signal.payload.to_string(),
            signal.tier,
            signal.dedupe_key,
            signal.created_at
        ],
    )?;
    let mut deliveries = Vec::with_capacity(input.deliveries.len());
    for delivery in input.deliveries {
        let entry = InboxEntry {
            id: ids::new_id(),
            signal_id: signal.id.clone(),
            rule: delivery.rule,
            channel: delivery.channel,
            read: false,
            name: signal.name.clone(),
            payload: signal.payload.clone(),
            tier: signal.tier.clone(),
            at: signal.at,
        };
        conn.execute(
            "INSERT INTO inbox (id, signal_id, rule, channel) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                entry.id,
                entry.signal_id,
                entry.rule,
                entry.channel.as_str()
            ],
        )?;
        deliveries.push(entry);
    }
    Ok(Some(Emitted { signal, deliveries }))
}

/// The cards, the latest first.
pub fn query_inbox(conn: &Connection, filter: &InboxQuery) -> Result<Vec<InboxEntry>> {
    let limit = filter.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let unread = if filter.unread_only {
        "WHERE inbox.read = 0"
    } else {
        ""
    };
    let sql = format!(
        "SELECT inbox.id, inbox.signal_id, inbox.rule, inbox.channel, inbox.read,
                signals.name, signals.payload, signals.tier, signals.created_at
         FROM inbox JOIN signals ON signals.id = inbox.signal_id {unread}
         ORDER BY signals.created_at DESC, inbox.id DESC LIMIT ?1"
    );
    Ok(conn
        .prepare(&sql)?
        .query_map([limit], |row| {
            Ok(InboxEntry {
                id: row.get(0)?,
                signal_id: row.get(1)?,
                rule: row.get(2)?,
                channel: text_column(row, 3, Channel::parse)?,
                read: row.get(4)?,
                name: row.get(5)?,
                payload: json(row.get(6)?),
                tier: row.get(7)?,
                at: wall_ms(&row.get::<_, String>(8)?),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Marks the cards as read. Answers how many were unread.
pub fn mark_read(conn: &Connection, card_ids: &[String]) -> Result<usize> {
    let mut marked = 0;
    for id in card_ids {
        marked += conn.execute("UPDATE inbox SET read = 1 WHERE id = ?1 AND read = 0", [id])?;
    }
    Ok(marked)
}

/// Takes the cards of one signal out of the inbox: what its emitter calls once the owner has answered it where it
/// came from (an alert dismissed in Sky). The signal stays, so its key is still spent and it is not emitted again.
/// Answers the cards that went.
pub fn withdraw(conn: &Connection, name: &str, dedupe_key: &str) -> Result<Vec<String>> {
    let cards = conn
        .prepare(
            "SELECT inbox.id FROM inbox JOIN signals ON signals.id = inbox.signal_id
             WHERE signals.name = ?1 AND signals.dedupe_key = ?2",
        )?
        .query_map([name, dedupe_key], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    for id in &cards {
        conn.execute("DELETE FROM inbox WHERE id = ?1", [id])?;
    }
    Ok(cards)
}

/// Removes the signals past their retention, counted from `now_ms`, and the cards made of them. A stamp begins with
/// its wall clock, so comparing text against a stamp made of the cutoff alone does it. Answers how many signals went.
pub(crate) fn sweep(conn: &Connection, now_ms: u64) -> Result<usize> {
    let cutoff = now_ms.saturating_sub(RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let stamp = format!("{cutoff:016x}-00000000-00000000");
    let swept = conn.execute("DELETE FROM signals WHERE created_at < ?1", [stamp])?;
    conn.execute(
        "DELETE FROM inbox WHERE signal_id NOT IN (SELECT id FROM signals)",
        [],
    )?;
    Ok(swept)
}

/// Whether an OS notification may be shown: the owner turned the capability on for this device.
pub fn may_notify(conn: &Connection) -> Result<bool> {
    let decision = grants::check(
        conn,
        &CheckQuery {
            subject: DEVICE.to_string(),
            resource: OS_NOTIFICATIONS.to_string(),
            resource_type: ResourceType::Capability,
            access: Access::Read,
        },
    )?;
    Ok(decision.allowed)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::substrate::grants::{GrantInput, Lifetime, Origin};
    use crate::substrate::Workspace;

    const DAY_MS: u64 = 24 * 60 * 60 * 1000;

    fn input(name: &str, key: Option<&str>, rules: &[(&str, Channel)]) -> SignalInput {
        SignalInput {
            name: name.to_string(),
            payload: Some(json!({ "uris": [], "count": 2 })),
            tier: "T1".to_string(),
            dedupe_key: key.map(str::to_string),
            deliveries: rules
                .iter()
                .map(|(rule, channel)| DeliveryInput {
                    rule: rule.to_string(),
                    channel: *channel,
                })
                .collect(),
        }
    }

    fn count(ws: &Workspace, table: &str) -> i64 {
        ws.read(|conn| {
            Ok(
                conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })?,
            )
        })
        .unwrap()
    }

    fn inbox(ws: &Workspace) -> Vec<InboxEntry> {
        ws.read(|conn| query_inbox(conn, &InboxQuery::default()))
            .unwrap()
    }

    fn code<T: std::fmt::Debug>(result: Result<T>) -> String {
        let message = result.expect_err("refused").to_string();
        message.split(": ").next().unwrap().to_string()
    }

    #[test]
    fn a_signal_is_kept_with_the_cards_its_rules_ask_for() {
        let ws = Workspace::in_memory();
        let emitted = ws
            .write(|ctx| {
                emit(
                    ctx.conn,
                    input(
                        "stock.expiring",
                        Some("2026-09-30"),
                        &[("kitchen.expiring-digest", Channel::InApp)],
                    ),
                )
            })
            .unwrap()
            .expect("emitted");
        assert_eq!(emitted.signal.name, "stock.expiring");
        assert_eq!(emitted.signal.payload, json!({ "uris": [], "count": 2 }));
        assert!(emitted.signal.at > 0);
        assert_eq!(emitted.deliveries.len(), 1);
        assert_eq!(emitted.deliveries[0].signal_id, emitted.signal.id);
        assert!(!emitted.deliveries[0].read);
        // The card reads back with what the signal holds.
        assert_eq!(inbox(&ws), emitted.deliveries);

        // A signal no rule answers is kept all the same, with no card; one with no payload has an empty one.
        let bare = ws
            .write(|ctx| {
                emit(
                    ctx.conn,
                    SignalInput {
                        payload: None,
                        ..input("idea.stale", None, &[])
                    },
                )
            })
            .unwrap()
            .expect("emitted");
        assert_eq!(bare.signal.payload, json!({}));
        assert_eq!(count(&ws, "signals"), 2);
        assert_eq!(count(&ws, "inbox"), 1);
    }

    #[test]
    fn a_signal_with_a_key_is_emitted_once() {
        let ws = Workspace::in_memory();
        let alert = || {
            input(
                "weather.alert",
                Some("https://api.weather.gov/alerts/urn:oid:1"),
                &[("weather.severe-alert", Channel::Os)],
            )
        };
        assert!(ws.write(|ctx| emit(ctx.conn, alert())).unwrap().is_some());
        // The same key again is a dedupe hit: nothing is answered and nothing is written.
        assert_eq!(ws.write(|ctx| emit(ctx.conn, alert())).unwrap(), None);
        assert_eq!(count(&ws, "signals"), 1);
        assert_eq!(count(&ws, "inbox"), 1);

        // The key is the name's own: the same key under another name is another signal, and no key is never one.
        let other = SignalInput {
            name: "weather.frost".into(),
            ..alert()
        };
        assert!(ws.write(|ctx| emit(ctx.conn, other)).unwrap().is_some());
        for _ in 0..2 {
            let keyless = input("idea.stale", None, &[]);
            assert!(ws.write(|ctx| emit(ctx.conn, keyless)).unwrap().is_some());
        }
        assert_eq!(count(&ws, "signals"), 4);
    }

    #[test]
    fn a_withdrawn_signal_leaves_the_inbox_and_keeps_its_key() {
        let ws = Workspace::in_memory();
        let alert = |key: &str| {
            input(
                "weather.alert",
                Some(key),
                &[("weather.severe-alert", Channel::Os)],
            )
        };
        let first = ws.write(|ctx| emit(ctx.conn, alert("urn:1"))).unwrap();
        let second = ws.write(|ctx| emit(ctx.conn, alert("urn:2"))).unwrap();
        let went = ws
            .write(|ctx| withdraw(ctx.conn, "weather.alert", "urn:1"))
            .unwrap();
        assert_eq!(went, vec![first.unwrap().deliveries[0].id.clone()]);
        // The other alert's card stays; the withdrawn one's signal does too, so it is not emitted again.
        assert_eq!(inbox(&ws), second.unwrap().deliveries);
        assert_eq!(count(&ws, "signals"), 2);
        assert_eq!(
            ws.write(|ctx| emit(ctx.conn, alert("urn:1"))).unwrap(),
            None
        );
        // Nothing left to withdraw, and a key under another name is not this one.
        let none: Vec<String> = Vec::new();
        for name in ["weather.alert", "weather.frost"] {
            let went = ws.write(|ctx| withdraw(ctx.conn, name, "urn:1")).unwrap();
            assert_eq!(went, none);
        }
        assert_eq!(count(&ws, "inbox"), 1);
    }

    #[test]
    fn the_cards_are_written_with_the_signal_or_not_at_all() {
        let ws = Workspace::in_memory();
        let twice = input(
            "grocery.shop-day",
            None,
            &[
                ("kitchen.shop-day-reminder", Channel::Os),
                ("kitchen.shop-day-reminder", Channel::InApp),
            ],
        );
        assert_eq!(
            code(ws.write(|ctx| emit(ctx.conn, twice))),
            "signal:invalid"
        );
        // A write that fails after the signal went in leaves neither behind.
        let failed: Result<()> = ws.write(|ctx| {
            emit(
                ctx.conn,
                input(
                    "grocery.shop-day",
                    None,
                    &[("kitchen.shop-day-reminder", Channel::Os)],
                ),
            )?;
            Err(EdenError::InvalidOperation("later in the write".into()))
        });
        assert!(failed.is_err());
        assert_eq!(count(&ws, "signals"), 0);
        assert_eq!(count(&ws, "inbox"), 0);
    }

    #[test]
    fn a_card_is_marked_read_once() {
        let ws = Workspace::in_memory();
        let mut card_ids = Vec::new();
        for day in ["2026-09-29", "2026-09-30"] {
            let emitted = ws
                .write(|ctx| {
                    emit(
                        ctx.conn,
                        input(
                            "stock.expiring",
                            Some(day),
                            &[("kitchen.expiring-digest", Channel::InApp)],
                        ),
                    )
                })
                .unwrap()
                .expect("emitted");
            card_ids.push(emitted.deliveries[0].id.clone());
        }
        // The latest first.
        assert_eq!(
            inbox(&ws).iter().map(|card| &card.id).collect::<Vec<_>>(),
            vec![&card_ids[1], &card_ids[0]]
        );

        let first = vec![card_ids[0].clone()];
        assert_eq!(ws.write(|ctx| mark_read(ctx.conn, &first)).unwrap(), 1);
        assert_eq!(ws.write(|ctx| mark_read(ctx.conn, &first)).unwrap(), 0);
        let unread = ws
            .read(|conn| {
                query_inbox(
                    conn,
                    &InboxQuery {
                        unread_only: true,
                        limit: None,
                    },
                )
            })
            .unwrap();
        assert_eq!(unread.len(), 1);
        assert_eq!(unread[0].id, card_ids[1]);
        assert_eq!(
            ws.read(|conn| {
                query_inbox(
                    conn,
                    &InboxQuery {
                        unread_only: false,
                        limit: Some(1),
                    },
                )
            })
            .unwrap()
            .len(),
            1
        );
    }

    #[test]
    fn signals_are_swept_at_thirty_days_with_their_cards() {
        let ws = Workspace::in_memory();
        let emitted = ws
            .write(|ctx| {
                emit(
                    ctx.conn,
                    input(
                        "stock.expiring",
                        Some("2026-09-30"),
                        &[("kitchen.expiring-digest", Channel::InApp)],
                    ),
                )
            })
            .unwrap()
            .expect("emitted");
        let at = emitted.signal.at;

        // Thirty days on it stays; a millisecond past that it goes, and its card with it.
        assert_eq!(
            ws.write(|ctx| sweep(ctx.conn, at + RETENTION_DAYS * DAY_MS))
                .unwrap(),
            0
        );
        assert_eq!(inbox(&ws).len(), 1);
        assert_eq!(
            ws.write(|ctx| sweep(ctx.conn, at + RETENTION_DAYS * DAY_MS + 1))
                .unwrap(),
            1
        );
        assert_eq!(count(&ws, "signals"), 0);
        assert_eq!(count(&ws, "inbox"), 0);
        // Once swept, the key is free again.
        assert!(ws
            .write(|ctx| emit(ctx.conn, input("stock.expiring", Some("2026-09-30"), &[])))
            .unwrap()
            .is_some());
    }

    #[test]
    fn what_is_malformed_is_refused() {
        let ws = Workspace::in_memory();
        let good = || input("stock.expiring", Some("2026-09-30"), &[]);
        for bad in [
            SignalInput {
                name: "expiring".into(),
                ..good()
            },
            SignalInput {
                name: "Stock.Expiring".into(),
                ..good()
            },
            SignalInput {
                tier: "by-kind".into(),
                ..good()
            },
            SignalInput {
                payload: Some(json!(["eden://stock-item/1"])),
                ..good()
            },
            SignalInput {
                payload: Some(json!({ "note": "x".repeat(MAX_PAYLOAD_BYTES) })),
                ..good()
            },
            SignalInput {
                dedupe_key: Some(String::new()),
                ..good()
            },
            input(
                "stock.expiring",
                None,
                &[("expiring-digest", Channel::InApp)],
            ),
        ] {
            assert_eq!(code(ws.write(|ctx| emit(ctx.conn, bad))), "signal:invalid");
        }
        assert_eq!(count(&ws, "signals"), 0);
    }

    #[test]
    fn an_os_notification_needs_the_capability_on_this_device() {
        let ws = Workspace::in_memory();
        assert!(!ws.read(may_notify).unwrap());
        let granted = ws
            .write(|ctx| {
                grants::grant(
                    ctx,
                    GrantInput {
                        id: None,
                        subject: DEVICE.into(),
                        resource: OS_NOTIFICATIONS.into(),
                        resource_type: ResourceType::Capability,
                        access: Access::Read,
                        lifetime: Lifetime::Standing,
                        narrowing: None,
                        origin: Origin::Confirm,
                    },
                )
            })
            .unwrap();
        assert!(ws.read(may_notify).unwrap());
        ws.write(|ctx| grants::revoke(ctx, &granted.id)).unwrap();
        assert!(!ws.read(may_notify).unwrap());
    }
}
