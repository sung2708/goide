use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    pub go_version: String,
    pub gopls_version: String,
    pub delve_version: String,
    pub platform: String,
    pub url: String,
    pub sha256: String,
    pub archive_bytes: u64,
}
pub fn catalog_for(os: &str, arch: &str) -> Result<Catalog, String> {
    let (platform, ext, hash, size) = match (os, arch) {
        ("windows", "x86_64") => ("windows-amd64", "zip", "b92c3b2adae85a11ba71fe7216daf0d84e82af4c8ab6c5625807f28622043a59", 74957586),
        ("linux", "x86_64") => ("linux-amd64", "tar.gz", "d0f743b33e8d8945e6b1f432edd15785c70507121d6e2a723b21285eddf8b57b", 66897291),
        ("macos", "x86_64") => ("darwin-amd64", "tar.gz", "186be014105aa6542b767d2c6ed5cca10a0214bdff809ef1724022a8c7894150", 67759394),
        ("macos", "aarch64") => ("darwin-arm64", "tar.gz", "a012b25b571bd0138a03dcd25375ceba866fe5ca822f426d2c66a4de56fd3f4b", 64626620),
        _ => return Err("Managed setup is unavailable for this OS/architecture. Configure existing tools in Settings.".into()),
    };
    Ok(Catalog {
        go_version: "1.26.8".into(),
        gopls_version: "0.23.0".into(),
        delve_version: "1.27.2".into(),
        platform: platform.into(),
        url: format!("https://go.dev/dl/go1.26.8.{platform}.{ext}"),
        sha256: hash.into(),
        archive_bytes: size,
    })
}
