//! PTY ownership is registered before Windows project code can execute.
use anyhow::Result;
use portable_pty::{Child, CommandBuilder, SlavePty};
#[cfg(windows)]
mod windows;

pub fn spawn(
    slave: &dyn SlavePty,
    command: CommandBuilder,
) -> Result<Box<dyn Child + Send + Sync>> {
    #[cfg(windows)]
    return windows::spawn(slave, command);
    #[cfg(not(windows))]
    slave.spawn_command(command)
}
pub fn retry_cleanup() -> Result<(), String> {
    #[cfg(windows)]
    return windows::retry_cleanup();
    #[cfg(not(windows))]
    Ok(())
}
pub fn is_pending() -> bool {
    #[cfg(windows)]
    return windows::is_pending();
    #[cfg(not(windows))]
    false
}
#[cfg(all(test, windows))]
mod tests;
