//! Watched cold wallets (D-201): one Bitcoin or Ethereum address, or a Bitcoin extended public key, read from a
//! public explorer once a local day. Bitcoin is Blockstream's Esplora, confirmed balance only; Ether is Blockscout,
//! the coin alone, no tokens. Requests run one after another and a 429 stops the read. Quantities are made from the
//! explorers' integers with string arithmetic (sats to 8 places, wei to 18), never a float.
//!
//! A failure is `EdenError::Refused("chain:<code>: <detail>")`, with the code one of `invalid-address`,
//! `private-key`, `unsupported`, `not-found`, `too-many`, `rate-limited`, `provider-down`, `network` and `other`.
//! Logs carry the code only, never an address or a key.

use serde_json::Value;

use super::fetch::Fetch;
use super::xpub::{self, Script};
use crate::db::secret_store::SecretStore;
use crate::error::{EdenError, Result};
use crate::substrate::ids;

pub const BLOCKSTREAM: &str = "https://blockstream.info/api";
pub const BLOCKSCOUT: &str = "https://eth.blockscout.com/api/v2";
/// Unused addresses in a row that end an extended key's chain (BIP-44's gap limit).
pub const GAP: u32 = 20;
/// The most addresses read on one chain of an extended key.
pub const MAX_PER_CHAIN: u32 = 1000;

pub fn refused(code: &str, detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("chain:{code}: {detail}"))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Chain {
    Bitcoin,
    Ethereum,
}

impl Chain {
    pub fn of(text: &str) -> Result<Self> {
        match text {
            "bitcoin" => Ok(Chain::Bitcoin),
            "ethereum" => Ok(Chain::Ethereum),
            _ => Err(refused("other", "not a chain Orchard reads")),
        }
    }
}

/// The secret that holds a watched asset's extended key. The id must be the asset's ULID.
pub fn xpub_secret(asset_id: &str) -> Result<String> {
    if !ids::is_ulid(asset_id) {
        return Err(refused("other", "not an asset id"));
    }
    Ok(format!("crypto-xpub-{}", asset_id.to_ascii_lowercase()))
}

/// The asset's extended key on this device, or `chain:not-found` (an asset that came from a bundle has none).
pub fn stored_xpub(secrets: &dyn SecretStore, asset_id: &str) -> Result<String> {
    secrets
        .get(&xpub_secret(asset_id)?)?
        .ok_or_else(|| refused("not-found", "no extended key for this asset on this device"))
}

fn invalid() -> EdenError {
    refused("invalid-address", "not an address on this chain")
}

/// The address in its normal form, or `chain:invalid-address`. Bitcoin: a mainnet P2PKH or P2SH address as given,
/// or a bech32 v0 or bech32m v1 one in lowercase. Ethereum: `0x` and 40 hex digits, in lowercase (no EIP-55 check).
pub fn check_address(chain: Chain, text: &str) -> Result<String> {
    let text = text.trim();
    match chain {
        Chain::Ethereum => {
            let hex = text.strip_prefix("0x").ok_or_else(invalid)?;
            if hex.len() != 40 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(invalid());
            }
            Ok(format!("0x{}", hex.to_ascii_lowercase()))
        }
        Chain::Bitcoin => {
            let lower = text.to_ascii_lowercase();
            if lower.starts_with("bc1") {
                if text != lower && text != text.to_ascii_uppercase() {
                    return Err(invalid());
                }
                let (hrp, version, _) = bech32::segwit::decode(&lower).map_err(|_| invalid())?;
                let known =
                    version == bech32::segwit::VERSION_0 || version == bech32::segwit::VERSION_1;
                if hrp != bech32::hrp::BC || !known {
                    return Err(invalid());
                }
                return Ok(lower);
            }
            let bytes = bs58::decode(text)
                .with_check(None)
                .into_vec()
                .map_err(|_| invalid())?;
            if bytes.len() != 21 || !matches!(bytes[0], 0x00 | 0x05) {
                return Err(invalid());
            }
            Ok(text.to_string())
        }
    }
}

/// An integer amount in the smallest unit as a decimal of the coin, exact: `150000000` sats is `"1.5"` BTC.
pub fn units(digits: &str, places: usize) -> Option<String> {
    if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let digits = digits.trim_start_matches('0');
    let padded = format!("{digits:0>width$}", width = places + 1);
    let (whole, fraction) = padded.split_at(padded.len() - places);
    let fraction = fraction.trim_end_matches('0');
    Some(if fraction.is_empty() {
        whole.to_string()
    } else {
        format!("{whole}.{fraction}")
    })
}

/// One explorer read: the JSON answer, or the failure for its status.
async fn get<F: Fetch>(fetch: &F, url: &str) -> Result<std::result::Result<Value, u16>> {
    let (status, answer) = fetch.get(url, None).await?;
    if !(200..300).contains(&status) {
        return Ok(Err(status));
    }
    if !answer.is_object() {
        return Err(refused("provider-down", "an answer that is not JSON"));
    }
    Ok(Ok(answer))
}

fn failure(status: u16) -> EdenError {
    let code = match status {
        429 => "rate-limited",
        500.. => "provider-down",
        _ => "other",
    };
    log::warn!("A chain read failed: {code}");
    refused(code, format!("HTTP {status}"))
}

/// A Bitcoin address's confirmed balance in sats, and whether it was ever used (any chain or mempool transaction).
async fn bitcoin<F: Fetch>(fetch: &F, address: &str) -> Result<(u64, bool)> {
    let answer = get(fetch, &format!("{BLOCKSTREAM}/address/{address}"))
        .await?
        .map_err(failure)?;
    let stat = |group: &str, name: &str| answer[group][name].as_u64();
    let (Some(funded), Some(spent)) = (
        stat("chain_stats", "funded_txo_sum"),
        stat("chain_stats", "spent_txo_sum"),
    ) else {
        return Err(refused(
            "provider-down",
            "an answer without the address's stats",
        ));
    };
    let used = stat("chain_stats", "tx_count").unwrap_or(0) > 0
        || stat("mempool_stats", "tx_count").unwrap_or(0) > 0;
    Ok((funded.saturating_sub(spent), used))
}

/// One watched address's quantity, as an exact decimal of the coin.
pub async fn read_address<F: Fetch>(fetch: &F, chain: Chain, address: &str) -> Result<String> {
    let address = check_address(chain, address)?;
    match chain {
        Chain::Bitcoin => {
            let (sats, _) = bitcoin(fetch, &address).await?;
            Ok(units(&sats.to_string(), 8).expect("digits"))
        }
        Chain::Ethereum => match get(fetch, &format!("{BLOCKSCOUT}/addresses/{address}")).await? {
            Err(404) => Ok("0".to_string()),
            Err(status) => Err(failure(status)),
            Ok(answer) => match &answer["coin_balance"] {
                Value::Null => Ok("0".to_string()),
                Value::String(wei) => units(wei, 18)
                    .ok_or_else(|| refused("provider-down", "a balance that is not an integer")),
                _ => Err(refused("provider-down", "a balance that is not an integer")),
            },
        },
    }
}

/// An extended key's confirmed balance: its receive and change chains each scanned from index 0 until `GAP` unused
/// addresses in a row, the balances summed.
pub async fn read_xpub<F: Fetch>(fetch: &F, key: &str, script: Option<Script>) -> Result<String> {
    let account = xpub::parse(key)?;
    let script = account.script(script);
    let mut total: u64 = 0;
    for branch in [0, 1] {
        let node = xpub::derive(&account.node, branch)?;
        let mut unused = 0;
        let mut index = 0;
        while unused < GAP {
            if index == MAX_PER_CHAIN {
                return Err(refused("too-many", "more addresses than Orchard reads"));
            }
            let child = xpub::derive(&node, index)?;
            let (sats, used) = bitcoin(fetch, &xpub::address(&child.key, script)).await?;
            total = total.saturating_add(sats);
            unused = if used { 0 } else { unused + 1 };
            index += 1;
        }
    }
    Ok(units(&total.to_string(), 8).expect("digits"))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::fetch::tests::{Memory, Script as Fake};
    use super::super::xpub::vectors;
    use super::*;

    fn code_of(error: EdenError) -> String {
        let message = error.to_string();
        let rest = message.split("chain:").nth(1).unwrap_or(&message);
        rest.split(':').next().unwrap_or(rest).to_string()
    }

    #[test]
    fn checks_addresses() {
        use Chain::{Bitcoin, Ethereum};
        // The base58 addresses are made at test time from BIP-84's published receive key, so none sits in the source.
        let key: [u8; 33] = vectors::hex(vectors::BIP84_RECEIVE_KEY).try_into().unwrap();
        let p2pkh = xpub::address(&key, Script::P2pkh);
        let p2sh = xpub::address(&key, Script::P2shP2wpkh);
        let bech32 = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
        let good = [
            (Bitcoin, p2pkh.clone(), p2pkh.clone()),
            (Bitcoin, format!(" {p2sh} "), p2sh.clone()),
            (Bitcoin, bech32.to_string(), bech32.to_string()),
            (Bitcoin, bech32.to_uppercase(), bech32.to_string()),
            // BIP-350's bech32m v1 vector.
            (
                Bitcoin,
                "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0".to_string(),
                "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0".to_string(),
            ),
            (
                Ethereum,
                "0x52908400098527886E0F7030069857D2E4169EE7".to_string(),
                "0x52908400098527886e0f7030069857d2e4169ee7".to_string(),
            ),
        ];
        for (chain, text, expected) in good {
            assert_eq!(check_address(chain, &text).unwrap(), expected, "{text}");
        }
        // The last character swapped for another, so the checksum no longer holds.
        let swapped = |text: &str, to: char, or: char| {
            let mut text = text.to_string();
            let last = text.pop().unwrap();
            text.push(if last == to { or } else { to });
            text
        };
        // A testnet P2SH address: the same script hash under version 0xC4.
        let p2sh_bytes = bs58::decode(&p2sh).with_check(None).into_vec().unwrap();
        let testnet_p2sh = bs58::encode([&[0xC4], &p2sh_bytes[1..]].concat())
            .with_check()
            .into_string();
        let mixed = format!("{}{}", &bech32[..39], bech32[39..].to_uppercase());
        let built = [
            // A bad checksum, each shape.
            (Bitcoin, swapped(&p2pkh, 'B', 'C')),
            (Bitcoin, swapped(bech32, 'v', 'w')),
            // Mixed case.
            (Bitcoin, mixed),
            // Testnet.
            (Bitcoin, testnet_p2sh),
        ];
        for (chain, text) in built {
            assert_eq!(
                code_of(check_address(chain, &text).unwrap_err()),
                "invalid-address",
                "{text}"
            );
        }
        let bad = [
            // Testnet and the wrong HRP.
            (Bitcoin, "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"),
            (Bitcoin, "ltc1qg82hsrqmxq7w4qp7vp6g9q2qxq6jghvp0m9k8a"),
            // A v0 program with a bech32m checksum (BIP-350's invalid list).
            (Bitcoin, "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh"),
            // A v2 address.
            (Bitcoin, "bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs"),
            // The wrong chain.
            (Bitcoin, "0x52908400098527886e0f7030069857d2e4169ee7"),
            (Ethereum, "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"),
            (Ethereum, "0x52908400098527886e0f7030069857d2e4169ee"),
            (Ethereum, "0x52908400098527886e0f7030069857d2e4169eeg"),
            (Ethereum, "52908400098527886e0f7030069857d2e4169ee7"),
            (Bitcoin, ""),
        ];
        for (chain, text) in bad {
            assert_eq!(
                code_of(check_address(chain, text).unwrap_err()),
                "invalid-address",
                "{text}"
            );
        }
        assert_eq!(code_of(Chain::of("dogecoin").unwrap_err()), "other");
        assert_eq!(units("150000000", 8).as_deref(), Some("1.5"));
        assert_eq!(units("0", 8).as_deref(), Some("0"));
        assert_eq!(units("1", 18).as_deref(), Some("0.000000000000000001"));
        assert_eq!(units("12.5", 8), None);
    }

    fn stats(funded: u64, spent: u64, txs: u64, mempool_txs: u64) -> Value {
        json!({
            "address": "…",
            "chain_stats": { "funded_txo_count": txs, "funded_txo_sum": funded, "spent_txo_count": 0, "spent_txo_sum": spent, "tx_count": txs },
            "mempool_stats": { "funded_txo_count": 0, "funded_txo_sum": 7, "spent_txo_count": 0, "spent_txo_sum": 0, "tx_count": mempool_txs },
        })
    }

    fn addresses(branch: u32, count: u32) -> Vec<String> {
        let account = xpub::parse(&vectors::zpub()).unwrap();
        let node = xpub::derive(&account.node, branch).unwrap();
        (0..count)
            .map(|index| {
                let child = xpub::derive(&node, index).unwrap();
                format!(
                    "{BLOCKSTREAM}/address/{}",
                    xpub::address(&child.key, Script::P2wpkh)
                )
            })
            .collect()
    }

    #[tokio::test]
    async fn scans_to_the_gap_limit() {
        // Single addresses: confirmed sats only, as BTC; wei as ETH; Blockscout's 404 and null are zero.
        let btc = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
        let eth = "0x52908400098527886e0f7030069857d2e4169ee7";
        let fake = Fake::new(
            "chain",
            vec![
                (
                    &format!("{BLOCKSTREAM}/address/{btc}"),
                    200,
                    stats(150_000_000, 100_000_000, 3, 1),
                ),
                (
                    &format!("{BLOCKSCOUT}/addresses/{eth}"),
                    200,
                    json!({ "coin_balance": "1500000000000000000" }),
                ),
                (
                    &format!("{BLOCKSCOUT}/addresses/{eth}"),
                    200,
                    json!({ "coin_balance": null }),
                ),
                (
                    &format!("{BLOCKSCOUT}/addresses/{eth}"),
                    404,
                    json!({ "message": "Not found" }),
                ),
            ],
        );
        assert_eq!(
            read_address(&&fake, Chain::Bitcoin, btc).await.unwrap(),
            "0.5"
        );
        assert_eq!(
            read_address(&&fake, Chain::Ethereum, eth).await.unwrap(),
            "1.5"
        );
        assert_eq!(
            read_address(&&fake, Chain::Ethereum, eth).await.unwrap(),
            "0"
        );
        assert_eq!(
            read_address(&&fake, Chain::Ethereum, eth).await.unwrap(),
            "0"
        );
        assert_eq!(fake.left(), 0);

        let zpub = vectors::zpub();
        // An extended key: the receive chain has a used address at 0 and a mempool-only one at 2, so it stops after
        // index 22; the change chain has one used at 0 and stops after 20 more.
        let receive = addresses(0, 23);
        let change = addresses(1, 21);
        let mut replies: Vec<(&str, u16, Value)> = Vec::new();
        for (index, url) in receive.iter().enumerate() {
            let answer = match index {
                0 => stats(100_000, 50_000, 2, 0),
                2 => stats(0, 0, 0, 1),
                _ => stats(0, 0, 0, 0),
            };
            replies.push((url, 200, answer));
        }
        for (index, url) in change.iter().enumerate() {
            let answer = if index == 0 {
                stats(12_345, 0, 1, 0)
            } else {
                stats(0, 0, 0, 0)
            };
            replies.push((url, 200, answer));
        }
        let fake = Fake::new("chain", replies);
        assert_eq!(read_xpub(&&fake, &zpub, None).await.unwrap(), "0.00062345");
        assert_eq!(fake.left(), 0, "every scripted address read, and no more");

        // Never used: 20 a chain, zero.
        let mut replies: Vec<(&str, u16, Value)> = Vec::new();
        let (receive, change) = (addresses(0, 20), addresses(1, 20));
        for url in receive.iter().chain(change.iter()) {
            replies.push((url, 200, stats(0, 0, 0, 0)));
        }
        let fake = Fake::new("chain", replies);
        assert_eq!(read_xpub(&&fake, &zpub, None).await.unwrap(), "0");

        // More than 1000 used addresses on a chain.
        let receive = addresses(0, MAX_PER_CHAIN);
        let fake = Fake::new(
            "chain",
            receive
                .iter()
                .map(|url| (url.as_str(), 200, stats(1, 0, 1, 0)))
                .collect(),
        );
        assert_eq!(
            code_of(read_xpub(&&fake, &zpub, None).await.unwrap_err()),
            "too-many"
        );

        // A 429 stops the read; a 5xx and a non-JSON answer are provider-down; no answer is network.
        let first = addresses(0, 1);
        for (status, answer, expected) in [
            (429, json!({}), "rate-limited"),
            (502, json!({}), "provider-down"),
            (200, Value::Null, "provider-down"),
            (0, Value::Null, "network"),
        ] {
            let fake = Fake::new("chain", vec![(first[0].as_str(), status, answer)]);
            assert_eq!(
                code_of(read_xpub(&&fake, &zpub, None).await.unwrap_err()),
                expected,
                "{status}"
            );
            assert_eq!(fake.left(), 0);
        }

        // No key on this device.
        let id = ids::new_id();
        assert_eq!(
            code_of(stored_xpub(&Memory::default(), &id).unwrap_err()),
            "not-found"
        );
        assert_eq!(
            code_of(xpub_secret("../plaid-secret").unwrap_err()),
            "other"
        );
        assert_eq!(
            xpub_secret(&id).unwrap(),
            format!("crypto-xpub-{}", id.to_ascii_lowercase())
        );
    }
}
