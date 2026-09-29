//! The database handle: one writer connection behind a mutex.
//!
//! Every write goes through [`Db::write`], so the mutex is the critical section for anything that reads and then
//! writes (a clock tick, a merge). [`Db::read`] exists so callers say which they mean; today it takes the same
//! connection, and a pool of read-only connections can sit behind it later without touching a caller.

use rusqlite::Connection;
use std::sync::{Arc, Mutex};

use crate::error::{EdenError, Result};

#[derive(Clone)]
pub struct Db {
    writer: Arc<Mutex<Connection>>,
}

impl Db {
    pub fn new(conn: Connection) -> Self {
        Self {
            writer: Arc::new(Mutex::new(conn)),
        }
    }

    /// A read that writes nothing. Never tick the clock or stamp a row in here.
    pub fn read<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        self.write(f)
    }

    /// Serialized access to the writer.
    pub fn write<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let guard = self.writer.lock().map_err(|_| EdenError::LockPoisoned)?;
        f(&guard)
    }

    /// Folds the write-ahead log back into the database file, so the file alone is the whole database. Run on exit.
    pub fn checkpoint(&self) -> Result<()> {
        self.write(|conn| {
            conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))?;
            Ok(())
        })
    }
}
