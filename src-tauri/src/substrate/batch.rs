//! Many writes as one: a batch is applied whole or not at all. A batch may carry a marker, the name of something
//! that must happen once (an import of old data, say); the marker is written with the batch, and a batch whose marker
//! is already there is not applied again.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::entities::{self, EntityInput};
use super::hlc::{read_meta, write_meta};
use super::links::{self, LinkInput};
use super::primitives;
use super::rows;
use super::WriteCtx;
use crate::error::{EdenError, Result};

#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum BatchOp {
    CreateEntity {
        input: EntityInput,
    },
    UpdateEntity {
        id: String,
        payload: Value,
    },
    /// `type` is `task`, `event` or `place`. An attachment has a file, and is attached on its own.
    CreatePrimitive {
        #[serde(rename = "type")]
        type_id: String,
        input: Value,
    },
    UpdatePrimitive {
        #[serde(rename = "type")]
        type_id: String,
        id: String,
        patch: Value,
    },
    Delete {
        uri: String,
    },
    Restore {
        uri: String,
    },
    Link {
        owner: String,
        link: LinkInput,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    /// False when the batch carried a marker that was already there, and so did nothing.
    pub applied: bool,
    /// The rows the batch created or updated, in the order of its operations.
    pub rows: Vec<Value>,
}

fn batchable(type_id: &str) -> Result<&'static primitives::Primitive> {
    primitives::of_type(type_id)
        .filter(|primitive| primitive.type_id != primitives::ATTACHMENT.type_id)
        .ok_or_else(|| {
            EdenError::InvalidOperation(format!("not a primitive a batch can write: {type_id:?}"))
        })
}

fn marker_key(marker: &str) -> Result<String> {
    let well_formed = !marker.is_empty()
        && marker
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == ':');
    if well_formed {
        Ok(format!("batch-marker:{marker}"))
    } else {
        Err(EdenError::InvalidOperation(format!(
            "not a marker: {marker:?}"
        )))
    }
}

pub fn apply(ctx: &mut WriteCtx, ops: Vec<BatchOp>, marker: Option<&str>) -> Result<BatchResult> {
    let key = marker.map(marker_key).transpose()?;
    if let Some(key) = &key {
        if read_meta(ctx.conn, key)?.is_some() {
            return Ok(BatchResult {
                applied: false,
                rows: Vec::new(),
            });
        }
    }

    let mut rows = Vec::new();
    for op in ops {
        match op {
            BatchOp::CreateEntity { input } => {
                rows.push(serde_json::to_value(entities::create(ctx, input)?)?)
            }
            BatchOp::CreatePrimitive { type_id, input } => {
                rows.push(primitives::create(ctx, batchable(&type_id)?, input)?)
            }
            BatchOp::UpdatePrimitive { type_id, id, patch } => {
                rows.push(primitives::update(ctx, batchable(&type_id)?, &id, patch)?)
            }
            BatchOp::UpdateEntity { id, payload } => {
                rows.push(serde_json::to_value(entities::update(ctx, &id, payload)?)?)
            }
            BatchOp::Delete { uri } => {
                rows::delete(ctx, &uri)?;
            }
            BatchOp::Restore { uri } => {
                rows::restore(ctx, &uri)?;
            }
            BatchOp::Link { owner, link } => {
                links::link(ctx, &owner, &link)?;
            }
        }
    }

    if let Some(key) = &key {
        write_meta(ctx.conn, key, "done")?;
    }
    Ok(BatchResult {
        applied: true,
        rows,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::substrate::entities::EntityQuery;
    use crate::substrate::Workspace;

    fn ops(value: Value) -> Vec<BatchOp> {
        serde_json::from_value(value).unwrap()
    }

    fn count(workspace: &Workspace, type_id: &str) -> usize {
        let filter = EntityQuery {
            type_id: type_id.to_string(),
            ..Default::default()
        };
        workspace
            .read(|conn| entities::query(conn, &filter))
            .unwrap()
            .len()
    }

    #[test]
    fn a_batch_reads_the_shape_the_frontend_sends() {
        let workspace = Workspace::in_memory();
        let idea = crate::substrate::ids::new_id();
        let project = crate::substrate::ids::new_id();
        let batch = ops(json!([
            { "op": "createEntity", "input": { "id": project, "type": "project", "payload": { "name": "Kiln build" } } },
            { "op": "createEntity", "input": { "id": idea, "type": "idea", "payload": { "title": "Kiln" } } },
            { "op": "updateEntity", "id": idea, "payload": { "title": "Kiln", "projectId": project } },
            { "op": "link", "owner": format!("eden://idea/{idea}"),
              "link": { "uri": format!("eden://project/{project}"), "relation": "part-of" } },
            { "op": "delete", "uri": format!("eden://project/{project}") },
            { "op": "restore", "uri": format!("eden://project/{project}") },
        ]));

        let result = workspace.write(|ctx| apply(ctx, batch, None)).unwrap();
        assert!(result.applied);
        assert_eq!(result.rows.len(), 3);
        assert_eq!(result.rows[2]["payload"]["projectId"], json!(project));
        assert_eq!(count(&workspace, "idea"), 1);
        assert_eq!(count(&workspace, "project"), 1);

        // Each operation has its own stamp, in order.
        let stamps: Vec<&str> = result
            .rows
            .iter()
            .map(|row| row["updatedAt"].as_str().unwrap())
            .collect();
        assert!(stamps.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn a_batch_that_fails_writes_nothing_not_even_its_marker() {
        let workspace = Workspace::in_memory();
        let batch = ops(json!([
            { "op": "createEntity", "input": { "type": "recipe", "payload": { "name": "Dal" } } },
            { "op": "createEntity", "input": { "type": "spaceship", "payload": {} } },
        ]));
        assert!(workspace
            .write(|ctx| apply(ctx, batch, Some("legacy-import:kitchen")))
            .is_err());
        assert_eq!(count(&workspace, "recipe"), 0);

        // The marker was not written, so the next try is applied.
        let retry = ops(json!([
            { "op": "createEntity", "input": { "type": "recipe", "payload": { "name": "Dal" } } },
        ]));
        assert!(
            workspace
                .write(|ctx| apply(ctx, retry, Some("legacy-import:kitchen")))
                .unwrap()
                .applied
        );
        assert_eq!(count(&workspace, "recipe"), 1);
    }

    #[test]
    fn a_marked_batch_is_applied_once() {
        let workspace = Workspace::in_memory();
        let batch = || {
            ops(json!([
                { "op": "createEntity", "input": { "type": "recipe", "payload": { "name": "Dal" } } },
            ]))
        };
        let marker = Some("legacy-import:kitchen");
        assert!(
            workspace
                .write(|ctx| apply(ctx, batch(), marker))
                .unwrap()
                .applied
        );

        let second = workspace.write(|ctx| apply(ctx, batch(), marker)).unwrap();
        assert!(!second.applied);
        assert!(second.rows.is_empty());
        assert_eq!(count(&workspace, "recipe"), 1);

        // An empty batch still leaves its marker: there was nothing to bring over, and that is settled.
        let other = Some("legacy-import:toolbench");
        assert!(
            workspace
                .write(|ctx| apply(ctx, Vec::new(), other))
                .unwrap()
                .applied
        );
        assert!(
            !workspace
                .write(|ctx| apply(ctx, batch(), other))
                .unwrap()
                .applied
        );

        assert!(workspace
            .write(|ctx| apply(ctx, batch(), Some("Not A Marker")))
            .is_err());
    }
}
