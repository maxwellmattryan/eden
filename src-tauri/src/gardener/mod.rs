//! The Gardener's runtime on this side of the IPC boundary (docs/product/substrate/ai.md; docs/engineering/gardener.md;
//! D-76): the one call to a model provider, made here so the key never reaches the webview and every byte out is
//! counted. The frontend builds the request (the system prompt, the messages, the tools; docs/product/substrate/ai.md,
//! "The context pack") and receives the stream as events; this module holds the shapes they cross in, the adapter
//! for the one provider of v0, and the requests in flight so one can be cancelled.

pub mod anthropic;
#[cfg(feature = "desktop")]
pub mod claude_code;
#[cfg(feature = "desktop")]
pub mod mcp;

use std::collections::{BTreeMap, HashMap};
#[cfg(feature = "desktop")]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(feature = "desktop")]
use std::sync::Arc;
use std::sync::Mutex;

use futures_util::future::AbortHandle;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The name of the secret that holds the provider key.
pub const KEY_SECRET: &str = "anthropic-api-key";

/// The provider ids a request may name (D-178).
pub const ANTHROPIC: &str = "anthropic";
pub const CLAUDE_CODE: &str = "claude-code";

/// The Claude Code session a conversation's request runs in (D-178): a new one under `id`, or `id` resumed.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(feature = "desktop"), allow(dead_code))]
pub struct SessionSpec {
    pub id: String,
    #[serde(default)]
    pub resume: bool,
}

/// What this device knows of its Claude Code (D-178): the binary, its version, and whether it is signed in, with
/// the method and the subscription's kind. Never the account's email or organisation.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeStatus {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub signed_in: bool,
    pub auth_method: Option<String>,
    pub subscription: Option<String>,
}

/// One usage window of the subscription as the last reading gave it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(feature = "desktop"), allow(dead_code))]
pub struct Window {
    pub utilization: f64,
    pub resets_at: Option<u64>,
}

/// One request as the frontend sends it. `system`, `messages` and `tools` are passed to the provider verbatim.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(feature = "desktop"), allow(dead_code))]
pub struct GardenerRequest {
    /// The audit entry's id, a ULID the frontend makes; the key a cancel names.
    pub id: String,
    pub model: String,
    pub max_tokens: u32,
    /// A string, or the API's list of text blocks (with `cache_control`).
    pub system: Value,
    pub messages: Vec<Value>,
    #[serde(default)]
    pub tools: Vec<Value>,
    /// A JSON schema the reply is held to: the API's structured output, for a request whose answer a handler parses.
    #[serde(default)]
    pub output_format: Option<Value>,
    /// The effort the model is asked to work at, as the provider names the level (D-146); a model with no such dial
    /// is sent none.
    #[serde(default)]
    pub effort: Option<String>,
    /// `anthropic` (the default) or `claude-code` (D-178).
    #[serde(default)]
    pub provider: Option<String>,
    /// A conversation's session under `claude-code`; none for a delegated or research request.
    #[serde(default)]
    pub session: Option<SessionSpec>,
    /// The owner's override of where the `claude` binary is, kept on this device only.
    #[serde(default)]
    pub claude_path: Option<String>,
}

impl GardenerRequest {
    pub fn provider(&self) -> &str {
        self.provider.as_deref().unwrap_or(ANTHROPIC)
    }
}

/// What the stream is made of, as the frontend receives it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(not(feature = "desktop"), allow(dead_code))]
pub enum GardenerEvent {
    #[serde(rename_all = "camelCase")]
    Start { message_id: String, model: String },
    #[serde(rename_all = "camelCase")]
    TextDelta { text: String },
    #[serde(rename_all = "camelCase")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    /// One whole reasoning block (`thinking` or `redacted_thinking`) as the provider sent it, signature and all: the
    /// frontend sends it back unchanged while the request continues through its tool rounds.
    #[serde(rename_all = "camelCase")]
    Thinking { block: Value },
    /// One block of a tool the provider ran on its own side (D-132), handed over when it closes: the call with its
    /// input, or its result as the addresses and titles it returned, or its error code.
    #[serde(rename_all = "camelCase")]
    ServerBlock { block: Value },
    /// Sent once at the start with the input side, and once at the end with the output side and the searches the
    /// provider made, each of which has a price of its own.
    #[serde(rename_all = "camelCase")]
    Usage {
        input: u64,
        output: u64,
        cache_read: u64,
        cache_write: u64,
        searches: u64,
    },
    /// Why the stream ended: the provider's stop reason, or `cancelled`.
    #[serde(rename_all = "camelCase")]
    Stop {
        reason: String,
        refusal: Option<String>,
    },
    /// The provider said no, or the stream broke. The message never carries the key.
    #[serde(rename_all = "camelCase")]
    Error {
        status: Option<u16>,
        message: String,
    },
    /// The Claude Code session the process runs in, from its `system/init` line (D-178).
    #[serde(rename_all = "camelCase")]
    Session { session_id: String },
    /// The subscription's usage windows as the process last read them (D-180).
    #[serde(rename_all = "camelCase")]
    Limits {
        status: String,
        resets_at: Option<u64>,
        rate_limit_type: Option<String>,
        windows: BTreeMap<String, Window>,
    },
    /// The close of a Claude Code process's turn: the usage summed over every round, the cost at list price, the
    /// answer a schema held it to, why it ended and what was refused.
    #[serde(rename_all = "camelCase")]
    Result {
        usage: Value,
        cost_usd: Option<f64>,
        structured_output: Option<Value>,
        terminal_reason: Option<String>,
        denials: Vec<Value>,
        is_error: bool,
    },
    /// A tool result Claude Code fed back to the model, so a card can settle even if its call skipped the bridge.
    #[serde(rename_all = "camelCase")]
    ToolResult {
        tool_use_id: String,
        is_error: bool,
        content: String,
    },
    /// A call of an Eden tool that reached the MCP bridge (D-179); the webview runs it and answers through
    /// `gardener_tool_answer`.
    #[serde(rename_all = "camelCase")]
    ToolCall {
        call_id: String,
        request_id: String,
        name: String,
        input: Value,
        tool_use_id: Option<String>,
    },
}

/// How a request in flight is stopped: an HTTP stream is aborted, a Claude Code process has its group killed.
#[derive(Clone)]
pub enum Kill {
    Abort(AbortHandle),
    /// The process group's id, and the flag the reader checks to end the stream as cancelled.
    #[cfg(feature = "desktop")]
    Group {
        pgid: u32,
        cancelled: Arc<AtomicBool>,
    },
}

/// The requests in flight, by request id, so a cancel can stop one. Managed by the app at setup.
#[derive(Default)]
pub struct Inflight(pub Mutex<HashMap<String, Kill>>);

impl Inflight {
    pub fn insert(&self, id: &str, handle: AbortHandle) {
        self.insert_kill(id, Kill::Abort(handle));
    }

    pub fn insert_kill(&self, id: &str, kill: Kill) {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id.to_string(), kill);
    }

    pub fn remove(&self, id: &str) -> Option<Kill> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).remove(id)
    }

    /// Stops the request. Answers whether it was in flight.
    pub fn cancel(&self, id: &str) -> bool {
        match self.remove(id) {
            Some(Kill::Abort(handle)) => {
                handle.abort();
                true
            }
            #[cfg(feature = "desktop")]
            Some(Kill::Group { pgid, cancelled }) => {
                cancelled.store(true, Ordering::SeqCst);
                kill_group(pgid);
                true
            }
            None => false,
        }
    }
}

/// Ends a process group: TERM now, KILL after two seconds for whatever is left. Through the system `kill`, so the
/// crate needs no `libc`.
#[cfg(feature = "desktop")]
pub fn kill_group(pgid: u32) {
    let group = format!("-{pgid}");
    let signal = |name: &str| {
        let _ = std::process::Command::new("/bin/kill")
            .args([name, "--", &group])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    };
    signal("-TERM");
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let _ = std::process::Command::new("/bin/kill")
            .args(["-KILL", "--", &group])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_cross_as_tagged_camel_case() {
        let event = GardenerEvent::Usage {
            input: 1,
            output: 2,
            cache_read: 3,
            cache_write: 4,
            searches: 5,
        };
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            serde_json::json!({ "type": "usage", "input": 1, "output": 2, "cacheRead": 3, "cacheWrite": 4, "searches": 5 })
        );
        let event = GardenerEvent::ServerBlock {
            block: serde_json::json!({ "type": "server_tool_use" }),
        };
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            serde_json::json!({ "type": "server_block", "block": { "type": "server_tool_use" } })
        );
        let event = GardenerEvent::Start {
            message_id: "msg_1".into(),
            model: "m".into(),
        };
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            serde_json::json!({ "type": "start", "messageId": "msg_1", "model": "m" })
        );
        let request: GardenerRequest = serde_json::from_value(serde_json::json!({
            "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV", "model": "m", "maxTokens": 10,
            "system": "Be brief.", "messages": []
        }))
        .unwrap();
        assert_eq!(request.max_tokens, 10);
        assert!(request.tools.is_empty());
        assert_eq!(request.provider(), ANTHROPIC);
        assert_eq!(request.session, None);

        let request: GardenerRequest = serde_json::from_value(serde_json::json!({
            "id": "r", "model": "m", "maxTokens": 10, "system": "s", "messages": [],
            "provider": "claude-code", "session": { "id": "abc", "resume": true }, "claudePath": "/bin/claude"
        }))
        .unwrap();
        assert_eq!(request.provider(), CLAUDE_CODE);
        assert_eq!(
            request.session,
            Some(SessionSpec {
                id: "abc".into(),
                resume: true
            })
        );
        assert_eq!(request.claude_path.as_deref(), Some("/bin/claude"));

        let event = GardenerEvent::Limits {
            status: "allowed".into(),
            resets_at: Some(10),
            rate_limit_type: Some("five_hour".into()),
            windows: BTreeMap::from([(
                "five_hour".to_string(),
                Window {
                    utilization: 0.5,
                    resets_at: Some(10),
                },
            )]),
        };
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            serde_json::json!({ "type": "limits", "status": "allowed", "resetsAt": 10, "rateLimitType": "five_hour",
                "windows": { "five_hour": { "utilization": 0.5, "resetsAt": 10 } } })
        );
        let event = GardenerEvent::ToolCall {
            call_id: "c".into(),
            request_id: "r".into(),
            name: "read-rows".into(),
            input: serde_json::json!({}),
            tool_use_id: None,
        };
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            serde_json::json!({ "type": "tool_call", "callId": "c", "requestId": "r", "name": "read-rows",
                "input": {}, "toolUseId": null })
        );
        let event = GardenerEvent::Result {
            usage: serde_json::json!({}),
            cost_usd: Some(0.5),
            structured_output: None,
            terminal_reason: None,
            denials: vec![],
            is_error: false,
        };
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            serde_json::json!({ "type": "result", "usage": {}, "costUsd": 0.5, "structuredOutput": null,
                "terminalReason": null, "denials": [], "isError": false })
        );
        let event = GardenerEvent::Session {
            session_id: "s".into(),
        };
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            serde_json::json!({ "type": "session", "sessionId": "s" })
        );
    }

    #[test]
    fn a_cancel_answers_whether_the_request_was_in_flight() {
        let inflight = Inflight::default();
        let (handle, _registration) = AbortHandle::new_pair();
        inflight.insert("r1", handle.clone());
        assert!(!handle.is_aborted());
        assert!(inflight.cancel("r1"));
        assert!(handle.is_aborted());
        assert!(!inflight.cancel("r1"));
    }
}
