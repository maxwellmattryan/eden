//! The IPC boundary of the data layer (docs/engineering/data-layer.md, "The IPC boundary"). Each command is one read
//! or one write of the workspace; a write is one transaction. `@eden/shared/data` wraps them all.

use serde_json::Value;
use tauri::State;

use crate::error::Result;
use crate::substrate::attachments::{self, AttachInput};
use crate::substrate::batch::{self, BatchOp, BatchResult};
use crate::substrate::bundle::{self, ExportRequest, ExportResult, ImportSummary, Manifest, Mode};
use crate::substrate::entities::{self, Entity, EntityInput, EntityQuery};
use crate::substrate::links::{self, Link, LinkInput, LinkQuery};
use crate::substrate::primitives::{self, Query, ATTACHMENT, EVENT, PLACE, TASK};
use crate::substrate::rows::{self, Stamped};
use crate::substrate::Workspace;

#[tauri::command]
pub async fn create_entity(workspace: State<'_, Workspace>, input: EntityInput) -> Result<Entity> {
    workspace.write(|ctx| entities::create(ctx, input))
}

#[tauri::command]
pub async fn update_entity(
    workspace: State<'_, Workspace>,
    id: String,
    payload: Value,
) -> Result<Entity> {
    workspace.write(|ctx| entities::update(ctx, &id, payload))
}

#[tauri::command]
pub async fn query_entities(
    workspace: State<'_, Workspace>,
    filter: EntityQuery,
) -> Result<Vec<Entity>> {
    workspace.read(|conn| entities::query(conn, &filter))
}

/// Tombstones the rows; the result lists the ones that changed.
#[tauri::command]
pub async fn delete_rows(
    workspace: State<'_, Workspace>,
    uris: Vec<String>,
) -> Result<Vec<Stamped>> {
    workspace.write(|ctx| {
        let mut stamped = Vec::new();
        for uri in &uris {
            stamped.extend(rows::delete(ctx, uri)?);
        }
        Ok(stamped)
    })
}

/// Brings tombstoned rows back; the result lists the ones that changed.
#[tauri::command]
pub async fn restore_rows(
    workspace: State<'_, Workspace>,
    uris: Vec<String>,
) -> Result<Vec<Stamped>> {
    workspace.write(|ctx| {
        let mut stamped = Vec::new();
        for uri in &uris {
            stamped.extend(rows::restore(ctx, uri)?);
        }
        Ok(stamped)
    })
}

#[tauri::command]
pub async fn apply_batch(
    workspace: State<'_, Workspace>,
    ops: Vec<BatchOp>,
    marker: Option<String>,
) -> Result<BatchResult> {
    workspace.write(|ctx| batch::apply(ctx, ops, marker.as_deref()))
}

#[tauri::command]
pub async fn link(workspace: State<'_, Workspace>, owner: String, link: LinkInput) -> Result<Link> {
    workspace.write(|ctx| links::link(ctx, &owner, &link))
}

#[tauri::command]
pub async fn unlink(
    workspace: State<'_, Workspace>,
    owner: String,
    uri: String,
    relation: String,
) -> Result<()> {
    workspace.write(|ctx| links::unlink(ctx, &owner, &uri, &relation))
}

#[tauri::command]
pub async fn query_links(workspace: State<'_, Workspace>, filter: LinkQuery) -> Result<Vec<Link>> {
    workspace.read(|conn| links::query(conn, &filter))
}

/// The row a URI names, deleted or not; `null` when there is none.
#[tauri::command]
pub async fn get_row(workspace: State<'_, Workspace>, uri: String) -> Result<Option<Value>> {
    workspace.read(|conn| rows::get(conn, &uri))
}

#[tauri::command]
pub async fn snapshot(
    workspace: State<'_, Workspace>,
    uri: String,
    snapshot: Value,
) -> Result<Value> {
    workspace.write(|ctx| rows::snapshot(ctx, &uri, &snapshot))
}

#[tauri::command]
pub async fn create_task(workspace: State<'_, Workspace>, input: Value) -> Result<Value> {
    workspace.write(|ctx| primitives::create(ctx, &TASK, input))
}

#[tauri::command]
pub async fn create_event(workspace: State<'_, Workspace>, input: Value) -> Result<Value> {
    workspace.write(|ctx| primitives::create(ctx, &EVENT, input))
}

#[tauri::command]
pub async fn create_place(workspace: State<'_, Workspace>, input: Value) -> Result<Value> {
    workspace.write(|ctx| primitives::create(ctx, &PLACE, input))
}

/// Copies the file into the workspace and writes its row. The copy can be long, so it runs off the async runtime.
#[tauri::command]
pub async fn attach(app: tauri::AppHandle, input: AttachInput) -> Result<Value> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        attachments::attach(&app.state::<Workspace>(), input)
    })
    .await?
}

#[tauri::command]
pub async fn update_task(
    workspace: State<'_, Workspace>,
    id: String,
    patch: Value,
) -> Result<Value> {
    workspace.write(|ctx| primitives::update(ctx, &TASK, &id, patch))
}

#[tauri::command]
pub async fn update_event(
    workspace: State<'_, Workspace>,
    id: String,
    patch: Value,
) -> Result<Value> {
    workspace.write(|ctx| primitives::update(ctx, &EVENT, &id, patch))
}

#[tauri::command]
pub async fn update_place(
    workspace: State<'_, Workspace>,
    id: String,
    patch: Value,
) -> Result<Value> {
    workspace.write(|ctx| primitives::update(ctx, &PLACE, &id, patch))
}

#[tauri::command]
pub async fn update_attachment(
    workspace: State<'_, Workspace>,
    id: String,
    patch: Value,
) -> Result<Value> {
    workspace.write(|ctx| primitives::update(ctx, &ATTACHMENT, &id, patch))
}

#[tauri::command]
pub async fn query_tasks(workspace: State<'_, Workspace>, filter: Query) -> Result<Vec<Value>> {
    workspace.read(|conn| primitives::query(conn, &TASK, &filter))
}

#[tauri::command]
pub async fn query_events(workspace: State<'_, Workspace>, filter: Query) -> Result<Vec<Value>> {
    workspace.read(|conn| primitives::query(conn, &EVENT, &filter))
}

#[tauri::command]
pub async fn query_places(workspace: State<'_, Workspace>, filter: Query) -> Result<Vec<Value>> {
    workspace.read(|conn| primitives::query(conn, &PLACE, &filter))
}

#[tauri::command]
pub async fn query_attachments(
    workspace: State<'_, Workspace>,
    filter: Query,
) -> Result<Vec<Value>> {
    workspace.read(|conn| primitives::query(conn, &ATTACHMENT, &filter))
}

/// Writes a bundle of the workspace, or of what one domain owns. Off the async runtime: it reads every row.
#[tauri::command]
pub async fn export_bundle(app: tauri::AppHandle, request: ExportRequest) -> Result<ExportResult> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || bundle::export(&app.state::<Workspace>(), request))
        .await?
}

/// The manifest of a bundle, once every file in it has been checked against its hash.
#[tauri::command]
pub async fn inspect_bundle(path: String) -> Result<Manifest> {
    tauri::async_runtime::spawn_blocking(move || bundle::inspect(std::path::Path::new(&path)))
        .await?
}

/// Brings a bundle in. A replace writes a backup of the whole workspace first, and names it in its answer.
#[tauri::command]
pub async fn import_bundle(
    app: tauri::AppHandle,
    path: String,
    mode: Mode,
) -> Result<ImportSummary> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        bundle::import(&app.state::<Workspace>(), std::path::Path::new(&path), mode)
    })
    .await?
}
