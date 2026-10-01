//! The IPC boundary of the Gardener (docs/engineering/gardener.md): the key the owner gave this device, the one call
//! to the provider with its stream of events and its cancel, the audit log, the threads with their messages, and
//! the policy. `@eden/shared/gardener` wraps them. Nothing here ever answers a secret's value.

use serde_json::Value;
use tauri::{ipc::Channel, State};

use crate::db::secret_store::SecretStore;
use crate::error::{EdenError, Result};
use crate::gardener::{anthropic, GardenerEvent, GardenerRequest, Inflight, KEY_SECRET};
use crate::substrate::audit::{
    self, AuditEntry, AuditEntryInput, AuditFacets, AuditPage, AuditPageQuery, AuditQuery,
    ThreadUsage,
};
use crate::substrate::policy::{self, PolicyRow};
use crate::substrate::threads::{
    self, Message, MessageInput, Thread, ThreadInput, ThreadPatch, ThreadQuery,
};
use crate::substrate::usage::{self, UsageQuery, UsageRow};
use crate::substrate::{egress, Workspace};

// Secrets.

#[tauri::command]
pub async fn set_secret(
    secrets: State<'_, Box<dyn SecretStore>>,
    name: String,
    value: String,
) -> Result<()> {
    secrets.set(&name, &value)
}

#[tauri::command]
pub async fn has_secret(secrets: State<'_, Box<dyn SecretStore>>, name: String) -> Result<bool> {
    Ok(secrets.get(&name)?.is_some())
}

#[tauri::command]
pub async fn delete_secret(secrets: State<'_, Box<dyn SecretStore>>, name: String) -> Result<bool> {
    secrets.delete(&name)
}

// The provider call.

/// The provider key, or the refusal the frontend turns into "add a key in Settings".
pub(crate) fn key_or_refused(secrets: &dyn SecretStore) -> Result<String> {
    secrets
        .get(KEY_SECRET)?
        .ok_or_else(|| EdenError::Refused("gardener:no-key: no key on this device".to_string()))
}

/// Sends one request and streams its events to `on_event`. Answers once the stream has ended, after the last event;
/// a cancel ends it with a `stop` whose reason is `cancelled`. The bytes out are counted in the ledger before the
/// request leaves.
#[tauri::command]
pub async fn gardener_send(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    inflight: State<'_, Inflight>,
    request: GardenerRequest,
    on_event: Channel<GardenerEvent>,
) -> Result<()> {
    let key = key_or_refused(secrets.inner().as_ref())?;
    let bytes_out = (anthropic::URL.len() + anthropic::body_len(&request)) as u64;
    if let Err(e) =
        workspace.write(|ctx| egress::record(ctx.conn, anthropic::DESTINATION, bytes_out))
    {
        log::warn!("The egress ledger did not take the Gardener's request: {e}");
    }

    let emit = move |event: GardenerEvent| {
        if let Err(e) = on_event.send(event) {
            log::warn!("A Gardener event did not reach the webview: {e}");
        }
    };
    let (handle, registration) = futures_util::future::AbortHandle::new_pair();
    inflight.insert(&request.id, handle);
    let sent =
        futures_util::future::Abortable::new(anthropic::send(&key, &request, &emit), registration)
            .await;
    inflight.remove(&request.id);
    match sent {
        Ok(result) => result,
        Err(futures_util::future::Aborted) => {
            emit(GardenerEvent::Stop {
                reason: "cancelled".to_string(),
                refusal: None,
            });
            Ok(())
        }
    }
}

/// Aborts a request in flight. Answers whether there was one.
#[tauri::command]
pub async fn gardener_cancel(inflight: State<'_, Inflight>, request_id: String) -> Result<bool> {
    Ok(inflight.cancel(&request_id))
}

// The audit log.

#[tauri::command]
pub async fn record_audit(
    workspace: State<'_, Workspace>,
    entry: AuditEntryInput,
) -> Result<AuditEntry> {
    workspace.write(|ctx| audit::record(ctx.conn, entry))
}

#[tauri::command]
pub async fn query_audit(
    workspace: State<'_, Workspace>,
    filter: AuditQuery,
) -> Result<Vec<AuditEntry>> {
    workspace.read(|conn| audit::query(conn, &filter))
}

#[tauri::command]
pub async fn audit_usage(
    workspace: State<'_, Workspace>,
) -> Result<std::collections::BTreeMap<String, u64>> {
    workspace.read(audit::usage)
}

#[tauri::command]
pub async fn audit_spend(workspace: State<'_, Workspace>, from_ms: u64) -> Result<f64> {
    workspace.read(|conn| audit::spend_since(conn, from_ms))
}

#[tauri::command]
pub async fn query_audit_page(
    workspace: State<'_, Workspace>,
    filter: AuditPageQuery,
) -> Result<AuditPage> {
    workspace.read(|conn| audit::query_page(conn, &filter))
}

#[tauri::command]
pub async fn audit_facets(workspace: State<'_, Workspace>) -> Result<AuditFacets> {
    workspace.read(audit::facets)
}

#[tauri::command]
pub async fn audit_thread_totals(workspace: State<'_, Workspace>) -> Result<Vec<ThreadUsage>> {
    workspace.read(audit::thread_totals)
}

#[tauri::command]
pub async fn query_usage(
    workspace: State<'_, Workspace>,
    filter: UsageQuery,
) -> Result<Vec<UsageRow>> {
    workspace.read(|conn| usage::query(conn, &filter))
}

// Threads and messages.

#[tauri::command]
pub async fn create_thread(workspace: State<'_, Workspace>, input: ThreadInput) -> Result<Thread> {
    workspace.write(|ctx| threads::create_thread(ctx, input))
}

#[tauri::command]
pub async fn update_thread(
    workspace: State<'_, Workspace>,
    id: String,
    patch: ThreadPatch,
) -> Result<Thread> {
    workspace.write(|ctx| threads::update_thread(ctx, &id, &patch))
}

#[tauri::command]
pub async fn delete_thread(workspace: State<'_, Workspace>, id: String) -> Result<Thread> {
    workspace.write(|ctx| threads::delete_thread(ctx, &id))
}

#[tauri::command]
pub async fn restore_thread(workspace: State<'_, Workspace>, id: String) -> Result<Thread> {
    workspace.write(|ctx| threads::restore_thread(ctx, &id))
}

#[tauri::command]
pub async fn query_threads(
    workspace: State<'_, Workspace>,
    filter: ThreadQuery,
) -> Result<Vec<Thread>> {
    workspace.read(|conn| threads::query_threads(conn, &filter))
}

#[tauri::command]
pub async fn append_message(
    workspace: State<'_, Workspace>,
    input: MessageInput,
) -> Result<Message> {
    workspace.write(|ctx| threads::append_message(ctx, input))
}

#[tauri::command]
pub async fn update_message(
    workspace: State<'_, Workspace>,
    id: String,
    blocks: Value,
) -> Result<Message> {
    workspace.write(|ctx| threads::update_message(ctx, &id, blocks))
}

#[tauri::command]
pub async fn delete_message(workspace: State<'_, Workspace>, id: String) -> Result<Message> {
    workspace.write(|ctx| threads::delete_message(ctx, &id))
}

#[tauri::command]
pub async fn query_messages(
    workspace: State<'_, Workspace>,
    thread_id: String,
) -> Result<Vec<Message>> {
    workspace.read(|conn| threads::query_messages(conn, &thread_id))
}

// Policy.

#[tauri::command]
pub async fn get_policy(workspace: State<'_, Workspace>, key: String) -> Result<Option<PolicyRow>> {
    workspace.read(|conn| policy::get(conn, &key))
}

#[tauri::command]
pub async fn set_policy(
    workspace: State<'_, Workspace>,
    key: String,
    value: Value,
) -> Result<PolicyRow> {
    workspace.write(|ctx| policy::set(ctx, &key, value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::secret_store::FileSecretStore;
    use crate::db::testing::temp_dir;

    /// The precondition of a send: without the key on this device the request is refused before anything leaves.
    #[test]
    fn gardener_send_without_a_key_is_refused() {
        let dir = temp_dir("gardener-no-key");
        let secrets = FileSecretStore::new(&dir);
        let message = key_or_refused(&secrets).expect_err("no key").to_string();
        assert!(message.starts_with("gardener:no-key: "), "{message}");
        secrets.set(KEY_SECRET, "sk-ant-test").unwrap();
        assert_eq!(key_or_refused(&secrets).unwrap(), "sk-ant-test");
        std::fs::remove_dir_all(&dir).ok();
    }
}
