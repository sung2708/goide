//! Windows app boundary: descendants inherit the job before tools are launched.
#[cfg(windows)]
mod windows_spawn;
#[cfg(windows)]
mod windows {
    use std::{
        os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle, RawHandle},
        sync::OnceLock,
    };
    use windows_sys::Win32::{
        Foundation::HANDLE,
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Threading::GetCurrentProcess,
        },
    };
    #[derive(Debug)]
    pub struct Job(OwnedHandle);
    impl Job {
        pub fn new() -> Result<Self, String> {
            // An unnamed, non-inheritable handle; descendants inherit membership, not the handle.
            let raw = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if raw.is_null() {
                return Err(std::io::Error::last_os_error().to_string());
            }
            // SAFETY: CreateJobObjectW returned a unique owned kernel handle.
            let handle = unsafe { OwnedHandle::from_raw_handle(raw as RawHandle) };
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            // SAFETY: The buffer is a fully initialized structure of the required size.
            let configured = unsafe {
                SetInformationJobObject(
                    handle.as_raw_handle() as HANDLE,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const _,
                    std::mem::size_of_val(&limits) as u32,
                )
            };
            if configured == 0 {
                return Err(std::io::Error::last_os_error().to_string());
            }
            Ok(Self(handle))
        }
        pub fn assign(&self, process: RawHandle) -> Result<(), String> {
            // SAFETY: Both handles remain valid for the duration of this call.
            if unsafe {
                AssignProcessToJobObject(self.0.as_raw_handle() as HANDLE, process as HANDLE)
            } == 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
            Ok(())
        }
        pub fn resume_registered(&self, process: RawHandle) -> Result<(), String> {
            use windows_sys::Win32::System::JobObjects::IsProcessInJob;
            let mut assigned = 0;
            // SAFETY: Both owned handles remain valid, and the initialized BOOL output is writable.
            if unsafe {
                IsProcessInJob(
                    process as HANDLE,
                    self.0.as_raw_handle() as HANDLE,
                    &mut assigned,
                )
            } == 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
            if assigned == 0 {
                return Err("Suspended process is not registered in its owned job.".into());
            }
            super::windows_spawn::resume_initial_thread(process)
        }
        pub fn terminate(&self) -> Result<(), String> {
            // SAFETY: This handle owns only its explicitly assigned process tree.
            if unsafe { TerminateJobObject(self.0.as_raw_handle() as HANDLE, 1) } == 0 {
                return Err(std::io::Error::last_os_error().to_string());
            }
            Ok(())
        }
        pub fn is_empty(&self) -> Result<bool, String> {
            use windows_sys::Win32::System::JobObjects::{
                JobObjectBasicAccountingInformation, QueryInformationJobObject,
                JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
            };
            let mut accounting: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION =
                unsafe { std::mem::zeroed() };
            // SAFETY: The owned job handle and correctly sized output structure remain valid.
            if unsafe {
                QueryInformationJobObject(
                    self.0.as_raw_handle() as HANDLE,
                    JobObjectBasicAccountingInformation,
                    &mut accounting as *mut _ as *mut _,
                    std::mem::size_of_val(&accounting) as u32,
                    std::ptr::null_mut(),
                )
            } == 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
            Ok(accounting.ActiveProcesses == 0)
        }
    }
    pub fn install() -> Result<(), String> {
        static APP_JOB: OnceLock<Result<Job, String>> = OnceLock::new();
        APP_JOB
            .get_or_init(|| {
                let job = Job::new()?;
                // SAFETY: GetCurrentProcess returns a valid pseudo handle; we do not close it.
                job.assign(unsafe { GetCurrentProcess() } as RawHandle)?;
                Ok(job)
            })
            .as_ref()
            .map(|_| ())
            .map_err(Clone::clone)
    }
}
#[cfg(windows)]
pub use windows::{install, Job};

#[cfg(windows)]
mod owned_async;
#[cfg(windows)]
pub use owned_async::OwnedChild;
pub fn async_cleanup_pending() -> bool {
    #[cfg(windows)]
    {
        owned_async::is_pending()
    }
    #[cfg(not(windows))]
    {
        false
    }
}
pub async fn retry_async_cleanup() -> Result<(), String> {
    #[cfg(windows)]
    {
        owned_async::retry_cleanup().await
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

#[cfg(not(windows))]
#[derive(Debug)]
pub struct OwnedChild {
    identity: uuid::Uuid,
    child: tokio::process::Child,
    #[cfg(unix)]
    process_group: u32,
}
#[cfg(not(windows))]
impl OwnedChild {
    pub async fn spawn(
        command: &mut tokio::process::Command,
        before_resume: impl FnOnce() -> anyhow::Result<()>,
    ) -> anyhow::Result<Self> {
        before_resume()?;
        command.process_group(0);
        let child = command.spawn()?;
        Self::new(child)
            .await
            .map_err(|error| anyhow::anyhow!(error))
    }

    pub async fn new(child: tokio::process::Child) -> Result<Self, String> {
        let process_group = child.id().ok_or("Owned child has no process group")?;
        Ok(Self {
            identity: uuid::Uuid::new_v4(),
            child,
            process_group,
        })
    }
    pub async fn stop(&mut self) -> Result<(), String> {
        crate::integration::process::kill_process_group(&mut self.child)
            .await
            .map_err(|e| e.to_string())
    }
    pub fn identity(&self) -> uuid::Uuid {
        self.identity
    }
}
#[cfg(not(windows))]
impl std::ops::Deref for OwnedChild {
    type Target = tokio::process::Child;
    fn deref(&self) -> &Self::Target {
        &self.child
    }
}
#[cfg(not(windows))]
impl std::ops::DerefMut for OwnedChild {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.child
    }
}
#[cfg(unix)]
impl Drop for OwnedChild {
    fn drop(&mut self) {
        let _ = crate::integration::command::std_command("kill")
            .args(["-KILL", "--", &format!("-{}", self.process_group)])
            .output();
    }
}
#[cfg(not(windows))]
pub fn install() -> Result<(), String> {
    Ok(())
}
#[cfg(all(test, windows))]
mod tests;
