//! The one `GET` Orchard's crypto reads make (D-204): Coinbase's API and price feed, Blockstream's Esplora and
//! Blockscout. A `Fetch` answers the status and the JSON body: `reqwest` in the app, a scripted fake in the tests. A
//! request that never got an answer is `<prefix>:network`, and a 2xx answer that is not JSON reads as `Value::Null`,
//! which each caller turns into its own `provider-down`.

use std::future::Future;
use std::time::Duration;

use serde_json::Value;

use crate::error::{EdenError, Result};
use crate::substrate::{egress, Workspace};

/// Each request's deadline, as the Plaid transport's.
const TIMEOUT: Duration = Duration::from_secs(30);

/// One `GET`, with an optional bearer token in the `Authorization` header.
pub trait Fetch: Send + Sync {
    fn get(
        &self,
        url: &str,
        bearer: Option<&str>,
    ) -> impl Future<Output = Result<(u16, Value)>> + Send;
}

/// The egress ledger's destination for a URL: one name per host, so Settings → Privacy shows who was asked.
pub fn destination(url: &str) -> Option<&'static str> {
    let host = url.strip_prefix("https://")?.split(['/', '?']).next()?;
    match host {
        "api.coinbase.com" => Some(super::coinbase::DESTINATION),
        "blockstream.info" => Some("blockstream"),
        "eth.blockscout.com" => Some("blockscout"),
        _ => None,
    }
}

/// The real fetch: `reqwest` over the crate's rustls, https only, every request counted in the egress ledger. The
/// bearer is a header and is never counted (D-71), and only the three hosts above are ever asked.
pub struct HttpGet<'a> {
    client: reqwest::Client,
    workspace: &'a Workspace,
    /// The error prefix a failed request carries: `coinbase` or `chain`.
    prefix: &'static str,
}

impl<'a> HttpGet<'a> {
    pub fn new(workspace: &'a Workspace, prefix: &'static str) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .https_only(true)
            .build()
            .map_err(|_| refused(prefix, "network", "no client"))?;
        Ok(Self {
            client,
            workspace,
            prefix,
        })
    }
}

fn refused(prefix: &str, code: &str, detail: &str) -> EdenError {
    EdenError::Refused(format!("{prefix}:{code}: {detail}"))
}

impl Fetch for HttpGet<'_> {
    async fn get(&self, url: &str, bearer: Option<&str>) -> Result<(u16, Value)> {
        let destination = destination(url)
            .ok_or_else(|| refused(self.prefix, "other", "not a host Orchard reads"))?;
        if let Err(e) = self
            .workspace
            .write(|ctx| egress::record(ctx.conn, destination, url.len() as u64))
        {
            log::warn!("The egress ledger did not take a {destination} request: {e}");
        }
        let mut request = self.client.get(url).header("accept", "application/json");
        if let Some(token) = bearer {
            request = request.bearer_auth(token);
        }
        let response = request.send().await.map_err(|e| {
            refused(
                self.prefix,
                "network",
                if e.is_timeout() {
                    "timed out"
                } else {
                    "no answer"
                },
            )
        })?;
        let status = response.status().as_u16();
        let answer = response.json::<Value>().await.unwrap_or(Value::Null);
        Ok((status, answer))
    }
}

#[cfg(test)]
pub mod tests {
    use std::collections::VecDeque;
    use std::sync::Mutex;

    use super::*;

    /// A fake fetch: answers each request in turn from its script, and keeps the URL and bearer it was sent. Status 0
    /// is a request that never got an answer.
    #[derive(Default)]
    pub struct Script {
        replies: Mutex<VecDeque<(String, u16, Value)>>,
        sent: Mutex<Vec<(String, Option<String>)>>,
        pub prefix: &'static str,
    }

    impl Script {
        pub fn new(prefix: &'static str, replies: Vec<(&str, u16, Value)>) -> Self {
            Self {
                replies: Mutex::new(
                    replies
                        .into_iter()
                        .map(|(url, status, answer)| (url.to_string(), status, answer))
                        .collect(),
                ),
                sent: Mutex::default(),
                prefix,
            }
        }

        pub fn sent(&self) -> Vec<(String, Option<String>)> {
            self.sent.lock().unwrap().clone()
        }

        pub fn left(&self) -> usize {
            self.replies.lock().unwrap().len()
        }
    }

    impl Fetch for &Script {
        async fn get(&self, url: &str, bearer: Option<&str>) -> Result<(u16, Value)> {
            self.sent
                .lock()
                .unwrap()
                .push((url.to_string(), bearer.map(str::to_string)));
            let (expected, status, answer) = self
                .replies
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or_else(|| panic!("a scripted reply for {url}"));
            assert_eq!(url, expected, "the next request");
            if status == 0 {
                return Err(refused(self.prefix, "network", "offline"));
            }
            Ok((status, answer))
        }
    }

    /// The device's secrets, in memory.
    #[derive(Default)]
    pub struct Memory(Mutex<std::collections::HashMap<String, String>>);

    impl Memory {
        pub fn is_empty(&self) -> bool {
            self.0.lock().unwrap().is_empty()
        }
    }

    impl crate::db::secret_store::SecretStore for Memory {
        fn get(&self, name: &str) -> Result<Option<String>> {
            Ok(self.0.lock().unwrap().get(name).cloned())
        }
        fn set(&self, name: &str, value: &str) -> Result<()> {
            self.0
                .lock()
                .unwrap()
                .insert(name.to_string(), value.to_string());
            Ok(())
        }
        fn delete(&self, name: &str) -> Result<bool> {
            Ok(self.0.lock().unwrap().remove(name).is_some())
        }
    }

    #[test]
    fn each_host_has_its_destination() {
        assert_eq!(
            destination("https://api.coinbase.com/v2/accounts?limit=100"),
            Some("coinbase")
        );
        assert_eq!(
            destination("https://blockstream.info/api/address/bc1q"),
            Some("blockstream")
        );
        assert_eq!(
            destination("https://eth.blockscout.com/api/v2/addresses/0x"),
            Some("blockscout")
        );
        assert_eq!(destination("https://api.coinbase.com.evil.example/x"), None);
        assert_eq!(destination("http://api.coinbase.com/v2/accounts"), None);
    }
}
