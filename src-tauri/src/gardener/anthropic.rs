//! The Anthropic adapter (docs/engineering/gardener.md, "The provider call"; D-76): one streaming Messages request
//! and the translation of its server-sent events into the Gardener's own. The request crosses as the frontend built
//! it, with the API's names; nothing is added but `stream`, and `output_config` around a schema the reply is held to,
//! and neither `thinking` nor `tool_choice` is ever sent.
//!
//! The key is a header and nothing else: no message this module produces, whether from the provider, from a broken
//! stream or from a failure to connect, carries it. A request that never reached the provider is refused
//! (`gardener:network`); anything after the first byte arrives as an `Error` event so the audit entry is written
//! either way.

use std::collections::BTreeMap;
use std::time::Duration;

use futures_util::StreamExt;
use serde_json::{json, Value};

use super::{GardenerEvent, GardenerRequest};
use crate::error::{EdenError, Result};

/// The destination in the egress ledger.
pub const DESTINATION: &str = "anthropic";
pub const URL: &str = "https://api.anthropic.com/v1/messages";
const VERSION: &str = "2023-06-01";
/// A deep request streams for a while; the provider ends it long before this.
const TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// The body as the API expects it.
pub fn body(request: &GardenerRequest) -> Value {
    let mut body = json!({
        "model": request.model,
        "max_tokens": request.max_tokens,
        "system": request.system,
        "messages": request.messages,
        "stream": true,
    });
    if !request.tools.is_empty() {
        body["tools"] = Value::Array(request.tools.clone());
    }
    if let Some(schema) = &request.output_format {
        body["output_config"] = json!({ "format": { "type": "json_schema", "schema": schema } });
    }
    body
}

/// How many bytes the body is on the wire, for the ledger.
pub fn body_len(request: &GardenerRequest) -> usize {
    serde_json::to_vec(&body(request))
        .map(|bytes| bytes.len())
        .unwrap_or(0)
}

/// Sends the request and hands each event to `on_event` as it arrives. Answers once the stream has ended, however
/// it ended; only a request that never reached the provider is an error.
pub async fn send(
    key: &str,
    request: &GardenerRequest,
    on_event: &(dyn Fn(GardenerEvent) + Send + Sync),
) -> Result<()> {
    send_to(URL, key, request, on_event).await
}

async fn send_to(
    url: &str,
    key: &str,
    request: &GardenerRequest,
    on_event: &(dyn Fn(GardenerEvent) + Send + Sync),
) -> Result<()> {
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| network_error(&e))?;
    let response = client
        .post(url)
        .header("x-api-key", key)
        .header("anthropic-version", VERSION)
        .header("content-type", "application/json")
        .header("accept", "text/event-stream")
        .json(&body(request))
        .send()
        .await
        .map_err(|e| network_error(&e))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        on_event(GardenerEvent::Error {
            status: Some(status.as_u16()),
            message: error_message(&text, status.as_u16()),
        });
        return Ok(());
    }

    let mut stream = response.bytes_stream();
    let mut parser = SseParser::default();
    let mut state = StreamState::default();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                for sse in parser.push(&bytes) {
                    for event in translate(&sse, &mut state) {
                        on_event(event);
                    }
                }
            }
            Err(e) => {
                on_event(GardenerEvent::Error {
                    status: None,
                    message: format!("the stream broke: {}", e.without_url()),
                });
                return Ok(());
            }
        }
    }
    Ok(())
}

/// A failure before the provider answered. `without_url` drops the URL, which is the only place a query could
/// carry anything; the key is a header and never part of an error.
fn network_error(e: &reqwest::Error) -> EdenError {
    let e = if e.is_timeout() {
        "timed out".to_string()
    } else {
        e.to_string()
    };
    EdenError::Refused(format!("gardener:network: {e}"))
}

/// The message of a non-2xx answer: the API's `{"error":{"type","message"}}` when the body is one, the status
/// otherwise.
fn error_message(text: &str, status: u16) -> String {
    let parsed: Option<Value> = serde_json::from_str(text).ok();
    let error = parsed.as_ref().and_then(|value| value.get("error"));
    match error
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
    {
        Some(message) => match error
            .and_then(|error| error.get("type"))
            .and_then(Value::as_str)
        {
            Some(kind) => format!("{kind}: {message}"),
            None => message.to_string(),
        },
        None => format!("HTTP {status}"),
    }
}

// Server-sent events.

/// One event of the stream: its name and its data, the lines of the data joined by newlines.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sse {
    pub event: String,
    pub data: String,
}

/// A parser of the SSE wire format that takes bytes in any pieces: a line may arrive split at any byte, and an
/// event ends at a blank line. Comments (lines that start with `:`) and fields other than `event` and `data` are
/// skipped, as the format says.
#[derive(Debug, Default)]
pub struct SseParser {
    buffer: Vec<u8>,
    event: String,
    data: Vec<String>,
}

impl SseParser {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<Sse> {
        self.buffer.extend_from_slice(chunk);
        let mut events = Vec::new();
        while let Some(end) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = self.buffer.drain(..=end).collect();
            let line = &line[..end];
            let line = line.strip_suffix(b"\r").unwrap_or(line);
            let line = String::from_utf8_lossy(line);
            if line.is_empty() {
                if let Some(event) = self.dispatch() {
                    events.push(event);
                }
                continue;
            }
            if line.starts_with(':') {
                continue;
            }
            let (field, value) = match line.split_once(':') {
                Some((field, value)) => (field, value.strip_prefix(' ').unwrap_or(value)),
                None => (line.as_ref(), ""),
            };
            match field {
                "event" => self.event = value.to_string(),
                "data" => self.data.push(value.to_string()),
                _ => {}
            }
        }
        events
    }

    fn dispatch(&mut self) -> Option<Sse> {
        if self.event.is_empty() && self.data.is_empty() {
            return None;
        }
        let event = Sse {
            event: std::mem::take(&mut self.event),
            data: std::mem::take(&mut self.data).join("\n"),
        };
        Some(event)
    }
}

// The stream's meaning.

#[derive(Debug)]
enum Block {
    Text,
    Tool {
        id: String,
        name: String,
        json: String,
    },
    /// The model's reasoning: its text (empty when the provider omits it) and the signature that lets it be sent back.
    Thinking {
        thinking: String,
        signature: String,
    },
    /// Reasoning the provider encrypted; it goes back as it came.
    Redacted(Value),
    /// A block kind this build does not read (whatever comes next).
    Other,
}

/// What a stream has said so far: the open content blocks by index, and the input side of the usage, which the
/// start carries and the end repeats.
#[derive(Debug, Default)]
pub struct StreamState {
    blocks: BTreeMap<u64, Block>,
    input: u64,
    cache_read: u64,
    cache_write: u64,
}

fn count(value: &Value, key: &str) -> u64 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// The Gardener's events for one server-sent event. An event the build does not know yields nothing.
pub fn translate(sse: &Sse, state: &mut StreamState) -> Vec<GardenerEvent> {
    let data: Value = match serde_json::from_str(&sse.data) {
        Ok(data) => data,
        Err(e) => {
            return vec![GardenerEvent::Error {
                status: None,
                message: format!("an event that is not JSON ({}): {e}", sse.event),
            }]
        }
    };
    let kind = data
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or(&sse.event);
    match kind {
        "message_start" => {
            let message = &data["message"];
            let usage = &message["usage"];
            state.input = count(usage, "input_tokens");
            state.cache_read = count(usage, "cache_read_input_tokens");
            state.cache_write = count(usage, "cache_creation_input_tokens");
            vec![
                GardenerEvent::Start {
                    message_id: text(message, "id"),
                    model: text(message, "model"),
                },
                GardenerEvent::Usage {
                    input: state.input,
                    output: 0,
                    cache_read: state.cache_read,
                    cache_write: state.cache_write,
                },
            ]
        }
        "content_block_start" => {
            let index = count(&data, "index");
            let block = &data["content_block"];
            let opened = match block.get("type").and_then(Value::as_str) {
                Some("text") => Block::Text,
                Some("tool_use") => Block::Tool {
                    id: text(block, "id"),
                    name: text(block, "name"),
                    json: String::new(),
                },
                Some("thinking") => Block::Thinking {
                    thinking: text(block, "thinking"),
                    signature: text(block, "signature"),
                },
                Some("redacted_thinking") => Block::Redacted(block.clone()),
                _ => Block::Other,
            };
            state.blocks.insert(index, opened);
            Vec::new()
        }
        "content_block_delta" => {
            let index = count(&data, "index");
            let delta = &data["delta"];
            match delta.get("type").and_then(Value::as_str) {
                Some("text_delta") => vec![GardenerEvent::TextDelta {
                    text: text(delta, "text"),
                }],
                Some("input_json_delta") => {
                    if let Some(Block::Tool { json, .. }) = state.blocks.get_mut(&index) {
                        json.push_str(delta["partial_json"].as_str().unwrap_or_default());
                    }
                    Vec::new()
                }
                Some("thinking_delta") => {
                    if let Some(Block::Thinking { thinking, .. }) = state.blocks.get_mut(&index) {
                        thinking.push_str(delta["thinking"].as_str().unwrap_or_default());
                    }
                    Vec::new()
                }
                Some("signature_delta") => {
                    if let Some(Block::Thinking { signature, .. }) = state.blocks.get_mut(&index) {
                        signature.push_str(delta["signature"].as_str().unwrap_or_default());
                    }
                    Vec::new()
                }
                _ => Vec::new(),
            }
        }
        "content_block_stop" => {
            let index = count(&data, "index");
            match state.blocks.remove(&index) {
                Some(Block::Tool { id, name, json }) => {
                    let json = if json.trim().is_empty() { "{}" } else { &json };
                    match serde_json::from_str::<Value>(json) {
                        Ok(input) => vec![GardenerEvent::ToolUse { id, name, input }],
                        Err(e) => vec![GardenerEvent::Error {
                            status: None,
                            message: format!("the input of the tool {name} is not JSON: {e}"),
                        }],
                    }
                }
                Some(Block::Thinking {
                    thinking,
                    signature,
                }) => vec![GardenerEvent::Thinking {
                    block: json!({ "type": "thinking", "thinking": thinking, "signature": signature }),
                }],
                Some(Block::Redacted(block)) => vec![GardenerEvent::Thinking { block }],
                _ => Vec::new(),
            }
        }
        "message_delta" => {
            let delta = &data["delta"];
            let reason = text(delta, "stop_reason");
            let refusal = (reason == "refusal")
                .then(|| {
                    [delta.get("stop_details"), data.get("stop_details")]
                        .into_iter()
                        .flatten()
                        .find_map(|details| details.get("category").and_then(Value::as_str))
                        .map(str::to_string)
                })
                .flatten();
            vec![
                GardenerEvent::Usage {
                    input: state.input,
                    output: count(&data["usage"], "output_tokens"),
                    cache_read: state.cache_read,
                    cache_write: state.cache_write,
                },
                GardenerEvent::Stop { reason, refusal },
            ]
        }
        "error" => vec![GardenerEvent::Error {
            status: None,
            message: error_message(&sse.data, 0),
        }],
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STREAM: &[u8] = include_bytes!("fixtures/stream.sse");
    const KEY: &str = "sk-ant-api03-never-in-a-message";

    fn events_of(chunks: impl Iterator<Item = Vec<u8>>) -> Vec<GardenerEvent> {
        let mut parser = SseParser::default();
        let mut state = StreamState::default();
        let mut events = Vec::new();
        for chunk in chunks {
            for sse in parser.push(&chunk) {
                events.extend(translate(&sse, &mut state));
            }
        }
        events
    }

    fn request() -> GardenerRequest {
        GardenerRequest {
            id: "01ARZ3NDEKTSV4RRFFQ69G5FAV".into(),
            model: "claude-haiku-4-5-20251001".into(),
            max_tokens: 256,
            system: json!("Be brief."),
            messages: vec![json!({ "role": "user", "content": "Dinner?" })],
            tools: Vec::new(),
            output_format: None,
        }
    }

    #[test]
    fn sse_parser_splits_chunks_at_any_byte() {
        let whole = events_of(std::iter::once(STREAM.to_vec()));
        let by_byte = events_of(STREAM.iter().map(|byte| vec![*byte]));
        assert_eq!(whole, by_byte);
        let by_seven = events_of(STREAM.chunks(7).map(<[u8]>::to_vec));
        assert_eq!(whole, by_seven);

        assert_eq!(
            whole,
            vec![
                GardenerEvent::Start {
                    message_id: "msg_01XFDUDYJgAACzvnptvVoYEL".into(),
                    model: "claude-haiku-4-5-20251001".into(),
                },
                GardenerEvent::Usage {
                    input: 1234,
                    output: 0,
                    cache_read: 1000,
                    cache_write: 200,
                },
                GardenerEvent::TextDelta {
                    text: "Dal tonight: ".into()
                },
                GardenerEvent::TextDelta {
                    text: "you have the lentils.".into()
                },
                GardenerEvent::ToolUse {
                    id: "toolu_01T1x1fJ34qAmk2tNTrN7Up6".into(),
                    name: "kitchen_plan".into(),
                    input: json!({ "recipe": "Dal", "serves": 2 }),
                },
                GardenerEvent::Usage {
                    input: 1234,
                    output: 57,
                    cache_read: 1000,
                    cache_write: 200,
                },
                GardenerEvent::Stop {
                    reason: "tool_use".into(),
                    refusal: None,
                },
            ]
        );

        // Windows line ends, a comment, a multi-line data field and a field the format allows are all read.
        let mut parser = SseParser::default();
        let events = parser.push(
            b": keep-alive\r\nevent: ping\r\nid: 7\r\ndata: {\"type\":\r\ndata: \"ping\"}\r\n\r\n",
        );
        assert_eq!(
            events,
            vec![Sse {
                event: "ping".into(),
                data: "{\"type\":\n\"ping\"}".into()
            }]
        );
        assert!(parser.push(b"\n\n").is_empty());
    }

    #[test]
    fn a_refusal_carries_its_category() {
        let sse = Sse {
            event: "message_delta".into(),
            data: json!({
                "type": "message_delta",
                "delta": { "stop_reason": "refusal", "stop_sequence": null, "stop_details": { "category": "policy" } },
                "usage": { "output_tokens": 3 }
            })
            .to_string(),
        };
        let mut state = StreamState::default();
        state.input = 10;
        let events = translate(&sse, &mut state);
        assert_eq!(
            events,
            vec![
                GardenerEvent::Usage {
                    input: 10,
                    output: 3,
                    cache_read: 0,
                    cache_write: 0
                },
                GardenerEvent::Stop {
                    reason: "refusal".into(),
                    refusal: Some("policy".into()),
                },
            ]
        );
        // The category means nothing on any other stop.
        let sse = Sse {
            data: json!({
                "type": "message_delta",
                "delta": { "stop_reason": "end_turn", "stop_details": { "category": "policy" } },
                "usage": { "output_tokens": 3 }
            })
            .to_string(),
            ..sse
        };
        assert!(matches!(
            translate(&sse, &mut state)[1],
            GardenerEvent::Stop { refusal: None, .. }
        ));
    }

    #[test]
    fn an_error_event_becomes_an_error() {
        let sse = Sse {
            event: "error".into(),
            data: json!({
                "type": "error",
                "error": { "type": "overloaded_error", "message": "Overloaded" }
            })
            .to_string(),
        };
        let events = translate(&sse, &mut StreamState::default());
        assert_eq!(
            events,
            vec![GardenerEvent::Error {
                status: None,
                message: "overloaded_error: Overloaded".into(),
            }]
        );
        assert_eq!(error_message("{\"error\":{\"message\":\"no\"}}", 401), "no");
        assert_eq!(error_message("<html>", 502), "HTTP 502");
        // What is not JSON at all is an error too, and says which event.
        let events = translate(
            &Sse {
                event: "message_delta".into(),
                data: "{".into(),
            },
            &mut StreamState::default(),
        );
        assert!(
            matches!(&events[0], GardenerEvent::Error { status: None, message } if message.contains("message_delta"))
        );
    }

    /// Reasoning comes back as one whole block, text and signature, in its place among the others; an encrypted
    /// one comes back as it was sent.
    #[test]
    fn a_thinking_block_is_handed_over_whole() {
        let mut state = StreamState::default();
        let mut events = Vec::new();
        for data in [
            json!({ "type": "content_block_start", "index": 0,
                    "content_block": { "type": "thinking", "thinking": "", "signature": "" } }),
            json!({ "type": "content_block_delta", "index": 0,
                    "delta": { "type": "thinking_delta", "thinking": "Leeks expire " } }),
            json!({ "type": "content_block_delta", "index": 0,
                    "delta": { "type": "thinking_delta", "thinking": "first." } }),
            json!({ "type": "content_block_delta", "index": 0,
                    "delta": { "type": "signature_delta", "signature": "sig" } }),
            json!({ "type": "content_block_delta", "index": 0,
                    "delta": { "type": "signature_delta", "signature": "nature" } }),
            json!({ "type": "content_block_stop", "index": 0 }),
            json!({ "type": "content_block_start", "index": 1,
                    "content_block": { "type": "redacted_thinking", "data": "opaque" } }),
            json!({ "type": "content_block_stop", "index": 1 }),
            json!({ "type": "content_block_start", "index": 2,
                    "content_block": { "type": "tool_use", "id": "toolu_1", "name": "kitchen_plan", "input": {} } }),
            json!({ "type": "content_block_stop", "index": 2 }),
        ] {
            let sse = Sse {
                event: data["type"].as_str().unwrap().into(),
                data: data.to_string(),
            };
            events.extend(translate(&sse, &mut state));
        }
        assert_eq!(
            events,
            vec![
                GardenerEvent::Thinking {
                    block: json!({ "type": "thinking", "thinking": "Leeks expire first.", "signature": "signature" }),
                },
                GardenerEvent::Thinking {
                    block: json!({ "type": "redacted_thinking", "data": "opaque" }),
                },
                GardenerEvent::ToolUse {
                    id: "toolu_1".into(),
                    name: "kitchen_plan".into(),
                    input: json!({}),
                },
            ]
        );
        assert_eq!(
            serde_json::to_value(&events[1]).unwrap(),
            json!({ "type": "thinking", "block": { "type": "redacted_thinking", "data": "opaque" } })
        );
    }

    #[test]
    fn a_tool_input_that_is_not_json_is_an_error() {
        let mut state = StreamState::default();
        let mut events = Vec::new();
        for data in [
            json!({ "type": "content_block_start", "index": 0,
                    "content_block": { "type": "tool_use", "id": "toolu_1", "name": "kitchen_plan", "input": {} } }),
            json!({ "type": "content_block_delta", "index": 0,
                    "delta": { "type": "input_json_delta", "partial_json": "{\"recipe\": " } }),
            json!({ "type": "content_block_stop", "index": 0 }),
            json!({ "type": "content_block_start", "index": 1,
                    "content_block": { "type": "tool_use", "id": "toolu_2", "name": "kitchen_list", "input": {} } }),
            json!({ "type": "content_block_stop", "index": 1 }),
        ] {
            let sse = Sse {
                event: data["type"].as_str().unwrap().into(),
                data: data.to_string(),
            };
            events.extend(translate(&sse, &mut state));
        }
        assert_eq!(events.len(), 2);
        assert!(
            matches!(&events[0], GardenerEvent::Error { status: None, message } if message.contains("kitchen_plan"))
        );
        // An input that never arrived is an empty object.
        assert_eq!(
            events[1],
            GardenerEvent::ToolUse {
                id: "toolu_2".into(),
                name: "kitchen_list".into(),
                input: json!({}),
            }
        );
    }

    /// The key is a header: no event of a stream, and no error of one, ever carries it.
    #[test]
    fn no_message_of_the_stream_carries_the_key() {
        let mut stream = STREAM.to_vec();
        stream.extend_from_slice(
            b"event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"api_error\",\"message\":\"bad\"}}\n\n",
        );
        stream.extend_from_slice(b"event: message_delta\ndata: {\n\n");
        let events = events_of(std::iter::once(stream));
        let errors: Vec<&GardenerEvent> = events
            .iter()
            .filter(|event| matches!(event, GardenerEvent::Error { .. }))
            .collect();
        assert_eq!(errors.len(), 2);
        for event in &events {
            let text = serde_json::to_string(event).unwrap();
            assert!(!text.contains(KEY), "{text}");
        }
    }

    #[test]
    fn the_body_is_what_the_api_expects() {
        let mut request = request();
        let sent = body(&request);
        assert_eq!(sent["max_tokens"], 256);
        assert_eq!(sent["stream"], true);
        assert_eq!(sent["system"], "Be brief.");
        assert!(sent.get("tools").is_none());
        assert!(sent.get("thinking").is_none() && sent.get("tool_choice").is_none());
        assert!(sent.get("output_config").is_none());
        request.output_format = Some(json!({ "type": "object" }));
        assert_eq!(
            body(&request)["output_config"],
            json!({ "format": { "type": "json_schema", "schema": { "type": "object" } } })
        );
        request.tools = vec![json!({ "name": "kitchen_plan" })];
        assert_eq!(body(&request)["tools"][0]["name"], "kitchen_plan");
        assert_eq!(
            body_len(&request),
            serde_json::to_vec(&body(&request)).unwrap().len()
        );
    }

    /// A provider that cannot be reached is a refusal, before any event, and the refusal carries no key.
    #[tokio::test]
    async fn a_network_failure_is_refused_without_the_key() {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let events = std::sync::Mutex::new(Vec::new());
        let on_event = |event: GardenerEvent| events.lock().unwrap().push(event);
        let result = send_to("http://127.0.0.1:9/v1/messages", KEY, &request(), &on_event).await;
        let message = result.expect_err("unreachable").to_string();
        assert!(message.starts_with("gardener:network: "), "{message}");
        assert!(!message.contains(KEY));
        assert!(events.lock().unwrap().is_empty());
    }
}
