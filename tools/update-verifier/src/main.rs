use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use std::{env, fs};
fn verify(
    key: &str,
    bytes: &[u8],
    signature: &str,
    version: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    semver::Version::parse(version)?;
    let key = String::from_utf8(STANDARD.decode(key.trim())?)?;
    let signature = String::from_utf8(STANDARD.decode(signature.trim())?)?;
    let signature = Signature::decode(&signature)?;
    PublicKey::decode(&key)?.verify(bytes, &signature, false)?;
    let signed_version = signature
        .trusted_comment()
        .split('\t')
        .find_map(|part| part.strip_prefix("version:"));
    if signed_version != Some(version) {
        return Err("Signature does not bind the announced app version".into());
    }
    Ok(())
}
fn main() {
    let args: Vec<_> = env::args().skip(1).collect();
    let result = (|| {
        if args.len() != 3 {
            return Err("Usage: goro-update-verifier ARTIFACT SIGNATURE VERSION; GORO_UPDATER_PUBLIC_KEY must be set".into());
        }
        verify(
            &env::var("GORO_UPDATER_PUBLIC_KEY")?,
            &fs::read(&args[0])?,
            &fs::read_to_string(&args[1])?,
            &args[2],
        )
    })();
    if result.is_err() {
        eprintln!("Update signature or signed-version verification failed.");
        std::process::exit(1);
    }
}
