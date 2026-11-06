//! The sealed bundle: an export zip encrypted whole under a passphrase (docs/engineering/data-layer.md, "Sealed
//! bundle").
//!
//! The file is a 57-byte header and then the zip, encrypted with XChaCha20-Poly1305 in the STREAM construction (BE32):
//! 64 KiB plaintext chunks, each followed by its 16-byte tag, the last one sealed as last so a cut-off file does not
//! open. The key is derived from the passphrase with Argon2id, and the whole header is the associated data of every
//! chunk, so an altered header fails like a wrong passphrase. All integers are little-endian.
//!
//! | Bytes    | Holds                                 |
//! |----------|---------------------------------------|
//! | `0..8`   | the magic `EDENLOCK`                  |
//! | `8`      | the format version, `1`               |
//! | `9`      | the KDF, `1` (Argon2id, version 0x13) |
//! | `10..14` | `m_kib`, u32                          |
//! | `14..18` | `t`, u32                              |
//! | `18..22` | `p`, u32                              |
//! | `22..38` | the salt, 16 bytes                    |
//! | `38..57` | the STREAM nonce, 19 bytes            |
//!
//! The passphrase is its exact UTF-8 bytes, neither trimmed nor normalised. It and the derived key never appear in an
//! error or a log line.

use std::io::Write;

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::generic_array::GenericArray;
use chacha20poly1305::aead::rand_core::RngCore;
use chacha20poly1305::aead::stream::{DecryptorBE32, EncryptorBE32};
use chacha20poly1305::aead::{KeyInit, OsRng, Payload};
use chacha20poly1305::XChaCha20Poly1305;
use zeroize::Zeroizing;

use super::bundle::bundle_error;
use crate::error::Result;

pub(crate) const MAGIC: &[u8; 8] = b"EDENLOCK";
const VERSION: u8 = 1;
const KDF_ARGON2ID: u8 = 1;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 19;
const HEADER_LEN: usize = 8 + 1 + 1 + 4 + 4 + 4 + SALT_LEN + NONCE_LEN;
const CHUNK: usize = 64 * 1024;
const TAG_LEN: usize = 16;
const MIN_PASSPHRASE: usize = 8;

/// The most a header may ask of `open`, so a crafted file cannot make it allocate gigabytes or spin for minutes.
const MAX_M_KIB: u32 = 262_144;
const MAX_T: u32 = 10;
const MAX_P: u32 = 4;

/// Argon2id's cost: memory in KiB, passes and lanes.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct KdfParams {
    pub m_kib: u32,
    pub t: u32,
    pub p: u32,
}

/// 64 MiB, three passes, one lane: about a second on a phone, and the same on every device that opens the file.
const DEFAULT_PARAMS: KdfParams = KdfParams {
    m_kib: 65_536,
    t: 3,
    p: 1,
};

/// Whether a file that starts with `prefix` is a sealed bundle. The magic decides, never the extension.
pub(crate) fn is_sealed(prefix: &[u8]) -> bool {
    prefix.starts_with(MAGIC)
}

/// Refuses a passphrase under 8 characters, behind the interface's own check.
pub(crate) fn check_passphrase(passphrase: &str) -> Result<()> {
    if passphrase.chars().count() < MIN_PASSPHRASE {
        return Err(bundle_error(
            "passphrase-short",
            "a passphrase has at least 8 characters",
        ));
    }
    Ok(())
}

/// Seals `plain` under `passphrase` into `out`, with the default cost. Test builds seal with `TEST_PARAMS`, so the
/// bundle tests do not spend seconds in Argon2; `open` reads the cost from the header either way.
pub(crate) fn seal(plain: &[u8], passphrase: &str, out: &mut impl Write) -> Result<()> {
    #[cfg(not(test))]
    let params = DEFAULT_PARAMS;
    #[cfg(test)]
    let params = TEST_PARAMS;
    seal_with(params, plain, passphrase, out)
}

pub(crate) fn seal_with(
    params: KdfParams,
    plain: &[u8],
    passphrase: &str,
    out: &mut impl Write,
) -> Result<()> {
    check_passphrase(passphrase)?;
    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);

    let header = header(params, &salt, &nonce);
    let key = derive(params, passphrase, &salt)?;
    let cipher = XChaCha20Poly1305::new_from_slice(key.as_slice())
        .map_err(|_| bundle_error("unreadable", "the derived key has the wrong length"))?;
    let mut encryptor = EncryptorBE32::from_aead(cipher, GenericArray::from_slice(&nonce));
    let failed = |_| bundle_error("unreadable", "the bundle could not be sealed");

    out.write_all(&header)?;
    let mut chunks = plain.chunks(CHUNK).peekable();
    if chunks.peek().is_none() {
        let last = encryptor
            .encrypt_last(Payload {
                msg: &[],
                aad: &header,
            })
            .map_err(failed)?;
        out.write_all(&last)?;
        return Ok(());
    }
    while let Some(chunk) = chunks.next() {
        let payload = Payload {
            msg: chunk,
            aad: &header,
        };
        if chunks.peek().is_none() {
            out.write_all(&encryptor.encrypt_last(payload).map_err(failed)?)?;
            break;
        }
        out.write_all(&encryptor.encrypt_next(payload).map_err(failed)?)?;
    }
    Ok(())
}

/// The zip inside a sealed bundle. A wrong passphrase or an altered header fails the first chunk, `bundle:passphrase`;
/// a later chunk that fails, or a missing last one, is `bundle:unreadable`. A header that asks more than the bounds
/// allow is refused before any key is derived.
pub(crate) fn open(sealed: &[u8], passphrase: &str) -> Result<Vec<u8>> {
    if sealed.len() < HEADER_LEN + TAG_LEN || !is_sealed(sealed) {
        return Err(bundle_error("unreadable", "not a whole sealed bundle"));
    }
    let header = &sealed[..HEADER_LEN];
    if header[8] != VERSION {
        return Err(bundle_error(
            "unreadable",
            "a sealed bundle of an unknown version",
        ));
    }
    if header[9] != KDF_ARGON2ID {
        return Err(bundle_error(
            "unreadable",
            "a sealed bundle with an unknown key derivation",
        ));
    }
    let u32_at = |at: usize| u32::from_le_bytes(header[at..at + 4].try_into().expect("four bytes"));
    let params = KdfParams {
        m_kib: u32_at(10),
        t: u32_at(14),
        p: u32_at(18),
    };
    if params.m_kib > MAX_M_KIB || params.t > MAX_T || params.p > MAX_P || params.p == 0 {
        return Err(bundle_error(
            "unreadable",
            "the key derivation asks too much",
        ));
    }
    let salt = &header[22..22 + SALT_LEN];
    let nonce = &header[22 + SALT_LEN..HEADER_LEN];

    let key = derive(params, passphrase, salt)?;
    let cipher = XChaCha20Poly1305::new_from_slice(key.as_slice())
        .map_err(|_| bundle_error("unreadable", "the derived key has the wrong length"))?;
    let nonce = GenericArray::from_slice(nonce);
    let mut decryptor = Some(DecryptorBE32::from_aead(cipher.clone(), nonce));

    let body = &sealed[HEADER_LEN..];
    let mut plain = Vec::with_capacity(body.len());
    let mut chunks = body.chunks(CHUNK + TAG_LEN).enumerate().peekable();
    let cut_short = || {
        bundle_error(
            "unreadable",
            "the sealed bundle is cut short or was changed",
        )
    };
    while let Some((index, chunk)) = chunks.next() {
        let payload = || Payload {
            msg: chunk,
            aad: header,
        };
        let last = chunks.peek().is_none();
        // `decrypt_last` consumes the decryptor, so it is taken for the last chunk alone.
        let opened = match (last, decryptor.as_mut()) {
            (false, Some(current)) => current.decrypt_next(payload()),
            (true, Some(_)) => match decryptor.take() {
                Some(current) => current.decrypt_last(payload()),
                None => break,
            },
            (_, None) => break,
        };
        match opened {
            Ok(bytes) => plain.extend_from_slice(&bytes),
            // A first chunk that opens as a middle one means the key is right and the rest of the file is gone.
            Err(_)
                if index == 0
                    && last
                    && DecryptorBE32::from_aead(cipher.clone(), nonce)
                        .decrypt_next(payload())
                        .is_ok() =>
            {
                return Err(cut_short())
            }
            Err(_) if index == 0 => {
                return Err(bundle_error(
                    "passphrase",
                    "the passphrase does not open this bundle",
                ))
            }
            Err(_) => return Err(cut_short()),
        }
        if last {
            return Ok(plain);
        }
    }
    Err(cut_short())
}

fn header(params: KdfParams, salt: &[u8; SALT_LEN], nonce: &[u8; NONCE_LEN]) -> Vec<u8> {
    let mut header = Vec::with_capacity(HEADER_LEN);
    header.extend_from_slice(MAGIC);
    header.push(VERSION);
    header.push(KDF_ARGON2ID);
    header.extend_from_slice(&params.m_kib.to_le_bytes());
    header.extend_from_slice(&params.t.to_le_bytes());
    header.extend_from_slice(&params.p.to_le_bytes());
    header.extend_from_slice(salt);
    header.extend_from_slice(nonce);
    header
}

fn derive(params: KdfParams, passphrase: &str, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>> {
    let unreadable = |_| bundle_error("unreadable", "the key derivation parameters are not valid");
    let argon = Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(params.m_kib, params.t, params.p, Some(32)).map_err(unreadable)?,
    );
    let mut key = Zeroizing::new([0u8; 32]);
    argon
        .hash_password_into(passphrase.as_bytes(), salt, key.as_mut_slice())
        .map_err(unreadable)?;
    Ok(key)
}

#[cfg(test)]
pub(crate) const TEST_PARAMS: KdfParams = KdfParams {
    m_kib: 8,
    t: 1,
    p: 1,
};

#[cfg(test)]
mod tests {
    use super::*;

    const PASSPHRASE: &str = "correct horse battery";

    fn sealed(plain: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        seal_with(TEST_PARAMS, plain, PASSPHRASE, &mut out).unwrap();
        out
    }

    fn code(result: Result<Vec<u8>>) -> String {
        let text = result.unwrap_err().to_string();
        text.split(": ").next().unwrap().to_string()
    }

    #[test]
    fn a_sealed_file_opens_back_to_its_bytes() {
        // Empty, under one chunk, exactly one chunk, and several.
        for len in [0, 10, CHUNK, CHUNK * 2 + 7] {
            let plain: Vec<u8> = (0..len).map(|i| (i % 251) as u8).collect();
            let file = sealed(&plain);
            assert!(is_sealed(&file));
            assert_eq!(&file[..8], b"EDENLOCK");
            assert_eq!(open(&file, PASSPHRASE).unwrap(), plain, "{len}");
        }
    }

    #[test]
    fn open_refuses_locked_wrong_truncated_tampered_and_oversized() {
        let plain: Vec<u8> = (0..CHUNK * 2 + 100).map(|i| (i % 253) as u8).collect();
        let file = sealed(&plain);

        let with_header = |at: usize, value: u32| {
            let mut file = file.clone();
            file[at..at + 4].copy_from_slice(&value.to_le_bytes());
            file
        };
        let mut flipped_late = file.clone();
        let last = flipped_late.len() - 3;
        flipped_late[last] ^= 0x01;
        let mut flipped_header = file.clone();
        flipped_header[30] ^= 0x01;
        let mut version = file.clone();
        version[8] = 2;
        let mut kdf = file.clone();
        kdf[9] = 2;

        let cases: Vec<(&str, Vec<u8>, &str, &str)> = vec![
            (
                "wrong passphrase",
                file.clone(),
                "not the passphrase",
                "bundle:passphrase",
            ),
            (
                "altered header",
                flipped_header,
                PASSPHRASE,
                "bundle:passphrase",
            ),
            (
                "truncated",
                file[..file.len() - 40].to_vec(),
                PASSPHRASE,
                "bundle:unreadable",
            ),
            (
                "cut at a chunk",
                file[..HEADER_LEN + CHUNK + TAG_LEN].to_vec(),
                PASSPHRASE,
                "bundle:unreadable",
            ),
            (
                "header only",
                file[..HEADER_LEN].to_vec(),
                PASSPHRASE,
                "bundle:unreadable",
            ),
            (
                "flipped late byte",
                flipped_late,
                PASSPHRASE,
                "bundle:unreadable",
            ),
            (
                "memory over the bound",
                with_header(10, MAX_M_KIB + 1),
                PASSPHRASE,
                "bundle:unreadable",
            ),
            (
                "passes over the bound",
                with_header(14, MAX_T + 1),
                PASSPHRASE,
                "bundle:unreadable",
            ),
            (
                "lanes over the bound",
                with_header(18, MAX_P + 1),
                PASSPHRASE,
                "bundle:unreadable",
            ),
            (
                "no lanes",
                with_header(18, 0),
                PASSPHRASE,
                "bundle:unreadable",
            ),
            ("unknown version", version, PASSPHRASE, "bundle:unreadable"),
            ("unknown kdf", kdf, PASSPHRASE, "bundle:unreadable"),
        ];
        for (case, bytes, passphrase, expected) in cases {
            let result = open(&bytes, passphrase);
            let text = result
                .as_ref()
                .map(|_| String::new())
                .unwrap_err()
                .to_string();
            assert!(!text.contains(passphrase), "{case}: {text}");
            assert_eq!(code(result), expected, "{case}");
        }

        // The memory bound holds before any key is derived: a header asking 4 GiB answers at once.
        let started = std::time::Instant::now();
        assert_eq!(
            code(open(&with_header(10, u32::MAX), PASSPHRASE)),
            "bundle:unreadable"
        );
        assert!(started.elapsed() < std::time::Duration::from_secs(1));
    }

    #[test]
    fn the_default_cost_is_within_what_open_allows() {
        let KdfParams { m_kib, t, p } = DEFAULT_PARAMS;
        assert!(m_kib <= MAX_M_KIB && t <= MAX_T && (1..=MAX_P).contains(&p));
        assert_eq!(HEADER_LEN, 57);
    }

    #[test]
    fn a_short_passphrase_is_refused() {
        assert_eq!(
            code(Err(check_passphrase("seven77").unwrap_err())),
            "bundle:passphrase-short"
        );
        assert!(check_passphrase("eight888").is_ok());
        // Characters, not bytes: eight kana pass.
        assert!(check_passphrase("あいうえおかきく").is_ok());
        let mut out = Vec::new();
        assert!(seal_with(TEST_PARAMS, b"zip", "short", &mut out).is_err());
        assert!(out.is_empty());
    }
}
