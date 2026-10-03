//! A process group may be signal_consumed only while its original leader is unreaped.
use std::io;

#[derive(Debug)]
pub(crate) struct Group {
    pid: u32,
    signal_consumed: bool,
    reaped: bool,
    #[cfg(test)]
    group_signal_error: Option<i32>,
}

#[cfg(test)]
mod tests;
impl Group {
    /// Caller created this child with process_group(0) before its exec.
    pub fn new(pid: u32) -> Self {
        Self {
            pid,
            signal_consumed: false,
            reaped: false,
            #[cfg(test)]
            group_signal_error: None,
        }
    }
    fn pid(&self) -> io::Result<libc::pid_t> {
        let pid =
            i32::try_from(self.pid).map_err(|_| io::Error::other("Invalid owned process group"))?;
        if pid <= 1 {
            return Err(io::Error::other("Invalid owned process group"));
        }
        Ok(pid)
    }
    pub fn exited(&self) -> io::Result<bool> {
        if self.reaped {
            return Ok(true);
        }
        let mut action: libc::sigaction = unsafe { std::mem::zeroed() };
        // Automatic SIGCHLD reaping would invalidate the leader pin.
        if unsafe { libc::sigaction(libc::SIGCHLD, std::ptr::null(), &mut action) } != 0 {
            return Err(io::Error::last_os_error());
        }
        if action.sa_sigaction == libc::SIG_IGN || action.sa_flags & libc::SA_NOCLDWAIT != 0 {
            return Err(io::Error::other(
                "Automatic child reaping prevents safe process group ownership",
            ));
        }
        let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
        // SAFETY: An initialized output buffer observes only our child without
        // consuming its wait status. Its PID remains pinned even after exit.
        let result = unsafe {
            libc::waitid(
                libc::P_PID,
                self.pid()? as libc::id_t,
                &mut info,
                libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
            )
        };
        if result != 0 {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: waitid filled this initialized siginfo, or left a zero PID.
        let observed = unsafe { info.si_pid() };
        if observed == 0 {
            Ok(false)
        } else if observed == self.pid()? {
            Ok(true)
        } else {
            Err(io::Error::other("Unexpected owned child wait identity"))
        }
    }
    pub fn signal_once(&mut self) -> io::Result<()> {
        if self.signal_consumed {
            return Ok(());
        }
        if self.reaped {
            return Err(io::Error::other(
                "Process group authority was already consumed",
            ));
        }
        // ECHILD fails closed: never signal a recycled number.
        self.exited()?;
        // SAFETY: The exclusively owned, unreaped leader still pins this group ID.
        #[cfg(test)]
        let injected = self.group_signal_error.is_some();
        #[cfg(not(test))]
        let injected = false;
        let signal_result = if injected {
            -1
        } else {
            unsafe { libc::kill(-self.pid()?, libc::SIGKILL) }
        };
        if signal_result != 0 {
            #[cfg(test)]
            let error = self
                .group_signal_error
                .take()
                .map(io::Error::from_raw_os_error)
                .unwrap_or_else(io::Error::last_os_error);
            #[cfg(not(test))]
            let error = io::Error::last_os_error();
            if error.raw_os_error() == Some(libc::EPERM) && self.exited()? {
                // XNU's group filter skips zombies and may return EPERM for a
                // zombie-only group. This is NOT proof of group retirement:
                // consume signal authority, reap only our confirmed-exited child,
                // then require ESRCH from is_empty. Live/denied descendants keep
                // ownership pending. Never signal this number again after reaping.
                self.signal_consumed = true;
                return Ok(());
            }
            if error.raw_os_error() != Some(libc::ESRCH) {
                return Err(error);
            }
        }
        // Also retire the pinned root if it deliberately changed its group.
        // This positive PID is still the exclusively owned, unreaped child.
        if unsafe { libc::kill(self.pid()?, libc::SIGKILL) } != 0 {
            let error = io::Error::last_os_error();
            // Some kernels reject signalling zombies. Only the original
            // waitable child's confirmed exit permits accepting that failure.
            if !self.exited()? {
                return Err(error);
            }
        }
        self.signal_consumed = true;
        Ok(())
    }
    pub fn try_wait(
        &mut self,
        child: &mut std::process::Child,
    ) -> io::Result<Option<std::process::ExitStatus>> {
        if !self.reaped {
            if !self.exited()? {
                return Ok(None);
            }
            self.signal_once()?;
        }
        let status = child.try_wait()?;
        self.reaped |= status.is_some();
        Ok(status)
    }
    pub fn try_wait_async(
        &mut self,
        child: &mut tokio::process::Child,
    ) -> io::Result<Option<std::process::ExitStatus>> {
        if !self.reaped {
            if !self.exited()? {
                return Ok(None);
            }
            self.signal_once()?;
        }
        let status = child.try_wait()?;
        self.reaped |= status.is_some();
        Ok(status)
    }
    pub fn is_empty(&self) -> io::Result<bool> {
        if !self.reaped {
            return Ok(false);
        }
        // This is a non-mutating probe. Never send another signal after reaping.
        if unsafe { libc::kill(-self.pid()?, 0) } == 0 {
            return Ok(false);
        }
        let error = io::Error::last_os_error();
        match error.raw_os_error() {
            Some(libc::ESRCH) => Ok(true),
            // XNU also skips zombies for the read-only group probe. EPERM is
            // unconfirmed, never empty: the owner's bounded wait/retry retains
            // authority until kernel group absence can be positively observed.
            Some(libc::EPERM) => Ok(false),
            _ => Err(error),
        }
    }
}
