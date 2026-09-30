//! The IPC boundary of the profile (docs/engineering/data-layer.md, "The profile"): what "What Eden knows about me"
//! reads and edits, what a domain asks for the facts it needs, and what the substrate derives. `@eden/shared/profile`
//! wraps them.

use tauri::State;

use crate::error::Result;
use crate::substrate::facts::{self, Fact, FactHistoryEntry, FactInput, FactPatch, FactQuery};
use crate::substrate::Workspace;

#[tauri::command]
pub async fn assert_fact(workspace: State<'_, Workspace>, input: FactInput) -> Result<Fact> {
    workspace.write(|ctx| facts::assert(ctx, input))
}

#[tauri::command]
pub async fn update_fact(
    workspace: State<'_, Workspace>,
    id: String,
    patch: FactPatch,
) -> Result<Fact> {
    workspace.write(|ctx| facts::update(ctx, &id, &patch))
}

#[tauri::command]
pub async fn delete_fact(workspace: State<'_, Workspace>, id: String) -> Result<Fact> {
    workspace.write(|ctx| facts::delete(ctx, &id))
}

#[tauri::command]
pub async fn restore_fact(workspace: State<'_, Workspace>, id: String) -> Result<Fact> {
    workspace.write(|ctx| facts::restore(ctx, &id))
}

#[tauri::command]
pub async fn query_facts(workspace: State<'_, Workspace>, filter: FactQuery) -> Result<Vec<Fact>> {
    workspace.read(|conn| facts::query(conn, &filter))
}

#[tauri::command]
pub async fn query_fact_history(
    workspace: State<'_, Workspace>,
    fact_id: String,
) -> Result<Vec<FactHistoryEntry>> {
    workspace.read(|conn| facts::history(conn, &fact_id))
}
