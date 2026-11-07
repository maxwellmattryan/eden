//! Orchard on the Rust side (docs/product/domains/finance.md §8): the Plaid provider. The client id, the secrets and
//! every access token live in the secret store (T3, per device, D-184); the webview gets a link token, the hosted
//! page's URL, and whether keys exist, never a key or a token. The commands exist in both features so the handler
//! list is one list; only the desktop binds them (the phone's links are #89).

pub mod plaid;
pub mod provider;

use std::collections::HashMap;
use std::time::Duration;

use serde_json::Value;
use tauri::State;

use crate::db::secret_store::SecretStore;
use crate::error::Result;
use crate::substrate::{egress, ids, Workspace};
use plaid::{refused, Env, Keys, Mode, Plaid, Session, Transport};
use provider::{LinkPoll, LinkStart, PlaidStatus, SyncResult};

/// Each request's deadline.
const TIMEOUT: Duration = Duration::from_secs(30);

/// The real transport: `reqwest` over the crate's rustls, every request counted in the egress ledger under `plaid`.
pub struct Http<'a> {
    base: &'static str,
    client: reqwest::Client,
    workspace: &'a Workspace,
}

impl<'a> Http<'a> {
    fn new(env: Env, workspace: &'a Workspace) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .https_only(true)
            .build()
            .map_err(|e| network(&e))?;
        Ok(Self {
            base: env.base_url(),
            client,
            workspace,
        })
    }
}

/// A request that got no answer. `without_url` keeps the address out; the keys are in the body, never in an error.
fn network(e: &reqwest::Error) -> crate::error::EdenError {
    let detail = if e.is_timeout() {
        "timed out".to_string()
    } else {
        "no answer".to_string()
    };
    refused("network", detail)
}

impl Transport for Http<'_> {
    async fn post(&self, path: &str, body: Value) -> Result<(u16, Value)> {
        let text = body.to_string();
        let bytes_out = (self.base.len() + path.len() + text.len()) as u64;
        if let Err(e) = self
            .workspace
            .write(|ctx| egress::record(ctx.conn, plaid::DESTINATION, bytes_out))
        {
            log::warn!("The egress ledger did not take a Plaid request: {e}");
        }
        let response = self
            .client
            .post(format!("{}{path}", self.base))
            .header("content-type", "application/json")
            .body(text)
            .send()
            .await
            .map_err(|e| network(&e))?;
        let status = response.status().as_u16();
        let answer = response.json::<Value>().await.unwrap_or(Value::Null);
        if (200..300).contains(&status) && !answer.is_object() {
            return Err(refused("provider-down", "an answer that is not JSON"));
        }
        Ok((status, answer))
    }
}

/// The finished Link sessions of this run, by link token, so a poll after the answer gets the same answer and a
/// public token is never exchanged twice. Held across a poll, so polls run one at a time. It only grows, one small
/// entry per finished session, and is cleared on restart; a few links a year never make that worth pruning.
#[derive(Default)]
pub struct Sessions(tokio::sync::Mutex<HashMap<String, LinkPoll>>);

fn keys(secrets: &dyn SecretStore, env: Env) -> Result<Option<Keys>> {
    let client_id = secrets.get(plaid::CLIENT_ID_SECRET)?;
    let secret = secrets.get(env.secret_name())?;
    Ok(client_id
        .zip(secret)
        .map(|(client_id, secret)| Keys { client_id, secret }))
}

fn client<'a>(workspace: &'a Workspace, secrets: &dyn SecretStore) -> Result<Plaid<Http<'a>>> {
    let env = Env::current();
    let keys =
        keys(secrets, env)?.ok_or_else(|| refused("no-keys", "no Plaid keys on this device"))?;
    Ok(Plaid::new(env, keys, Http::new(env, workspace)?))
}

/// A link's access token. The id must be a link's ULID, so it can only ever name a `plaid-item-` secret.
fn token(secrets: &dyn SecretStore, link_id: &str) -> Result<String> {
    if !ids::is_ulid(link_id) {
        return Err(refused("not-found", "not a link id"));
    }
    secrets
        .get(&plaid::item_secret(link_id))?
        .ok_or_else(|| refused("not-found", "no token for this link on this device"))
}

/// The device's `client_user_id`: random, made on first use, never the owner's name.
fn user_id(secrets: &dyn SecretStore) -> Result<String> {
    if let Some(id) = secrets.get(plaid::USER_ID_SECRET)? {
        return Ok(id);
    }
    let id = ids::new_id().to_ascii_lowercase();
    secrets.set(plaid::USER_ID_SECRET, &id)?;
    Ok(id)
}

#[tauri::command]
pub async fn plaid_status(secrets: State<'_, Box<dyn SecretStore>>) -> Result<PlaidStatus> {
    let env = Env::current();
    Ok(PlaidStatus {
        environment: env.name(),
        has_keys: keys(secrets.inner().as_ref(), env)?.is_some(),
    })
}

/// Stores the keys once Plaid has accepted them: `plaid:invalid-keys` when it refuses them, `plaid:network` when it
/// can't be reached, and nothing is stored either way.
#[tauri::command]
pub async fn plaid_set_keys(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    client_id: String,
    secret: String,
) -> Result<()> {
    let (client_id, secret) = (client_id.trim().to_string(), secret.trim().to_string());
    if client_id.is_empty() || secret.is_empty() {
        return Err(refused("invalid-keys", "both keys are needed"));
    }
    let env = Env::current();
    let trial = Plaid::new(
        env,
        Keys {
            client_id: client_id.clone(),
            secret: secret.clone(),
        },
        Http::new(env, &workspace)?,
    );
    trial.check_keys().await?;
    secrets.set(plaid::CLIENT_ID_SECRET, &client_id)?;
    secrets.set(env.secret_name(), &secret)
}

/// Removes this build's keys from the device. The links' tokens stay: entering keys again brings them back.
#[tauri::command]
pub async fn plaid_clear_keys(secrets: State<'_, Box<dyn SecretStore>>) -> Result<()> {
    secrets.delete(plaid::CLIENT_ID_SECRET)?;
    secrets.delete(Env::current().secret_name())?;
    Ok(())
}

/// A hosted Link session: a new Item, or with `link_id` the update mode of that link's own Item.
#[tauri::command]
pub async fn plaid_link_start(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    link_id: Option<String>,
) -> Result<LinkStart> {
    let secrets = secrets.inner().as_ref();
    let plaid = client(&workspace, secrets)?;
    let user = user_id(secrets)?;
    match link_id {
        Some(link_id) => {
            let access_token = token(secrets, &link_id)?;
            plaid
                .start_link(
                    &user,
                    &Mode::Update {
                        access_token: &access_token,
                    },
                )
                .await
        }
        None => plaid.start_link(&user, &Mode::Link).await,
    }
}

/// Where a session is. A finished new one exchanges its public token here, stores the access token under a new link
/// id and reads the institution, the item and the accounts; the public token never leaves the crate.
#[tauri::command]
pub async fn plaid_link_poll(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    sessions: State<'_, Sessions>,
    link_token: String,
    link_id: Option<String>,
) -> Result<LinkPoll> {
    let mut done = sessions.0.lock().await;
    if let Some(answer) = done.get(&link_token) {
        return Ok(answer.clone());
    }
    let secrets = secrets.inner().as_ref();
    let plaid = client(&workspace, secrets)?;
    let answer = match plaid.poll_link(&link_token, chrono::Utc::now()).await? {
        Session::Waiting => return Ok(LinkPoll::Waiting),
        Session::Expired => LinkPoll::Expired,
        Session::Exited { reason } => LinkPoll::Exited { reason },
        Session::Finished { .. } if link_id.is_some() => LinkPoll::Reconnected,
        Session::Finished {
            public_token: Some(public_token),
        } => LinkPoll::Linked(
            plaid
                .exchange_and_read(secrets, &public_token, &ids::new_id())
                .await?,
        ),
        Session::Finished { public_token: None } => {
            return Err(refused("other", "a finished session with no public token"))
        }
    };
    done.insert(link_token, answer.clone());
    Ok(answer)
}

/// One sync run for one link, from its cursor.
#[tauri::command]
pub async fn plaid_sync(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    link_id: String,
    cursor: Option<String>,
) -> Result<SyncResult> {
    let secrets = secrets.inner().as_ref();
    let plaid = client(&workspace, secrets)?;
    let access_token = token(secrets, &link_id)?;
    plaid.sync(&access_token, cursor, chrono::Utc::now()).await
}

/// Removes a tombstoned link's Item at Plaid and its token here. Answers whether there was a token.
#[tauri::command]
pub async fn plaid_revoke(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    link_id: String,
) -> Result<bool> {
    let secrets = secrets.inner().as_ref();
    if !ids::is_ulid(&link_id) || secrets.get(&plaid::item_secret(&link_id))?.is_none() {
        return Ok(false);
    }
    client(&workspace, secrets)?.revoke(secrets, &link_id).await
}

/// Sandbox only: the link asks the owner to sign in again.
#[tauri::command]
pub async fn plaid_sandbox_reset_login(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    link_id: String,
) -> Result<()> {
    let secrets = secrets.inner().as_ref();
    let plaid = client(&workspace, secrets)?;
    plaid.sandbox_reset_login(&token(secrets, &link_id)?).await
}
