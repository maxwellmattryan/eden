//! The MCP bridge (docs/engineering/gardener.md, "The loop"; D-179): how Eden's tools reach a Claude Code process.
//! A small streamable-HTTP JSON-RPC server on `127.0.0.1`, started with the app, written by hand on tokio: POST only,
//! `Content-Length` bodies, and plain JSON answers (the transport lets a server answer a POST with
//! `application/json`), so no session id is issued or asked for and a GET is refused 405.
//!
//! Every request must carry the bearer minted at launch, which reaches the process only through its 0600
//! `--mcp-config` file; a request with an `Origin` is a browser's and is refused. The path names the Gardener request,
//! whose tools `tools/list` answers. A `tools/call` is handed to the webview as a `tool_call` event on that request's
//! channel, where the same handler path as the API's runs it (cards, grants, confirms, the guard), and is answered
//! when `gardener_tool_answer` brings its result back. A call still open when its request ends answers an error.

use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::ipc::Channel;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::oneshot;

use super::GardenerEvent;

/// The longest request head read, and the largest body.
const HEAD_CAP: usize = 64 * 1024;
const BODY_CAP: usize = 16 * 1024 * 1024;

/// What the webview answers a call with.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
    pub content: String,
    #[serde(default)]
    pub is_error: bool,
}

/// A Gardener request the bridge serves: its tools, its channel, and its calls waiting for an answer.
struct Open {
    tools: Vec<Value>,
    channel: Channel<GardenerEvent>,
    calls: HashMap<String, oneshot::Sender<Answer>>,
}

struct Inner {
    port: u16,
    token: String,
    requests: Mutex<HashMap<String, Open>>,
}

/// The bridge, managed by the app on desktop. Cheap to clone.
#[derive(Clone)]
pub struct McpBridge {
    inner: Arc<Inner>,
}

/// Two v4 UUIDs as hex: 244 random bits, minted once per launch.
fn mint() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// Compares in time that depends on the length only.
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// A request's tools as MCP lists them: the name, the description and the schema, without the API's
/// `cache_control` or `strict`, and without the provider's own tools (web search), which Claude Code has its own of.
pub fn mcp_tools(tools: &[Value]) -> Vec<Value> {
    tools
        .iter()
        .filter(|tool| {
            !tool
                .get("type")
                .and_then(Value::as_str)
                .is_some_and(|kind| kind.starts_with("web_search"))
        })
        .filter_map(|tool| {
            let name = tool.get("name").and_then(Value::as_str)?;
            Some(json!({
                "name": name,
                "description": tool.get("description").and_then(Value::as_str).unwrap_or_default(),
                "inputSchema": tool.get("input_schema").cloned().unwrap_or_else(|| json!({ "type": "object" })),
            }))
        })
        .collect()
}

/// The tool-use id Claude Code passes in a call's `_meta` (`claudecode/toolUseId` on 2.1.316), so a card matches its
/// call by id.
fn tool_use_id(meta: &Value) -> Option<String> {
    let meta = meta.as_object()?;
    meta.get("claudecode/toolUseId")
        .or_else(|| {
            meta.iter()
                .find(|(key, _)| key.contains("toolUseId"))
                .map(|(_, value)| value)
        })
        .and_then(Value::as_str)
        .map(str::to_string)
}

struct Response {
    status: u16,
    body: Option<Value>,
}

impl Response {
    fn empty(status: u16) -> Self {
        Self { status, body: None }
    }

    fn rpc(id: &Value, result: Value) -> Self {
        Self {
            status: 200,
            body: Some(json!({ "jsonrpc": "2.0", "id": id, "result": result })),
        }
    }

    fn rpc_error(id: &Value, code: i64, message: &str) -> Self {
        Self {
            status: 200,
            body: Some(
                json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }),
            ),
        }
    }
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        431 => "Request Header Fields Too Large",
        _ => "Error",
    }
}

/// One parsed HTTP request.
struct HttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

/// Reads one request off a kept-alive connection; none when it closed or broke.
async fn read_request(
    stream: &mut TcpStream,
    buffer: &mut Vec<u8>,
) -> std::result::Result<Option<HttpRequest>, u16> {
    let mut chunk = vec![0u8; 8192];
    let end = loop {
        if let Some(at) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
            break at;
        }
        if buffer.len() > HEAD_CAP {
            return Err(431);
        }
        match stream.read(&mut chunk).await {
            Ok(0) | Err(_) => return Ok(None),
            Ok(n) => buffer.extend_from_slice(&chunk[..n]),
        }
    };
    let head: Vec<u8> = buffer.drain(..end + 4).collect();
    let head = String::from_utf8_lossy(&head[..end]).into_owned();
    let mut lines = head.split("\r\n");
    let mut first = lines.next().unwrap_or_default().split_whitespace();
    let method = first.next().unwrap_or_default().to_string();
    let path = first.next().unwrap_or_default().to_string();
    let headers: HashMap<String, String> = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_string()))
        .collect();
    let length: usize = headers
        .get("content-length")
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    if length > BODY_CAP {
        return Err(413);
    }
    while buffer.len() < length {
        match stream.read(&mut chunk).await {
            Ok(0) | Err(_) => return Ok(None),
            Ok(n) => buffer.extend_from_slice(&chunk[..n]),
        }
    }
    let body: Vec<u8> = buffer.drain(..length).collect();
    Ok(Some(HttpRequest {
        method,
        path,
        headers,
        body,
    }))
}

async fn write_response(stream: &mut TcpStream, response: &Response) -> std::io::Result<()> {
    let body = response
        .body
        .as_ref()
        .map(|body| body.to_string())
        .unwrap_or_default();
    let mut head = format!(
        "HTTP/1.1 {} {}\r\nContent-Length: {}\r\nConnection: keep-alive\r\n",
        response.status,
        reason(response.status),
        body.len()
    );
    if response.body.is_some() {
        head.push_str("Content-Type: application/json\r\n");
    }
    if response.status == 405 {
        head.push_str("Allow: POST\r\n");
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes()).await?;
    stream.write_all(body.as_bytes()).await?;
    stream.flush().await
}

impl McpBridge {
    /// Binds a port on loopback and serves it for the life of the app.
    pub fn start() -> std::io::Result<McpBridge> {
        let listener = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        listener.set_nonblocking(true)?;
        let bridge = McpBridge {
            inner: Arc::new(Inner {
                port: listener.local_addr()?.port(),
                token: mint(),
                requests: Mutex::new(HashMap::new()),
            }),
        };
        let serving = bridge.clone();
        tauri::async_runtime::spawn(async move {
            let listener = match tokio::net::TcpListener::from_std(listener) {
                Ok(listener) => listener,
                Err(e) => {
                    log::error!("The Gardener's MCP bridge did not start: {e}");
                    return;
                }
            };
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let bridge = serving.clone();
                        tauri::async_runtime::spawn(async move { bridge.serve(stream).await });
                    }
                    Err(e) => {
                        log::warn!("The Gardener's MCP bridge missed a connection: {e}");
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                }
            }
        });
        Ok(bridge)
    }

    pub fn port(&self) -> u16 {
        self.inner.port
    }

    pub fn token(&self) -> &str {
        &self.inner.token
    }

    fn requests(&self) -> std::sync::MutexGuard<'_, HashMap<String, Open>> {
        self.inner
            .requests
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

    /// Serves a request's tools until `close`.
    pub fn open(&self, request_id: &str, tools: Vec<Value>, channel: Channel<GardenerEvent>) {
        self.requests().insert(
            request_id.to_string(),
            Open {
                tools,
                channel,
                calls: HashMap::new(),
            },
        );
    }

    /// Stops serving a request; every call it still has open answers an error.
    pub fn close(&self, request_id: &str) {
        if let Some(open) = self.requests().remove(request_id) {
            for (_, call) in open.calls {
                let _ = call.send(Answer {
                    content: "The request ended before this tool answered.".to_string(),
                    is_error: true,
                });
            }
        }
    }

    /// Answers a call. Answers whether it was open.
    pub fn answer(&self, call_id: &str, answer: Answer) -> bool {
        let call = self
            .requests()
            .values_mut()
            .find_map(|open| open.calls.remove(call_id));
        call.is_some_and(|call| call.send(answer).is_ok())
    }

    async fn serve(&self, mut stream: TcpStream) {
        let mut buffer = Vec::new();
        loop {
            let request = match read_request(&mut stream, &mut buffer).await {
                Ok(Some(request)) => request,
                Ok(None) => return,
                Err(status) => {
                    let _ = write_response(&mut stream, &Response::empty(status)).await;
                    return;
                }
            };
            let close = request
                .headers
                .get("connection")
                .is_some_and(|value| value.eq_ignore_ascii_case("close"));
            let response = self.handle(request).await;
            if write_response(&mut stream, &response).await.is_err() || close {
                return;
            }
        }
    }

    async fn handle(&self, request: HttpRequest) -> Response {
        // A browser always sends an Origin; Claude Code never does.
        if request.headers.contains_key("origin") {
            return Response::empty(403);
        }
        let bearer = request
            .headers
            .get("authorization")
            .and_then(|value| value.strip_prefix("Bearer "))
            .unwrap_or_default();
        if !same(bearer.as_bytes(), self.inner.token.as_bytes()) {
            return Response::empty(401);
        }
        let request_id = request
            .path
            .split('?')
            .next()
            .unwrap_or_default()
            .strip_prefix("/mcp/")
            .unwrap_or_default()
            .to_string();
        if !self.requests().contains_key(&request_id) {
            return Response::empty(404);
        }
        if request.method != "POST" {
            return Response::empty(405);
        }
        let Ok(message) = serde_json::from_slice::<Value>(&request.body) else {
            return Response {
                status: 400,
                body: Some(
                    json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": "Parse error" } }),
                ),
            };
        };
        let Some(id) = message.get("id").filter(|id| !id.is_null()).cloned() else {
            // A notification or a response: nothing to answer.
            return Response::empty(202);
        };
        let params = message.get("params").cloned().unwrap_or(Value::Null);
        match message.get("method").and_then(Value::as_str) {
            Some("initialize") => Response::rpc(
                &id,
                json!({
                    "protocolVersion": params.get("protocolVersion").cloned().unwrap_or_else(|| json!("2025-06-18")),
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "eden", "version": env!("CARGO_PKG_VERSION") },
                }),
            ),
            Some("ping") => Response::rpc(&id, json!({})),
            Some("tools/list") => {
                let tools = self
                    .requests()
                    .get(&request_id)
                    .map(|open| mcp_tools(&open.tools))
                    .unwrap_or_default();
                Response::rpc(&id, json!({ "tools": tools }))
            }
            Some("tools/call") => {
                let answer = self.call(&request_id, &params).await;
                Response::rpc(
                    &id,
                    json!({ "content": [{ "type": "text", "text": answer.content }], "isError": answer.is_error }),
                )
            }
            _ => Response::rpc_error(&id, -32601, "Method not found"),
        }
    }

    /// Hands a call to the webview and waits for its answer.
    async fn call(&self, request_id: &str, params: &Value) -> Answer {
        let name = params
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let input = params
            .get("arguments")
            .cloned()
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}));
        let call_id = uuid::Uuid::new_v4().simple().to_string();
        let (sender, receiver) = oneshot::channel();
        let channel = {
            let mut requests = self.requests();
            let Some(open) = requests.get_mut(request_id) else {
                return Answer {
                    content: "The request has ended.".to_string(),
                    is_error: true,
                };
            };
            if !mcp_tools(&open.tools)
                .iter()
                .any(|tool| tool["name"] == name.as_str())
            {
                return Answer {
                    content: format!("There is no tool named {name}."),
                    is_error: true,
                };
            }
            open.calls.insert(call_id.clone(), sender);
            open.channel.clone()
        };
        let event = GardenerEvent::ToolCall {
            call_id,
            request_id: request_id.to_string(),
            name,
            input,
            tool_use_id: params.get("_meta").and_then(tool_use_id),
        };
        if let Err(e) = channel.send(event) {
            log::warn!("A Gardener tool call did not reach the webview: {e}");
        }
        receiver.await.unwrap_or_else(|_| Answer {
            content: "The request ended before this tool answered.".to_string(),
            is_error: true,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::ipc::InvokeResponseBody;

    type Seen = Arc<Mutex<Vec<Value>>>;

    fn channel() -> (Channel<GardenerEvent>, Seen) {
        let seen: Seen = Arc::default();
        let held = seen.clone();
        let channel = Channel::new(move |body| {
            if let InvokeResponseBody::Json(json) = body {
                held.lock()
                    .unwrap()
                    .push(serde_json::from_str(&json).unwrap());
            }
            Ok(())
        });
        (channel, seen)
    }

    fn tools() -> Vec<Value> {
        vec![
            json!({ "name": "read-rows", "description": "Reads rows.", "input_schema": { "type": "object" },
                "cache_control": { "type": "ephemeral" } }),
            json!({ "name": "add-task", "description": "Adds a task.", "strict": true,
                "input_schema": { "type": "object", "properties": { "title": { "type": "string" } } } }),
            json!({ "type": "web_search_20250305", "name": "web_search" }),
        ]
    }

    /// One raw HTTP request on a new connection; answers the status and the JSON body, if any.
    async fn post(
        port: u16,
        path: &str,
        headers: &[(&str, &str)],
        body: &Value,
    ) -> (u16, Option<Value>) {
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        let body = body.to_string();
        let mut head = format!(
            "POST {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n",
            body.len()
        );
        for (name, value) in headers {
            head.push_str(&format!("{name}: {value}\r\n"));
        }
        head.push_str("\r\n");
        stream.write_all(head.as_bytes()).await.unwrap();
        stream.write_all(body.as_bytes()).await.unwrap();
        let mut buffer = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            let n = stream.read(&mut chunk).await.unwrap();
            assert!(n > 0, "the connection closed early");
            buffer.extend_from_slice(&chunk[..n]);
            let Some(end) = buffer.windows(4).position(|w| w == b"\r\n\r\n") else {
                continue;
            };
            let head = String::from_utf8_lossy(&buffer[..end]).to_string();
            let status: u16 = head.split_whitespace().nth(1).unwrap().parse().unwrap();
            let length: usize = head
                .lines()
                .find_map(|line| line.strip_prefix("Content-Length: "))
                .unwrap()
                .parse()
                .unwrap();
            if buffer.len() >= end + 4 + length {
                let body = &buffer[end + 4..end + 4 + length];
                return (status, serde_json::from_slice(body).ok());
            }
        }
    }

    fn rpc(id: u64, method: &str, params: Value) -> Value {
        json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
    }

    #[tokio::test]
    async fn refuses_without_bearer_or_with_origin() {
        let bridge = McpBridge::start().unwrap();
        let (channel, _) = channel();
        bridge.open("r1", tools(), channel);
        let bearer = format!("Bearer {}", bridge.token());
        let list = rpc(1, "tools/list", json!({}));
        let port = bridge.port();

        assert_eq!(post(port, "/mcp/r1", &[], &list).await.0, 401);
        assert_eq!(
            post(port, "/mcp/r1", &[("Authorization", "Bearer nope")], &list)
                .await
                .0,
            401
        );
        assert_eq!(
            post(
                port,
                "/mcp/r1",
                &[
                    ("Authorization", &bearer),
                    ("Origin", "http://localhost:1420")
                ],
                &list
            )
            .await
            .0,
            403
        );
        assert_eq!(
            post(port, "/mcp/r2", &[("Authorization", &bearer)], &list)
                .await
                .0,
            404
        );
        assert_eq!(
            post(port, "/mcp/r1", &[("Authorization", &bearer)], &list)
                .await
                .0,
            200
        );
        bridge.close("r1");
        assert_eq!(
            post(port, "/mcp/r1", &[("Authorization", &bearer)], &list)
                .await
                .0,
            404
        );
    }

    #[tokio::test]
    async fn lists_the_requests_tools() {
        let bridge = McpBridge::start().unwrap();
        let (channel, _) = channel();
        bridge.open("r1", tools(), channel);
        let bearer = format!("Bearer {}", bridge.token());
        let auth = [("Authorization", bearer.as_str())];
        let port = bridge.port();

        let (status, body) = post(
            port,
            "/mcp/r1",
            &auth,
            &rpc(
                0,
                "initialize",
                json!({ "protocolVersion": "2025-11-25", "capabilities": {} }),
            ),
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(body.unwrap()["result"]["protocolVersion"], "2025-11-25");

        let (status, body) = post(
            port,
            "/mcp/r1",
            &auth,
            &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
        )
        .await;
        assert_eq!((status, body), (202, None));

        let (_, body) = post(port, "/mcp/r1", &auth, &rpc(1, "tools/list", json!({}))).await;
        assert_eq!(
            body.unwrap()["result"]["tools"],
            json!([
                { "name": "read-rows", "description": "Reads rows.", "inputSchema": { "type": "object" } },
                { "name": "add-task", "description": "Adds a task.",
                    "inputSchema": { "type": "object", "properties": { "title": { "type": "string" } } } },
            ])
        );

        let (_, body) = post(
            port,
            "/mcp/r1",
            &auth,
            &rpc(2, "server/discover", json!({})),
        )
        .await;
        assert_eq!(body.unwrap()["error"]["code"], -32601);
        bridge.close("r1");
    }

    async fn first_call(seen: &Seen) -> Value {
        for _ in 0..200 {
            if let Some(event) = seen.lock().unwrap().first().cloned() {
                return event;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        panic!("no tool_call reached the channel");
    }

    #[tokio::test]
    async fn a_call_waits_for_its_answer() {
        let bridge = McpBridge::start().unwrap();
        let (channel, seen) = channel();
        bridge.open("r1", tools(), channel);
        let bearer = format!("Bearer {}", bridge.token());
        let port = bridge.port();
        let call = rpc(
            3,
            "tools/call",
            json!({ "name": "read-rows", "arguments": { "kind": "grocery-item" },
                "_meta": { "claudecode/toolUseId": "toolu_1", "progressToken": 3 } }),
        );
        let waiting = tokio::spawn(async move {
            post(port, "/mcp/r1", &[("Authorization", &bearer)], &call).await
        });

        let event = first_call(&seen).await;
        assert_eq!(event["type"], "tool_call");
        assert_eq!(event["requestId"], "r1");
        assert_eq!(event["name"], "read-rows");
        assert_eq!(event["input"], json!({ "kind": "grocery-item" }));
        assert_eq!(event["toolUseId"], "toolu_1");
        assert!(!waiting.is_finished());
        assert!(!bridge.answer(
            "nope",
            Answer {
                content: String::new(),
                is_error: false
            }
        ));
        assert!(bridge.answer(
            event["callId"].as_str().unwrap(),
            Answer {
                content: "[\"Milk\"]".into(),
                is_error: false
            }
        ));
        let (status, body) = waiting.await.unwrap();
        assert_eq!(status, 200);
        assert_eq!(
            body.unwrap()["result"],
            json!({ "content": [{ "type": "text", "text": "[\"Milk\"]" }], "isError": false })
        );
        bridge.close("r1");
    }

    #[tokio::test]
    async fn an_open_call_errors_when_the_request_ends() {
        let bridge = McpBridge::start().unwrap();
        let (channel, seen) = channel();
        bridge.open("r1", tools(), channel);
        let bearer = format!("Bearer {}", bridge.token());
        let port = bridge.port();
        let call = rpc(
            4,
            "tools/call",
            json!({ "name": "add-task", "arguments": { "title": "Milk" } }),
        );
        let waiting = tokio::spawn(async move {
            post(port, "/mcp/r1", &[("Authorization", &bearer)], &call).await
        });
        let event = first_call(&seen).await;
        assert_eq!(event["toolUseId"], Value::Null);
        bridge.close("r1");
        let (_, body) = waiting.await.unwrap();
        let result = body.unwrap()["result"].clone();
        assert_eq!(result["isError"], true);
        assert!(!bridge.answer(
            event["callId"].as_str().unwrap(),
            Answer {
                content: String::new(),
                is_error: false
            }
        ));
    }
}
