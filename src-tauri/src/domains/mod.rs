//! Domain code on the Rust side lives here, one module per plain domain id (`kitchen`, `toolbench`, `weather`, …),
//! each with its models, services and commands, registered from `lib.rs` (docs/engineering/app-scaffold.md, "Where a
//! domain's code goes"). `documents` keeps what stays on this device, one
//! JSON document per domain; the owner's data is in the workspace database (`crate::substrate`).
pub mod documents;
pub mod weather;
