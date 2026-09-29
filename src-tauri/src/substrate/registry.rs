//! The seed of the resource registry (D-35): the Phase 1 rows of docs/product/substrate/registry.md, by hand, until
//! the registry is generated from the domains' manifests. A write names a registered resource or is refused; a row
//! that arrives by import keeps whatever well-formed id it has, so a bundle from a newer build loses nothing.

/// Every Phase 1 entity type, with the domain that owns it (`substrate` for the substrate's own).
const ENTITY_TYPES: &[(&str, &str)] = &[
    ("calendar-source", "substrate"),
    ("stock-item", "kitchen"),
    ("recipe", "kitchen"),
    ("grocery-list", "kitchen"),
    ("grocery-item", "kitchen"),
    ("storage-tip", "kitchen"),
    ("idea", "toolbench"),
    ("project", "toolbench"),
    ("device", "toolbench"),
    ("parts-list", "toolbench"),
    ("sketch", "toolbench"),
    ("note", "toolbench"),
    ("brainstorm-session", "toolbench"),
    ("forecast", "weather"),
    ("alert", "weather"),
    ("ephemeris", "weather"),
    ("air-quality", "weather"),
    ("allergens", "weather"),
];

/// Every Phase 1 kind, with its primitive and the domain that owns it.
const KINDS: &[(&str, &str, &str)] = &[
    ("todo", "task", "substrate"),
    ("checklist", "task", "substrate"),
    ("routine", "task", "substrate"),
    ("habit", "task", "substrate"),
    ("reminder", "task", "substrate"),
    ("local-event", "event", "substrate"),
    ("shop-day", "event", "kitchen"),
    ("home", "place", "substrate"),
    ("venue", "place", "substrate"),
    ("document", "attachment", "substrate"),
    ("photo", "attachment", "substrate"),
    ("haul-photo", "attachment", "kitchen"),
    ("render", "attachment", "toolbench"),
];

pub fn is_entity_type(id: &str) -> bool {
    ENTITY_TYPES.iter().any(|(entity, _)| *entity == id)
}

pub fn is_kind(primitive: &str, kind: &str) -> bool {
    KINDS
        .iter()
        .any(|(id, of, _)| *id == kind && *of == primitive)
}

/// Whether anything in the registry belongs to `owner`.
pub fn is_owner(owner: &str) -> bool {
    ENTITY_TYPES.iter().any(|(_, of)| *of == owner) || KINDS.iter().any(|(_, _, of)| *of == owner)
}

/// The entity types a domain owns.
pub fn entity_types_of(owner: &str) -> Vec<&'static str> {
    ENTITY_TYPES
        .iter()
        .filter(|(_, of)| *of == owner)
        .map(|(id, _)| *id)
        .collect()
}

/// The kinds of one primitive a domain owns.
pub fn kinds_of(owner: &str, primitive: &str) -> Vec<&'static str> {
    KINDS
        .iter()
        .filter(|(_, p, of)| *p == primitive && *of == owner)
        .map(|(id, _, _)| *id)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::substrate::ids::is_resource_id;

    #[test]
    fn every_id_is_well_formed_and_listed_once() {
        for (index, (id, owner)) in ENTITY_TYPES.iter().enumerate() {
            assert!(is_resource_id(id), "{id:?}");
            assert!(is_resource_id(owner), "{owner:?}");
            assert!(
                !ENTITY_TYPES[..index].iter().any(|(other, _)| other == id),
                "{id:?} is listed twice"
            );
        }
        for (index, (id, primitive, owner)) in KINDS.iter().enumerate() {
            assert!(is_resource_id(id) && is_resource_id(owner), "{id:?}");
            assert!(crate::substrate::primitives::of_type(primitive).is_some());
            assert!(!is_entity_type(id), "{id:?} is an entity type too");
            assert!(
                !KINDS[..index].iter().any(|(other, _, _)| other == id),
                "{id:?} is listed twice"
            );
        }
        assert!(is_entity_type("recipe"));
        assert!(!is_entity_type("task"));
        assert!(is_kind("event", "shop-day") && !is_kind("task", "shop-day"));
        assert_eq!(kinds_of("kitchen", "attachment"), ["haul-photo"]);
        assert!(entity_types_of("toolbench").contains(&"idea"));
        assert!(is_owner("weather") && !is_owner("finance"));
    }
}
