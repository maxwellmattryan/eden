//! The Claude Code adapter (docs/engineering/gardener.md, "The request"; D-178): every desktop request is one
//! headless `claude -p` process on the owner's own subscription, speaking stream-json. The frontend's request crosses
//! as it does for the API; this module turns it into arguments and one user message on stdin, and the process's JSONL
//! back into the Gardener's events. Eden's tools reach the process through the MCP bridge (`mcp.rs`, D-179).
//!
//! The process runs from an empty folder under the app data dir with every setting source off, no built-in tool but
//! WebSearch for research, and `ANTHROPIC_API_KEY` removed so it always runs on the subscription. Claude Code still adds
//! an environment block to the first message (the folder, the shell, the date, the account's email); `--bare` would
//! remove it but needs an API key, so the persona tells the model to ignore it.

use std::collections::HashSet;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

use super::anthropic::{self, Sse, StreamState};
use super::{ClaudeStatus, GardenerEvent, GardenerRequest, Inflight, Kill, Window};
use crate::error::{EdenError, Result};

/// The destination in the egress ledger.
pub const DESTINATION: &str = "claude-code";
/// What Claude Code puts before the name of a tool of the `eden` MCP server.
const MCP_PREFIX: &str = "mcp__eden__";
/// The tool `--json-schema` answers through; its answer arrives in the `result`, never as a card.
const STRUCTURED: &str = "StructuredOutput";
/// Claude Code's own web search, which a research request is given in place of the API's server tool.
const WEB_SEARCH: &str = "WebSearch";
/// How long a call may stay open in Claude Code's MCP client: a write behind its confirm waits for the owner.
pub const MCP_TOOL_TIMEOUT_MS: u64 = 30 * 60 * 1000;
/// The variables the process never inherits: a key would move it off the subscription, and `CLAUDECODE` marks a
/// session nested in another (a development launch from a terminal that runs one).
pub const ENV_REMOVED: [&str; 2] = ["ANTHROPIC_API_KEY", "CLAUDECODE"];
/// How much of stderr is kept for an error message.
const STDERR_CAP: usize = 16 * 1024;

// Finding the binary.

/// The places a binary is looked for, in order, before the login shell is asked: the owner's override alone when
/// there is one (a wrong override is not found, never passed over), otherwise the installer's and Homebrew's.
pub fn candidates(home: &Path, override_path: Option<&str>) -> Vec<PathBuf> {
    match override_path.map(str::trim).filter(|path| !path.is_empty()) {
        Some(path) => vec![PathBuf::from(path)],
        None => vec![
            home.join(".local/bin/claude"),
            PathBuf::from("/opt/homebrew/bin/claude"),
            PathBuf::from("/usr/local/bin/claude"),
        ],
    }
}

/// An absolute path to a file someone may execute (a symlink is followed).
pub fn is_executable(path: &Path) -> bool {
    path.is_absolute()
        && std::fs::metadata(path)
            .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// The binary this device runs: the first executable candidate, else what the login shell's PATH finds (a GUI app
/// does not inherit it). An override that is not executable answers none.
pub async fn find_binary(override_path: Option<&str>) -> Option<PathBuf> {
    let list = candidates(&home_dir(), override_path);
    if let Some(found) = list.iter().find(|path| is_executable(path)) {
        return Some(found.clone());
    }
    if override_path.is_some_and(|path| !path.trim().is_empty()) {
        return None;
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let out = output(Path::new(&shell), &["-lc", "command -v claude"], 5).await?;
    let path = PathBuf::from(
        out.lines()
            .rev()
            .find(|line| !line.trim().is_empty())?
            .trim(),
    );
    is_executable(&path).then_some(path)
}

/// The stdout of a short command, or none when it would not start or took longer than `seconds`.
async fn output(program: &Path, args: &[&str], seconds: u64) -> Option<String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    for name in ENV_REMOVED {
        command.env_remove(name);
    }
    let out = tokio::time::timeout(Duration::from_secs(seconds), command.output())
        .await
        .ok()?
        .ok()?;
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// `claude auth status --json`, of which only the sign-in, its method, the subscription's kind and the projects
/// folder are ever read.
async fn auth_status(binary: &Path) -> Option<Value> {
    let out = output(binary, &["auth", "status", "--json"], 10).await?;
    serde_json::from_str(out.trim()).ok()
}

/// What Settings shows: found or not, the version, signed in or not.
pub async fn status(override_path: Option<&str>) -> ClaudeStatus {
    let Some(binary) = find_binary(override_path).await else {
        return ClaudeStatus::default();
    };
    let version = output(&binary, &["--version"], 5)
        .await
        .and_then(|out| out.split_whitespace().next().map(str::to_string));
    let auth = auth_status(&binary).await.unwrap_or(Value::Null);
    let signed_in = auth
        .get("loggedIn")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let field = |key: &str| {
        signed_in
            .then(|| auth.get(key).and_then(Value::as_str).map(str::to_string))
            .flatten()
    };
    ClaudeStatus {
        found: true,
        path: Some(binary.to_string_lossy().into_owned()),
        version,
        signed_in,
        auth_method: field("authMethod"),
        subscription: field("subscriptionType"),
    }
}

// The process.

/// Where the bridge listens and the bearer it wants, for a conversation's `--mcp-config`.
#[derive(Debug, Clone)]
pub struct McpEndpoint {
    pub port: u16,
    pub token: String,
}

/// What `args_for` needs beyond the request: the config file of a conversation's MCP server.
#[derive(Debug, Clone, Default)]
pub struct SpawnContext {
    pub mcp_config: Option<PathBuf>,
}

fn searches(request: &GardenerRequest) -> bool {
    request.tools.iter().any(|tool| {
        tool.get("type")
            .and_then(Value::as_str)
            .is_some_and(|kind| kind.starts_with("web_search"))
    })
}

/// The system prompt as one text: a string as it is, the API's text blocks joined.
fn system_text(system: &Value) -> String {
    match system {
        Value::String(text) => text.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(|block| block.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n\n"),
        _ => String::new(),
    }
}

/// The arguments of one request's process. Every process reads stream-json and writes it with the partial messages,
/// on the request's model, with no settings, MCP servers or slash commands but its own. A conversation gets the
/// bridge and its session; anything else persists no session.
pub fn args_for(request: &GardenerRequest, ctx: &SpawnContext) -> Vec<String> {
    let mut args: Vec<String> = [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--model",
        &request.model,
        "--strict-mcp-config",
        "--setting-sources",
        "",
        "--disable-slash-commands",
        "--system-prompt",
        &system_text(&request.system),
        "--permission-mode",
        "default",
    ]
    .iter()
    .map(|arg| arg.to_string())
    .collect();
    let search = searches(request);
    args.push("--tools".into());
    args.push(if search { WEB_SEARCH } else { "" }.into());
    let mut allowed = Vec::new();
    if let (Some(session), Some(config)) = (&request.session, &ctx.mcp_config) {
        args.push("--mcp-config".into());
        args.push(config.to_string_lossy().into_owned());
        allowed.push(format!("{MCP_PREFIX}*"));
        args.push(
            if session.resume {
                "--resume"
            } else {
                "--session-id"
            }
            .into(),
        );
        args.push(session.id.clone());
    } else {
        args.push("--no-session-persistence".into());
    }
    if search {
        allowed.push(WEB_SEARCH.to_string());
    }
    if !allowed.is_empty() {
        args.push("--allowedTools".into());
        args.extend(allowed);
    }
    if let Some(schema) = &request.output_format {
        args.push("--json-schema".into());
        args.push(schema.to_string());
    }
    if let Some(effort) = &request.effort {
        args.push("--effort".into());
        args.push(effort.clone());
    }
    args
}

/// The child's environment, as a change of the app's: what is removed, and what is set.
pub fn env_for() -> (Vec<&'static str>, Vec<(&'static str, String)>) {
    (
        ENV_REMOVED.to_vec(),
        vec![
            ("MCP_TOOL_TIMEOUT", MCP_TOOL_TIMEOUT_MS.to_string()),
            (
                "CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT",
                MCP_TOOL_TIMEOUT_MS.to_string(),
            ),
        ],
    )
}

/// The one stream-json line written to stdin: the last turn of the pack, its text, image and document blocks.
pub fn user_line(request: &GardenerRequest) -> Vec<u8> {
    let content = request
        .messages
        .last()
        .and_then(|message| message.get("content"))
        .cloned()
        .unwrap_or_else(|| json!(""));
    let mut line =
        json!({ "type": "user", "message": { "role": "user", "content": content } }).to_string();
    line.push('\n');
    line.into_bytes()
}

/// The folder every process runs from, empty, under the app data dir.
pub fn work_dir(app_data: &Path) -> PathBuf {
    app_data.join("gardener").join("work")
}

/// A request id is a ULID; anything else never names a file.
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Writes a conversation's `--mcp-config` (mode 0600; the bearer is never in argv, where `ps` would show it).
fn write_mcp_config(app_data: &Path, request_id: &str, mcp: &McpEndpoint) -> Result<PathBuf> {
    let dir = app_data.join("gardener").join("mcp");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{request_id}.json"));
    let config = json!({ "mcpServers": { "eden": {
        "type": "http",
        "url": format!("http://127.0.0.1:{}/mcp/{request_id}", mcp.port),
        "headers": { "Authorization": format!("Bearer {}", mcp.token) },
        // Claude Code aborts a call silent for 300 s whatever `MCP_TOOL_TIMEOUT` says (probed on 2.1.316); the
        // server's own timeout lifts that for a confirm the owner takes their time over.
        "timeout": MCP_TOOL_TIMEOUT_MS,
    } } });
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&path)?;
    std::io::Write::write_all(&mut file, config.to_string().as_bytes())?;
    Ok(path)
}

/// One process, ready to start.
#[derive(Debug, Clone)]
pub struct Prepared {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub stdin: Vec<u8>,
    pub mcp_config: Option<PathBuf>,
}

/// Finds the binary and lays out the process. Refused `gardener:no-claude` when there is no binary.
pub async fn prepare(
    request: &GardenerRequest,
    app_data: &Path,
    mcp: Option<&McpEndpoint>,
) -> Result<Prepared> {
    if !safe_id(&request.id) {
        return Err(EdenError::Refused(
            "gardener:request: the request id is not a ULID".to_string(),
        ));
    }
    let program = find_binary(request.claude_path.as_deref())
        .await
        .ok_or_else(|| {
            EdenError::Refused(
                "gardener:no-claude: Claude Code was not found on this device".to_string(),
            )
        })?;
    let cwd = work_dir(app_data);
    std::fs::create_dir_all(&cwd)?;
    let mcp_config = match (&request.session, mcp) {
        (Some(_), Some(mcp)) => Some(write_mcp_config(app_data, &request.id, mcp)?),
        _ => None,
    };
    let ctx = SpawnContext {
        mcp_config: mcp_config.clone(),
    };
    Ok(Prepared {
        program,
        args: args_for(request, &ctx),
        cwd,
        stdin: user_line(request),
        mcp_config,
    })
}

/// An error's text with the home folder written `~` and the app data path removed.
pub fn scrub_paths(message: &str, home: &Path, app_data: &Path) -> String {
    let mut out = message.to_string();
    let app_data = app_data.to_string_lossy();
    if app_data.len() > 1 {
        out = out.replace(app_data.as_ref(), "");
    }
    let home = home.to_string_lossy();
    if home.len() > 1 {
        out = out.replace(home.as_ref(), "~");
    }
    out
}

/// The text of a failure Claude Code reported, marked `gardener:no-session` when the session to resume is gone.
fn failure_message(text: &str) -> String {
    let text = text.trim();
    if text.contains("No conversation found with session ID") {
        format!("gardener:no-session: {text}")
    } else if text.is_empty() {
        "Claude Code ended without an answer".to_string()
    } else {
        text.to_string()
    }
}

/// Starts the process, writes its one message, and hands each event to `on_event` until it exits. A cancel through
/// `inflight` kills the process group and ends the stream with `stop: cancelled`. The config file is removed however
/// it ends.
pub async fn run(
    request_id: &str,
    prepared: Prepared,
    app_data: &Path,
    inflight: &Inflight,
    on_event: &(dyn Fn(GardenerEvent) + Send + Sync),
) -> Result<()> {
    let outcome = run_process(request_id, &prepared, app_data, inflight, on_event).await;
    if let Some(config) = &prepared.mcp_config {
        let _ = std::fs::remove_file(config);
    }
    outcome
}

async fn run_process(
    request_id: &str,
    prepared: &Prepared,
    app_data: &Path,
    inflight: &Inflight,
    on_event: &(dyn Fn(GardenerEvent) + Send + Sync),
) -> Result<()> {
    let home = home_dir();
    let emit = |event: GardenerEvent| {
        on_event(match event {
            GardenerEvent::Error { status, message } => GardenerEvent::Error {
                status,
                message: scrub_paths(&message, &home, app_data),
            },
            event => event,
        })
    };

    let mut command = Command::new(&prepared.program);
    command
        .args(&prepared.args)
        .current_dir(&prepared.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .process_group(0);
    let (removed, set) = env_for();
    for name in removed {
        command.env_remove(name);
    }
    for (name, value) in set {
        command.env(name, value);
    }
    let mut child = command.spawn().map_err(|e| {
        EdenError::Refused(format!(
            "gardener:no-claude: {}",
            scrub_paths(&e.to_string(), &home, app_data)
        ))
    })?;
    let cancelled = Arc::new(AtomicBool::new(false));
    if let Some(pgid) = child.id() {
        inflight.insert_kill(
            request_id,
            Kill::Group {
                pgid,
                cancelled: cancelled.clone(),
            },
        );
    }

    if let Some(mut stdin) = child.stdin.take() {
        // A process that is already gone shows in its exit and stderr.
        let _ = stdin.write_all(&prepared.stdin).await;
        let _ = stdin.shutdown().await;
    }
    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();

    let mut state = ClaudeState::default();
    let read_stdout = async {
        let Some(stdout) = stdout.as_mut() else {
            return;
        };
        let mut reader = LineReader::default();
        let mut buffer = vec![0u8; 16 * 1024];
        loop {
            match stdout.read(&mut buffer).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    for line in reader.push(&buffer[..n]) {
                        for event in translate_line(&line, &mut state) {
                            emit(event);
                        }
                    }
                }
            }
        }
        if let Some(line) = reader.finish() {
            for event in translate_line(&line, &mut state) {
                emit(event);
            }
        }
    };
    let read_stderr = async {
        let mut kept = Vec::new();
        if let Some(stderr) = stderr.as_mut() {
            let mut buffer = vec![0u8; 4096];
            while let Ok(n) = stderr.read(&mut buffer).await {
                if n == 0 {
                    break;
                }
                if kept.len() < STDERR_CAP {
                    kept.extend_from_slice(&buffer[..n.min(STDERR_CAP - kept.len())]);
                }
            }
        }
        String::from_utf8_lossy(&kept).into_owned()
    };
    let ((), stderr_text) = futures_util::join!(read_stdout, read_stderr);
    let exit = child.wait().await;
    inflight.remove(request_id);

    if cancelled.load(Ordering::SeqCst) {
        emit(GardenerEvent::Stop {
            reason: "cancelled".to_string(),
            refusal: None,
        });
        return Ok(());
    }
    if !state.closed {
        let code = exit
            .ok()
            .and_then(|status| status.code())
            .map(|code| format!(" (exit {code})"))
            .unwrap_or_default();
        let message = if stderr_text.trim().is_empty() {
            format!("Claude Code ended without an answer{code}")
        } else {
            failure_message(&stderr_text)
        };
        emit(GardenerEvent::Error {
            status: None,
            message,
        });
    }
    Ok(())
}

// Reading the stream.

/// Splits bytes that arrive in any pieces into lines.
#[derive(Debug, Default)]
pub struct LineReader {
    buffer: Vec<u8>,
}

impl LineReader {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buffer.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(end) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = self.buffer.drain(..=end).collect();
            let line = String::from_utf8_lossy(&line[..end]);
            let line = line.trim_end_matches('\r');
            if !line.trim().is_empty() {
                lines.push(line.to_string());
            }
        }
        lines
    }

    /// The last line, when the stream ended without a newline.
    pub fn finish(&mut self) -> Option<String> {
        let rest = String::from_utf8_lossy(&std::mem::take(&mut self.buffer)).into_owned();
        (!rest.trim().is_empty()).then_some(rest)
    }
}

/// What a process has said so far: the API stream inside its `stream_event`s, the calls that are not cards (the
/// structured answer, WebSearch), the last stop the stream gave, and whether the `result` has closed it.
#[derive(Debug, Default)]
pub struct ClaudeState {
    stream: StreamState,
    structured: HashSet<String>,
    searches: HashSet<String>,
    last_stop: Option<(String, Option<String>)>,
    pub closed: bool,
}

fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn count(value: &Value, key: &str) -> u64 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0)
}

/// A tool result's content as text: a string as it is, a list's text blocks joined.
fn content_text(content: &Value) -> String {
    match content {
        Value::String(text) => text.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(|block| block.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

/// The addresses and titles a WebSearch returned: from the line's `tool_use_result` when it has them, otherwise
/// from the `Links: [...]` list in the result's text.
fn search_results(line: &Value, content: &Value) -> Vec<Value> {
    let pick = |entry: &Value| {
        entry
            .get("url")
            .and_then(Value::as_str)
            .map(|url| json!({ "url": url, "title": text(entry, "title") }))
    };
    if let Some(results) = line
        .get("tool_use_result")
        .and_then(|result| result.get("results"))
        .and_then(Value::as_array)
    {
        return results
            .iter()
            .filter_map(|result| result.get("content").and_then(Value::as_array))
            .flatten()
            .filter_map(pick)
            .collect();
    }
    let body = content_text(content);
    body.find("Links: ")
        .and_then(|at| {
            serde_json::Deserializer::from_str(&body[at + 7..])
                .into_iter::<Value>()
                .next()
                .and_then(|value| value.ok())
        })
        .and_then(|value| value.as_array().cloned())
        .map(|list| list.iter().filter_map(pick).collect())
        .unwrap_or_default()
}

fn limits(info: &Value) -> GardenerEvent {
    let windows = info
        .get("unifiedWindows")
        .and_then(Value::as_object)
        .map(|windows| {
            windows
                .iter()
                .map(|(name, window)| {
                    (
                        name.clone(),
                        Window {
                            utilization: window
                                .get("utilization")
                                .and_then(Value::as_f64)
                                .unwrap_or(0.0),
                            resets_at: window.get("resetsAt").and_then(Value::as_u64),
                        },
                    )
                })
                .collect()
        })
        .unwrap_or_default();
    GardenerEvent::Limits {
        status: text(info, "status"),
        resets_at: info.get("resetsAt").and_then(Value::as_u64),
        rate_limit_type: info
            .get("rateLimitType")
            .and_then(Value::as_str)
            .map(str::to_string),
        windows,
    }
}

fn result(line: &Value, state: &mut ClaudeState) -> Vec<GardenerEvent> {
    state.closed = true;
    let usage = line.get("usage").cloned().unwrap_or_else(|| json!({}));
    let model_searches: u64 = line
        .get("modelUsage")
        .and_then(Value::as_object)
        .map(|models| {
            models
                .values()
                .map(|model| count(model, "webSearchRequests"))
                .sum()
        })
        .unwrap_or(0);
    let searches = model_searches.max(count(&usage["server_tool_use"], "web_search_requests"));
    let structured_output = line
        .get("structured_output")
        .filter(|value| !value.is_null())
        .cloned();
    let is_error = line
        .get("is_error")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let mut events = vec![
        GardenerEvent::Usage {
            input: count(&usage, "input_tokens"),
            output: count(&usage, "output_tokens"),
            cache_read: count(&usage, "cache_read_input_tokens"),
            cache_write: count(&usage, "cache_creation_input_tokens"),
            searches,
        },
        GardenerEvent::Result {
            usage: usage.clone(),
            cost_usd: line.get("total_cost_usd").and_then(Value::as_f64),
            structured_output: structured_output.clone(),
            terminal_reason: line
                .get("terminal_reason")
                .and_then(Value::as_str)
                .map(str::to_string),
            denials: line
                .get("permission_denials")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
            is_error,
        },
    ];
    if is_error {
        let errors = line
            .get("errors")
            .and_then(Value::as_array)
            .map(|errors| {
                errors
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join("; ")
            })
            .filter(|errors| !errors.is_empty());
        let message = errors.unwrap_or_else(|| text(line, "result"));
        events.push(GardenerEvent::Error {
            status: None,
            message: failure_message(&message),
        });
    } else {
        // The structured answer is given through a tool, so the last round's stop reads `tool_use`; the request
        // ended with its answer all the same.
        let (last, refusal) = state.last_stop.take().unwrap_or_default();
        let reason = if structured_output.is_some() {
            "end_turn".to_string()
        } else {
            line.get("stop_reason")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or(if last.is_empty() {
                    "end_turn".to_string()
                } else {
                    last
                })
        };
        let refusal = (reason == "refusal").then_some(refusal).flatten();
        events.push(GardenerEvent::Stop { reason, refusal });
    }
    events
}

fn stream_event(line: &Value, state: &mut ClaudeState) -> Vec<GardenerEvent> {
    // A subagent's stream is not the reply.
    if line
        .get("parent_tool_use_id")
        .is_some_and(|parent| !parent.is_null())
    {
        return Vec::new();
    }
    let event = &line["event"];
    let sse = Sse {
        event: text(event, "type"),
        data: event.to_string(),
    };
    anthropic::translate(&sse, &mut state.stream)
        .into_iter()
        .filter_map(|event| match event {
            // Per-round usage and stops are summed and closed by the `result`.
            GardenerEvent::Usage { .. } => None,
            GardenerEvent::Stop { reason, refusal } => {
                state.last_stop = Some((reason, refusal));
                None
            }
            GardenerEvent::ToolUse { id, name, input } => {
                if name == STRUCTURED {
                    state.structured.insert(id);
                    None
                } else if name == WEB_SEARCH {
                    state.searches.insert(id.clone());
                    Some(GardenerEvent::ServerBlock {
                        block: json!({
                            "type": "server_tool_use",
                            "id": id,
                            "name": "web_search",
                            "input": { "query": input.get("query").cloned().unwrap_or(Value::Null) },
                        }),
                    })
                } else {
                    let name = name.strip_prefix(MCP_PREFIX).unwrap_or(&name).to_string();
                    Some(GardenerEvent::ToolUse { id, name, input })
                }
            }
            event => Some(event),
        })
        .collect()
}

fn user(line: &Value, state: &mut ClaudeState) -> Vec<GardenerEvent> {
    let Some(content) = line["message"]["content"].as_array() else {
        return Vec::new();
    };
    content
        .iter()
        .filter(|block| block.get("type").and_then(Value::as_str) == Some("tool_result"))
        .filter_map(|block| {
            let id = text(block, "tool_use_id");
            let is_error = block
                .get("is_error")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            if state.structured.contains(&id) {
                None
            } else if state.searches.contains(&id) {
                Some(GardenerEvent::ServerBlock {
                    block: json!({
                        "type": "web_search_tool_result",
                        "toolUseId": id,
                        "results": if is_error { Vec::new() } else { search_results(line, &block["content"]) },
                        "error": if is_error { Some("unavailable") } else { None },
                    }),
                })
            } else {
                Some(GardenerEvent::ToolResult {
                    tool_use_id: id,
                    is_error,
                    content: content_text(&block["content"]),
                })
            }
        })
        .collect()
}

/// The Gardener's events for one line of Claude Code's stream-json. A line it does not read yields nothing.
pub fn translate_line(line: &str, state: &mut ClaudeState) -> Vec<GardenerEvent> {
    let Ok(line) = serde_json::from_str::<Value>(line) else {
        return Vec::new();
    };
    match line.get("type").and_then(Value::as_str) {
        Some("system") if line.get("subtype").and_then(Value::as_str) == Some("init") => {
            vec![GardenerEvent::Session {
                session_id: text(&line, "session_id"),
            }]
        }
        Some("stream_event") => stream_event(&line, state),
        Some("user") => user(&line, state),
        Some("rate_limit_event") => vec![limits(&line["rate_limit_info"])],
        Some("result") => result(&line, state),
        _ => Vec::new(),
    }
}

// Sessions.

/// Claude Code's name for a project folder: every character but a letter or digit written `-`. (The probe shows a
/// space and an underscore go the same way as `/` and `.`.)
pub fn slug(path: &Path) -> String {
    path.to_string_lossy()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

/// Removes a thread's session from Claude Code's projects folder: `<projects>/<slug of the work folder>/<id>.jsonl`
/// and the folder of the same name beside it, and nothing when `id` is not a UUID. Answers whether a file went.
pub fn forget_session(projects_dir: &Path, work: &Path, id: &str) -> bool {
    let Ok(parsed) = uuid::Uuid::parse_str(id) else {
        return false;
    };
    if parsed.hyphenated().to_string() != id.to_ascii_lowercase() || !projects_dir.is_absolute() {
        return false;
    }
    let work = std::fs::canonicalize(work).unwrap_or_else(|_| work.to_path_buf());
    let project = projects_dir.join(slug(&work));
    let file = project.join(format!("{id}.jsonl"));
    let removed = std::fs::remove_file(&file).is_ok();
    let _ = std::fs::remove_dir_all(project.join(id));
    removed
}

/// The projects folder Claude Code keeps sessions in, as `auth status` names it.
pub async fn projects_dir(override_path: Option<&str>) -> Option<PathBuf> {
    let binary = find_binary(override_path).await?;
    let auth = auth_status(&binary).await?;
    auth.get("projectsDirectory")
        .and_then(Value::as_str)
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::temp_dir;
    use crate::gardener::SessionSpec;

    fn request() -> GardenerRequest {
        GardenerRequest {
            id: "01ARZ3NDEKTSV4RRFFQ69G5FAV".into(),
            model: "claude-haiku-4-5-20251001".into(),
            max_tokens: 256,
            system: json!([{ "type": "text", "text": "Be brief.", "cache_control": { "type": "ephemeral" } }]),
            messages: vec![
                json!({ "role": "user", "content": "Earlier" }),
                json!({ "role": "user", "content": [{ "type": "text", "text": "Dinner?" }] }),
            ],
            tools: Vec::new(),
            output_format: None,
            effort: None,
            provider: Some("claude-code".into()),
            session: None,
            claude_path: None,
        }
    }

    fn executable(dir: &Path, name: &str, mode: u32) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, "#!/bin/sh\necho 2.1.316 '(Claude Code)'\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode)).unwrap();
        path
    }

    #[tokio::test]
    async fn discovery_order_and_override() {
        let home = Path::new("/home/owner");
        assert_eq!(
            candidates(home, None),
            vec![
                PathBuf::from("/home/owner/.local/bin/claude"),
                PathBuf::from("/opt/homebrew/bin/claude"),
                PathBuf::from("/usr/local/bin/claude"),
            ]
        );
        assert_eq!(candidates(home, Some("  ")), candidates(home, None));
        assert_eq!(
            candidates(home, Some("/opt/claude")),
            vec![PathBuf::from("/opt/claude")]
        );

        let dir = temp_dir("claude-discovery");
        let good = executable(&dir, "claude", 0o755);
        let plain = executable(&dir, "plain", 0o644);
        let good_text = good.to_string_lossy().into_owned();
        assert_eq!(find_binary(Some(&good_text)).await, Some(good.clone()));
        // A wrong override is not found, and the search does not fall through to the usual places.
        assert_eq!(find_binary(Some(&plain.to_string_lossy())).await, None);
        assert_eq!(find_binary(Some("claude")).await, None);
        assert_eq!(
            find_binary(Some(&dir.join("missing").to_string_lossy())).await,
            None
        );
        assert_eq!(find_binary(Some(&dir.to_string_lossy())).await, None);
        let found = status(Some(&plain.to_string_lossy())).await;
        assert!(!found.found);
        let found = status(Some(&good_text)).await;
        assert!(found.found);
        assert_eq!(found.version.as_deref(), Some("2.1.316"));
        assert!(!found.signed_in);
        std::fs::remove_dir_all(&dir).ok();
    }

    fn pair(args: &[String], flag: &str) -> Option<String> {
        args.iter()
            .position(|arg| arg == flag)
            .map(|at| args[at + 1].clone())
    }

    #[test]
    fn spawn_arguments_per_request_kind() {
        let base = [
            "-p",
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--model",
            "claude-haiku-4-5-20251001",
            "--strict-mcp-config",
            "--setting-sources",
            "",
            "--disable-slash-commands",
            "--system-prompt",
            "Be brief.",
            "--permission-mode",
            "default",
        ];

        // A delegated request: no session kept, no tools, no schema or effort unless asked.
        let delegated = args_for(&request(), &SpawnContext::default());
        assert_eq!(&delegated[..base.len()], base);
        assert_eq!(pair(&delegated, "--tools").as_deref(), Some(""));
        assert!(delegated.contains(&"--no-session-persistence".to_string()));
        for flag in [
            "--mcp-config",
            "--allowedTools",
            "--session-id",
            "--resume",
            "--json-schema",
            "--effort",
        ] {
            assert!(!delegated.contains(&flag.to_string()), "{flag}");
        }

        let mut held = request();
        held.output_format = Some(json!({ "type": "object" }));
        held.effort = Some("low".into());
        let held = args_for(&held, &SpawnContext::default());
        assert_eq!(
            pair(&held, "--json-schema").as_deref(),
            Some(r#"{"type":"object"}"#)
        );
        assert_eq!(pair(&held, "--effort").as_deref(), Some("low"));

        let mut research = request();
        research.tools = vec![json!({ "type": "web_search_20250305", "name": "web_search" })];
        let research = args_for(&research, &SpawnContext::default());
        assert_eq!(pair(&research, "--tools").as_deref(), Some("WebSearch"));
        assert_eq!(
            pair(&research, "--allowedTools").as_deref(),
            Some("WebSearch")
        );
        assert!(research.contains(&"--no-session-persistence".to_string()));

        // A conversation: the bridge, its tools, and its session, new or resumed.
        let mut chat = request();
        chat.tools = vec![json!({ "name": "read-rows", "input_schema": { "type": "object" } })];
        chat.session = Some(SessionSpec {
            id: "11111111-2222-4333-8444-555555555555".into(),
            resume: false,
        });
        let ctx = SpawnContext {
            mcp_config: Some(PathBuf::from("/data/gardener/mcp/r.json")),
        };
        let first = args_for(&chat, &ctx);
        assert_eq!(
            pair(&first, "--mcp-config").as_deref(),
            Some("/data/gardener/mcp/r.json")
        );
        assert_eq!(
            pair(&first, "--allowedTools").as_deref(),
            Some("mcp__eden__*")
        );
        assert_eq!(
            pair(&first, "--session-id").as_deref(),
            Some("11111111-2222-4333-8444-555555555555")
        );
        assert_eq!(pair(&first, "--tools").as_deref(), Some(""));
        assert!(!first.contains(&"--no-session-persistence".to_string()));
        chat.session.as_mut().unwrap().resume = true;
        let later = args_for(&chat, &ctx);
        assert_eq!(
            pair(&later, "--resume").as_deref(),
            Some("11111111-2222-4333-8444-555555555555")
        );
        assert!(!later.contains(&"--session-id".to_string()));

        let (removed, set) = env_for();
        assert!(removed.contains(&"ANTHROPIC_API_KEY"));
        assert!(removed.contains(&"CLAUDECODE"));
        assert!(set.contains(&("MCP_TOOL_TIMEOUT", MCP_TOOL_TIMEOUT_MS.to_string())));
        assert!(set.contains(&(
            "CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT",
            MCP_TOOL_TIMEOUT_MS.to_string()
        )));
        assert_eq!(
            work_dir(Path::new("/data")),
            PathBuf::from("/data/gardener/work")
        );
        let line: Value = serde_json::from_slice(&user_line(&request())).unwrap();
        assert_eq!(
            line,
            json!({ "type": "user", "message": { "role": "user", "content": [{ "type": "text", "text": "Dinner?" }] } })
        );
    }

    const FIXTURES: [(&str, &[u8]); 6] = [
        ("text", include_bytes!("fixtures/claude-code/text.jsonl")),
        (
            "mcp-tool",
            include_bytes!("fixtures/claude-code/mcp-tool.jsonl"),
        ),
        (
            "structured",
            include_bytes!("fixtures/claude-code/structured.jsonl"),
        ),
        (
            "rate-limit",
            include_bytes!("fixtures/claude-code/rate-limit.jsonl"),
        ),
        (
            "web-search",
            include_bytes!("fixtures/claude-code/web-search.jsonl"),
        ),
        (
            "no-session",
            include_bytes!("fixtures/claude-code/no-session.jsonl"),
        ),
    ];

    fn events_of(bytes: &[u8], piece: usize) -> Vec<GardenerEvent> {
        let mut reader = LineReader::default();
        let mut state = ClaudeState::default();
        let mut events = Vec::new();
        for chunk in bytes.chunks(piece) {
            for line in reader.push(chunk) {
                events.extend(translate_line(&line, &mut state));
            }
        }
        if let Some(line) = reader.finish() {
            events.extend(translate_line(&line, &mut state));
        }
        events
    }

    /// The events as a list of their kinds, with the detail a test reads.
    fn shape(events: &[GardenerEvent]) -> Vec<String> {
        events
            .iter()
            .map(|event| match event {
                GardenerEvent::Session { .. } => "session".into(),
                GardenerEvent::Start { .. } => "start".into(),
                GardenerEvent::TextDelta { .. } => "text".into(),
                GardenerEvent::Thinking { .. } => "thinking".into(),
                GardenerEvent::ToolUse { name, .. } => format!("tool_use {name}"),
                GardenerEvent::ToolResult { .. } => "tool_result".into(),
                GardenerEvent::ServerBlock { block } => {
                    format!("server_block {}", block["type"].as_str().unwrap())
                }
                GardenerEvent::Limits { .. } => "limits".into(),
                GardenerEvent::Usage { .. } => "usage".into(),
                GardenerEvent::Result { .. } => "result".into(),
                GardenerEvent::Stop { reason, .. } => format!("stop {reason}"),
                GardenerEvent::Error { .. } => "error".into(),
                GardenerEvent::ToolCall { .. } => "tool_call".into(),
            })
            .fold(Vec::<String>::new(), |mut list, kind| {
                // a run of text deltas reads as one
                if !(kind == "text" && list.last().is_some_and(|last| last == "text")) {
                    list.push(kind);
                }
                list
            })
    }

    #[test]
    fn fixtures_translate_whole_and_by_line() {
        for (name, bytes) in FIXTURES {
            let whole = events_of(bytes, bytes.len().max(1));
            assert_eq!(whole, events_of(bytes, 1), "{name} byte by byte");
            assert_eq!(whole, events_of(bytes, 97), "{name} in pieces");
        }
        let of = |name: &str| {
            let bytes = FIXTURES.iter().find(|(n, _)| *n == name).unwrap().1;
            events_of(bytes, bytes.len())
        };

        let text = of("text");
        assert_eq!(
            shape(&text),
            [
                "session",
                "start",
                "thinking",
                "text",
                "limits",
                "usage",
                "result",
                "stop end_turn"
            ]
        );
        let reply: String = text
            .iter()
            .filter_map(|event| match event {
                GardenerEvent::TextDelta { text } => Some(text.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(reply, "Hello, nice day!");
        assert!(text.contains(&GardenerEvent::Usage {
            input: 503,
            output: 101,
            cache_read: 0,
            cache_write: 0,
            searches: 0
        }));
        assert!(matches!(
            text.iter().find(|event| matches!(event, GardenerEvent::Result { .. })),
            Some(GardenerEvent::Result { cost_usd: Some(cost), is_error: false, .. }) if (*cost - 0.001008).abs() < 1e-9
        ));

        let tool = of("mcp-tool");
        assert_eq!(
            shape(&tool),
            [
                "session",
                "start",
                "thinking",
                "tool_use read-rows",
                "tool_result",
                "limits",
                "start",
                "thinking",
                "text",
                "usage",
                "result",
                "stop end_turn"
            ]
        );
        assert!(tool.iter().any(|event| matches!(event,
            GardenerEvent::ToolUse { id, input, .. } if id == "toolu_1" && input == &json!({ "kind": "grocery-item" }))));
        assert!(tool.iter().any(|event| matches!(event,
            GardenerEvent::ToolResult { tool_use_id, is_error: false, content } if tool_use_id == "toolu_1" && content.contains("Milk"))));

        let structured = of("structured");
        assert_eq!(
            shape(&structured),
            [
                "session",
                "start",
                "thinking",
                "limits",
                "usage",
                "result",
                "stop end_turn"
            ]
        );
        assert!(structured.iter().any(|event| matches!(event,
            GardenerEvent::Result { structured_output: Some(answer), .. } if answer == &json!({ "fruits": ["apple", "banana"] }))));

        let rate = of("rate-limit");
        assert_eq!(
            rate,
            [GardenerEvent::Limits {
                status: "allowed".into(),
                resets_at: Some(1793836800),
                rate_limit_type: Some("seven_day".into()),
                windows: [(
                    "seven_day".to_string(),
                    Window {
                        utilization: 0.29,
                        resets_at: Some(1793836800)
                    }
                )]
                .into(),
            }]
        );

        let search = of("web-search");
        assert_eq!(
            shape(&search),
            [
                "session",
                "start",
                "thinking",
                "server_block server_tool_use",
                "limits",
                "server_block web_search_tool_result",
                "start",
                "thinking",
                "text",
                "usage",
                "result",
                "stop end_turn"
            ]
        );
        let blocks: Vec<&Value> = search
            .iter()
            .filter_map(|event| match event {
                GardenerEvent::ServerBlock { block } => Some(block),
                _ => None,
            })
            .collect();
        assert_eq!(blocks[0]["name"], "web_search");
        assert_eq!(
            blocks[0]["input"],
            json!({ "query": "Tokyo Skytree height" })
        );
        assert_eq!(blocks[1]["toolUseId"], blocks[0]["id"]);
        assert_eq!(blocks[1]["error"], Value::Null);
        assert_eq!(
            blocks[1]["results"][0],
            json!({ "url": "https://en.wikipedia.org/wiki/Tokyo_Skytree", "title": "Tokyo Skytree" })
        );
        assert!(search
            .iter()
            .any(|event| matches!(event, GardenerEvent::Usage { searches, .. } if *searches == 1)));

        let gone = of("no-session");
        assert_eq!(shape(&gone), ["usage", "result", "error"]);
        assert!(
            matches!(gone.last(), Some(GardenerEvent::Error { status: None, message }) if message.starts_with("gardener:no-session: "))
        );
    }

    /// A fixture-content invariant: what was recorded from a real account carries none of it.
    #[test]
    fn fixtures_hold_nothing_personal() {
        let email = |text: &str| {
            text.char_indices().any(|(at, c)| {
                c == '@'
                    && text[..at]
                        .chars()
                        .next_back()
                        .is_some_and(|c| c.is_ascii_alphanumeric())
                    && text[at + 1..]
                        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '.' || c == '-'))
                        .next()
                        .is_some_and(|host| host.contains('.'))
            })
        };
        let mut all: Vec<(&str, &[u8])> = FIXTURES.to_vec();
        all.push((
            "no-session.stderr",
            include_bytes!("fixtures/claude-code/no-session.stderr"),
        ));
        for (name, bytes) in all {
            let text = String::from_utf8_lossy(bytes);
            assert!(!email(&text), "{name} holds an email address");
            assert!(!text.contains("/Users/"), "{name} holds a home path");
            assert!(!text.contains("/private/"), "{name} holds a scratch path");
            assert!(
                !text.contains("scratchpad"),
                "{name} holds a scratchpad path"
            );
            for line in text.lines() {
                let Ok(value) = serde_json::from_str::<Value>(line) else {
                    continue;
                };
                let flat = value.to_string();
                assert!(!flat.contains("\"orgId\":\""), "{name} holds an org id");
                assert!(!flat.contains("\"email\":\""), "{name} holds an email");
            }
        }
    }

    #[test]
    fn errors_lose_the_home_and_data_paths() {
        assert_eq!(
            scrub_paths(
                "cannot open /Users/o/Library/Eden/gardener/work/x and /Users/o/.claude",
                Path::new("/Users/o"),
                Path::new("/Users/o/Library/Eden")
            ),
            "cannot open /gardener/work/x and ~/.claude"
        );
        assert_eq!(
            failure_message("No conversation found with session ID: abc"),
            "gardener:no-session: No conversation found with session ID: abc"
        );
    }

    #[test]
    fn a_session_is_forgotten_only_by_its_uuid() {
        let dir = temp_dir("claude-forget");
        let work = dir.join("data dir").join("gardener").join("work");
        std::fs::create_dir_all(&work).unwrap();
        let projects = dir.join("projects");
        let work_real = std::fs::canonicalize(&work).unwrap();
        let project = projects.join(slug(&work_real));
        std::fs::create_dir_all(&project).unwrap();
        let id = "11111111-2222-4333-8444-555555555555";
        std::fs::write(project.join(format!("{id}.jsonl")), "{}").unwrap();
        std::fs::write(project.join("keep.jsonl"), "{}").unwrap();
        assert!(!forget_session(&projects, &work, "../keep"));
        assert!(!forget_session(&projects, &work, "keep"));
        assert!(forget_session(&projects, &work, id));
        assert!(!project.join(format!("{id}.jsonl")).exists());
        assert!(project.join("keep.jsonl").exists());
        assert!(!forget_session(&projects, &work, id));
        assert_eq!(slug(Path::new("/tmp/a b.c_d")), "-tmp-a-b-c-d");
        std::fs::remove_dir_all(&dir).ok();
    }

    fn alive(pid: &str) -> bool {
        std::process::Command::new("/bin/kill")
            .args(["-0", pid])
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[tokio::test]
    async fn cancel_kills_the_group() {
        let dir = temp_dir("claude-cancel");
        let config = dir.join("r1.json");
        std::fs::write(&config, "{}").unwrap();
        let pids = dir.join("pids");
        // A stand-in for claude: it forks a sleeper, writes both pids, and sleeps.
        let script = format!(
            "sleep 60 & echo $! > '{p}.tmp'; echo $$ >> '{p}.tmp'; mv '{p}.tmp' '{p}'; sleep 60",
            p = pids.display()
        );
        let prepared = Prepared {
            program: PathBuf::from("/bin/sh"),
            args: vec!["-c".into(), script, config.to_string_lossy().into_owned()],
            cwd: dir.clone(),
            stdin: b"{}\n".to_vec(),
            mcp_config: Some(config.clone()),
        };
        let inflight = Inflight::default();
        let events = std::sync::Mutex::new(Vec::new());
        let on_event = |event: GardenerEvent| events.lock().unwrap().push(event);
        let cancel = async {
            for _ in 0..100 {
                if pids.exists() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            assert!(inflight.cancel("r1"));
        };
        let (ran, ()) = tokio::join!(run("r1", prepared, &dir, &inflight, &on_event), cancel);
        ran.unwrap();
        let events = events.into_inner().unwrap();
        assert_eq!(
            events.last(),
            Some(&GardenerEvent::Stop {
                reason: "cancelled".into(),
                refusal: None
            })
        );
        let list = std::fs::read_to_string(&pids).unwrap();
        let list: Vec<&str> = list.split_whitespace().collect();
        assert_eq!(list.len(), 2);
        for _ in 0..60 {
            if list.iter().all(|pid| !alive(pid)) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        for pid in &list {
            assert!(!alive(pid), "{pid} is still running");
        }
        assert!(!config.exists());
        assert!(!inflight.cancel("r1"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
