//! The resource registry (D-35): every fact type, entity type and kind, with its owner, its tier and its phase. The
//! rows are generated from the domains' manifests (`packages/shared/src/domains/<id>/manifest.json`, and
//! `registry/substrate.json` and `registry/planned.json` beside them) by `yarn registry`, which checks them against
//! docs/product/substrate/registry.md. A write names a live resource, one of Phase 1, or is refused; a row that
//! arrives by import keeps whatever well-formed id it has, so a bundle from a newer build loses nothing.

#[path = "registry_generated.rs"]
mod generated;

use generated::RESOURCES;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Fact,
    /// One of the four shared tables; a row of it has a kind, and it is never an entity type.
    Primitive,
    Entity,
    Kind,
}

/// The privacy tier (docs/product/substrate/privacy.md).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tier {
    T0,
    T1,
    T2,
    T3,
    /// A primitive's rows take the tier of their kind (D-30).
    ByKind,
    /// A mirrored Event takes the tier of its calendar source.
    BySource,
}

#[derive(Debug, Clone, Copy)]
pub struct Resource {
    pub id: &'static str,
    pub category: Category,
    /// The primitive a kind belongs to.
    pub primitive: Option<&'static str>,
    /// A domain id, or `substrate`.
    pub owner: &'static str,
    // Read by the grant store (issue 33) and the Gardener's context packs (issue 35).
    #[allow(dead_code)]
    pub tier: Tier,
    /// When the resource first exists; `None` is later than Phase 3.
    pub phase: Option<u8>,
}

impl Resource {
    /// Whether a write may create it: the resources of Phase 1.
    pub fn live(&self) -> bool {
        self.phase == Some(1)
    }
}

/// The row of an id, live or not: what a declared read, a grant or an audit entry names (D-31).
// Called by the grant store (issue 33) and the audit log (issue 35).
#[allow(dead_code)]
pub fn resource(id: &str) -> Option<&'static Resource> {
    RESOURCES.iter().find(|row| row.id == id)
}

fn live(category: Category) -> impl Iterator<Item = &'static Resource> {
    RESOURCES
        .iter()
        .filter(move |row| row.category == category && row.live())
}

pub fn is_entity_type(id: &str) -> bool {
    live(Category::Entity).any(|row| row.id == id)
}

pub fn is_kind(primitive: &str, kind: &str) -> bool {
    live(Category::Kind).any(|row| row.id == kind && row.primitive == Some(primitive))
}

/// Whether any live entity type or kind belongs to `owner`.
pub fn is_owner(owner: &str) -> bool {
    live(Category::Entity)
        .chain(live(Category::Kind))
        .any(|row| row.owner == owner)
}

/// The entity types a domain owns.
pub fn entity_types_of(owner: &str) -> Vec<&'static str> {
    live(Category::Entity)
        .filter(|row| row.owner == owner)
        .map(|row| row.id)
        .collect()
}

/// The kinds of one primitive a domain owns.
pub fn kinds_of(owner: &str, primitive: &str) -> Vec<&'static str> {
    live(Category::Kind)
        .filter(|row| row.owner == owner && row.primitive == Some(primitive))
        .map(|row| row.id)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::substrate::ids::is_resource_id;

    #[test]
    fn every_id_is_well_formed_and_listed_once() {
        for (index, row) in RESOURCES.iter().enumerate() {
            assert!(is_resource_id(row.id), "{:?}", row.id);
            assert!(is_resource_id(row.owner), "{:?}", row.owner);
            assert!(
                !RESOURCES[..index].iter().any(|other| other.id == row.id),
                "{:?} is listed twice",
                row.id
            );
            assert_eq!(row.primitive.is_some(), row.category == Category::Kind);
            if let Some(primitive) = row.primitive {
                assert!(crate::substrate::primitives::of_type(primitive).is_some());
            }
            if row.category == Category::Primitive {
                assert!(crate::substrate::primitives::of_type(row.id).is_some());
            }
        }
        assert!(is_entity_type("recipe"));
        assert!(!is_entity_type("task"));
        assert!(is_kind("event", "shop-day") && !is_kind("task", "shop-day"));
        assert_eq!(kinds_of("kitchen", "attachment"), ["haul-photo"]);
        assert!(entity_types_of("toolbench").contains(&"idea"));
        assert!(is_owner("weather") && !is_owner("finance"));
    }

    #[test]
    fn a_write_names_a_live_resource_and_a_read_any() {
        // Vigor is Phase 2: Sky may declare that it reads a workout, and nothing may create one yet
        let session = resource("workout-session").expect("registered");
        assert_eq!(
            (session.owner, session.tier, session.phase),
            ("fitness", Tier::T1, Some(2))
        );
        assert!(!session.live() && !is_kind("event", "workout-session"));
        assert!(!is_owner("fitness") && entity_types_of("fitness").is_empty());
        // a fact the owner may assert before its domain ships does not make the domain an owner of rows
        assert!(resource("medical-dietary-restriction").is_some_and(Resource::live));
        assert!(!is_owner("health"));
        assert_eq!(resource("account").map(|row| row.phase), Some(None));
        assert_eq!(resource("event").map(|row| row.tier), Some(Tier::ByKind));
        assert_eq!(
            resource("identity-document").map(|row| row.tier),
            Some(Tier::T3)
        );
        assert!(resource("kitchen.recipe").is_none());
    }
}
