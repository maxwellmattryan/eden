//! Domain code on the Rust side lives here, one module per plain domain id (`kitchen`, `toolbench`, `weather`, …),
//! each with its models, services and commands, registered from `lib.rs` (docs/engineering/app-scaffold.md, "Where a
//! domain's code goes"). `documents` is the interim store every domain persists through until the data layer lands.
pub mod documents;
pub mod weather;
