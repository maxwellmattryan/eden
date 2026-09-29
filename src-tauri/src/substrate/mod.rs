//! The substrate's data layer: the workspace and, over it, the primitives, entities and links every domain reads and
//! writes (docs/product/substrate/data.md, docs/engineering/data-layer.md).

use std::path::Path;

use crate::db::{self, Db};
use crate::error::Result;

/// The owner's workspace on this device: the managed state every data command takes.
pub struct Workspace {
    db: Db,
}

impl Workspace {
    /// Opens the workspace in the app data dir, creating it on first launch.
    pub fn open(dir: &Path) -> Result<Self> {
        let db = db::open(dir)?;
        let version = db.read(db::schema_version)?;
        log::info!("Workspace open (schema version {version})");
        Ok(Self { db })
    }

    /// Run on exit, so the database file alone holds everything.
    pub fn close(&self) {
        if let Err(e) = self.db.checkpoint() {
            log::warn!("Workspace checkpoint on exit failed: {e}");
        }
    }
}
