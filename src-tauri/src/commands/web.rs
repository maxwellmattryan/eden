//! One web page, or one picture, fetched for the owner (Hearth's recipe import takes a link, D-88; a stock item's
//! picture can come from one, D-91; the Gardener's `read-page` reads one the owner wrote or confirmed, D-126). The webview cannot reach an arbitrary host (its CSP names the few it may, and
//! CORS would refuse the rest), so the crate fetches it and hands the HTML, or the picture's bytes, back for the
//! webview to read locally. `@eden/shared/api` wraps them as `fetchPage` and `fetchImage`.
//!
//! This is egress to a host the owner chose, or agreed to on a card that showed the whole address, so it is narrow
//! and it is counted:
//!
//! - `https` on its own port only, no credentials in the address, a plain `GET` with an honest `User-Agent`; no
//!   cookies, no `Referer`, no proxy.
//! - Never an address that is not public. A host that is an IP literal is classified as written; a name is resolved
//!   here, every address it resolves to is classified, and the connection is pinned to exactly those addresses, so
//!   a name that answers differently a moment later (DNS rebinding) cannot move the request somewhere else.
//! - Redirects are followed by hand, five at most, and each one passes every check again.
//! - Fifteen seconds a hop. A page is two megabytes at most and only HTML; a picture five, and only a JPEG, a PNG
//!   or a WebP, or the `.ico` a site keeps as its icon (D-103).
//! - Each request that leaves is one row's worth in the egress ledger, under `web-page` or `web-image` (D-71): the
//!   ledger counts requests and bytes by destination and day and holds no address, so neither the host nor the
//!   path is kept.
//!
//! A refusal starts with a stable code the frontend reads (`webErrorCode`): `web:invalid-url`, `web:not-https`,
//! `web:blocked-host`, `web:too-large`, `web:not-html`, `web:not-image`, `web:too-many-redirects`, `web:timeout` and `web:failed`
//! (a status that is not a page, or the transport).

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::Duration;

use reqwest::header::{HeaderValue, ACCEPT, CONTENT_TYPE, LOCATION};
use reqwest::{redirect, StatusCode, Url};
use serde::Serialize;
use tauri::State;

use crate::error::{EdenError, Result};
use crate::substrate::{egress, Workspace};

/// The destination a page is counted under in the egress ledger.
pub const DESTINATION: &str = "web-page";
/// The destination a picture is counted under.
pub const IMAGE_DESTINATION: &str = "web-image";
/// Who is asking: the app by name and version, nothing that pretends to be a browser.
const USER_AGENT: &str = concat!("Eden/", env!("CARGO_PKG_VERSION"));
const ACCEPTS: &str = "text/html, application/xhtml+xml;q=0.9";
const ACCEPTS_IMAGE: &str = "image/jpeg, image/png, image/webp, image/x-icon;q=0.8";
/// One hop from the first lookup to the last byte of the body.
const HOP_TIMEOUT: Duration = Duration::from_secs(15);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REDIRECTS: usize = 5;
/// The most a page may weigh. No encoding is asked for, so these are the bytes on the wire.
const MAX_BODY: usize = 2 * 1024 * 1024;
/// The most a picture may weigh: a product shot or a photo, never a file to keep whole.
const MAX_IMAGE: usize = 5 * 1024 * 1024;

/// What a fetch is for: a page to read, or a picture to keep. Everything else about the request is the same.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Want {
    Page,
    Image,
}

impl Want {
    fn accepts(self) -> &'static str {
        match self {
            Want::Page => ACCEPTS,
            Want::Image => ACCEPTS_IMAGE,
        }
    }

    fn destination(self) -> &'static str {
        match self {
            Want::Page => DESTINATION,
            Want::Image => IMAGE_DESTINATION,
        }
    }

    fn cap(self) -> usize {
        match self {
            Want::Page => MAX_BODY,
            Want::Image => MAX_IMAGE,
        }
    }

    /// Whether a `Content-Type` is what was asked for.
    fn takes(self, content_type: &str) -> bool {
        match self {
            Want::Page => is_html(content_type),
            Want::Image => is_image(content_type),
        }
    }

    fn mismatch(self) -> EdenError {
        match self {
            Want::Page => refused("not-html", "the address is not a web page"),
            Want::Image => refused(
                "not-image",
                "the address is not a JPEG, a PNG, a WebP or an icon",
            ),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FetchedPage {
    /// The address the page came from, after the redirects.
    pub url: String,
    /// The `Content-Type` as the server sent it.
    pub content_type: String,
    pub html: String,
}

fn refused(code: &str, detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("web:{code}: {detail}"))
}

/// A failure of the transport. The URL is dropped from the message, and the causes beneath it are kept, since
/// reqwest's own line says little.
fn transport(e: reqwest::Error) -> EdenError {
    if e.is_timeout() {
        return refused("timeout", "the page took too long");
    }
    let e = e.without_url();
    let mut detail = e.to_string();
    let mut source = std::error::Error::source(&e);
    while let Some(cause) = source {
        detail.push_str(": ");
        detail.push_str(&cause.to_string());
        source = cause.source();
    }
    refused("failed", detail)
}

// The address.

/// What a URL's host is: a name to resolve, or an address as written.
#[derive(Debug, PartialEq, Eq)]
enum Target {
    Name(String),
    Literal(IpAddr),
}

/// The host of an accepted URL. The parser has already brought every spelling of an IPv4 address (`0x7f.1`,
/// `2130706433`) to its dotted form, so an address is never mistaken for a name.
fn target(url: &Url) -> Result<Target> {
    let host = url
        .host_str()
        .filter(|host| !host.is_empty())
        .ok_or_else(|| refused("invalid-url", "the address names no host"))?;
    if let Some(v6) = host.strip_prefix('[').and_then(|h| h.strip_suffix(']')) {
        return v6
            .parse::<Ipv6Addr>()
            .map(|ip| Target::Literal(IpAddr::V6(ip)))
            .map_err(|_| refused("invalid-url", "the address names no host"));
    }
    Ok(match host.parse::<Ipv4Addr>() {
        Ok(ip) => Target::Literal(IpAddr::V4(ip)),
        Err(_) => Target::Name(host.to_string()),
    })
}

/// The address the owner gave, checked.
fn accept(raw: &str) -> Result<Url> {
    let url = Url::parse(raw.trim()).map_err(|e| refused("invalid-url", e))?;
    check(url)
}

/// Every rule a URL can be held to without the network; the first address and each redirect pass through here. The
/// fragment is dropped: it is never sent, so it is neither counted nor returned.
fn check(mut url: Url) -> Result<Url> {
    if url.scheme() != "https" {
        return Err(refused("not-https", "only https pages are fetched"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(refused(
            "invalid-url",
            "an address that carries credentials is not fetched",
        ));
    }
    // The parser answers `None` for the scheme's own port, written or not.
    if url.port().is_some() {
        return Err(refused("blocked-host", "only the https port is fetched"));
    }
    if let Target::Literal(ip) = target(&url)? {
        if !is_public(ip) {
            return Err(refused("blocked-host", "the address is not a public one"));
        }
    }
    url.set_fragment(None);
    Ok(url)
}

/// Whether an address is one on the public internet: not private, loopback, link-local, shared (CGNAT), multicast,
/// unspecified, documentation or otherwise reserved.
fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_public_v4(ip),
        IpAddr::V6(ip) => is_public_v6(ip),
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    let reserved = a == 0 // "this network", 0.0.0.0 with it
        || a == 10 // private
        || (a == 100 && (64..128).contains(&b)) // shared address space (CGNAT), 100.64/10
        || a == 127 // loopback
        || (a == 169 && b == 254) // link-local, the cloud metadata address with it
        || (a == 172 && (16..32).contains(&b)) // private
        || (a == 192 && b == 0 && c == 0) // IETF protocol assignments
        || (a == 192 && b == 0 && c == 2) // documentation
        || (a == 192 && b == 88 && c == 99) // the 6to4 relays, deprecated
        || (a == 192 && b == 168) // private
        || (a == 198 && (18..20).contains(&b)) // benchmarking
        || (a == 198 && b == 51 && c == 100) // documentation
        || (a == 203 && b == 0 && c == 113) // documentation
        || a >= 224; // multicast, reserved, broadcast
    !reserved
}

/// Only global unicast (`2000::/3`) is public, less its special blocks; an address that carries an IPv4 one is as
/// public as the one it carries.
fn is_public_v6(ip: Ipv6Addr) -> bool {
    let s = ip.segments();
    let embedded =
        |hi: u16, lo: u16| Ipv4Addr::new((hi >> 8) as u8, hi as u8, (lo >> 8) as u8, lo as u8);
    // IPv4-mapped (`::ffff:a.b.c.d`) and the deprecated IPv4-compatible (`::a.b.c.d`), which holds `::` and `::1`.
    if s[..5] == [0; 5] && (s[5] == 0xffff || s[5] == 0) {
        return is_public_v4(embedded(s[6], s[7]));
    }
    // NAT64, `64:ff9b::/96`.
    if s[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
        return is_public_v4(embedded(s[6], s[7]));
    }
    // 6to4, `2002:a.b:c.d::/48`.
    if s[0] == 0x2002 {
        return is_public_v4(embedded(s[1], s[2]));
    }
    // Outside `2000::/3` are unique-local (`fc00::/7`), link-local (`fe80::/10`), multicast (`ff00::/8`) and
    // everything not allocated.
    (s[0] & 0xe000) == 0x2000
        && !(s[0] == 0x2001 && s[1] < 0x0200) // IETF protocol assignments, `2001::/23`: Teredo, ORCHID, benchmarking
        && !(s[0] == 0x2001 && s[1] == 0x0db8) // documentation
        && !(s[0] == 0x3fff && s[1] < 0x1000) // documentation, `3fff::/20`
}

/// What a name resolved to, as the addresses the connection is pinned to: all of them public, or none are used.
fn pinned(addrs: Vec<SocketAddr>) -> Result<Vec<SocketAddr>> {
    if addrs.is_empty() {
        return Err(refused("failed", "the host did not resolve"));
    }
    if addrs.iter().any(|addr| !is_public(addr.ip())) {
        return Err(refused(
            "blocked-host",
            "the host resolves to an address that is not a public one",
        ));
    }
    Ok(addrs)
}

async fn resolve(host: &str) -> Result<Vec<SocketAddr>> {
    let addrs = tokio::net::lookup_host((host, 443))
        .await
        .map_err(|e| refused("failed", format!("the host did not resolve: {e}")))?;
    pinned(addrs.collect())
}

// The answer.

/// Where a redirect leads: its `Location` against the address that answered, held to every rule again.
fn redirect_target(from: &Url, location: Option<&HeaderValue>) -> Result<Url> {
    let location = location
        .and_then(|value| std::str::from_utf8(value.as_bytes()).ok())
        .map(str::trim)
        .filter(|location| !location.is_empty())
        .ok_or_else(|| refused("failed", "a redirect named no address"))?;
    let next = from
        .join(location)
        .map_err(|e| refused("failed", format!("a redirect named no address: {e}")))?;
    check(next)
}

fn is_redirect(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::MOVED_PERMANENTLY
            | StatusCode::FOUND
            | StatusCode::SEE_OTHER
            | StatusCode::TEMPORARY_REDIRECT
            | StatusCode::PERMANENT_REDIRECT
    )
}

/// Whether a `Content-Type` is a page: its parameters are ignored, and so is its case.
fn is_html(content_type: &str) -> bool {
    let essence = content_type.split(';').next().unwrap_or_default().trim();
    essence.eq_ignore_ascii_case("text/html")
        || essence.eq_ignore_ascii_case("application/xhtml+xml")
}

/// Whether a `Content-Type` is a picture the webview can draw: one a model can take, or a site's `.ico` (D-103),
/// which the webview redraws as a JPEG before it is kept.
fn is_image(content_type: &str) -> bool {
    let essence = content_type.split(';').next().unwrap_or_default().trim();
    [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/x-icon",
        "image/vnd.microsoft.icon",
    ]
    .iter()
    .any(|kind| essence.eq_ignore_ascii_case(kind))
}

fn too_large(cap: usize) -> EdenError {
    refused(
        "too-large",
        format!("the answer is larger than {} MB", cap / (1024 * 1024)),
    )
}

/// Adds a chunk to the body, or refuses the one that takes it past the cap.
fn take(body: &mut Vec<u8>, chunk: &[u8], cap: usize) -> Result<()> {
    if body.len() + chunk.len() > cap {
        return Err(too_large(cap));
    }
    body.extend_from_slice(chunk);
    Ok(())
}

/// The body, read as it streams and no further than the cap. A `Content-Length` over the cap is refused before a
/// byte is read; one under it is not trusted.
async fn read_capped(mut response: reqwest::Response, cap: usize) -> Result<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > cap as u64)
    {
        return Err(too_large(cap));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(transport)? {
        take(&mut body, &chunk, cap)?;
    }
    Ok(body)
}

// The request.

/// A client for one hop. A name is pinned to the addresses that were checked; a literal needs no pin. The crypto
/// provider is the one `run()` installed at setup.
fn client(pin: Option<(&str, &[SocketAddr])>) -> Result<reqwest::Client> {
    let mut builder = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .redirect(redirect::Policy::none())
        .referer(false)
        // A proxy would resolve the name itself, past the pin.
        .no_proxy()
        .https_only(true)
        .timeout(HOP_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT);
    if let Some((host, addrs)) = pin {
        builder = builder.resolve_to_addrs(host, addrs);
    }
    builder.build().map_err(transport)
}

/// What came back from an address: its final URL, its type as sent, and its bytes.
struct Fetched {
    url: String,
    content_type: String,
    body: Vec<u8>,
}

enum Hop {
    Done(Fetched),
    Redirect(Url),
}

/// One request to an address `check` has passed: resolve, classify, pin, count, send, and read what came back.
async fn hop(workspace: &Workspace, url: &Url, want: Want) -> Result<Hop> {
    let (client, allowed): (reqwest::Client, Vec<IpAddr>) = match target(url)? {
        Target::Literal(ip) => (client(None)?, vec![ip]),
        Target::Name(host) => {
            let addrs = resolve(&host).await?;
            let client = client(Some((&host, &addrs)))?;
            (client, addrs.iter().map(SocketAddr::ip).collect())
        }
    };

    // What Eden hands over is the address; the request is counted before it leaves, answered or not, and a ledger
    // that cannot be written never costs the page.
    let bytes_out = url.as_str().len() as u64;
    if let Err(e) = workspace.write(|ctx| egress::record(ctx.conn, want.destination(), bytes_out)) {
        log::warn!("The egress ledger did not take the request: {e}");
    }

    let response = client
        .get(url.clone())
        .header(ACCEPT, want.accepts())
        .send()
        .await
        .map_err(transport)?;

    // The pin is what keeps the connection on a checked address; this is the proof of it, so that an answer from
    // anywhere else is never handed on.
    if let Some(remote) = response.remote_addr() {
        let remote = remote.ip().to_canonical();
        if !allowed.iter().any(|ip| ip.to_canonical() == remote) {
            return Err(refused(
                "blocked-host",
                "the answer came from an address that was not checked",
            ));
        }
    }

    let status = response.status();
    if is_redirect(status) {
        return redirect_target(url, response.headers().get(LOCATION)).map(Hop::Redirect);
    }
    if !status.is_success() {
        return Err(refused(
            "failed",
            format!("the page answered {}", status.as_u16()),
        ));
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    if !want.takes(&content_type) {
        return Err(want.mismatch());
    }

    let body = read_capped(response, want.cap()).await?;
    Ok(Hop::Done(Fetched {
        url: url.to_string(),
        content_type,
        body,
    }))
}

/// Fetches what is at an `https` address, following up to five redirects, each through every check.
async fn fetch(workspace: &Workspace, url: &str, want: Want) -> Result<Fetched> {
    let mut url = accept(url)?;
    // The first request, and one more for each redirect allowed.
    for _ in 0..=MAX_REDIRECTS {
        let step = tokio::time::timeout(HOP_TIMEOUT, hop(workspace, &url, want))
            .await
            .map_err(|_| refused("timeout", "the address took too long"))??;
        match step {
            Hop::Done(fetched) => return Ok(fetched),
            Hop::Redirect(next) => url = next,
        }
    }
    Err(refused(
        "too-many-redirects",
        format!("more than {MAX_REDIRECTS} redirects"),
    ))
}

/// Fetches the page at an `https` address and answers its HTML, following up to five redirects. Every request that
/// leaves is counted in the egress ledger under `web-page`.
#[tauri::command]
pub async fn fetch_page(workspace: State<'_, Workspace>, url: String) -> Result<FetchedPage> {
    let fetched = fetch(workspace.inner(), &url, Want::Page).await?;
    Ok(FetchedPage {
        url: fetched.url,
        content_type: fetched.content_type,
        // Read as UTF-8, with whatever is not replaced: sniffing the charset (the header's, a `<meta>`'s) is out of
        // scope, so a page in another encoding keeps its ASCII and loses the rest.
        html: String::from_utf8_lossy(&fetched.body).into_owned(),
    })
}

/// Fetches the picture at an `https` address (D-91) and answers its bytes, as a raw response: a JPEG, a PNG or a
/// WebP, or a site's `.ico` (D-103), of five megabytes at most, under the same checks as a page. Every request that leaves is counted in the
/// egress ledger under `web-image`.
#[tauri::command]
pub async fn fetch_image(
    workspace: State<'_, Workspace>,
    url: String,
) -> Result<tauri::ipc::Response> {
    let fetched = fetch(workspace.inner(), &url, Want::Image).await?;
    Ok(tauri::ipc::Response::new(fetched.body))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The code a refusal starts with.
    fn code<T: std::fmt::Debug>(result: Result<T>) -> String {
        let error = result.expect_err("refused");
        assert!(matches!(error, EdenError::Refused(_)));
        let message = error.to_string();
        let (code, _) = message.split_once(": ").expect("a coded message");
        code.to_string()
    }

    #[test]
    fn an_https_address_is_accepted() {
        let url = accept(" https://example.com/recipes/soup?serves=4#method ").unwrap();
        // The fragment never leaves, so it is not kept.
        assert_eq!(url.as_str(), "https://example.com/recipes/soup?serves=4");
        assert_eq!(target(&url).unwrap(), Target::Name("example.com".into()));
        // The scheme's own port, written out, is the same address.
        assert_eq!(
            accept("https://example.com:443/a").unwrap().as_str(),
            "https://example.com/a"
        );
        assert_eq!(
            accept("HTTPS://Example.COM").unwrap().as_str(),
            "https://example.com/"
        );
    }

    #[test]
    fn only_https_is_accepted() {
        for url in [
            "http://example.com/",
            "ftp://example.com/",
            "file:///etc/passwd",
            "data:text/html,<p>hello</p>",
            "javascript:alert(1)",
        ] {
            assert_eq!(code(accept(url)), "web:not-https", "{url}");
        }
    }

    #[test]
    fn what_is_not_an_address_is_refused() {
        for url in [
            "",
            "example.com/recipe",
            "/recipes/soup",
            "https://",
            "https://exa mple.com/",
        ] {
            assert_eq!(code(accept(url)), "web:invalid-url", "{url:?}");
        }
    }

    #[test]
    fn credentials_in_the_address_are_refused() {
        for url in [
            "https://owner:secret@example.com/",
            "https://owner@example.com/",
            "https://:secret@example.com/",
        ] {
            assert_eq!(code(accept(url)), "web:invalid-url", "{url}");
        }
    }

    #[test]
    fn another_port_is_refused() {
        for url in [
            "https://example.com:8443/",
            "https://example.com:80/",
            "https://example.com:22/",
        ] {
            assert_eq!(code(accept(url)), "web:blocked-host", "{url}");
        }
    }

    #[test]
    fn a_literal_address_is_classified_as_written() {
        for url in [
            "https://127.0.0.1/",
            "https://10.0.0.5/admin",
            "https://192.168.1.1/",
            "https://169.254.169.254/latest/meta-data/",
            "https://0.0.0.0/",
            "https://[::1]/",
            "https://[::]/",
            "https://[fe80::1]/",
            "https://[fd12:3456:789a::1]/",
            "https://[::ffff:127.0.0.1]/",
            "https://[::ffff:7f00:1]/",
            // Every other spelling of 127.0.0.1 the parser understands.
            "https://2130706433/",
            "https://0x7f.1/",
            "https://0177.0.0.1/",
            "https://127.1/",
        ] {
            assert_eq!(code(accept(url)), "web:blocked-host", "{url}");
        }
        let v4 = accept("https://1.1.1.1/").unwrap();
        assert_eq!(
            target(&v4).unwrap(),
            Target::Literal("1.1.1.1".parse().unwrap())
        );
        let v6 = accept("https://[2606:4700:4700::1111]/").unwrap();
        assert_eq!(
            target(&v6).unwrap(),
            Target::Literal("2606:4700:4700::1111".parse().unwrap())
        );
    }

    #[test]
    fn addresses_are_classified() {
        let refused = [
            // IPv4.
            "0.0.0.0",
            "0.1.2.3",
            "10.0.0.1",
            "10.255.255.255",
            "100.64.0.1",
            "100.127.255.255",
            "127.0.0.1",
            "127.255.255.254",
            "169.254.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "172.31.255.255",
            "192.0.0.1",
            "192.0.2.1",
            "192.88.99.1",
            "192.168.0.1",
            "192.168.255.255",
            "198.18.0.1",
            "198.19.255.255",
            "198.51.100.7",
            "203.0.113.7",
            "224.0.0.1",
            "239.255.255.250",
            "240.0.0.1",
            "255.255.255.255",
            // IPv6.
            "::",
            "::1",
            "fe80::1",
            "febf::1",
            "fc00::1",
            "fd00::1",
            "fec0::1",
            "ff02::1",
            "ff0e::1",
            "100::1",
            "2001:db8::1",
            "3fff:0fff::1",
            "2001::1",
            "2001:2::1",
            "2001:10::1",
            "64:ff9b:1::1",
            // An IPv4 address carried in an IPv6 one is the address it carries.
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
            "::ffff:192.168.1.1",
            "::ffff:169.254.169.254",
            "::ffff:100.64.0.1",
            "::127.0.0.1",
            "::10.0.0.1",
            "64:ff9b::127.0.0.1",
            "64:ff9b::10.0.0.1",
            "2002:7f00:1::1",
            "2002:c0a8:101::1",
        ];
        for ip in refused {
            assert!(!is_public(ip.parse().unwrap()), "{ip} is not public");
        }
        let allowed = [
            "1.1.1.1",
            "8.8.8.8",
            "93.184.216.34",
            "100.63.255.255",
            "100.128.0.1",
            "172.15.255.255",
            "172.32.0.1",
            "192.0.1.1",
            "192.167.255.255",
            "198.17.255.255",
            "198.20.0.1",
            "223.255.255.254",
            "2606:4700:4700::1111",
            "2001:4860:4860::8888",
            "2a00:1450:4001:81b::200e",
            "3fff:1000::1",
            "::ffff:8.8.8.8",
            "64:ff9b::8.8.8.8",
            "2002:808:808::1",
        ];
        for ip in allowed {
            assert!(is_public(ip.parse().unwrap()), "{ip} is public");
        }
    }

    #[test]
    fn a_name_is_pinned_only_when_every_address_is_public() {
        let addr = |ip: &str| SocketAddr::new(ip.parse().unwrap(), 443);
        let public = vec![addr("93.184.216.34"), addr("2606:4700:4700::1111")];
        assert_eq!(pinned(public.clone()).unwrap(), public);
        // One address that is not public refuses the name, wherever it is in the answer.
        for mixed in [
            vec![addr("93.184.216.34"), addr("127.0.0.1")],
            vec![addr("10.0.0.1"), addr("93.184.216.34")],
            vec![addr("93.184.216.34"), addr("::1")],
            vec![addr("::ffff:192.168.1.1")],
        ] {
            assert_eq!(code(pinned(mixed)), "web:blocked-host");
        }
        assert_eq!(code(pinned(Vec::new())), "web:failed");
    }

    #[test]
    fn a_content_type_is_a_page_or_it_is_not() {
        for content_type in [
            "text/html",
            "text/html; charset=utf-8",
            "text/html;charset=Shift_JIS",
            "TEXT/HTML; Charset=UTF-8",
            " text/html ",
            "application/xhtml+xml",
            "application/xhtml+xml; charset=utf-8",
        ] {
            assert!(is_html(content_type), "{content_type:?}");
        }
        for content_type in [
            "",
            "text/plain",
            "text/htmlx",
            "application/json",
            "application/pdf",
            "application/xml",
            "image/png",
            "application/octet-stream",
            "text/plain; note=text/html",
        ] {
            assert!(!is_html(content_type), "{content_type:?}");
        }
    }

    #[test]
    fn a_redirect_resolves_against_the_address_that_answered() {
        let from = accept("https://example.com/recipes/soup?serves=4").unwrap();
        let to = |location: &'static str| {
            redirect_target(&from, Some(&HeaderValue::from_static(location)))
        };
        for (location, expected) in [
            ("/print/soup", "https://example.com/print/soup"),
            ("stew", "https://example.com/recipes/stew"),
            ("../about", "https://example.com/about"),
            ("?serves=2", "https://example.com/recipes/soup?serves=2"),
            ("//www.example.com/soup", "https://www.example.com/soup"),
            (
                "https://other.example/soup#method",
                "https://other.example/soup",
            ),
            (" /spaced ", "https://example.com/spaced"),
        ] {
            assert_eq!(to(location).unwrap().as_str(), expected, "{location:?}");
        }
    }

    #[test]
    fn a_redirect_passes_every_check_again() {
        let from = accept("https://example.com/recipes/soup").unwrap();
        let to = |location: &'static str| {
            redirect_target(&from, Some(&HeaderValue::from_static(location)))
        };
        assert_eq!(code(to("http://example.com/soup")), "web:not-https");
        assert_eq!(code(to("file:///etc/passwd")), "web:not-https");
        assert_eq!(code(to("https://127.0.0.1/")), "web:blocked-host");
        assert_eq!(code(to("//169.254.169.254/latest")), "web:blocked-host");
        assert_eq!(code(to("https://[::1]/")), "web:blocked-host");
        assert_eq!(code(to("https://example.com:8443/")), "web:blocked-host");
        assert_eq!(
            code(to("https://owner:secret@example.com/")),
            "web:invalid-url"
        );
        assert_eq!(code(to("")), "web:failed");
        assert_eq!(code(redirect_target(&from, None)), "web:failed");
    }

    #[test]
    fn only_the_statuses_that_move_a_get_are_followed() {
        for status in [301, 302, 303, 307, 308] {
            assert!(is_redirect(StatusCode::from_u16(status).unwrap()));
        }
        for status in [200, 204, 300, 304, 305, 400, 404, 500] {
            assert!(!is_redirect(StatusCode::from_u16(status).unwrap()));
        }
    }

    #[test]
    fn a_body_stops_at_the_cap() {
        let mut body = Vec::new();
        take(&mut body, &vec![b'a'; MAX_BODY - 1], MAX_BODY).unwrap();
        take(&mut body, b"b", MAX_BODY).unwrap();
        assert_eq!(body.len(), MAX_BODY);
        assert_eq!(code(take(&mut body, b"c", MAX_BODY)), "web:too-large");
        // Nothing of the chunk that was refused is kept.
        assert_eq!(body.len(), MAX_BODY);
    }

    #[test]
    fn the_page_crosses_in_camel_case() {
        let page = FetchedPage {
            url: "https://example.com/soup".into(),
            content_type: "text/html; charset=utf-8".into(),
            html: "<p>soup</p>".into(),
        };
        assert_eq!(
            serde_json::to_value(&page).unwrap(),
            serde_json::json!({
                "url": "https://example.com/soup",
                "contentType": "text/html; charset=utf-8",
                "html": "<p>soup</p>",
            })
        );
    }

    #[test]
    fn the_destination_is_one_the_ledger_takes() {
        let ws = Workspace::in_memory();
        ws.write(|ctx| egress::record(ctx.conn, DESTINATION, 42))
            .unwrap();
        let rows = ws
            .read(|conn| egress::query(conn, &egress::EgressQuery::default()))
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(
            (rows[0].destination.as_str(), rows[0].requests),
            (DESTINATION, 1)
        );
        assert_eq!(rows[0].bytes_out, 42);
    }

    #[test]
    fn a_picture_is_a_jpeg_a_png_a_webp_or_an_icon_and_nothing_else() {
        for content_type in [
            "image/jpeg",
            "IMAGE/PNG",
            "image/webp; q=1",
            "image/x-icon",
            "image/vnd.microsoft.icon",
        ] {
            assert!(is_image(content_type), "{content_type:?}");
            assert!(Want::Image.takes(content_type), "{content_type:?}");
            assert!(!Want::Page.takes(content_type), "{content_type:?}");
        }
        for content_type in [
            "image/svg+xml",
            "image/gif",
            "text/html",
            "application/octet-stream",
            "",
        ] {
            assert!(!is_image(content_type), "{content_type:?}");
        }
        assert_eq!(code(Err::<(), _>(Want::Image.mismatch())), "web:not-image");
        assert_eq!(code(Err::<(), _>(Want::Page.mismatch())), "web:not-html");
    }

    #[test]
    fn a_picture_has_its_own_cap_and_its_own_line_in_the_ledger() {
        assert_eq!(Want::Page.cap(), MAX_BODY);
        assert_eq!(Want::Image.cap(), MAX_IMAGE);
        let mut body = Vec::new();
        take(&mut body, &vec![0; MAX_BODY + 1], Want::Image.cap()).unwrap();
        assert_eq!(
            code(take(&mut body, &vec![0; MAX_IMAGE], Want::Image.cap())),
            "web:too-large"
        );

        let ws = Workspace::in_memory();
        ws.write(|ctx| egress::record(ctx.conn, Want::Image.destination(), 7))
            .unwrap();
        let rows = ws
            .read(|conn| egress::query(conn, &egress::EgressQuery::default()))
            .unwrap();
        assert_eq!(rows[0].destination.as_str(), IMAGE_DESTINATION);
    }
}
