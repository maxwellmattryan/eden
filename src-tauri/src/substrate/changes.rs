//! The seam for the substrate's own signals. Every write records what it changed, and the changes are published once
//! the write has committed. Signals exist (`signals.rs`; docs/product/substrate/signals-notifications.md) and the
//! domains emit theirs from the frontend, but `publish` still only logs: `event.created`, `task.completed` and the
//! rest of the substrate's list are not emitted yet (D-73). Three things are settled first, with the issues that
//! consume them (the Tasks substrate, the notification center):
//!
//! - One signal per write or one per change. A seed or a legacy import is a single batch of dozens of creates.
//! - What an import emits. A bundle is applied without recording changes, so today it would be silent.
//! - What a change carries. `task.completed` needs the transition and `attachment.added` the kind, and a change is a
//!   URI and an operation.
//!
//! When they are, this is where the signals are emitted, and no write changes.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChangeOp {
    Created,
    Updated,
    Deleted,
    Restored,
}

impl ChangeOp {
    fn as_str(self) -> &'static str {
        match self {
            ChangeOp::Created => "created",
            ChangeOp::Updated => "updated",
            ChangeOp::Deleted => "deleted",
            ChangeOp::Restored => "restored",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Change {
    pub uri: String,
    pub op: ChangeOp,
}

pub fn publish(changes: &[Change]) {
    for change in changes {
        log::debug!("change: {} {}", change.op.as_str(), change.uri);
    }
}
