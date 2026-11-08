//! Extended public keys (D-201): a Bitcoin account's `xpub`, `ypub` or `zpub`, as a hardware wallet shows it, read
//! by the addresses it makes. Only public derivation happens here (BIP-32's CKDpub on `m/0/i` and `m/1/i` from the
//! account key): no private key is ever parsed, and one pasted is refused before anything else. The key is T3: it
//! lives in the secret store, and the crate never logs or answers it.

use hmac::{Hmac, Mac};
use k256::elliptic_curve::sec1::ToEncodedPoint;
use k256::elliptic_curve::PrimeField;
use k256::{FieldBytes, ProjectivePoint, PublicKey, Scalar};
use ripemd::Ripemd160;
use sha2::{Digest, Sha256, Sha512};

use super::chain::refused;
use crate::error::Result;

/// The output script an account's addresses pay to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Script {
    /// Legacy, `1…` (BIP-44).
    P2pkh,
    /// Nested SegWit, `3…` (BIP-49).
    P2shP2wpkh,
    /// Native SegWit, `bc1q…` (BIP-84).
    P2wpkh,
}

impl Script {
    pub fn of(text: &str) -> Option<Self> {
        match text {
            "p2pkh" => Some(Script::P2pkh),
            "p2sh-p2wpkh" => Some(Script::P2shP2wpkh),
            "p2wpkh" => Some(Script::P2wpkh),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Script::P2pkh => "p2pkh",
            Script::P2shP2wpkh => "p2sh-p2wpkh",
            Script::P2wpkh => "p2wpkh",
        }
    }
}

const XPUB: [u8; 4] = [0x04, 0x88, 0xB2, 0x1E];
const YPUB: [u8; 4] = [0x04, 0x9D, 0x7C, 0xB2];
const ZPUB: [u8; 4] = [0x04, 0xB2, 0x47, 0x46];
/// Private versions: xprv, yprv, zprv, tprv, uprv, vprv.
const PRIVATE: [[u8; 4]; 6] = [
    [0x04, 0x88, 0xAD, 0xE4],
    [0x04, 0x9D, 0x78, 0x78],
    [0x04, 0xB2, 0x43, 0x0C],
    [0x04, 0x35, 0x83, 0x94],
    [0x04, 0x4A, 0x4E, 0x28],
    [0x04, 0x5F, 0x18, 0xBC],
];
/// Testnet public versions: tpub, upub, vpub.
const TESTNET: [[u8; 4]; 3] = [
    [0x04, 0x35, 0x87, 0xCF],
    [0x04, 0x4A, 0x52, 0x62],
    [0x04, 0x5F, 0x1C, 0xF6],
];
/// The prefixes of a pasted private key, refused before it is decoded.
pub const PRIVATE_PREFIXES: [&str; 6] = ["xprv", "yprv", "zprv", "tprv", "uprv", "vprv"];

/// A node of the account's tree: its compressed public key and chain code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Node {
    pub key: [u8; 33],
    pub chain_code: [u8; 32],
}

/// An account key: the node, and the script its version fixes (`None` for an `xpub`, whose script the owner picks).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    pub node: Node,
    pub script: Option<Script>,
}

impl Account {
    /// The script the addresses use: the version's for a `ypub` or `zpub`; for an `xpub` the one given, Native
    /// SegWit when none is.
    pub fn script(&self, given: Option<Script>) -> Script {
        self.script.or(given).unwrap_or(Script::P2wpkh)
    }
}

/// The account key a text holds. A private key is `chain:private-key`; a testnet key or one whose depth is not 3 (an
/// account's, `m/purpose'/coin'/account'`) is `chain:unsupported`; anything else that is not a mainnet extended
/// public key with a good checksum is `chain:invalid-address`.
pub fn parse(text: &str) -> Result<Account> {
    let text = text.trim();
    if PRIVATE_PREFIXES
        .iter()
        .any(|prefix| text.starts_with(prefix))
    {
        return Err(refused("private-key", "a private key"));
    }
    let bytes = bs58::decode(text)
        .with_check(None)
        .into_vec()
        .map_err(|_| refused("invalid-address", "not an extended key"))?;
    if bytes.len() != 78 {
        return Err(refused("invalid-address", "not an extended key"));
    }
    let version: [u8; 4] = bytes[..4].try_into().expect("four bytes");
    if PRIVATE.contains(&version) {
        return Err(refused("private-key", "a private key"));
    }
    if TESTNET.contains(&version) {
        return Err(refused("unsupported", "a testnet key"));
    }
    let script = match version {
        XPUB => None,
        YPUB => Some(Script::P2shP2wpkh),
        ZPUB => Some(Script::P2wpkh),
        _ => return Err(refused("invalid-address", "not an extended public key")),
    };
    if bytes[4] != 3 {
        return Err(refused("unsupported", "not an account key"));
    }
    let node = Node {
        chain_code: bytes[13..45].try_into().expect("32 bytes"),
        key: bytes[45..78].try_into().expect("33 bytes"),
    };
    PublicKey::from_sec1_bytes(&node.key)
        .map_err(|_| refused("invalid-address", "not a public key"))?;
    Ok(Account { node, script })
}

/// The non-hardened child `index` of a node (BIP-32 CKDpub): `IL·G + K`, with `IR` the child's chain code.
pub fn derive(node: &Node, index: u32) -> Result<Node> {
    if index >= 0x8000_0000 {
        return Err(refused("other", "a hardened index"));
    }
    let parent = PublicKey::from_sec1_bytes(&node.key)
        .map_err(|_| refused("invalid-address", "not a public key"))?;
    let mut mac =
        Hmac::<Sha512>::new_from_slice(&node.chain_code).expect("HMAC takes any key length");
    mac.update(&node.key);
    mac.update(&index.to_be_bytes());
    let out = mac.finalize().into_bytes();
    let tweak: Option<Scalar> = Scalar::from_repr(*FieldBytes::from_slice(&out[..32])).into();
    // BIP-32: an IL past the order, or a child at infinity, has no key; the chance is below 2^-127.
    let tweak = tweak.ok_or_else(|| refused("other", "no child at this index"))?;
    let child = (ProjectivePoint::GENERATOR * tweak + parent.to_projective()).to_affine();
    let child =
        PublicKey::from_affine(child).map_err(|_| refused("other", "no child at this index"))?;
    Ok(Node {
        key: child
            .to_encoded_point(true)
            .as_bytes()
            .try_into()
            .expect("a compressed point is 33 bytes"),
        chain_code: out[32..].try_into().expect("32 bytes"),
    })
}

/// RIPEMD160(SHA256(bytes)).
pub fn hash160(bytes: &[u8]) -> [u8; 20] {
    Ripemd160::digest(Sha256::digest(bytes)).into()
}

fn base58check(version: u8, payload: &[u8]) -> String {
    let mut bytes = vec![version];
    bytes.extend_from_slice(payload);
    bs58::encode(bytes).with_check().into_string()
}

/// The mainnet address a compressed public key pays to under a script.
pub fn address(key: &[u8; 33], script: Script) -> String {
    let h160 = hash160(key);
    match script {
        Script::P2pkh => base58check(0x00, &h160),
        Script::P2shP2wpkh => {
            let mut redeem = vec![0x00, 0x14];
            redeem.extend_from_slice(&h160);
            base58check(0x05, &hash160(&redeem))
        }
        Script::P2wpkh => {
            bech32::segwit::encode_v0(bech32::hrp::BC, &h160).expect("a 20-byte program encodes")
        }
    }
}

/// The BIPs' test vectors, made at test time from the mnemonic BIP-49 and BIP-84 publish them for, so no extended
/// key sits in the source: the seed (BIP-39, PBKDF2-HMAC-SHA512), the master key and the hardened account path
/// (BIP-32's CKDpriv), and the account's public key encoded under a version. Private derivation exists only here.
#[cfg(test)]
pub mod vectors {
    use super::*;

    /// "abandon" eleven times, then "about", with no passphrase.
    pub const MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    /// BIP-84's published public key at m/84'/0'/0'/0/0.
    pub const BIP84_RECEIVE_KEY: &str =
        "0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c";

    pub fn hex(text: &str) -> Vec<u8> {
        (0..text.len())
            .step_by(2)
            .map(|at| u8::from_str_radix(&text[at..at + 2], 16).unwrap())
            .collect()
    }

    fn hmac(key: &[u8], parts: &[&[u8]]) -> [u8; 64] {
        let mut mac = Hmac::<Sha512>::new_from_slice(key).unwrap();
        for part in parts {
            mac.update(part);
        }
        mac.finalize().into_bytes().into()
    }

    fn seed() -> [u8; 64] {
        // PBKDF2 with one block: U1 = HMAC(P, salt ‖ 1), Ui = HMAC(P, Ui-1), the block their XOR.
        let password = MNEMONIC.as_bytes();
        let mut u = hmac(password, &[b"mnemonic", &1u32.to_be_bytes()]);
        let mut out = u;
        for _ in 1..2048 {
            u = hmac(password, &[&u]);
            for (o, b) in out.iter_mut().zip(u.iter()) {
                *o ^= b;
            }
        }
        out
    }

    fn scalar(bytes: &[u8]) -> Scalar {
        Option::from(Scalar::from_repr(*FieldBytes::from_slice(bytes))).unwrap()
    }

    fn public(key: &Scalar) -> [u8; 33] {
        (ProjectivePoint::GENERATOR * key)
            .to_affine()
            .to_encoded_point(true)
            .as_bytes()
            .try_into()
            .unwrap()
    }

    /// The account key m/purpose'/coin'/0' of the mnemonic, as a 78-byte public extended key under the version.
    pub fn account_key(version: [u8; 4], purpose: u32, coin: u32) -> String {
        let master = hmac(b"Bitcoin seed", &[&seed()]);
        let (mut key, mut chain_code) = (scalar(&master[..32]), master[32..].to_vec());
        // CKDpriv at a hardened index: IL + k, with IR the child's chain code
        let harden = |key: &mut Scalar, chain_code: &mut Vec<u8>, index: u32| {
            let index = index | 0x8000_0000;
            let out = hmac(chain_code, &[&[0], &key.to_repr(), &index.to_be_bytes()]);
            *key += scalar(&out[..32]);
            *chain_code = out[32..].to_vec();
        };
        harden(&mut key, &mut chain_code, purpose);
        harden(&mut key, &mut chain_code, coin);
        let parent = public(&key);
        harden(&mut key, &mut chain_code, 0);
        let mut bytes = version.to_vec();
        bytes.push(3);
        bytes.extend_from_slice(&hash160(&parent)[..4]);
        bytes.extend_from_slice(&0x8000_0000u32.to_be_bytes());
        bytes.extend_from_slice(&chain_code);
        bytes.extend_from_slice(&public(&key));
        bs58::encode(bytes).with_check().into_string()
    }

    /// BIP-84's account key, a mainnet zpub.
    pub fn zpub() -> String {
        account_key(ZPUB, 84, 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code_of(error: crate::error::EdenError) -> String {
        let message = error.to_string();
        let rest = message.split("chain:").nth(1).unwrap_or(&message);
        rest.split(':').next().unwrap_or(rest).to_string()
    }

    /// The first receive (`m/…/0/0`) and change (`m/…/1/0`) addresses of an account key.
    fn first(account: &Account, script: Script) -> (String, String) {
        let at = |chain| {
            let node = derive(&derive(&account.node, chain).unwrap(), 0).unwrap();
            address(&node.key, script)
        };
        (at(0), at(1))
    }

    /// The account key re-encoded under other version bytes or depth, with a fresh checksum.
    fn reencode(text: &str, version: Option<[u8; 4]>, depth: Option<u8>) -> String {
        let mut bytes = bs58::decode(text).with_check(None).into_vec().unwrap();
        if let Some(version) = version {
            bytes[..4].copy_from_slice(&version);
        }
        if let Some(depth) = depth {
            bytes[4] = depth;
        }
        bs58::encode(bytes).with_check().into_string()
    }

    use super::vectors::{account_key, hex, BIP84_RECEIVE_KEY};

    #[test]
    fn derives_the_bip_vectors() {
        let bip84_zpub = account_key(ZPUB, 84, 0);
        let bip49_ypub = account_key(YPUB, 49, 0);
        let bip44_xpub = account_key(XPUB, 44, 0);

        // BIP-84, Native SegWit: the published m/84'/0'/0'/0/0 and m/84'/0'/0'/1/0 addresses.
        let zpub = parse(&bip84_zpub).unwrap();
        assert_eq!(zpub.script, Some(Script::P2wpkh));
        assert_eq!(
            zpub.script(Some(Script::P2pkh)),
            Script::P2wpkh,
            "a zpub's script is fixed"
        );
        assert_eq!(
            first(&zpub, zpub.script(None)),
            (
                "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu".to_string(),
                "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el".to_string()
            )
        );

        // BIP-49, Nested SegWit: its vector is on testnet (m/49'/1'/0'); read as a mainnet ypub, the account makes
        // the published receive key and the published address bytes, HASH160(0x0014 ‖ HASH160(key)).
        let bip49 = parse(&account_key(YPUB, 49, 1)).unwrap();
        let receive = derive(&derive(&bip49.node, 0).unwrap(), 0).unwrap();
        assert_eq!(
            receive.key.to_vec(),
            hex("03a1af804ac108a8a51782198c2d034b28bf90c8803f5a53f76276fa69a4eae77f")
        );
        let address_bytes = bs58::decode(address(&receive.key, Script::P2shP2wpkh))
            .with_check(None)
            .into_vec()
            .unwrap();
        assert_eq!(address_bytes[0], 0x05);
        assert_eq!(
            address_bytes[1..].to_vec(),
            hex("336caa13e08b96080a32b5d818d59b4ab3b36742")
        );
        let ypub = parse(&bip49_ypub).unwrap();
        assert_eq!(ypub.script, Some(Script::P2shP2wpkh));
        assert!(first(&ypub, ypub.script(None)).0.starts_with('3'));

        // Legacy: the published BIP-84 receive key's P2PKH address is base58check of 0x00 ‖ HASH160(key), the same
        // HASH160 its published bech32 address carries. BIP-44 itself publishes no vectors.
        let key: [u8; 33] = hex(BIP84_RECEIVE_KEY).try_into().unwrap();
        assert_eq!(
            address(&key, Script::P2wpkh),
            "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"
        );
        let legacy = bs58::decode(address(&key, Script::P2pkh))
            .with_check(None)
            .into_vec()
            .unwrap();
        assert_eq!(legacy[0], 0x00);
        assert_eq!(legacy[1..], hash160(&key));

        // BIP-44's account key is an xpub: it derives the script it is given, Native SegWit by default.
        let xpub = parse(&bip44_xpub).unwrap();
        assert_eq!(xpub.script, None);
        assert!(first(&xpub, Script::P2pkh).0.starts_with('1'));
        assert!(first(&xpub, Script::P2pkh).1.starts_with('1'));
        assert_eq!(xpub.script(None), Script::P2wpkh);
        assert!(first(&xpub, Script::P2wpkh).0.starts_with("bc1q"));
        assert!(first(&xpub, Script::P2shP2wpkh).0.starts_with('3'));

        // Refusals.
        for version in PRIVATE {
            let text = reencode(&bip84_zpub, Some(version), None);
            assert_eq!(
                code_of(parse(&text).unwrap_err()),
                "private-key",
                "{}",
                &text[..4]
            );
        }
        for prefix in PRIVATE_PREFIXES {
            let text = format!("{prefix}{}", &bip84_zpub[4..]);
            assert_eq!(
                code_of(parse(&text).unwrap_err()),
                "private-key",
                "{prefix}"
            );
        }
        for version in TESTNET {
            let text = reencode(&bip84_zpub, Some(version), None);
            assert_eq!(
                code_of(parse(&text).unwrap_err()),
                "unsupported",
                "{}",
                &text[..4]
            );
        }
        for depth in [0, 2, 4] {
            let text = reencode(&bip84_zpub, None, Some(depth));
            assert_eq!(
                code_of(parse(&text).unwrap_err()),
                "unsupported",
                "depth {depth}"
            );
        }
        let mut bad = bip84_zpub.clone();
        let last = bad.pop().unwrap();
        bad.push(if last == 't' { 'u' } else { 't' });
        assert_eq!(code_of(parse(&bad).unwrap_err()), "invalid-address");
        assert_eq!(
            code_of(parse("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu").unwrap_err()),
            "invalid-address"
        );
        assert_eq!(code_of(parse("").unwrap_err()), "invalid-address");
    }
}
