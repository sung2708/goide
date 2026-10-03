//! Windows app boundary: descendants inherit the job before tools are launched.
#[cfg(windows)]
mod windows_spawn;
#[cfg(windows)]
mod windows {
    use std::{
        os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle, RawHandle},
        sync::{Arc, OnceLock},
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
    pub struct Job(Arc<OwnedHandle>);
    static APP_JOB: OnceLock<Result<Job, String>> = OnceLock::new();
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
            Ok(Self(Arc::new(handle)))
        }
        pub fn handle(&self) -> Arc<OwnedHandle> {
            self.0.clone()
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
        pub fn active_count(&self) -> Result<u32, String> {
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
            Ok(accounting.ActiveProcesses)
        }
        pub fn is_empty(&self) -> Result<bool, String> {
            Ok(self.active_count()? == 0)
        }
        pub(super) fn installer_handoff(&self, enabled: bool) -> Result<(), String> {
            use windows_sys::Win32::System::JobObjects::QueryInformationJobObject;
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            // SAFETY: Correctly sized output buffer and an owned, live job handle.
            if unsafe {
                QueryInformationJobObject(
                    self.0.as_raw_handle() as HANDLE,
                    JobObjectExtendedLimitInformation,
                    &mut limits as *mut _ as *mut _,
                    std::mem::size_of_val(&limits) as u32,
                    std::ptr::null_mut(),
                )
            } == 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
            use windows_sys::Win32::System::JobObjects::JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;
            if enabled {
                limits.BasicLimitInformation.LimitFlags |= JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;
            } else {
                limits.BasicLimitInformation.LimitFlags &= !JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;
            }
            // SAFETY: Initialized limits read from this exact job, retaining all other flags.
            if unsafe {
                SetInformationJobObject(
                    self.0.as_raw_handle() as HANDLE,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const _,
                    std::mem::size_of_val(&limits) as u32,
                )
            } == 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
            Ok(())
        }
    }
    pub fn install() -> Result<(), String> {
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
    pub fn prepare_update_exit() -> Result<(), String> {
        if !super::super::lifecycle::exit_approved()
            || !super::super::lifecycle::gate().is_closing()
        {
            return Err("Workspace cleanup has not been acknowledged.".into());
        }
        let job = APP_JOB
            .get()
            .ok_or("App job is unavailable.")?
            .as_ref()
            .map_err(Clone::clone)?;
        // Only new installer children escape. Existing WebView/tool descendants retain
        // KILL_ON_JOB_CLOSE; the closed lifecycle gate rejects every new tool launch.
        job.installer_handoff(true)
    }
    pub fn restore_update_exit() -> Result<(), String> {
        APP_JOB
            .get()
            .ok_or("App job is unavailable.")?
            .as_ref()
            .map_err(Clone::clone)?
            .installer_handoff(false)
    }
}
#[cfg(windows)]
pub use windows::{install, prepare_update_exit, restore_update_exit, Job};

#[cfg(windows)]
mod owned_async;
#[cfg(windows)]
pub use owned_async::OwnedChild;
#[cfg(unix)]
mod owned_unix;
#[cfg(unix)]
pub use owned_unix::OwnedChild;
pub fn async_cleanup_pending() -> bool {
    #[cfg(windows)]
    return owned_async::is_pending();
    #[cfg(unix)]
    owned_unix::is_pending()
}
pub async fn retry_async_cleanup() -> Result<(), String> {
    #[cfg(windows)]
    return owned_async::retry_cleanup().await;
    #[cfg(unix)]
    owned_unix::retry_cleanup().await
}

#[cfg(not(windows))]
pub fn install() -> Result<(), String> {
    Ok(())
}
#[cfg(not(windows))]
pub fn prepare_update_exit() -> Result<(), String> {
    Ok(())
}
#[cfg(not(windows))]
pub fn restore_update_exit() -> Result<(), String> {
    Ok(())
}
#[cfg(all(test, windows))]
mod tests;
