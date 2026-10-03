fn main() {
    println!("cargo:rerun-if-env-changed=GORO_UPDATER_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=GORO_RELEASE_BASE_URL");
    tauri_build::build()
}
