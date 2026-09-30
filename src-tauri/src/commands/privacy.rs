//! The IPC boundary of the grant store and the egress ledger (docs/engineering/data-layer.md, "Grants", "The egress
//! ledger"). What Settings → Privacy reads, what a Gardener read or a confirm asks first, and what every request that
//! leaves the device reports. `@eden/shared/grants` and `@eden/shared/egress` wrap them.

use tauri::State;

use crate::error::Result;
use crate::substrate::egress::{self, EgressQuery, EgressRow};
use crate::substrate::grants::{self, CheckQuery, Decision, Grant, GrantInput, GrantQuery};
use crate::substrate::Workspace;

#[tauri::command]
pub async fn grant(workspace: State<'_, Workspace>, input: GrantInput) -> Result<Grant> {
    workspace.write(|ctx| grants::grant(ctx, input))
}

#[tauri::command]
pub async fn revoke(workspace: State<'_, Workspace>, id: String) -> Result<Grant> {
    workspace.write(|ctx| grants::revoke(ctx, &id))
}

#[tauri::command]
pub async fn query_grants(
    workspace: State<'_, Workspace>,
    filter: GrantQuery,
) -> Result<Vec<Grant>> {
    workspace.read(|conn| grants::query(conn, &filter))
}

#[tauri::command]
pub async fn check_grant(workspace: State<'_, Workspace>, query: CheckQuery) -> Result<Decision> {
    workspace.read(|conn| grants::check(conn, &query))
}

#[tauri::command]
pub async fn record_egress(
    workspace: State<'_, Workspace>,
    destination: String,
    bytes_out: u64,
) -> Result<()> {
    workspace.write(|ctx| egress::record(ctx.conn, &destination, bytes_out))
}

#[tauri::command]
pub async fn query_egress(
    workspace: State<'_, Workspace>,
    filter: EgressQuery,
) -> Result<Vec<EgressRow>> {
    workspace.read(|conn| egress::query(conn, &filter))
}
