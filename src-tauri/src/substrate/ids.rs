//! Ids and URIs (D-24): an entity's id is a ULID that names no domain, and its URI is `eden://<type>/<id>`.

use std::fmt;
use std::sync::Mutex;

use crate::error::{EdenError, Result};

const SCHEME: &str = "eden://";

static GENERATOR: Mutex<Option<ulid::Generator>> = Mutex::new(None);

/// A new id. Ids made within one process only ever grow, even within one millisecond, so the order of ids is the
/// order of creation.
pub fn new_id() -> String {
    let mut guard = GENERATOR.lock().unwrap_or_else(|e| e.into_inner());
    let generator = guard.get_or_insert_with(ulid::Generator::new);
    // The generator only fails when the random part overflows within one millisecond; a fresh id is fine then.
    generator
        .generate()
        .unwrap_or_else(|_| ulid::Ulid::new())
        .to_string()
}

/// Whether `id` is a ULID in its canonical form: 26 characters of Crockford base 32, in capitals.
pub fn is_ulid(id: &str) -> bool {
    ulid::Ulid::from_string(id).is_ok_and(|parsed| parsed.to_string() == id)
}

/// Whether `id` can name a resource in the registry: kebab-case, no domain prefix, no dot (D-36).
pub fn is_resource_id(id: &str) -> bool {
    !id.is_empty()
        && id.split('-').all(|word| {
            !word.is_empty()
                && word
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
        && id.starts_with(|c: char| c.is_ascii_lowercase())
}

/// Checks an id a caller supplied, or makes one.
pub fn id_or_new(id: Option<String>) -> Result<String> {
    match id {
        None => Ok(new_id()),
        Some(id) if is_ulid(&id) => Ok(id),
        Some(id) => Err(EdenError::InvalidOperation(format!("not an id: {id:?}"))),
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Uri {
    pub type_id: String,
    pub id: String,
}

impl Uri {
    pub fn new(type_id: &str, id: &str) -> Self {
        Self {
            type_id: type_id.to_string(),
            id: id.to_string(),
        }
    }

    pub fn parse(uri: &str) -> Result<Uri> {
        uri.strip_prefix(SCHEME)
            .and_then(|rest| rest.split_once('/'))
            .filter(|(type_id, id)| is_resource_id(type_id) && is_ulid(id))
            .map(|(type_id, id)| Uri::new(type_id, id))
            .ok_or_else(|| EdenError::InvalidOperation(format!("not an entity URI: {uri:?}")))
    }
}

impl fmt::Display for Uri {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{SCHEME}{}/{}", self.type_id, self.id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_ulids_and_only_grow() {
        let ids: Vec<String> = (0..500).map(|_| new_id()).collect();
        assert!(ids.iter().all(|id| is_ulid(id)));
        assert!(ids.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn only_a_canonical_ulid_is_an_id() {
        assert!(is_ulid("01J9ZQ4M3T8R5V2X7Y6W1B0CDE"));
        assert!(is_ulid("00000000000000000000000001"));
        for bad in [
            "",
            "st-01",
            "01j9zq4m3t8r5v2x7y6w1b0cde",
            "01J9ZQ4M3T8R5V2X7Y6W1B0CD",
            "9f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
            "81J9ZQ4M3T8R5V2X7Y6W1B0CDE",
        ] {
            assert!(!is_ulid(bad), "{bad:?} should not be an id");
        }
        assert!(id_or_new(Some("st-01".to_string())).is_err());
        assert!(is_ulid(&id_or_new(None).unwrap()));
    }

    #[test]
    fn resource_ids_are_kebab_case_without_a_dot() {
        for good in ["recipe", "stock-item", "air-quality", "v2-thing"] {
            assert!(is_resource_id(good), "{good:?}");
        }
        for bad in [
            "",
            "Recipe",
            "kitchen.recipe",
            "stock_item",
            "-recipe",
            "recipe-",
            "a--b",
            "2fa",
        ] {
            assert!(!is_resource_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn a_uri_parses_and_formats() {
        let text = "eden://stock-item/01J9ZQ4M3T8R5V2X7Y6W1B0CDE";
        let uri = Uri::parse(text).unwrap();
        assert_eq!(uri, Uri::new("stock-item", "01J9ZQ4M3T8R5V2X7Y6W1B0CDE"));
        assert_eq!(uri.to_string(), text);
        for bad in [
            "stock-item/01J9ZQ4M3T8R5V2X7Y6W1B0CDE",
            "http://stock-item/01J9ZQ4M3T8R5V2X7Y6W1B0CDE",
            "eden://Stock/01J9ZQ4M3T8R5V2X7Y6W1B0CDE",
            "eden://stock-item/st-01",
            "eden://stock-item",
        ] {
            assert!(Uri::parse(bad).is_err(), "{bad:?}");
        }
    }
}
