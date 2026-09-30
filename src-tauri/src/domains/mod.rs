//! Domain code on the Rust side lives here, one module per plain domain id (`kitchen`, `toolbench`, `weather`, …),
//! each with its models, services and commands, registered from `lib.rs` (docs/engineering/app-scaffold.md, "Where a
//! domain's code goes"). `documents` keeps what stays on this device, one
//! JSON document per domain; the owner's data is in the workspace database (`crate::substrate`).
pub mod documents;
pub mod weather;

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    /// What lives here and is not a domain: the document store every domain's interim persistence goes through.
    const SHARED: &[&str] = &["documents"];

    fn sources(path: &Path, into: &mut Vec<String>) {
        if path.is_dir() {
            for entry in fs::read_dir(path).expect("a readable folder").flatten() {
                sources(&entry.path(), into);
            }
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            into.push(fs::read_to_string(path).expect("a readable source"));
        }
    }

    /// Isolation (docs/engineering/domain-module.md): a domain never uses another domain's code.
    #[test]
    fn a_domain_never_uses_another_domain() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/domains");
        let domains: Vec<(String, Vec<String>)> = fs::read_dir(&root)
            .expect("src/domains")
            .flatten()
            .filter_map(|entry| {
                let path = entry.path();
                let id = path.file_stem()?.to_str()?.to_string();
                if id == "mod" || SHARED.contains(&id.as_str()) {
                    return None;
                }
                let mut found = Vec::new();
                sources(&path, &mut found);
                Some((id, found))
            })
            .collect();
        assert!(domains.iter().any(|(id, _)| id == "weather"));

        for (id, found) in &domains {
            for (other, _) in domains.iter().filter(|(other, _)| other != id) {
                let uses = [
                    format!("domains::{other}"),
                    format!("super::super::{other}"),
                ];
                for source in found {
                    assert!(
                        !uses.iter().any(|path| source.contains(path.as_str())),
                        "the domain {id:?} uses the domain {other:?}"
                    );
                }
            }
        }
    }
}
