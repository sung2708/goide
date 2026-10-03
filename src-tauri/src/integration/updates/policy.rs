use semver::Version;
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Stable,
    Beta,
    Alpha,
}
impl Channel {
    pub fn name(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Beta => "beta",
            Self::Alpha => "alpha",
        }
    }
    pub fn default_for(version: &Version) -> Self {
        match version.pre.as_str().split('.').next().unwrap_or("") {
            "" => Self::Stable,
            "beta" | "rc" => Self::Beta,
            _ => Self::Alpha,
        }
    }
    pub fn allows(self, version: &Version) -> bool {
        match version.pre.as_str().split('.').next().unwrap_or("") {
            "" => true,
            "beta" | "rc" => self != Self::Stable,
            "alpha" => self == Self::Alpha,
            _ => false,
        }
    }
}
pub fn secure_url(value: &str) -> Result<Url, &'static str> {
    let url = Url::parse(value).map_err(|_| "Invalid release URL.")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.query().is_some()
    {
        return Err("Release URLs must use HTTPS without credentials, queries or fragments.");
    }
    Ok(url)
}
pub fn endpoint(base: &str, channel: Channel) -> Result<Url, &'static str> {
    let base = secure_url(base)?;
    if !base.path().ends_with('/') {
        return Err("Release base URL must end with a slash.");
    }
    base.join(&format!("{}/latest.json", channel.name()))
        .map_err(|_| "Invalid channel endpoint.")
}
pub fn allowed_host(host: &str, endpoint_host: &str) -> bool {
    host == endpoint_host
        || matches!(
            host,
            "github.com" | "release-assets.githubusercontent.com" | "objects.githubusercontent.com"
        )
}
pub fn artifact_url(url: &Url, endpoint_host: &str) -> bool {
    secure_url(url.as_str()).is_ok()
        && url
            .host_str()
            .is_some_and(|host| allowed_host(host, endpoint_host))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn numeric_semver_and_channel_boundaries() {
        for (older, newer) in [
            ("0.1.9", "0.2.0"),
            ("0.2.0-beta.1", "0.2.0-beta.2"),
            ("0.2.0-rc.1", "0.2.0"),
            ("0.99.0", "1.0.0"),
        ] {
            assert!(Version::parse(newer).unwrap() > Version::parse(older).unwrap());
        }
        for (version, channels) in [
            ("1.0.0", [true, true, true]),
            ("1.0.0-rc.1", [false, true, true]),
            ("1.0.0-beta.2", [false, true, true]),
            ("1.0.0-alpha.1", [false, false, true]),
            ("1.0.0-preview.1", [false, false, false]),
        ] {
            for (index, channel) in [Channel::Stable, Channel::Beta, Channel::Alpha]
                .into_iter()
                .enumerate()
            {
                assert_eq!(
                    channel.allows(&Version::parse(version).unwrap()),
                    channels[index]
                );
            }
        }
    }
    #[test]
    fn public_origin_credentials_and_redirect_boundaries() {
        for bad in [
            "http://example.test/",
            "https://user:secret@example.test/",
            "https://example.test/?token=secret",
            "file:///release",
            "https://example.test/#secret",
        ] {
            assert!(secure_url(bad).is_err());
        }
        assert_eq!(
            endpoint("https://example.test/releases/", Channel::Beta)
                .unwrap()
                .as_str(),
            "https://example.test/releases/beta/latest.json"
        );
        assert!(endpoint("https://example.test/releases", Channel::Stable).is_err());
        assert!(!artifact_url(
            &Url::parse("https://example.test.evil/package").unwrap(),
            "example.test"
        ));
        assert!(!artifact_url(
            &Url::parse("http://example.test/package").unwrap(),
            "example.test"
        ));
        assert!(artifact_url(
            &Url::parse("https://github.com/owner/public/releases/download/v1/a.exe").unwrap(),
            "example.test"
        ));
    }
}
