//! Attaching a file (docs/product/substrate/primitives.md, "Attachment"): the file is copied into the workspace and
//! the row records what was copied, its size and the hash of its bytes. The row and the file go together: a row is
//! never written for a file that could not be copied, and a file whose row failed is removed.

use std::io::Read;
use std::path::Path;

use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::ids;
use super::links::LinkInput;
use super::primitives::{self, ATTACHMENT};
use super::Workspace;
use crate::error::{EdenError, Result};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachInput {
    pub id: Option<String>,
    pub kind: String,
    /// The file to copy in; it is left where it is.
    pub path: String,
    /// The name to show; the file's own name when it is left out.
    pub file_name: Option<String>,
    /// The media type; guessed from the extension when it is left out.
    pub mime: Option<String>,
    pub captured: Option<Value>,
    #[serde(default)]
    pub links: Vec<LinkInput>,
}

/// The SHA-256 of a file, as lowercase hex, and its size in bytes.
pub fn hash_file(path: &Path) -> Result<(String, u64)> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut size = 0u64;
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        size += read as u64;
    }
    Ok((hex(&hasher.finalize()), size))
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// The media type an extension names, for the kinds of file Eden attaches; anything else is a plain stream of bytes.
fn mime_of(file_name: &str) -> &'static str {
    let extension = Path::new(file_name)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" => "image/heic",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "csv" => "text/csv",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
}

pub fn attach(workspace: &Workspace, input: AttachInput) -> Result<Value> {
    let id = ids::id_or_new(input.id)?;
    let source = Path::new(&input.path);
    let file_name = match input.file_name {
        Some(name) => name,
        None => source
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_string)
            .ok_or_else(|| EdenError::InvalidOperation(format!("not a file: {:?}", input.path)))?,
    };
    let mime = input
        .mime
        .unwrap_or_else(|| mime_of(&file_name).to_string());

    let destination = workspace.attachment_path(&id);
    if let Some(dir) = destination.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::copy(source, &destination)?;

    let written = hash_file(&destination).and_then(|(hash, size)| {
        let row = json!({
            "id": id,
            "kind": input.kind,
            "fileName": file_name,
            "mime": mime,
            "size": size,
            "hash": hash,
            "store": "workspace",
            "captured": input.captured,
            "links": input.links.iter().map(|link| json!({
                "uri": link.uri, "relation": link.relation, "label": link.label,
            })).collect::<Vec<_>>(),
        });
        workspace.write(|ctx| primitives::create(ctx, &ATTACHMENT, row))
    });
    if written.is_err() {
        let _ = std::fs::remove_file(&destination);
    }
    written
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::temp_dir;
    use crate::substrate::primitives::Query;

    fn input(path: &Path, kind: &str) -> AttachInput {
        AttachInput {
            id: None,
            kind: kind.to_string(),
            path: path.to_string_lossy().into_owned(),
            file_name: None,
            mime: None,
            captured: Some(json!({ "device": "desk" })),
            links: Vec::new(),
        }
    }

    #[test]
    fn a_file_is_copied_in_and_described() {
        let dir = temp_dir("attach");
        let file = dir.join("Haul.JPG");
        std::fs::write(&file, b"abc").unwrap();
        let workspace = Workspace::in_memory();

        let row = attach(&workspace, input(&file, "haul-photo")).unwrap();
        assert_eq!(row["fileName"], "Haul.JPG");
        assert_eq!(row["mime"], "image/jpeg");
        assert_eq!(row["size"], 3);
        assert_eq!(row["store"], "workspace");
        assert_eq!(row["captured"], json!({ "device": "desk" }));
        // The SHA-256 of "abc".
        assert_eq!(
            row["hash"],
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );

        let stored = workspace.attachment_path(row["id"].as_str().unwrap());
        assert_eq!(std::fs::read(stored).unwrap(), b"abc");
        assert!(file.exists());

        std::fs::remove_dir_all(&dir).ok();
        std::fs::remove_dir_all(workspace.dir).ok();
    }

    #[test]
    fn a_row_that_is_refused_leaves_no_file() {
        let dir = temp_dir("attach-refused");
        let file = dir.join("scan.pdf");
        std::fs::write(&file, b"abc").unwrap();
        let workspace = Workspace::in_memory();

        assert!(attach(&workspace, input(&file, "spaceship")).is_err());
        assert!(attach(&workspace, input(&dir.join("missing.pdf"), "document")).is_err());

        let rows = workspace
            .read(|conn| primitives::query(conn, &ATTACHMENT, &Query::default()))
            .unwrap();
        assert!(rows.is_empty());
        let kept = std::fs::read_dir(workspace.dir.join("attachments"))
            .map(|entries| entries.count())
            .unwrap_or(0);
        assert_eq!(kept, 0);

        std::fs::remove_dir_all(&dir).ok();
        std::fs::remove_dir_all(workspace.dir).ok();
    }
}
