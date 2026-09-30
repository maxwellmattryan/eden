//! The Gardener's runtime on this side of the IPC boundary (docs/product/substrate/ai.md; docs/engineering/gardener.md;
//! D-76): the one call to a model provider, made here so the key never reaches the webview and every byte out is
//! counted. The frontend builds the request (the system prompt, the messages, the tools; docs/product/substrate/ai.md,
//! "The context pack") and receives the stream as events; this module holds the shapes they cross in, the adapter
//! for the one provider of v0, and the requests in flight so one can be cancelled.

pub mod anthropic;

use std::collections::HashMap;
use std::sync::Mutex;

use futures_util::future::AbortHandle;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The name of the secret that holds the provider key.
pub const KEY_SECRET: &str = "anthropic-api-key";

/// One request as the frontend sends it. `system`, `messages` and `tools` are passed to the provider verbatim.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
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
}

/// What the stream is made of, as the frontend receives it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
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
    /// Sent once at the start with the input side, and once at the end with the output side.
    #[serde(rename_all = "camelCase")]
    Usage {
        input: u64,
        output: u64,
        cache_read: u64,
        cache_write: u64,
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
}

/// The requests in flight, by request id, so a cancel can abort one. Managed by the app at setup.
#[derive(Default)]
pub struct Inflight(pub Mutex<HashMap<String, AbortHandle>>);

impl Inflight {
    pub fn insert(&self, id: &str, handle: AbortHandle) {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id.to_string(), handle);
    }

    pub fn remove(&self, id: &str) -> Option<AbortHandle> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).remove(id)
    }

    /// Aborts the request. Answers whether it was in flight.
    pub fn cancel(&self, id: &str) -> bool {
        match self.remove(id) {
            Some(handle) => {
                handle.abort();
                true
            }
            None => false,
        }
    }
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
        };
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            serde_json::json!({ "type": "usage", "input": 1, "output": 2, "cacheRead": 3, "cacheWrite": 4 })
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
