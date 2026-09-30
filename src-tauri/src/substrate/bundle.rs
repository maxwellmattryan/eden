//! The export bundle and the import of one (docs/product/substrate/data.md, "Export", "Import";
//! docs/engineering/data-layer.md, "The bundle"). A bundle is a zip archive a person can open: a manifest, one JSONL
//! file for each primitive and each entity type, the files of the attachments, and a README that says what is what.
//!
//! The rows are written in a fixed order with their stamps, so two workspaces that hold the same rows write the same
//! bytes; that is what the round trip is checked by. Mirrors never leave (D-32). A deleted row leaves as its
//! tombstone and nothing of what it held.

use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use zip::write::SimpleFileOptions;

use super::attachments::{hash_file, hex};
use super::entities::{self, Entity, EntityQuery};
use super::facts::{self, Fact};
use super::grants::{self, Grant, GrantsFile};
use super::hlc::{self, Hlc};
use super::ids::{self, Uri};
use super::links::{self, Link};
use super::primitives::{self, Primitive, Query, ATTACHMENT, PLACE};
use super::rows::table_for;
use super::{registry, Workspace, WriteCtx};
use crate::error::{EdenError, Result};

const FORMAT: &str = "eden-bundle";
/// The version of the layout below. A bundle of a later version is refused; an earlier one is read.
const FORMAT_VERSION: u32 = 1;
const MANIFEST: &str = "manifest.json";
const README: &str = "README.md";
const SETTINGS: &str = "settings.json";
const GRANTS: &str = "grants.json";
/// The type the manifest counts grants under.
const GRANT: &str = "grant";
const FACTS: &str = "facts.jsonl";
/// The type the manifest counts facts under.
const FACT: &str = "fact";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Scope {
    /// The whole workspace.
    Full,
    /// What one domain owns: its entity types and its kinds.
    Domain { domain: String },
}

impl Scope {
    fn name(&self) -> &str {
        match self {
            Scope::Full => "full",
            Scope::Domain { domain } => domain,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    /// Rows win by stamp; what is already here and the same is skipped.
    Merge,
    /// What the scope holds is cleared first, after a backup, and the bundle's rows take its place.
    Replace,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub sha256: String,
    pub bytes: u64,
    /// For a file of rows: how many, tombstones included.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tombstones: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStamp {
    pub version: String,
    pub channel: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: String,
    pub format_version: u32,
    /// The schema of the database the bundle was written from.
    pub schema_version: i64,
    pub app: AppStamp,
    pub created_at: String,
    /// The node of the device that wrote it.
    pub node: String,
    pub scope: Scope,
    /// The live rows of each type.
    pub counts: BTreeMap<String, u64>,
    /// Every file but this one, with the hash of its bytes.
    pub files: Vec<FileEntry>,
}

/// A file the frontend wrote for the bundle: the friendlier formats of a domain (CSV, Markdown), whose shapes the
/// domain owns.
#[derive(Debug, Deserialize)]
pub struct Extra {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub scope: Scope,
    /// Where to write the archive; `exports/` in the app data dir when it is left out.
    pub path: Option<String>,
    /// The settings to carry, which live in the frontend. Full scope only.
    pub settings: Option<Value>,
    #[serde(default)]
    pub extras: Vec<Extra>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub counts: BTreeMap<String, u64>,
    pub bytes: u64,
}

#[derive(Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub mode: Option<Mode>,
    pub scope: Option<Scope>,
    /// Rows that were not here.
    pub inserted: u64,
    /// Rows that were here and older.
    pub updated: u64,
    /// Rows that were here and the same, or newer.
    pub skipped: u64,
    /// Rows deleted because only one of them can be: a second home, a second overlay of one mirror.
    pub tombstoned: u64,
    /// Types the bundle holds that this build does not know. Their rows are kept.
    pub unknown_types: Vec<String>,
    /// The backup a replace wrote before it cleared anything.
    pub backup_path: Option<String>,
    /// The settings the bundle carries, for the frontend to apply.
    pub settings: Option<Value>,
}

fn bundle_error(code: &str, detail: impl std::fmt::Display) -> EdenError {
    EdenError::Bundle(format!("bundle:{code}: {detail}"))
}

fn sha256(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

fn is_deleted(row: &Map<String, Value>) -> bool {
    row.get("deletedAt").is_some_and(|value| !value.is_null())
}

// Export

/// For a file of rows: how many rows, and how many of them tombstones.
type RowCount = Option<(u64, u64)>;

struct Collected {
    /// Path, bytes, and the count of a file of rows.
    files: Vec<(String, Vec<u8>, RowCount)>,
    counts: BTreeMap<String, u64>,
    /// The ids of the live attachments, whose files go with them.
    attachments: Vec<String>,
    /// The grants a full bundle carries, revocations included.
    grants: Vec<Grant>,
    /// The facts a full bundle carries, tombstones included.
    facts: Vec<Fact>,
    schema_version: i64,
    node: String,
}

/// The rows of one type as the lines of its file: no mirrors, every link, tombstones emptied.
fn lines(
    conn: &Connection,
    type_id: &str,
    rows: Vec<Map<String, Value>>,
    strip: impl Fn(&mut Map<String, Value>),
) -> Result<(Vec<u8>, u64, u64)> {
    let mut links = links::by_owner(conn, type_id, true)?;
    let mut bytes = Vec::new();
    let (mut count, mut tombstones) = (0, 0);
    for mut row in rows {
        if row.get("mirror") == Some(&json!(true)) {
            continue;
        }
        let id = row["id"].as_str().unwrap_or_default().to_string();
        row.insert(
            "links".into(),
            serde_json::to_value(links.remove(&id).unwrap_or_default())?,
        );
        if is_deleted(&row) {
            strip(&mut row);
            tombstones += 1;
        }
        serde_json::to_writer(&mut bytes, &row)?;
        bytes.push(b'\n');
        count += 1;
    }
    Ok((bytes, count, tombstones))
}

fn objects(rows: Vec<Value>) -> Vec<Map<String, Value>> {
    rows.into_iter()
        .filter_map(|row| match row {
            Value::Object(object) => Some(object),
            _ => None,
        })
        .collect()
}

fn entity_types(conn: &Connection, scope: &Scope) -> Result<Vec<String>> {
    match scope {
        Scope::Full => Ok(conn
            .prepare("SELECT DISTINCT type FROM entities WHERE mirror = 0 ORDER BY type")?
            .query_map([], |row| row.get(0))?
            .collect::<rusqlite::Result<_>>()?),
        Scope::Domain { domain } => {
            let mut types: Vec<String> = registry::entity_types_of(domain)
                .into_iter()
                .map(str::to_string)
                .collect();
            types.sort();
            Ok(types)
        }
    }
}

/// The kinds of a primitive the scope holds; `None` for all of them.
fn kinds_in(scope: &Scope, primitive: &Primitive) -> Option<Vec<String>> {
    match scope {
        Scope::Full => None,
        Scope::Domain { domain } => Some(
            registry::kinds_of(domain, primitive.type_id)
                .into_iter()
                .map(str::to_string)
                .collect(),
        ),
    }
}

fn collect(conn: &Connection, scope: &Scope) -> Result<Collected> {
    let mut collected = Collected {
        files: Vec::new(),
        counts: BTreeMap::new(),
        attachments: Vec::new(),
        grants: match scope {
            Scope::Full => grants::exportable(conn)?,
            Scope::Domain { .. } => Vec::new(),
        },
        facts: match scope {
            Scope::Full => facts::exportable(conn)?,
            Scope::Domain { .. } => Vec::new(),
        },
        schema_version: crate::db::schema_version(conn)?,
        node: format!("{:08x}", hlc::node_id(conn)?),
    };
    let add =
        |collected: &mut Collected, path: String, type_id: &str, file: (Vec<u8>, u64, u64)| {
            let (bytes, rows, tombstones) = file;
            collected
                .counts
                .insert(type_id.to_string(), rows - tombstones);
            collected
                .files
                .push((path, bytes, Some((rows, tombstones))));
        };

    for primitive in primitives::ALL {
        let filter = Query {
            kinds: kinds_in(scope, primitive),
            include_deleted: true,
            ..Default::default()
        };
        let rows = objects(primitives::query(conn, primitive, &filter)?);
        if primitive.type_id == ATTACHMENT.type_id {
            collected.attachments = rows
                .iter()
                .filter(|row| !is_deleted(row) && row.get("mirror") != Some(&json!(true)))
                .filter_map(|row| row["id"].as_str().map(str::to_string))
                .collect();
        }
        let file = lines(conn, primitive.type_id, rows, |row| primitive.strip(row))?;
        // A full bundle names every primitive, even one with no rows; a domain's names what it has.
        if *scope == Scope::Full || file.1 > 0 {
            let path = format!("primitives/{}.jsonl", primitive.type_id);
            add(&mut collected, path, primitive.type_id, file);
        }
    }

    for type_id in entity_types(conn, scope)? {
        let filter = EntityQuery {
            type_id: type_id.clone(),
            include_deleted: true,
            ..Default::default()
        };
        let rows = entities::query(conn, &filter)?
            .into_iter()
            .map(serde_json::to_value)
            .collect::<serde_json::Result<Vec<_>>>()?;
        let file = lines(conn, &type_id, objects(rows), |row| {
            row.insert("payload".into(), json!({}));
            for key in ["source", "externalId", "snapshot"] {
                row.insert(key.into(), Value::Null);
            }
        })?;
        if file.1 > 0 {
            add(
                &mut collected,
                format!("entities/{type_id}.jsonl"),
                &type_id,
                file,
            );
        }
    }
    Ok(collected)
}

fn readme(manifest: &Manifest) -> String {
    let mut text = String::from("# Eden export\n\n");
    text.push_str(&match &manifest.scope {
        Scope::Full => "Everything in the workspace".to_string(),
        Scope::Domain { domain } => format!("Everything the `{domain}` domain owns"),
    });
    text.push_str(
        ", as plain files. Nothing here needs Eden to be read.\n\n\
         ## What is here\n\n\
         | file | what it is |\n|---|---|\n\
         | `manifest.json` | the version of this layout, how many rows of each type, and the SHA-256 of every file |\n\
         | `primitives/*.jsonl` | tasks, events, places and attachments, one row a line |\n\
         | `entities/*.jsonl` | one file for each type of thing a domain keeps, one row a line |\n\
         | `attachments/` | the files of the attachments, named by the id of their row |\n\
         | `friendly/` | the same data in formats made for reading: CSV and Markdown |\n\
         | `grants.json` | the grants: who may see or do what, and the ones you ended |\n\
         | `facts.jsonl` | what Eden knows about you, one fact a line, with where each one came from |\n\
         | `settings.json` | your settings |\n\n\
         A file is only present when there is something to put in it.\n\n\
         ## Rows\n\n",
    );
    if manifest.counts.is_empty() {
        text.push_str("No rows.\n");
    } else {
        text.push_str("| type | rows |\n|---|---|\n");
        for (type_id, count) in &manifest.counts {
            text.push_str(&format!("| {type_id} | {count} |\n"));
        }
    }
    text.push_str(
        "\n## Reading a row\n\n\
         Every row has an `id`, a `type` and a `uri` (`eden://<type>/<id>`). `createdAt` and `updatedAt` are stamps: \
         the first sixteen characters are the time in milliseconds since 1970, in hexadecimal. A row with a \
         `deletedAt` was deleted; it is kept, empty, so that another device learns of the deletion. `links` point at \
         other rows by their `uri`.\n\n\
         What is not here: what Eden caches from other services, which it fetches again; keys and secrets; \
         diagnostics.\n\n\
         ## Checking a file\n\n\
         ```\nshasum -a 256 entities/recipe.jsonl\n```\n\n\
         The result is the `sha256` of that file in `manifest.json`.\n",
    );
    text
}

fn default_path(workspace: &Workspace, folder: &str, prefix: &str, scope: &Scope) -> PathBuf {
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    workspace
        .dir()
        .join(folder)
        .join(format!("{prefix}-{}-{stamp}.zip", scope.name()))
}

/// The path of an extra inside the bundle: under `friendly/`, and nowhere else.
fn extra_path(path: &str) -> Result<String> {
    let well_formed = path.starts_with("friendly/")
        && path.len() > "friendly/".len()
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != ".." && !part.contains('\\'));
    if well_formed {
        Ok(path.to_string())
    } else {
        Err(EdenError::InvalidOperation(format!(
            "not a path under friendly/: {path:?}"
        )))
    }
}

pub fn export(workspace: &Workspace, request: ExportRequest) -> Result<ExportResult> {
    if let Scope::Domain { domain } = &request.scope {
        if !registry::is_owner(domain) {
            return Err(EdenError::InvalidOperation(format!(
                "not a domain that owns anything: {domain:?}"
            )));
        }
    }
    let scope = request.scope;
    let mut collected = workspace.read(|conn| collect(conn, &scope))?;

    if scope == Scope::Full {
        // Facts leave one a line by id, a tombstone as its id, type and stamps and nothing of what it held.
        let facts = std::mem::take(&mut collected.facts);
        let mut bytes = Vec::new();
        let (mut rows, mut tombstones) = (0, 0);
        for fact in &facts {
            if fact.deleted_at.is_some() {
                serde_json::to_writer(&mut bytes, &facts::stripped(fact))?;
                tombstones += 1;
            } else {
                serde_json::to_writer(&mut bytes, fact)?;
            }
            bytes.push(b'\n');
            rows += 1;
        }
        collected.counts.insert(FACT.into(), rows - tombstones);
        collected
            .files
            .push((FACTS.into(), bytes, Some((rows, tombstones))));
        // Grants leave by id with their stamps, revocations included, so a merge can tell what was ended.
        let grants = std::mem::take(&mut collected.grants);
        let tombstones = grants
            .iter()
            .filter(|grant| grant.deleted_at.is_some())
            .count() as u64;
        let rows = grants.len() as u64;
        collected.counts.insert(GRANT.into(), rows - tombstones);
        let bytes = serde_json::to_vec_pretty(&GrantsFile { grants })?;
        collected
            .files
            .push((GRANTS.into(), bytes, Some((rows, tombstones))));
        if let Some(settings) = request.settings.filter(|settings| !settings.is_null()) {
            let bytes = serde_json::to_vec_pretty(&settings)?;
            collected.files.push((SETTINGS.into(), bytes, None));
        }
    }
    for extra in request.extras {
        let path = extra_path(&extra.path)?;
        collected
            .files
            .push((path, extra.content.into_bytes(), None));
    }

    let mut manifest = Manifest {
        format: FORMAT.to_string(),
        format_version: FORMAT_VERSION,
        schema_version: collected.schema_version,
        app: AppStamp {
            version: env!("CARGO_PKG_VERSION").to_string(),
            channel: crate::commands::app::environment().to_string(),
        },
        created_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        node: collected.node,
        scope: scope.clone(),
        counts: collected.counts,
        files: collected
            .files
            .iter()
            .map(|(path, bytes, rows)| FileEntry {
                path: path.clone(),
                sha256: sha256(bytes),
                bytes: bytes.len() as u64,
                rows: rows.map(|(rows, _)| rows),
                tombstones: rows.map(|(_, tombstones)| tombstones),
            })
            .collect(),
    };
    for id in &collected.attachments {
        let (sha256, bytes) = hash_file(&workspace.attachment_path(id))?;
        manifest.files.push(FileEntry {
            path: format!("attachments/{id}"),
            sha256,
            bytes,
            rows: None,
            tombstones: None,
        });
    }
    let readme = readme(&manifest).into_bytes();
    manifest.files.push(FileEntry {
        path: README.to_string(),
        sha256: sha256(&readme),
        bytes: readme.len() as u64,
        rows: None,
        tombstones: None,
    });
    manifest.files.sort_by(|a, b| a.path.cmp(&b.path));

    let path = match request.path {
        Some(path) => PathBuf::from(path),
        None => default_path(workspace, "exports", "eden", &scope),
    };
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    // Written beside its place and moved into it, so a bundle that is there is a whole one.
    let partial = path.with_extension("zip.partial");
    let written = (|| -> Result<()> {
        let mut archive = zip::ZipWriter::new(std::fs::File::create(&partial)?);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        archive.start_file(MANIFEST, options)?;
        archive.write_all(&serde_json::to_vec_pretty(&manifest)?)?;
        archive.start_file(README, options)?;
        archive.write_all(&readme)?;
        for (name, bytes, _) in &collected.files {
            archive.start_file(name.as_str(), options)?;
            archive.write_all(bytes)?;
        }
        for id in &collected.attachments {
            archive.start_file(format!("attachments/{id}"), options)?;
            let mut file = std::fs::File::open(workspace.attachment_path(id))?;
            std::io::copy(&mut file, &mut archive)?;
        }
        archive.finish()?;
        std::fs::rename(&partial, &path)?;
        Ok(())
    })();
    if let Err(error) = written {
        let _ = std::fs::remove_file(&partial);
        return Err(error);
    }

    Ok(ExportResult {
        bytes: std::fs::metadata(&path)?.len(),
        path: path.to_string_lossy().into_owned(),
        counts: manifest.counts,
    })
}

// Import

type Archive = zip::ZipArchive<std::fs::File>;

fn open(path: &Path) -> Result<Archive> {
    let file = std::fs::File::open(path).map_err(|e| bundle_error("unreadable", e))?;
    zip::ZipArchive::new(file).map_err(|e| bundle_error("unreadable", e))
}

fn entry(archive: &mut Archive, name: &str) -> Result<Vec<u8>> {
    let mut file = archive
        .by_name(name)
        .map_err(|_| bundle_error("unreadable", format!("{name} is missing")))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|e| bundle_error("unreadable", format!("{name}: {e}")))?;
    Ok(bytes)
}

/// Reads the manifest and checks every file it lists against its hash. Nothing of a bundle is used before this.
fn verify(archive: &mut Archive) -> Result<Manifest> {
    let manifest: Manifest = serde_json::from_slice(&entry(archive, MANIFEST)?)
        .map_err(|e| bundle_error("unreadable", format!("{MANIFEST}: {e}")))?;
    if manifest.format != FORMAT {
        return Err(bundle_error("unreadable", "not an Eden bundle"));
    }
    if manifest.format_version > FORMAT_VERSION {
        return Err(bundle_error(
            "version",
            format!(
                "the bundle is of version {}, and this build reads up to {FORMAT_VERSION}",
                manifest.format_version
            ),
        ));
    }
    for file in &manifest.files {
        if sha256(&entry(archive, &file.path)?) != file.sha256 {
            return Err(bundle_error("hash-mismatch", &file.path));
        }
    }
    Ok(manifest)
}

/// The manifest of a bundle, once every file in it has been checked: what the interface shows before an import.
pub fn inspect(path: &Path) -> Result<Manifest> {
    verify(&mut open(path)?)
}

struct Incoming {
    type_id: String,
    primitive: Option<&'static Primitive>,
    row: Map<String, Value>,
    links: Vec<Link>,
}

impl Incoming {
    fn text(&self, key: &str) -> &str {
        self.row
            .get(key)
            .and_then(Value::as_str)
            .unwrap_or_default()
    }
}

/// The rows of a file of the bundle, each checked for what the import relies on: an id, stamps, and the type the
/// file is named for.
fn parse(path: &str, bytes: &[u8]) -> Result<Vec<Incoming>> {
    let type_id = path
        .rsplit('/')
        .next()
        .and_then(|name| name.strip_suffix(".jsonl"))
        .filter(|type_id| ids::is_resource_id(type_id))
        .ok_or_else(|| bundle_error("unreadable", format!("{path} is not named for a type")))?;
    let primitive = primitives::of_type(type_id);
    if primitive.is_some() != path.starts_with("primitives/") {
        return Err(bundle_error(
            "unreadable",
            format!("{path} is in the wrong folder"),
        ));
    }

    let text = std::str::from_utf8(bytes)
        .map_err(|e| bundle_error("unreadable", format!("{path}: {e}")))?;
    let mut rows = Vec::new();
    for (index, line) in text
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.is_empty())
    {
        let bad = |detail: &str| {
            bundle_error(
                "unreadable",
                format!("{path}, line {}: {detail}", index + 1),
            )
        };
        let Ok(Value::Object(mut row)) = serde_json::from_str(line) else {
            return Err(bad("not a JSON object"));
        };
        let links: Vec<Link> = match row.remove("links") {
            Some(links) => {
                serde_json::from_value(links).map_err(|_| bad("links that cannot be read"))?
            }
            None => Vec::new(),
        };
        let incoming = Incoming {
            type_id: type_id.to_string(),
            primitive,
            row,
            links,
        };
        let uri = Uri::new(type_id, incoming.text("id")).to_string();
        let stamps_ok = ["createdAt", "updatedAt"]
            .iter()
            .all(|key| Hlc::parse(incoming.text(key)).is_ok())
            && match incoming.row.get("deletedAt") {
                None | Some(Value::Null) => true,
                Some(stamp) => stamp.as_str() == Some(incoming.text("updatedAt")),
            };
        if !ids::is_ulid(incoming.text("id")) || incoming.text("type") != type_id {
            return Err(bad("an id or a type that does not fit the file"));
        }
        if !stamps_ok {
            return Err(bad("stamps that cannot be read"));
        }
        if incoming.links.iter().any(|link| {
            link.owner != uri
                || Hlc::parse(&link.updated_at).is_err()
                || Uri::parse(&link.uri).is_err()
        }) {
            return Err(bad("a link that is not the row's own"));
        }
        if incoming.row.get("mirror") == Some(&json!(true)) {
            return Err(bad("a mirror, which a bundle never holds"));
        }
        rows.push(incoming);
    }
    Ok(rows)
}

#[derive(Debug, PartialEq, Eq)]
enum Decision {
    /// The row is not here.
    Insert,
    /// The row is here and the bundle's is later, or wins the tie.
    Replace,
    /// The row is here and the bundle says it was deleted: it takes the tombstone and keeps what it holds.
    Tombstone,
    Keep,
}

/// Which of two versions of a row stands. The later stamp wins. On a tie the two agree unless one is deleted: then
/// an entity stays deleted (`delete_wins`), and a link stays (D-21; docs/product/substrate/data.md, "Sync").
fn decide(local: Option<(&str, bool)>, stamp: &str, deleted: bool, delete_wins: bool) -> Decision {
    let Some((local_stamp, local_deleted)) = local else {
        return Decision::Insert;
    };
    let incoming = if deleted {
        Decision::Tombstone
    } else {
        Decision::Replace
    };
    match stamp.cmp(local_stamp) {
        std::cmp::Ordering::Greater => incoming,
        std::cmp::Ordering::Less => Decision::Keep,
        std::cmp::Ordering::Equal if deleted == local_deleted => Decision::Keep,
        std::cmp::Ordering::Equal if deleted == delete_wins => incoming,
        std::cmp::Ordering::Equal => Decision::Keep,
    }
}

fn state(conn: &Connection, table: &str, id: &str) -> Result<Option<(String, bool)>> {
    Ok(conn
        .query_row(
            &format!("SELECT updated_at, deleted_at IS NOT NULL FROM {table} WHERE id = ?1"),
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?)
}

fn put(conn: &Connection, incoming: &Incoming) -> Result<()> {
    match incoming.primitive {
        Some(primitive) => primitives::put(conn, primitive, &incoming.row),
        None => {
            let entity: Entity = serde_json::from_value(Value::Object({
                let mut row = incoming.row.clone();
                row.insert("links".into(), json!([]));
                row
            }))
            .map_err(|e| bundle_error("unreadable", format!("{}: {e}", incoming.text("uri"))))?;
            entities::put(conn, &entity)
        }
    }
}

/// The live row that the incoming one cannot live beside: the other home, or the other overlay of one mirror.
fn rival(conn: &Connection, incoming: &Incoming) -> Result<Option<(String, String)>> {
    let id = incoming.text("id");
    let found = if incoming.type_id == PLACE.type_id && incoming.text("kind") == "home" {
        conn.query_row(
            "SELECT id, updated_at FROM places
             WHERE kind = 'home' AND mirror = 0 AND deleted_at IS NULL AND id != ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
    } else if incoming.primitive.is_none() && !incoming.text("source").is_empty() {
        conn.query_row(
            "SELECT id, updated_at FROM entities
             WHERE type = ?1 AND source = ?2 AND external_id = ?3
               AND mirror = 0 AND deleted_at IS NULL AND id != ?4",
            [
                incoming.type_id.as_str(),
                incoming.text("source"),
                incoming.text("externalId"),
                id,
            ],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
    } else {
        None
    };
    Ok(found)
}

fn tombstone(conn: &Connection, table: &str, id: &str, stamp: &str) -> Result<()> {
    conn.execute(
        &format!("UPDATE {table} SET updated_at = ?1, deleted_at = ?1 WHERE id = ?2"),
        [stamp, id],
    )?;
    Ok(())
}

/// The grants of a bundle, each checked as a row is: an id, stamps, and nothing that never leaves a device.
fn parse_grants(bytes: &[u8]) -> Result<Vec<Grant>> {
    let file: GrantsFile = serde_json::from_slice(bytes)
        .map_err(|e| bundle_error("unreadable", format!("{GRANTS}: {e}")))?;
    for grant in &file.grants {
        grants::validate_imported(grant)
            .map_err(|detail| bundle_error("unreadable", format!("{GRANTS}: {detail}")))?;
    }
    Ok(file.grants)
}

/// The facts of a bundle, one a line, each checked as a row is.
fn parse_facts(bytes: &[u8]) -> Result<Vec<Fact>> {
    let text = std::str::from_utf8(bytes)
        .map_err(|e| bundle_error("unreadable", format!("{FACTS}: {e}")))?;
    let mut facts = Vec::new();
    for (index, line) in text
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.is_empty())
    {
        let bad = |detail: String| {
            bundle_error(
                "unreadable",
                format!("{FACTS}, line {}: {detail}", index + 1),
            )
        };
        let fact: Fact = serde_json::from_str(line).map_err(|e| bad(e.to_string()))?;
        facts::validate_imported(&fact).map_err(bad)?;
        facts.push(fact);
    }
    Ok(facts)
}

/// A fact of the bundle against the one here, by the rule rows follow. A live fact the substrate derived that finds
/// another of its type yields to the later of the two.
fn apply_fact(ctx: &mut WriteCtx, fact: &Fact, summary: &mut ImportSummary) -> Result<()> {
    let conn = ctx.conn;
    let deleted = fact.deleted_at.is_some();
    let local = state(conn, "facts", &fact.id)?;
    let decision = decide(
        local
            .as_ref()
            .map(|(stamp, deleted)| (stamp.as_str(), *deleted)),
        &fact.updated_at,
        deleted,
        true,
    );
    let mut row = fact.clone();
    if !deleted && matches!(decision, Decision::Insert | Decision::Replace) {
        if let Some((rival_id, rival_stamp)) = facts::rival(conn, fact)? {
            let next = hlc::next(conn)?;
            if fact.updated_at > rival_stamp {
                tombstone(conn, "facts", &rival_id, &next)?;
            } else {
                row.updated_at = next.clone();
                row.deleted_at = Some(next);
            }
            summary.tombstoned += 1;
        }
    }
    match decision {
        Decision::Insert | Decision::Replace => {
            facts::put(conn, &row)?;
            if decision == Decision::Insert {
                summary.inserted += 1;
            } else {
                summary.updated += 1;
            }
        }
        Decision::Tombstone => {
            tombstone(conn, "facts", &fact.id, &fact.updated_at)?;
            summary.updated += 1;
        }
        Decision::Keep => summary.skipped += 1,
    }
    Ok(())
}

/// A grant of the bundle against the one here, by the rule rows follow. A live grant that finds its key taken by
/// another id yields to the later of the two: the other is ended, or this one arrives ended.
fn apply_grant(ctx: &mut WriteCtx, grant: &Grant, summary: &mut ImportSummary) -> Result<()> {
    let conn = ctx.conn;
    let deleted = grant.deleted_at.is_some();
    let local = state(conn, "grants", &grant.id)?;
    let decision = decide(
        local
            .as_ref()
            .map(|(stamp, deleted)| (stamp.as_str(), *deleted)),
        &grant.updated_at,
        deleted,
        true,
    );
    let mut row = grant.clone();
    if !deleted && matches!(decision, Decision::Insert | Decision::Replace) {
        if let Some((rival_id, rival_stamp)) = grants::rival(conn, grant)? {
            let next = hlc::next(conn)?;
            if grant.updated_at > rival_stamp {
                tombstone(conn, "grants", &rival_id, &next)?;
            } else {
                row.updated_at = next.clone();
                row.deleted_at = Some(next);
            }
            summary.tombstoned += 1;
        }
    }
    match decision {
        Decision::Insert | Decision::Replace => {
            grants::put(conn, &row)?;
            if decision == Decision::Insert {
                summary.inserted += 1;
            } else {
                summary.updated += 1;
            }
        }
        Decision::Tombstone => {
            tombstone(conn, "grants", &grant.id, &grant.updated_at)?;
            summary.updated += 1;
        }
        Decision::Keep => summary.skipped += 1,
    }
    Ok(())
}

fn apply(ctx: &mut WriteCtx, incoming: &Incoming, summary: &mut ImportSummary) -> Result<()> {
    let conn = ctx.conn;
    let table = table_for(&incoming.type_id).name;
    let id = incoming.text("id");
    let stamp = incoming.text("updatedAt");
    let deleted = is_deleted(&incoming.row);
    let local = state(conn, table, id)?;

    let decision = decide(
        local
            .as_ref()
            .map(|(stamp, deleted)| (stamp.as_str(), *deleted)),
        stamp,
        deleted,
        true,
    );
    // A row that arrives live may find its place taken. Of the two, the later one stays.
    let mut loses = false;
    if !deleted && matches!(decision, Decision::Insert | Decision::Replace) {
        if let Some((rival_id, rival_stamp)) = rival(conn, incoming)? {
            let next = hlc::next(conn)?;
            if stamp > rival_stamp.as_str() {
                tombstone(conn, table, &rival_id, &next)?;
            } else {
                loses = true;
            }
            summary.tombstoned += 1;
        }
    }

    match decision {
        Decision::Insert | Decision::Replace => {
            put(conn, incoming)?;
            if loses {
                tombstone(conn, table, id, &hlc::next(conn)?)?;
            }
            if decision == Decision::Insert {
                summary.inserted += 1;
            } else {
                summary.updated += 1;
            }
        }
        Decision::Tombstone => {
            tombstone(conn, table, id, stamp)?;
            summary.updated += 1;
        }
        Decision::Keep => summary.skipped += 1,
    }

    for link in &incoming.links {
        let local = links::state(conn, link)?;
        let decision = decide(
            local
                .as_ref()
                .map(|(stamp, deleted)| (stamp.as_str(), *deleted)),
            &link.updated_at,
            link.deleted_at.is_some(),
            false,
        );
        if decision != Decision::Keep {
            links::put(conn, link)?;
        }
    }
    Ok(())
}

/// Clears what the scope holds, mirrors apart, and answers the ids of the attachments whose files go with them.
fn clear(conn: &Connection, scope: &Scope) -> Result<Vec<String>> {
    let mut removed_files = Vec::new();
    let mut delete = |table: &str, column: &str, only: Option<Vec<String>>| -> Result<()> {
        let (filter, params) = match only {
            None => (String::new(), Vec::new()),
            Some(values) if values.is_empty() => return Ok(()),
            Some(values) => {
                let marks: Vec<String> = (1..=values.len()).map(|n| format!("?{n}")).collect();
                (format!(" AND {column} IN ({})", marks.join(", ")), values)
            }
        };
        let rows = format!("FROM {table} WHERE mirror = 0{filter}");
        if table == ATTACHMENT.table() {
            let ids: Vec<String> = conn
                .prepare(&format!("SELECT id {rows}"))?
                .query_map(rusqlite::params_from_iter(&params), |row| row.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            removed_files.extend(ids);
        }
        conn.execute(
            &format!("DELETE FROM links WHERE owner_id IN (SELECT id {rows})"),
            rusqlite::params_from_iter(&params),
        )?;
        conn.execute(
            &format!("DELETE {rows}"),
            rusqlite::params_from_iter(&params),
        )?;
        Ok(())
    };

    for primitive in primitives::ALL {
        delete(primitive.table(), "kind", kinds_in(scope, primitive))?;
    }
    let types = match scope {
        Scope::Full => None,
        Scope::Domain { .. } => Some(entity_types(conn, scope)?),
    };
    delete("entities", "type", types)?;
    // A domain's bundle carries no grants and no facts, so only a replace of the whole workspace clears them; the
    // ledger is this device's and no import touches it.
    if *scope == Scope::Full {
        grants::clear(conn)?;
        facts::clear(conn)?;
    }
    Ok(removed_files)
}

pub fn import(workspace: &Workspace, path: &Path, mode: Mode) -> Result<ImportSummary> {
    let mut archive = open(path)?;
    let manifest = verify(&mut archive)?;
    if let Scope::Domain { domain } = &manifest.scope {
        if !registry::is_owner(domain) {
            return Err(bundle_error(
                "unreadable",
                format!("not a domain this build knows: {domain:?}"),
            ));
        }
    }

    // Everything is read and checked before anything is written.
    let mut incoming = Vec::new();
    let mut incoming_grants = Vec::new();
    let mut incoming_facts = Vec::new();
    let mut files = Vec::new();
    let mut settings = None;
    for file in &manifest.files {
        let in_folder = |folder: &str| file.path.starts_with(folder);
        if (in_folder("primitives/") || in_folder("entities/")) && file.path.ends_with(".jsonl") {
            incoming.extend(parse(&file.path, &entry(&mut archive, &file.path)?)?);
        } else if let Some(id) = file.path.strip_prefix("attachments/") {
            if !ids::is_ulid(id) {
                return Err(bundle_error(
                    "unreadable",
                    format!("{} is not named by an id", file.path),
                ));
            }
            files.push((id.to_string(), entry(&mut archive, &file.path)?));
        } else if file.path == SETTINGS {
            settings = serde_json::from_slice(&entry(&mut archive, SETTINGS)?).ok();
        } else if file.path == GRANTS {
            incoming_grants = parse_grants(&entry(&mut archive, GRANTS)?)?;
        } else if file.path == FACTS {
            incoming_facts = parse_facts(&entry(&mut archive, FACTS)?)?;
        }
    }

    let mut summary = ImportSummary {
        mode: Some(mode),
        scope: Some(manifest.scope.clone()),
        settings,
        ..Default::default()
    };
    summary.unknown_types = incoming
        .iter()
        .filter(|row| row.primitive.is_none() && !registry::is_entity_type(&row.type_id))
        .map(|row| row.type_id.clone())
        .chain(
            incoming_facts
                .iter()
                .filter(|fact| {
                    !registry::resource(&fact.type_id)
                        .is_some_and(|row| row.category == registry::Category::Fact)
                })
                .map(|fact| fact.type_id.clone()),
        )
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();

    if mode == Mode::Replace {
        let backup = default_path(workspace, "backups", "pre-replace", &Scope::Full);
        let request = ExportRequest {
            scope: Scope::Full,
            path: Some(backup.to_string_lossy().into_owned()),
            settings: None,
            extras: Vec::new(),
        };
        export(workspace, request).map_err(|e| bundle_error("backup", e))?;
        summary.backup_path = Some(backup.to_string_lossy().into_owned());
    }

    // The files first: a file without its row is a few bytes to sweep, a row without its file is broken.
    for (id, bytes) in &files {
        let destination = workspace.attachment_path(id);
        if let Some(dir) = destination.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(destination, bytes)?;
    }

    let latest = incoming
        .iter()
        .flat_map(|row| {
            std::iter::once(row.text("updatedAt").to_string())
                .chain(row.links.iter().map(|link| link.updated_at.clone()))
        })
        .chain(incoming_grants.iter().map(|grant| grant.updated_at.clone()))
        .chain(incoming_facts.iter().map(|fact| fact.updated_at.clone()))
        .max();
    let removed_files = workspace.write(|ctx| {
        if let Some(latest) = &latest {
            hlc::receive(ctx.conn, latest)?;
        }
        let removed = match mode {
            Mode::Replace => clear(ctx.conn, &manifest.scope)?,
            Mode::Merge => Vec::new(),
        };
        for row in &incoming {
            apply(ctx, row, &mut summary)?;
        }
        for grant in &incoming_grants {
            apply_grant(ctx, grant, &mut summary)?;
        }
        for fact in &incoming_facts {
            apply_fact(ctx, fact, &mut summary)?;
        }
        Ok(removed)
    })?;

    // What a replace cleared and the bundle did not bring back has no row any more.
    for id in removed_files {
        if !files.iter().any(|(kept, _)| *kept == id) {
            let _ = std::fs::remove_file(workspace.attachment_path(&id));
        }
    }
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::temp_dir;
    use crate::substrate::attachments::{attach, AttachInput};
    use crate::substrate::entities::EntityInput;
    use crate::substrate::grants::{
        Access, GrantInput, GrantQuery, Lifetime, Origin, ResourceType,
    };
    use crate::substrate::links::LinkInput;
    use crate::substrate::primitives::{EVENT, TASK};
    use crate::substrate::rows;

    fn entity(type_id: &str, payload: Value) -> EntityInput {
        EntityInput {
            id: None,
            type_id: type_id.to_string(),
            payload,
            mirror: false,
            source: None,
            external_id: None,
            snapshot: None,
        }
    }

    fn link_to(uri: &str, relation: &str, label: &str) -> LinkInput {
        LinkInput {
            uri: uri.to_string(),
            relation: relation.to_string(),
            label: label.to_string(),
        }
    }

    fn grant_of(
        subject: &str,
        resource: &str,
        resource_type: ResourceType,
        lifetime: Lifetime,
    ) -> GrantInput {
        GrantInput {
            id: None,
            subject: subject.into(),
            resource: resource.into(),
            resource_type,
            access: Access::Read,
            lifetime,
            narrowing: None,
            origin: Origin::Onboarding,
        }
    }

    fn fact_of(type_id: &str, value: Value, provenance: facts::Provenance) -> facts::FactInput {
        facts::FactInput {
            id: None,
            type_id: type_id.into(),
            value,
            provenance,
            confidence: match provenance {
                facts::Provenance::AiInferred => Some(0.8),
                _ => None,
            },
            valid_from: None,
            valid_until: None,
            source: None,
            note: None,
        }
    }

    /// A workspace with something of everything: rows in every table, tombstones, links live and removed, an
    /// overlay, a mirror, an attachment with its file, grants standing, revoked, for the session and for the
    /// device, and facts the owner asserted, the substrate derived, the Gardener inferred, one edited and one
    /// deleted.
    fn populated(scratch: &Path) -> Workspace {
        let workspace = Workspace::in_memory();
        let photo = scratch.join("haul.jpg");
        std::fs::write(&photo, b"not really a photo").unwrap();

        let recipe = workspace
            .write(|ctx| {
                let dal = entities::create(ctx, entity("recipe", json!({ "name": "Dal", "tags": ["quick"] })))?;
                let soup = entities::create(ctx, entity("recipe", json!({ "name": "Secret soup" })))?;
                rows::delete(ctx, &soup.uri)?;
                entities::create(ctx, entity("stock-item", json!({ "name": "Rice", "qty": "2" })))?;

                let project = entities::create(ctx, entity("project", json!({ "name": "Kiln build" })))?;
                let idea = entities::create(ctx, entity("idea", json!({ "title": "Kiln" })))?;
                links::link(ctx, &idea.uri, &link_to(&project.uri, "part-of", "Kiln build"))?;
                links::link(ctx, &idea.uri, &link_to(&dal.uri, "see-also", "Dal"))?;
                links::unlink(ctx, &idea.uri, &dal.uri, "see-also")?;

                let weather = |mirror: bool| EntityInput {
                    mirror,
                    source: Some("open-meteo".into()),
                    external_id: Some("home".into()),
                    ..entity("forecast", json!({ "note": if mirror { "cached" } else { "mine" } }))
                };
                entities::create(ctx, weather(true))?;
                entities::create(ctx, weather(false))?;

                let home = primitives::create(
                    ctx,
                    &PLACE,
                    json!({ "kind": "home", "name": "Home", "lat": 30.3, "lng": -97.7 }),
                )?;
                primitives::create(
                    ctx,
                    &EVENT,
                    json!({
                        "kind": "shop-day", "title": "Shop", "startAt": "2026-10-03", "allDay": true,
                        "links": [{ "uri": home["uri"], "relation": "at", "label": "Home" }],
                    }),
                )?;
                primitives::create(
                    ctx,
                    &TASK,
                    json!({
                        "kind": "checklist", "title": "Cook the dal", "due": "2026-10-01",
                        "items": [{ "text": "Soak", "done": true }],
                        "links": [{ "uri": dal.uri, "relation": "from", "label": "Dal" }],
                    }),
                )?;
                let gone = primitives::create(
                    ctx,
                    &TASK,
                    json!({ "kind": "todo", "title": "A private errand", "notes": "do not export" }),
                )?;
                rows::delete(ctx, gone["uri"].as_str().unwrap())?;

                grants::grant(ctx, grant_of("anthropic", "allergy", ResourceType::Registry, Lifetime::Standing))?;
                let ended = grants::grant(
                    ctx,
                    grant_of("anthropic", "medical-dietary-restriction", ResourceType::Registry, Lifetime::Standing),
                )?;
                grants::revoke(ctx, &ended.id)?;
                grants::grant(ctx, grant_of("anthropic", "body-metric", ResourceType::Registry, Lifetime::Session))?;
                grants::grant(ctx, grant_of("this-device", "camera", ResourceType::Capability, Lifetime::Standing))?;

                let nuts = facts::assert(
                    ctx,
                    fact_of(
                        "allergy",
                        json!({ "kind": "food", "substance": "tree nuts", "severity": "mild" }),
                        facts::Provenance::UserAsserted,
                    ),
                )?;
                let severe = json!({ "value": { "kind": "food", "substance": "tree nuts", "severity": "severe" } });
                facts::update(ctx, &nuts.id, severe.as_object().unwrap())?;
                facts::assert(
                    ctx,
                    fact_of(
                        "home-area",
                        json!({ "city": "Austin", "region": "Texas", "country": "United States" }),
                        facts::Provenance::SystemDerived,
                    ),
                )?;
                facts::assert(ctx, fact_of("disliked-ingredient", json!("cilantro"), facts::Provenance::AiInferred))?;
                let name = facts::assert(ctx, fact_of("preferred-name", json!("Rowan"), facts::Provenance::UserAsserted))?;
                facts::delete(ctx, &name.id)?;
                Ok(dal)
            })
            .unwrap();

        attach(
            &workspace,
            AttachInput {
                id: None,
                kind: "haul-photo".into(),
                path: photo.to_string_lossy().into_owned(),
                file_name: None,
                mime: None,
                captured: None,
                links: vec![link_to(&recipe.uri, "about", "Dal")],
            },
        )
        .unwrap();
        workspace
    }

    fn export_to(workspace: &Workspace, path: &Path, scope: Scope) -> ExportResult {
        export(
            workspace,
            ExportRequest {
                scope,
                path: Some(path.to_string_lossy().into_owned()),
                settings: Some(json!({ "measurement": "metric" })),
                extras: Vec::new(),
            },
        )
        .unwrap()
    }

    fn unzip(path: &Path) -> BTreeMap<String, Vec<u8>> {
        let mut archive = open(path).unwrap();
        let names: Vec<String> = archive.file_names().map(str::to_string).collect();
        names
            .into_iter()
            .map(|name| {
                let bytes = entry(&mut archive, &name).unwrap();
                (name, bytes)
            })
            .collect()
    }

    /// A copy of the bundle with some of its files changed, and the manifest as it was unless it is one of them.
    fn rewrite(from: &Path, to: &Path, change: impl Fn(&str, Vec<u8>) -> Vec<u8>) {
        let mut archive = zip::ZipWriter::new(std::fs::File::create(to).unwrap());
        for (name, bytes) in unzip(from) {
            archive
                .start_file(name.as_str(), SimpleFileOptions::default())
                .unwrap();
            archive.write_all(&change(&name, bytes)).unwrap();
        }
        archive.finish().unwrap();
    }

    fn text(files: &BTreeMap<String, Vec<u8>>, name: &str) -> String {
        String::from_utf8(files[name].clone()).unwrap()
    }

    /// The manifest without what differs between two exports of the same rows: when, by which device, which build.
    fn comparable(files: &BTreeMap<String, Vec<u8>>) -> Value {
        let mut manifest: Value = serde_json::from_slice(&files[MANIFEST]).unwrap();
        for key in ["createdAt", "node", "app"] {
            manifest.as_object_mut().unwrap().remove(key);
        }
        manifest
    }

    fn assert_same_bundle(a: &Path, b: &Path) {
        let (a, b) = (unzip(a), unzip(b));
        assert_eq!(a.keys().collect::<Vec<_>>(), b.keys().collect::<Vec<_>>());
        for (name, bytes) in &a {
            if name != MANIFEST {
                assert!(bytes == &b[name], "{name} differs");
            }
        }
        assert_eq!(comparable(&a), comparable(&b));
    }

    fn count(workspace: &Workspace, table: &str) -> i64 {
        workspace
            .read(|conn| {
                Ok(
                    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                        row.get(0)
                    })?,
                )
            })
            .unwrap()
    }

    fn cleanup(scratch: &Path, workspaces: &[&Workspace]) {
        std::fs::remove_dir_all(scratch).ok();
        for workspace in workspaces {
            std::fs::remove_dir_all(workspace.dir()).ok();
        }
    }

    #[test]
    fn a_bundle_holds_what_the_layout_says() {
        let scratch = temp_dir("bundle-layout");
        let workspace = populated(&scratch);
        let result = export_to(&workspace, &scratch.join("a.zip"), Scope::Full);
        let files = unzip(&scratch.join("a.zip"));

        let attachment = files
            .keys()
            .find(|name| name.starts_with("attachments/"))
            .unwrap();
        assert_eq!(files[attachment], b"not really a photo");
        for name in [
            MANIFEST,
            README,
            "primitives/task.jsonl",
            "primitives/event.jsonl",
            "primitives/place.jsonl",
            "primitives/attachment.jsonl",
            "entities/calendar-source.jsonl",
            "entities/recipe.jsonl",
            "entities/stock-item.jsonl",
            "entities/idea.jsonl",
            "entities/project.jsonl",
            "entities/forecast.jsonl",
            "facts.jsonl",
            "grants.json",
            SETTINGS,
        ] {
            assert!(files.contains_key(name), "{name} is missing");
        }
        assert_eq!(files.len(), 16);

        // The manifest lists every other file with its hash, and counts the live rows.
        let manifest: Manifest = serde_json::from_slice(&files[MANIFEST]).unwrap();
        assert_eq!(manifest.format, FORMAT);
        assert_eq!(manifest.scope, Scope::Full);
        assert_eq!(manifest.files.len(), files.len() - 1);
        for file in &manifest.files {
            assert_eq!(sha256(&files[&file.path]), file.sha256, "{}", file.path);
            assert_eq!(files[&file.path].len() as u64, file.bytes);
        }
        assert_eq!(manifest.counts["recipe"], 1);
        assert_eq!(manifest.counts["task"], 1);
        assert_eq!(manifest.counts["forecast"], 1);
        assert_eq!(manifest.counts[GRANT], 1);
        assert_eq!(manifest.counts[FACT], 3);
        assert_eq!(result.counts, manifest.counts);
        let recipes = manifest
            .files
            .iter()
            .find(|file| file.path == "entities/recipe.jsonl")
            .unwrap();
        assert_eq!((recipes.rows, recipes.tombstones), (Some(2), Some(1)));

        // The mirror stays; its overlay leaves. What was deleted leaves as a tombstone, empty.
        let forecasts = text(&files, "entities/forecast.jsonl");
        assert!(forecasts.contains("mine") && !forecasts.contains("cached"));
        let everything: String = files
            .keys()
            .filter(|name| name.ends_with(".jsonl"))
            .map(|name| text(&files, name))
            .collect();
        assert!(!everything.contains("Secret soup"));
        assert!(!everything.contains("A private errand") && !everything.contains("do not export"));

        // A link that was removed is there, as removed: a merge needs it.
        let ideas = text(&files, "entities/idea.jsonl");
        let idea: Value = serde_json::from_str(ideas.lines().next().unwrap()).unwrap();
        let removed: Vec<bool> = idea["links"]
            .as_array()
            .unwrap()
            .iter()
            .map(|link| !link["deletedAt"].is_null())
            .collect();
        assert_eq!(removed.iter().filter(|removed| **removed).count(), 1);
        assert_eq!(removed.len(), 2);

        // The grants leave with their revocations, and never the session's or the device's.
        let grants_file = manifest
            .files
            .iter()
            .find(|file| file.path == GRANTS)
            .unwrap();
        assert_eq!(
            (grants_file.rows, grants_file.tombstones),
            (Some(2), Some(1))
        );
        let grants_text = text(&files, GRANTS);
        assert!(
            grants_text.contains("allergy") && grants_text.contains("medical-dietary-restriction")
        );
        assert!(!grants_text.contains("body-metric") && !grants_text.contains("camera"));
        assert!(!grants_text.contains("session") && !grants_text.contains("capability"));

        // The facts leave one a line; the deleted one as its tombstone, with nothing it held, and the history stays.
        let facts_file = manifest
            .files
            .iter()
            .find(|file| file.path == FACTS)
            .unwrap();
        assert_eq!((facts_file.rows, facts_file.tombstones), (Some(4), Some(1)));
        let facts_text = text(&files, FACTS);
        assert_eq!(facts_text.lines().count(), 4);
        assert!(facts_text.contains("severe") && !facts_text.contains("mild"));
        assert!(facts_text.contains("cilantro") && facts_text.contains("system-derived"));
        assert!(!facts_text.contains("Rowan"));
        assert_eq!(count(&workspace, "fact_history"), 1);

        assert!(text(&files, README).contains("| recipe | 1 |"));
        cleanup(&scratch, &[&workspace]);
    }

    /// The Phase 1 done criterion: what is exported, imported into an empty workspace and exported again is the
    /// same bundle.
    #[test]
    fn an_export_round_trips_through_a_merge() {
        let scratch = temp_dir("bundle-merge");
        let first = populated(&scratch);
        export_to(&first, &scratch.join("a.zip"), Scope::Full);

        let second = Workspace::in_memory();
        let summary = import(&second, &scratch.join("a.zip"), Mode::Merge).unwrap();
        // The local calendar source is in every workspace, the same row: it is the one skipped.
        assert_eq!(summary.skipped, 1);
        assert_eq!(summary.inserted, 17);
        assert_eq!((summary.updated, summary.tombstoned), (0, 0));
        assert_eq!(summary.settings, Some(json!({ "measurement": "metric" })));
        assert_eq!(summary.backup_path, None);
        assert!(summary.unknown_types.is_empty());

        export_to(&second, &scratch.join("b.zip"), Scope::Full);
        assert_same_bundle(&scratch.join("a.zip"), &scratch.join("b.zip"));

        // The rows are usable where they landed: the task is found by what it came from, and the file is there.
        let recipe = second
            .read(|conn| {
                entities::query(
                    conn,
                    &EntityQuery {
                        type_id: "recipe".into(),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        let tasks = second
            .read(|conn| {
                primitives::query(
                    conn,
                    &TASK,
                    &Query {
                        linked_to: Some(recipe[0].uri.clone()),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        assert_eq!(tasks[0]["title"], "Cook the dal");
        assert_eq!(tasks[0]["items"][0]["text"], "Soak");
        let attachments = second
            .read(|conn| primitives::query(conn, &ATTACHMENT, &Query::default()))
            .unwrap();
        let file = second.attachment_path(attachments[0]["id"].as_str().unwrap());
        assert_eq!(std::fs::read(file).unwrap(), b"not really a photo");

        // Importing the same bundle again changes nothing, and says so.
        // The grants landed as they were: the standing one answers a check, the ended one stays ended.
        let live = second
            .read(|conn| grants::query(conn, &GrantQuery::default()))
            .unwrap();
        assert_eq!(live.len(), 1);
        assert_eq!(live[0].resource, "allergy");
        assert_eq!(count(&second, "grants"), 2);

        // The facts landed as they were, the tombstone included; the history never left.
        let effective = second
            .read(|conn| facts::query(conn, &facts::FactQuery::default()))
            .unwrap();
        assert_eq!(effective.len(), 3);
        assert_eq!(count(&second, "facts"), 4);
        assert_eq!(count(&second, "fact_history"), 0);

        // Importing the same bundle again changes nothing, and says so.
        let again = import(&second, &scratch.join("a.zip"), Mode::Merge).unwrap();
        assert_eq!((again.inserted, again.updated, again.skipped), (0, 0, 18));
        cleanup(&scratch, &[&first, &second]);
    }

    #[test]
    fn an_export_round_trips_through_a_replace() {
        let scratch = temp_dir("bundle-replace");
        let first = populated(&scratch);
        export_to(&first, &scratch.join("a.zip"), Scope::Full);

        // A workspace with rows of its own, a mirror, and a file.
        let second = populated(&scratch);
        let own_file = second
            .read(|conn| primitives::query(conn, &ATTACHMENT, &Query::default()))
            .unwrap()[0]["id"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(second.attachment_path(&own_file).exists());

        let summary = import(&second, &scratch.join("a.zip"), Mode::Replace).unwrap();
        assert_eq!(
            (summary.inserted, summary.updated, summary.skipped),
            (18, 0, 0)
        );

        // What was there went into the backup before it was cleared, and the backup is a bundle.
        let backup = PathBuf::from(summary.backup_path.unwrap());
        assert!(backup.starts_with(second.dir().join("backups")));
        let kept = inspect(&backup).unwrap();
        assert_eq!(kept.counts["recipe"], 1);
        assert!(!second.attachment_path(&own_file).exists());

        export_to(&second, &scratch.join("b.zip"), Scope::Full);
        assert_same_bundle(&scratch.join("a.zip"), &scratch.join("b.zip"));

        // The mirror is this device's, and a replace leaves it alone.
        let mirrors: i64 = second
            .read(|conn| {
                Ok(conn.query_row(
                    "SELECT COUNT(*) FROM entities WHERE mirror = 1",
                    [],
                    |row| row.get(0),
                )?)
            })
            .unwrap();
        assert_eq!(mirrors, 1);
        cleanup(&scratch, &[&first, &second]);
    }

    #[test]
    fn a_domain_bundle_holds_what_the_domain_owns() {
        let scratch = temp_dir("bundle-domain");
        let workspace = populated(&scratch);
        let path = scratch.join("kitchen.zip");
        let request = |extras: Vec<Extra>| ExportRequest {
            scope: Scope::Domain {
                domain: "kitchen".into(),
            },
            path: Some(path.to_string_lossy().into_owned()),
            settings: Some(json!({ "measurement": "metric" })),
            extras,
        };
        export(
            &workspace,
            request(vec![Extra {
                path: "friendly/stock.csv".into(),
                content: "name,qty\nRice,2\n".into(),
            }]),
        )
        .unwrap();

        let files = unzip(&path);
        let mut names: Vec<&str> = files
            .keys()
            .map(String::as_str)
            .filter(|name| !name.starts_with("attachments/"))
            .collect();
        names.sort();
        assert_eq!(
            names,
            [
                README,
                "entities/recipe.jsonl",
                "entities/stock-item.jsonl",
                "friendly/stock.csv",
                MANIFEST,
                "primitives/attachment.jsonl",
                "primitives/event.jsonl",
            ]
        );
        assert_eq!(
            files
                .keys()
                .filter(|name| name.starts_with("attachments/"))
                .count(),
            1
        );

        // Replacing the domain clears the domain and nothing else.
        let other = populated(&scratch);
        let before = (count(&other, "tasks"), count(&other, "places"));
        let ideas = |workspace: &Workspace| -> i64 {
            workspace
                .read(|conn| {
                    Ok(conn.query_row(
                        "SELECT COUNT(*) FROM entities WHERE type = 'idea'",
                        [],
                        |row| row.get(0),
                    )?)
                })
                .unwrap()
        };
        let summary = import(&other, &path, Mode::Replace).unwrap();
        assert_eq!(
            summary.scope,
            Some(Scope::Domain {
                domain: "kitchen".into()
            })
        );
        assert_eq!(summary.settings, None);
        assert_eq!((count(&other, "tasks"), count(&other, "places")), before);
        assert_eq!(ideas(&other), 1);
        let recipes: Vec<String> = other
            .read(|conn| {
                entities::query(
                    conn,
                    &EntityQuery {
                        type_id: "recipe".into(),
                        ..Default::default()
                    },
                )
            })
            .unwrap()
            .into_iter()
            .map(|row| row.id)
            .collect();
        let original = workspace
            .read(|conn| {
                entities::query(
                    conn,
                    &EntityQuery {
                        type_id: "recipe".into(),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        assert_eq!(recipes, [original[0].id.clone()]);

        for bad in [
            "stock.csv",
            "friendly/",
            "friendly/../manifest.json",
            "/friendly/x",
            "friendly//x",
        ] {
            let extras = vec![Extra {
                path: bad.into(),
                content: String::new(),
            }];
            assert!(
                export(&workspace, request(extras)).is_err(),
                "{bad:?} should be refused"
            );
        }
        let nobody = ExportRequest {
            scope: Scope::Domain {
                domain: "finance".into(),
            },
            ..request(Vec::new())
        };
        assert!(export(&workspace, nobody).is_err());
        cleanup(&scratch, &[&workspace, &other]);
    }

    #[test]
    fn the_later_stamp_wins_and_a_tie_follows_the_rule() {
        use Decision::*;
        let (early, late) = (
            "0000000000000001-00000000-00000001",
            "0000000000000002-00000000-00000001",
        );
        let cases = [
            // local, the bundle's stamp, the bundle's row is deleted, what an entity does, what a link does
            (None, late, false, Insert, Insert),
            (None, late, true, Insert, Insert),
            (Some((early, false)), late, false, Replace, Replace),
            (Some((early, false)), late, true, Tombstone, Tombstone),
            (Some((early, true)), late, false, Replace, Replace),
            (Some((late, false)), early, false, Keep, Keep),
            (Some((late, false)), early, true, Keep, Keep),
            (Some((late, true)), early, false, Keep, Keep),
            // the same stamp and the same state: the same row
            (Some((late, false)), late, false, Keep, Keep),
            (Some((late, true)), late, true, Keep, Keep),
            // the same stamp, one of them deleted: an entity stays deleted, a link stays
            (Some((late, false)), late, true, Tombstone, Keep),
            (Some((late, true)), late, false, Keep, Replace),
        ];
        for (local, stamp, deleted, entity, link) in cases {
            assert_eq!(
                decide(local, stamp, deleted, true),
                entity,
                "{local:?} {stamp} {deleted}"
            );
            assert_eq!(
                decide(local, stamp, deleted, false),
                link,
                "{local:?} {stamp} {deleted}"
            );
        }
    }

    #[test]
    fn a_merge_keeps_what_is_newer_here_and_takes_what_is_newer_there() {
        let scratch = temp_dir("bundle-newer");
        let first = Workspace::in_memory();
        let (kept, taken, deleted) = first
            .write(|ctx| {
                Ok((
                    entities::create(ctx, entity("recipe", json!({ "name": "Kept" })))?,
                    entities::create(ctx, entity("recipe", json!({ "name": "Taken" })))?,
                    entities::create(ctx, entity("recipe", json!({ "name": "Deleted there" })))?,
                ))
            })
            .unwrap();
        export_to(&first, &scratch.join("before.zip"), Scope::Full);

        let second = Workspace::in_memory();
        import(&second, &scratch.join("before.zip"), Mode::Merge).unwrap();

        // Each side edits one row, and the first deletes one, after they were the same.
        second
            .write(|ctx| entities::update(ctx, &kept.id, json!({ "name": "Kept, edited here" })))
            .unwrap();
        first
            .write(|ctx| {
                entities::update(ctx, &taken.id, json!({ "name": "Taken, edited there" }))?;
                rows::delete(ctx, &deleted.uri)
            })
            .unwrap();
        export_to(&first, &scratch.join("after.zip"), Scope::Full);

        let summary = import(&second, &scratch.join("after.zip"), Mode::Merge).unwrap();
        assert_eq!((summary.inserted, summary.updated), (0, 2));
        let names: Vec<String> = second
            .read(|conn| {
                entities::query(
                    conn,
                    &EntityQuery {
                        type_id: "recipe".into(),
                        ..Default::default()
                    },
                )
            })
            .unwrap()
            .into_iter()
            .map(|row| row.payload["name"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(names, ["Kept, edited here", "Taken, edited there"]);

        // The row deleted there is a tombstone here that still holds what it held: it can be brought back.
        let restored = second
            .write(|ctx| rows::restore(ctx, &deleted.uri))
            .unwrap();
        assert!(restored.is_some());
        let back = second
            .read(|conn| entities::get(conn, &deleted.id))
            .unwrap()
            .unwrap();
        assert_eq!(back.payload, json!({ "name": "Deleted there" }));
        cleanup(&scratch, &[&first, &second]);
    }

    #[test]
    fn of_two_homes_the_later_one_stays() {
        let scratch = temp_dir("bundle-home");
        let home = |name: &str| json!({ "kind": "home", "name": name, "lat": 30.3, "lng": -97.7 });
        let first = Workspace::in_memory();
        let second = Workspace::in_memory();
        second
            .write(|ctx| primitives::create(ctx, &PLACE, home("The old flat")))
            .unwrap();
        // The two clocks are independent: within one millisecond the node decides, so the later home is made later
        std::thread::sleep(std::time::Duration::from_millis(2));
        first
            .write(|ctx| primitives::create(ctx, &PLACE, home("The new house")))
            .unwrap();
        export_to(&first, &scratch.join("a.zip"), Scope::Full);

        let summary = import(&second, &scratch.join("a.zip"), Mode::Merge).unwrap();
        assert_eq!(summary.tombstoned, 1);
        let live = second
            .read(|conn| primitives::query(conn, &PLACE, &Query::default()))
            .unwrap();
        assert_eq!(live.len(), 1);
        assert_eq!(live[0]["name"], "The new house");
        assert_eq!(count(&second, "places"), 2);
        cleanup(&scratch, &[&first, &second]);
    }

    #[test]
    fn a_bundle_that_was_changed_is_refused_and_nothing_is_written() {
        let scratch = temp_dir("bundle-tampered");
        let first = populated(&scratch);
        export_to(&first, &scratch.join("a.zip"), Scope::Full);
        let second = Workspace::in_memory();
        let refused = |path: &Path, code: &str| {
            let error = import(&second, path, Mode::Replace)
                .unwrap_err()
                .to_string();
            assert!(error.starts_with(&format!("bundle:{code}: ")), "{error}");
            assert_eq!(count(&second, "entities"), 1);
            assert_eq!(count(&second, "tasks"), 0);
            assert!(!second.dir().join("attachments").exists());
            assert!(!second.dir().join("backups").exists());
        };

        let tampered = scratch.join("tampered.zip");
        rewrite(&scratch.join("a.zip"), &tampered, |name, bytes| {
            if name == "entities/recipe.jsonl" {
                String::from_utf8(bytes)
                    .unwrap()
                    .replace("Dal", "Dhal")
                    .into_bytes()
            } else {
                bytes
            }
        });
        refused(&tampered, "hash-mismatch");
        assert!(inspect(&tampered).is_err());

        let newer = scratch.join("newer.zip");
        rewrite(&scratch.join("a.zip"), &newer, |name, bytes| {
            if name == MANIFEST {
                String::from_utf8(bytes)
                    .unwrap()
                    .replace("\"formatVersion\": 1", "\"formatVersion\": 2")
                    .into_bytes()
            } else {
                bytes
            }
        });
        refused(&newer, "version");

        let not_a_zip = scratch.join("notes.zip");
        std::fs::write(&not_a_zip, b"just some text").unwrap();
        refused(&not_a_zip, "unreadable");
        refused(&scratch.join("missing.zip"), "unreadable");
        cleanup(&scratch, &[&first, &second]);
    }

    #[test]
    fn a_row_that_does_not_fit_its_file_is_refused() {
        let good = json!({
            "id": "01J9ZQ4M3T8R5V2X7Y6W1B0CDE", "type": "recipe", "uri": "eden://recipe/01J9ZQ4M3T8R5V2X7Y6W1B0CDE",
            "payload": {}, "mirror": false, "links": [],
            "createdAt": "0000000000000001-00000000-00000001", "updatedAt": "0000000000000001-00000000-00000001",
            "deletedAt": null,
        });
        let line = |change: &dyn Fn(&mut Value)| {
            let mut row = good.clone();
            change(&mut row);
            format!("{row}\n").into_bytes()
        };
        assert_eq!(
            parse("entities/recipe.jsonl", &line(&|_| {}))
                .unwrap()
                .len(),
            1
        );
        assert!(parse("entities/recipe.jsonl", b"").unwrap().is_empty());

        let changes: [&dyn Fn(&mut Value); 7] = [
            &|row| row["id"] = json!("r-01"),
            &|row| row["type"] = json!("idea"),
            &|row| row["updatedAt"] = json!("yesterday"),
            &|row| row["deletedAt"] = json!("0000000000000009-00000000-00000001"),
            &|row| row["mirror"] = json!(true),
            &|row| {
                row["links"] = json!([{ "owner": "eden://idea/01J9ZQ4M3T8R5V2X7Y6W1B0CDE", "uri": "eden://recipe/01J9ZQ4M3T8R5V2X7Y6W1B0CDE",
                "relation": "about", "label": "", "createdAt": "0000000000000001-00000000-00000001",
                "updatedAt": "0000000000000001-00000000-00000001", "deletedAt": null }])
            },
            &|row| *row = json!(["not", "an", "object"]),
        ];
        for change in changes {
            assert!(parse("entities/recipe.jsonl", &line(change)).is_err());
        }
        assert!(parse("primitives/recipe.jsonl", &line(&|_| {})).is_err());
        assert!(parse("entities/Recipe.jsonl", &line(&|_| {})).is_err());
    }

    #[test]
    fn a_replace_clears_grants_and_leaves_the_ledger() {
        let scratch = temp_dir("bundle-grants-replace");
        let first = populated(&scratch);
        export_to(&first, &scratch.join("a.zip"), Scope::Full);

        let second = populated(&scratch);
        second
            .write(|ctx| {
                grants::grant(
                    ctx,
                    grant_of(
                        "openai",
                        "allergy",
                        ResourceType::Registry,
                        Lifetime::Standing,
                    ),
                )?;
                crate::substrate::egress::record_on(ctx.conn, "open-meteo", 300, "2026-09-29")?;
                crate::substrate::scheduler::set(ctx.conn, "kitchen.shop-day", 1)?;
                crate::substrate::signals::emit(
                    ctx.conn,
                    crate::substrate::signals::SignalInput {
                        name: "stock.expiring".into(),
                        payload: None,
                        tier: "T1".into(),
                        dedupe_key: None,
                        deliveries: vec![crate::substrate::signals::DeliveryInput {
                            rule: "kitchen.expiring-digest".into(),
                            channel: crate::substrate::signals::Channel::InApp,
                        }],
                    },
                )?;
                Ok(())
            })
            .unwrap();
        let before = count(&second, "grants");
        import(&second, &scratch.join("a.zip"), Mode::Replace).unwrap();

        // What the bundle carries replaced what was here; the device's own camera grant stayed, and its ledger.
        let all = second
            .read(|conn| {
                grants::query(
                    conn,
                    &GrantQuery {
                        include_revoked: true,
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        let resources: Vec<&str> = all.iter().map(|grant| grant.resource.as_str()).collect();
        assert_eq!(all.len(), 3, "{resources:?}");
        assert!(resources.contains(&"camera") && !resources.contains(&"body-metric"));
        assert!(all.iter().all(|grant| grant.subject != "openai"));
        assert!(before > all.len() as i64);
        assert_eq!(count(&second, "egress"), 1);
        // Nor does a replace touch what else is the device's own: its schedules, its signals and its inbox.
        for table in ["schedules", "signals", "inbox"] {
            assert_eq!(count(&second, table), 1, "{table}");
        }

        // A domain's replace touches no grant.
        let kitchen = scratch.join("kitchen.zip");
        export_to(
            &first,
            &kitchen,
            Scope::Domain {
                domain: "kitchen".into(),
            },
        );
        second
            .write(|ctx| {
                grants::grant(
                    ctx,
                    grant_of(
                        "openai",
                        "allergy",
                        ResourceType::Registry,
                        Lifetime::Standing,
                    ),
                )
            })
            .unwrap();
        import(&second, &kitchen, Mode::Replace).unwrap();
        assert_eq!(count(&second, "grants"), 4);
        cleanup(&scratch, &[&first, &second]);
    }

    #[test]
    fn a_replace_clears_facts_and_their_history() {
        let scratch = temp_dir("bundle-facts-replace");
        let first = populated(&scratch);
        export_to(&first, &scratch.join("a.zip"), Scope::Full);

        let second = populated(&scratch);
        second
            .write(|ctx| {
                facts::assert(
                    ctx,
                    fact_of("household-size", json!(3), facts::Provenance::UserAsserted),
                )
            })
            .unwrap();
        assert_eq!(count(&second, "facts"), 5);
        assert_eq!(count(&second, "fact_history"), 1);
        import(&second, &scratch.join("a.zip"), Mode::Replace).unwrap();
        assert_eq!(count(&second, "facts"), 4);
        assert_eq!(count(&second, "fact_history"), 0);
        let types: Vec<String> = second
            .read(|conn| facts::query(conn, &facts::FactQuery::default()))
            .unwrap()
            .into_iter()
            .map(|fact| fact.type_id)
            .collect();
        assert!(!types.contains(&"household-size".to_string()));

        // A domain's replace touches no fact.
        let kitchen = scratch.join("kitchen.zip");
        export_to(
            &first,
            &kitchen,
            Scope::Domain {
                domain: "kitchen".into(),
            },
        );
        import(&second, &kitchen, Mode::Replace).unwrap();
        assert_eq!(count(&second, "facts"), 4);
        cleanup(&scratch, &[&first, &second]);
    }

    #[test]
    fn two_derived_facts_of_one_type_keep_the_later() {
        let scratch = temp_dir("bundle-fact-rivals");
        // Two devices each derive the home area, at different times, under different ids.
        let area = |city: &str| {
            fact_of(
                "home-area",
                json!({ "city": city, "region": "Texas", "country": "United States" }),
                facts::Provenance::SystemDerived,
            )
        };
        let earlier = Workspace::in_memory();
        earlier
            .write(|ctx| facts::assert(ctx, area("Austin")))
            .unwrap();
        export_to(&earlier, &scratch.join("earlier.zip"), Scope::Full);
        let later = Workspace::in_memory();
        // A write first, so the fact's stamp is past the other device's even within the same millisecond.
        later
            .write(|ctx| entities::create(ctx, entity("recipe", json!({ "name": "Dal" }))))
            .unwrap();
        let kept = later
            .write(|ctx| facts::assert(ctx, area("Houston")))
            .unwrap();

        // The earlier one arrives at the later one's device, and yields.
        let summary = import(&later, &scratch.join("earlier.zip"), Mode::Merge).unwrap();
        assert_eq!((summary.inserted, summary.tombstoned), (1, 1));
        let live = later
            .read(|conn| facts::query(conn, &facts::FactQuery::default()))
            .unwrap();
        assert_eq!(live.len(), 1);
        assert_eq!(live[0].id, kept.id);
        assert_eq!(count(&later, "facts"), 2);

        // The later one arrives at the earlier one's device, with the earlier one's own fact already ended.
        export_to(&later, &scratch.join("later.zip"), Scope::Full);
        let summary = import(&earlier, &scratch.join("later.zip"), Mode::Merge).unwrap();
        assert!(summary.updated + summary.tombstoned >= 1);
        assert_eq!(count(&earlier, "facts"), 2);
        let live = earlier
            .read(|conn| facts::query(conn, &facts::FactQuery::default()))
            .unwrap();
        assert_eq!(live.len(), 1);
        assert_eq!(live[0].id, kept.id);
        cleanup(&scratch, &[&earlier, &later]);
    }

    #[test]
    fn a_fact_that_cannot_be_read_stops_the_import_before_it_writes() {
        let fact = json!({
            "uri": "eden://fact/01ARZ3NDEKTSV4RRFFQ69G5FAV",
            "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
            "type": "allergy",
            "value": { "kind": "food", "substance": "shellfish", "severity": "moderate" },
            "provenance": "user-asserted",
            "createdAt": "0000000000000001-00000000-00000001",
            "updatedAt": "0000000000000001-00000000-00000001",
        });
        let file = |change: &dyn Fn(&mut Value)| {
            let mut fact = fact.clone();
            change(&mut fact);
            format!("{fact}\n").into_bytes()
        };
        assert_eq!(parse_facts(&file(&|_| {})).unwrap().len(), 1);
        assert!(parse_facts(b"").unwrap().is_empty());
        for change in [
            &(|fact: &mut Value| fact["id"] = json!("not-an-id")) as &dyn Fn(&mut Value),
            &|fact| fact["uri"] = json!("eden://grant/01ARZ3NDEKTSV4RRFFQ69G5FAV"),
            &|fact| fact["type"] = json!("Allergy!"),
            &|fact| fact["value"] = Value::Null,
            &|fact| fact["confidence"] = json!(0.5),
            &|fact| fact["provenance"] = json!("hearsay"),
            &|fact| fact["validUntil"] = json!("someday"),
            &|fact| fact["deletedAt"] = json!("0000000000000002-00000000-00000001"),
        ] {
            let error = parse_facts(&file(change)).unwrap_err().to_string();
            assert!(
                error.starts_with("bundle:unreadable: facts.jsonl"),
                "{error}"
            );
        }
        assert!(parse_facts(b"not json\n").is_err());
    }

    #[test]
    fn two_live_grants_with_one_key_keep_the_later() {
        let scratch = temp_dir("bundle-grant-rivals");
        // Two devices each grant the same read, at different times, under different ids.
        let earlier = Workspace::in_memory();
        earlier
            .write(|ctx| {
                grants::grant(
                    ctx,
                    grant_of(
                        "anthropic",
                        "allergy",
                        ResourceType::Registry,
                        Lifetime::Standing,
                    ),
                )
            })
            .unwrap();
        export_to(&earlier, &scratch.join("earlier.zip"), Scope::Full);
        let later = Workspace::in_memory();
        // A write first, so the grant's stamp is past the other device's even within the same millisecond.
        later
            .write(|ctx| entities::create(ctx, entity("recipe", json!({ "name": "Dal" }))))
            .unwrap();
        let kept = later
            .write(|ctx| {
                grants::grant(
                    ctx,
                    grant_of(
                        "anthropic",
                        "allergy",
                        ResourceType::Registry,
                        Lifetime::Standing,
                    ),
                )
            })
            .unwrap();

        // The earlier one arrives at the later one's device, and yields.
        let summary = import(&later, &scratch.join("earlier.zip"), Mode::Merge).unwrap();
        assert_eq!((summary.inserted, summary.tombstoned), (1, 1));
        let live = later
            .read(|conn| grants::query(conn, &GrantQuery::default()))
            .unwrap();
        assert_eq!(live.len(), 1);
        assert_eq!(live[0].id, kept.id);
        assert_eq!(count(&later, "grants"), 2);

        // The later one arrives at the earlier one's device, with the earlier one's own grant already ended.
        export_to(&later, &scratch.join("later.zip"), Scope::Full);
        let summary = import(&earlier, &scratch.join("later.zip"), Mode::Merge).unwrap();
        assert!(summary.updated + summary.tombstoned >= 1);
        assert_eq!(count(&earlier, "grants"), 2);
        let live = earlier
            .read(|conn| grants::query(conn, &GrantQuery::default()))
            .unwrap();
        assert_eq!(live.len(), 1);
        assert_eq!(live[0].id, kept.id);
        cleanup(&scratch, &[&earlier, &later]);
    }

    #[test]
    fn a_bundle_with_a_device_grant_is_refused() {
        let good = json!({
            "uri": "eden://grant/01J9ZQ4M3T8R5V2X7Y6W1B0CDE", "id": "01J9ZQ4M3T8R5V2X7Y6W1B0CDE",
            "subject": "anthropic", "resource": "allergy", "resourceType": "registry", "access": "read",
            "lifetime": "standing", "narrowing": null, "origin": "onboarding",
            "createdAt": "0000000000000001-00000000-00000001", "updatedAt": "0000000000000001-00000000-00000001",
            "deletedAt": null,
        });
        let file = |change: &dyn Fn(&mut Value)| {
            let mut grant = good.clone();
            change(&mut grant);
            json!({ "grants": [grant] }).to_string().into_bytes()
        };
        assert_eq!(parse_grants(&file(&|_| {})).unwrap().len(), 1);
        assert!(parse_grants(br#"{ "grants": [] }"#).unwrap().is_empty());

        let changes: [&dyn Fn(&mut Value); 7] = [
            &|grant| grant["resourceType"] = json!("capability"),
            &|grant| grant["lifetime"] = json!("session"),
            &|grant| grant["id"] = json!("g-01"),
            &|grant| grant["uri"] = json!("eden://grant/01J9ZQ4M3T8R5V2X7Y6W1B0CDF"),
            &|grant| grant["updatedAt"] = json!("yesterday"),
            &|grant| grant["deletedAt"] = json!("0000000000000009-00000000-00000001"),
            &|grant| {
                grant["access"] = json!("act-external");
            },
        ];
        for change in changes {
            let error = parse_grants(&file(change)).unwrap_err().to_string();
            assert!(
                error.starts_with("bundle:unreadable: grants.json"),
                "{error}"
            );
        }
        assert!(parse_grants(b"[]").is_err());
    }

    #[test]
    fn an_import_moves_the_clock_past_the_bundle() {
        let scratch = temp_dir("bundle-clock");
        let first = Workspace::in_memory();
        // A device whose clock runs a day ahead.
        let ahead = Hlc {
            wall_ms: 4_000_000_000_000,
            counter: 0,
            node: 7,
        }
        .format();
        first
            .write(|ctx| {
                hlc::receive(ctx.conn, &ahead)?;
                entities::create(ctx, entity("recipe", json!({ "name": "From the future" })))
            })
            .unwrap();
        export_to(&first, &scratch.join("a.zip"), Scope::Full);

        let second = Workspace::in_memory();
        import(&second, &scratch.join("a.zip"), Mode::Merge).unwrap();
        let here = second
            .write(|ctx| entities::create(ctx, entity("recipe", json!({ "name": "Made after" }))))
            .unwrap();
        assert!(here.updated_at > ahead);
        cleanup(&scratch, &[&first, &second]);
    }
}
