//! The substrate's data layer: the workspace and, over it, the primitives, entities and links every domain reads and
//! writes (docs/product/substrate/data.md, docs/engineering/data-layer.md).

pub mod attachments;
pub mod batch;
pub mod bundle;
pub mod changes;
pub mod egress;
pub mod entities;
pub mod facts;
pub mod grants;
pub mod hlc;
pub mod ids;
pub mod links;
pub mod primitives;
pub mod registry;
pub mod rows;
pub mod text;

use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::db::{self, Db};
use crate::error::Result;
use changes::{Change, ChangeOp};

/// The owner's workspace on this device: the managed state every data command takes.
pub struct Workspace {
    db: Db,
    /// The app data dir: the database, and beside it the files of the attachments.
    dir: PathBuf,
}

/// One write: the transaction's connection, and what the write has changed so far.
pub struct WriteCtx<'a> {
    pub conn: &'a Connection,
    changes: Vec<Change>,
}

impl WriteCtx<'_> {
    pub(crate) fn record(&mut self, uri: &str, op: ChangeOp) {
        self.changes.push(Change {
            uri: uri.to_string(),
            op,
        });
    }
}

impl Workspace {
    /// Opens the workspace in the app data dir, creating it on first launch.
    pub fn open(dir: &Path) -> Result<Self> {
        let db = db::open(dir)?;
        let version = db.read(db::schema_version)?;
        log::info!("Workspace open (schema version {version})");
        let workspace = Self {
            db,
            dir: dir.to_path_buf(),
        };
        // What the last run left behind: the grants that lasted a session, and the ledger days and the replaced
        // facts past their retention.
        let (sessions, days, history) = workspace.write(|ctx| {
            let sessions = grants::sweep_session(ctx)?;
            let days = egress::sweep(ctx.conn, &egress::today())?;
            let history = facts::sweep_history(ctx.conn, hlc::now_ms())?;
            Ok((sessions, days, history))
        })?;
        if sessions > 0 || days > 0 || history > 0 {
            log::info!(
                "Swept {sessions} session grants, {days} ledger rows and {history} replaced facts"
            );
        }
        Ok(workspace)
    }

    /// The app data dir.
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Where an attachment's file is kept: `attachments/<id>`, with no extension, named by the row.
    pub fn attachment_path(&self, id: &str) -> PathBuf {
        self.dir.join("attachments").join(id)
    }

    pub fn read<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        self.db.read(f)
    }

    /// Runs `f` in one transaction: all of it is written, or none of it. What it changed is published after the
    /// commit, never before and never for a write that failed.
    pub fn write<T>(&self, f: impl FnOnce(&mut WriteCtx) -> Result<T>) -> Result<T> {
        let (value, changes) = self.db.write(|conn| {
            let tx = conn.unchecked_transaction()?;
            let mut ctx = WriteCtx {
                conn: &tx,
                changes: Vec::new(),
            };
            let value = f(&mut ctx)?;
            let changes = ctx.changes;
            tx.commit()?;
            Ok((value, changes))
        })?;
        changes::publish(&changes);
        Ok(value)
    }

    /// Run on exit, so the database file alone holds everything.
    pub fn close(&self) {
        if let Err(e) = self.db.checkpoint() {
            log::warn!("Workspace checkpoint on exit failed: {e}");
        }
    }

    /// A workspace in memory, with the whole schema and no key. Its files, if a test attaches any, go to a directory
    /// of its own under the system's temp dir.
    #[cfg(test)]
    pub(crate) fn in_memory() -> Self {
        Self {
            db: Db::new(db::testing::memory()),
            dir: std::env::temp_dir().join(format!("eden-workspace-{}", ids::new_id())),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::entities::{EntityInput, EntityQuery};
    use super::links::{LinkInput, LinkQuery};
    use super::*;
    use crate::error::EdenError;

    fn input(type_id: &str, payload: Value) -> EntityInput {
        EntityInput {
            id: None,
            type_id: type_id.to_string(),
            payload,
            mirror: false,
            source: None,
            external_id: None,
            snapshot: None,
        }
    }

    fn of_type(type_id: &str) -> EntityQuery {
        EntityQuery {
            type_id: type_id.to_string(),
            ..Default::default()
        }
    }

    fn recipes(workspace: &Workspace) -> Vec<entities::Entity> {
        workspace
            .read(|conn| entities::query(conn, &of_type("recipe")))
            .unwrap()
    }

    #[test]
    fn an_entity_is_created_read_and_replaced() {
        let workspace = Workspace::in_memory();
        let created = workspace
            .write(|ctx| {
                entities::create(ctx, input("recipe", json!({ "name": "Dal", "serves": 2 })))
            })
            .unwrap();
        assert_eq!(created.uri, format!("eden://recipe/{}", created.id));
        assert_eq!(created.created_at, created.updated_at);
        assert_eq!(created.deleted_at, None);

        let updated = workspace
            .write(|ctx| entities::update(ctx, &created.id, json!({ "name": "Dal tadka" })))
            .unwrap();
        // The payload is replaced whole: `serves` is gone.
        assert_eq!(updated.payload, json!({ "name": "Dal tadka" }));
        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at > created.updated_at);
        assert_eq!(recipes(&workspace), vec![updated]);
    }

    #[test]
    fn a_write_is_refused_for_what_the_registry_does_not_know() {
        let workspace = Workspace::in_memory();
        for bad in [
            input("spaceship", json!({})),
            input("task", json!({})),
            input("recipe", json!("a string")),
            EntityInput {
                id: Some("r-01".to_string()),
                ..input("recipe", json!({}))
            },
        ] {
            let result = workspace.write(|ctx| entities::create(ctx, bad));
            assert!(matches!(result, Err(EdenError::InvalidOperation(_))));
        }
        assert!(recipes(&workspace).is_empty());
    }

    #[test]
    fn a_caller_may_bring_its_own_id() {
        let workspace = Workspace::in_memory();
        let id = ids::new_id();
        let created = workspace
            .write(|ctx| {
                entities::create(
                    ctx,
                    EntityInput {
                        id: Some(id.clone()),
                        ..input("idea", json!({ "title": "Kiln" }))
                    },
                )
            })
            .unwrap();
        assert_eq!(created.id, id);
    }

    #[test]
    fn a_tombstone_hides_the_row_and_a_restore_brings_it_back() {
        let workspace = Workspace::in_memory();
        let created = workspace
            .write(|ctx| entities::create(ctx, input("recipe", json!({ "name": "Dal" }))))
            .unwrap();

        let deleted = workspace
            .write(|ctx| rows::delete(ctx, &created.uri))
            .unwrap()
            .unwrap();
        assert!(deleted.updated_at > created.updated_at);
        assert!(recipes(&workspace).is_empty());

        // The row is still there, with its payload, stamped as deleted.
        let kept = workspace
            .read(|conn| {
                entities::query(
                    conn,
                    &EntityQuery {
                        include_deleted: true,
                        ..of_type("recipe")
                    },
                )
            })
            .unwrap();
        assert_eq!(kept[0].deleted_at.as_ref(), Some(&deleted.updated_at));
        assert_eq!(kept[0].updated_at, deleted.updated_at);
        assert_eq!(kept[0].payload, json!({ "name": "Dal" }));

        // Deleting twice, and updating what is deleted, change nothing.
        assert_eq!(
            workspace
                .write(|ctx| rows::delete(ctx, &created.uri))
                .unwrap(),
            None
        );
        assert!(matches!(
            workspace.write(|ctx| entities::update(ctx, &created.id, json!({}))),
            Err(EdenError::NotFound(_))
        ));

        let restored = workspace
            .write(|ctx| rows::restore(ctx, &created.uri))
            .unwrap()
            .unwrap();
        assert!(restored.updated_at > deleted.updated_at);
        let back = recipes(&workspace);
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].deleted_at, None);
        assert_eq!(back[0].payload, json!({ "name": "Dal" }));
    }

    #[test]
    fn a_row_that_does_not_exist_is_not_found() {
        let workspace = Workspace::in_memory();
        let missing = format!("eden://recipe/{}", ids::new_id());
        assert!(matches!(
            workspace.write(|ctx| rows::delete(ctx, &missing)),
            Err(EdenError::NotFound(_))
        ));
        // The type is part of the address: an idea's id is not a recipe.
        let idea = workspace
            .write(|ctx| entities::create(ctx, input("idea", json!({}))))
            .unwrap();
        assert!(matches!(
            workspace.write(|ctx| rows::delete(ctx, &format!("eden://recipe/{}", idea.id))),
            Err(EdenError::NotFound(_))
        ));
    }

    #[test]
    fn a_failed_write_leaves_nothing_behind() {
        let workspace = Workspace::in_memory();
        let result: Result<()> = workspace.write(|ctx| {
            entities::create(ctx, input("recipe", json!({ "name": "Dal" })))?;
            entities::create(ctx, input("spaceship", json!({})))?;
            Ok(())
        });
        assert!(result.is_err());
        assert!(recipes(&workspace).is_empty());
    }

    #[test]
    fn links_are_added_removed_and_brought_back() {
        let workspace = Workspace::in_memory();
        let (idea, project) = workspace
            .write(|ctx| {
                Ok((
                    entities::create(ctx, input("idea", json!({ "title": "Kiln" })))?,
                    entities::create(ctx, input("project", json!({ "name": "Kiln build" })))?,
                ))
            })
            .unwrap();
        let to_project = LinkInput {
            uri: project.uri.clone(),
            relation: "part-of".to_string(),
            label: "Kiln build".to_string(),
        };

        let first = workspace
            .write(|ctx| links::link(ctx, &idea.uri, &to_project))
            .unwrap();
        assert_eq!(first.owner, idea.uri);
        assert_eq!(first.uri, project.uri);

        // A query attaches the links, and can filter by them.
        let ideas = workspace
            .read(|conn| {
                entities::query(
                    conn,
                    &EntityQuery {
                        linked_to: Some(project.uri.clone()),
                        ..of_type("idea")
                    },
                )
            })
            .unwrap();
        assert_eq!(ideas.len(), 1);
        assert_eq!(ideas[0].links, vec![first.clone()]);
        let by_target = LinkQuery {
            target: Some(project.uri.clone()),
            ..Default::default()
        };
        assert_eq!(
            workspace
                .read(|conn| links::query(conn, &by_target))
                .unwrap(),
            vec![first.clone()]
        );

        workspace
            .write(|ctx| links::unlink(ctx, &idea.uri, &project.uri, "part-of"))
            .unwrap();
        assert!(workspace
            .read(|conn| links::query(conn, &by_target))
            .unwrap()
            .is_empty());

        // Linking again brings it back, with the new label and the first creation stamp.
        let renamed = LinkInput {
            label: "The kiln".to_string(),
            ..to_project.clone()
        };
        let again = workspace
            .write(|ctx| links::link(ctx, &idea.uri, &renamed))
            .unwrap();
        assert_eq!(again.label, "The kiln");
        assert_eq!(again.deleted_at, None);
        assert_eq!(again.created_at, first.created_at);
        assert!(again.updated_at > first.updated_at);

        // The target may be gone; the owner may not.
        workspace
            .write(|ctx| rows::delete(ctx, &project.uri))
            .unwrap();
        assert_eq!(
            workspace
                .read(|conn| links::query(conn, &by_target))
                .unwrap()
                .len(),
            1
        );
        workspace.write(|ctx| rows::delete(ctx, &idea.uri)).unwrap();
        assert!(matches!(
            workspace.write(|ctx| links::link(ctx, &idea.uri, &to_project)),
            Err(EdenError::NotFound(_))
        ));
    }

    #[test]
    fn a_link_needs_a_known_relation_and_two_uris() {
        let workspace = Workspace::in_memory();
        let idea = workspace
            .write(|ctx| entities::create(ctx, input("idea", json!({}))))
            .unwrap();
        for (uri, relation) in [
            (idea.uri.as_str(), "likes"),
            ("https://example.com", "about"),
        ] {
            let link = LinkInput {
                uri: uri.to_string(),
                relation: relation.to_string(),
                label: String::new(),
            };
            assert!(matches!(
                workspace.write(|ctx| links::link(ctx, &idea.uri, &link)),
                Err(EdenError::InvalidOperation(_))
            ));
        }
    }
}
