//! Attaching a file (docs/product/substrate/primitives.md, "Attachment"): the file is copied into the workspace and
//! the row records what was copied, its size and the hash of its bytes. The row and the file go together: a row is
//! never written for a file that could not be copied, and a file whose row failed is removed. A file arrives as a
//! path to copy from (`attach`) or as its bytes (`attach_bytes`: the webview holds a dropped, picked or pasted file
//! as bytes and never as a path, D-84); both leave the same row. `read_bytes` gives a stored file back.

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

/// A file given as its bytes: what `AttachInput` says of one, without the path, and with the small picture of it the
/// webview may have made.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachBytesInput {
    pub id: Option<String>,
    pub kind: String,
    pub file_name: String,
    /// The media type; guessed from the extension when it is left out.
    pub mime: Option<String>,
    /// A small picture of the file, as a data URL.
    pub thumbnail: Option<String>,
    pub captured: Option<Value>,
    #[serde(default)]
    pub links: Vec<LinkInput>,
}

/// The largest file `attach_bytes` takes: above what any caller sends, so a request that got here by mistake is
/// refused before it is written.
pub const MAX_ATTACH_BYTES: usize = 32 * 1024 * 1024;

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

/// What the row says of a file beside its bytes.
struct Described {
    kind: String,
    file_name: String,
    mime: Option<String>,
    thumbnail: Option<String>,
    captured: Option<Value>,
    links: Vec<LinkInput>,
}

/// Puts a file at its place in the workspace with `place`, then writes the row that describes what is there; a file
/// whose row failed is removed.
fn store(
    workspace: &Workspace,
    id: String,
    described: Described,
    place: impl FnOnce(&Path) -> Result<()>,
) -> Result<Value> {
    let mime = described
        .mime
        .unwrap_or_else(|| mime_of(&described.file_name).to_string());
    let destination = workspace.attachment_path(&id);
    if let Some(dir) = destination.parent() {
        std::fs::create_dir_all(dir)?;
    }
    place(&destination)?;

    let written = hash_file(&destination).and_then(|(hash, size)| {
        let row = json!({
            "id": id,
            "kind": described.kind,
            "fileName": described.file_name,
            "mime": mime,
            "size": size,
            "hash": hash,
            "store": "workspace",
            "thumbnail": described.thumbnail,
            "captured": described.captured,
            "links": described.links.iter().map(|link| json!({
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

pub fn attach(workspace: &Workspace, input: AttachInput) -> Result<Value> {
    let id = ids::id_or_new(input.id)?;
    let source = Path::new(&input.path).to_path_buf();
    let file_name = match input.file_name {
        Some(name) => name,
        None => source
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_string)
            .ok_or_else(|| EdenError::InvalidOperation(format!("not a file: {:?}", input.path)))?,
    };
    let described = Described {
        kind: input.kind,
        file_name,
        mime: input.mime,
        thumbnail: None,
        captured: input.captured,
        links: input.links,
    };
    store(workspace, id, described, |destination| {
        std::fs::copy(&source, destination)?;
        Ok(())
    })
}

/// Writes the bytes into the workspace as a file and its row. Nothing is written for no bytes, for more than
/// `MAX_ATTACH_BYTES`, or under a name that is blank.
pub fn attach_bytes(workspace: &Workspace, input: AttachBytesInput, bytes: &[u8]) -> Result<Value> {
    if bytes.is_empty() {
        return Err(EdenError::InvalidOperation(
            "an attachment has bytes".to_string(),
        ));
    }
    if bytes.len() > MAX_ATTACH_BYTES {
        return Err(EdenError::InvalidOperation(format!(
            "an attachment is at most {MAX_ATTACH_BYTES} bytes, not {}",
            bytes.len()
        )));
    }
    if input.file_name.trim().is_empty() {
        return Err(EdenError::InvalidOperation(
            "an attachment has a file name".to_string(),
        ));
    }
    let id = ids::id_or_new(input.id)?;
    let described = Described {
        kind: input.kind,
        file_name: input.file_name,
        mime: input.mime,
        thumbnail: input.thumbnail,
        captured: input.captured,
        links: input.links,
    };
    store(workspace, id, described, |destination| {
        std::fs::write(destination, bytes)?;
        Ok(())
    })
}

/// The bytes of a live attachment. `not-found` for a row that is not there or is deleted, and for a row whose file
/// is no longer on this device (it was attached on another one, or removed from under the app).
pub fn read_bytes(workspace: &Workspace, id: &str) -> Result<Vec<u8>> {
    let missing = || EdenError::NotFound(ids::Uri::new(ATTACHMENT.type_id, id).to_string());
    let row = workspace
        .read(|conn| primitives::get(conn, &ATTACHMENT, id))?
        .ok_or_else(missing)?;
    if !row["deletedAt"].is_null() {
        return Err(missing());
    }
    match std::fs::read(workspace.attachment_path(id)) {
        Ok(bytes) => Ok(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Err(missing()),
        Err(error) => Err(error.into()),
    }
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

    fn bytes_input(name: &str, kind: &str) -> AttachBytesInput {
        AttachBytesInput {
            id: None,
            kind: kind.to_string(),
            file_name: name.to_string(),
            mime: None,
            thumbnail: Some("data:image/jpeg;base64,AAAA".to_string()),
            captured: Some(json!({ "width": 4, "height": 3 })),
            links: Vec::new(),
        }
    }

    #[test]
    fn bytes_are_written_and_described_and_read_back() {
        let workspace = Workspace::in_memory();

        let row = attach_bytes(&workspace, bytes_input("basket.png", "photo"), b"abc").unwrap();
        assert_eq!(row["fileName"], "basket.png");
        assert_eq!(row["mime"], "image/png");
        assert_eq!(row["size"], 3);
        assert_eq!(row["thumbnail"], "data:image/jpeg;base64,AAAA");
        assert_eq!(row["captured"], json!({ "width": 4, "height": 3 }));
        assert_eq!(
            row["hash"],
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );

        let id = row["id"].as_str().unwrap();
        assert_eq!(read_bytes(&workspace, id).unwrap(), b"abc");

        std::fs::remove_dir_all(workspace.dir).ok();
    }

    #[test]
    fn bytes_that_are_refused_leave_no_file() {
        let workspace = Workspace::in_memory();

        assert!(attach_bytes(&workspace, bytes_input("a.png", "photo"), b"").is_err());
        assert!(attach_bytes(&workspace, bytes_input(" ", "photo"), b"abc").is_err());
        assert!(attach_bytes(&workspace, bytes_input("a.png", "spaceship"), b"abc").is_err());
        let large = vec![0u8; MAX_ATTACH_BYTES + 1];
        assert!(attach_bytes(&workspace, bytes_input("a.png", "photo"), &large).is_err());

        let kept = std::fs::read_dir(workspace.dir.join("attachments"))
            .map(|entries| entries.count())
            .unwrap_or(0);
        assert_eq!(kept, 0);

        std::fs::remove_dir_all(workspace.dir).ok();
    }

    #[test]
    fn a_file_that_is_gone_or_deleted_reads_as_not_found() {
        let workspace = Workspace::in_memory();
        let not_found = |result: Result<Vec<u8>>| matches!(result, Err(EdenError::NotFound(_)));

        assert!(not_found(read_bytes(
            &workspace,
            "01ARZ3NDEKTSV4RRFFQ69G5FAV"
        )));

        let gone = attach_bytes(&workspace, bytes_input("a.png", "photo"), b"abc").unwrap();
        let gone = gone["id"].as_str().unwrap();
        std::fs::remove_file(workspace.attachment_path(gone)).unwrap();
        assert!(not_found(read_bytes(&workspace, gone)));

        let deleted = attach_bytes(&workspace, bytes_input("b.png", "photo"), b"abc").unwrap();
        let uri = deleted["uri"].as_str().unwrap().to_string();
        workspace
            .write(|ctx| crate::substrate::rows::delete(ctx, &uri))
            .unwrap();
        assert!(not_found(read_bytes(
            &workspace,
            deleted["id"].as_str().unwrap()
        )));

        std::fs::remove_dir_all(workspace.dir).ok();
    }
}
