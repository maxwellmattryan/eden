//! The seam for signals. Every write records what it changed, and the changes are published once the write has
//! committed. Signals do not exist yet (docs/product/substrate/signals-notifications.md), so publishing only logs;
//! when they do, `publish` is where `event.created` and `task.completed` are emitted, and no write changes.

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
