//! Windows app boundary: descendants inherit the job before tools are launched.
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
                SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Threading::GetCurrentProcess,
        },
    };
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
#[cfg(not(windows))]
pub fn install() -> Result<(), String> {
    Ok(())
}
#[cfg(all(test, windows))]
mod tests;
