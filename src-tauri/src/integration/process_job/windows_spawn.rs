//! Resume only the pinned, newly created suspended child's initial thread.
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle, RawHandle};
use windows_sys::Win32::{
    Foundation::{ERROR_NO_MORE_FILES, HANDLE, INVALID_HANDLE_VALUE, WAIT_TIMEOUT},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
        },
        Threading::{
            GetProcessId, GetProcessIdOfThread, OpenThread, ResumeThread, WaitForSingleObject,
            THREAD_QUERY_LIMITED_INFORMATION, THREAD_SUSPEND_RESUME,
        },
    },
};

fn ensure_alive(process: RawHandle) -> Result<(), String> {
    // SAFETY: The caller retains the original Child process handle throughout registration.
    if unsafe { WaitForSingleObject(process as HANDLE, 0) } != WAIT_TIMEOUT {
        return Err("Owned suspended process stopped before registration completed.".into());
    }
    Ok(())
}

pub(super) fn resume_initial_thread(process: RawHandle) -> Result<(), String> {
    ensure_alive(process)?;
    // SAFETY: This is the pinned original Child handle, not a process opened by numeric PID.
    let pid = unsafe { GetProcessId(process as HANDLE) };
    if pid == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    // SAFETY: Read-only thread inventory; the returned handle is uniquely owned below.
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
    if snapshot == INVALID_HANDLE_VALUE || snapshot.is_null() {
        return Err(std::io::Error::last_os_error().to_string());
    }
    // SAFETY: The successful snapshot call returned a unique kernel handle.
    let snapshot = unsafe { OwnedHandle::from_raw_handle(snapshot as RawHandle) };
    // SAFETY: THREADENTRY32 is a plain output structure initialized before the API reads it.
    let mut entry: THREADENTRY32 = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
    let mut initial_thread = None;
    // SAFETY: The snapshot and correctly sized entry remain valid through enumeration.
    let mut found = unsafe { Thread32First(snapshot.as_raw_handle() as HANDLE, &mut entry) };
    while found != 0 {
        if entry.dwSize < std::mem::size_of::<THREADENTRY32>() as u32 {
            return Err("Incomplete owned thread inventory; refusing to resume.".into());
        }
        if entry.th32OwnerProcessID == pid && initial_thread.replace(entry.th32ThreadID).is_some() {
            return Err("Ambiguous suspended initial thread; refusing to resume.".into());
        }
        entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
        // SAFETY: The same owned snapshot and initialized structure remain valid.
        found = unsafe { Thread32Next(snapshot.as_raw_handle() as HANDLE, &mut entry) };
    }
    let error = std::io::Error::last_os_error();
    if error.raw_os_error() != Some(ERROR_NO_MORE_FILES as i32) {
        return Err(error.to_string());
    }
    let thread_id = initial_thread.ok_or("Owned suspended process has no initial thread.")?;
    ensure_alive(process)?;
    // SAFETY: Request only query/resume rights; the owner remains pinned and alive.
    let thread = unsafe {
        OpenThread(
            THREAD_QUERY_LIMITED_INFORMATION | THREAD_SUSPEND_RESUME,
            0,
            thread_id,
        )
    };
    if thread.is_null() {
        return Err(std::io::Error::last_os_error().to_string());
    }
    // SAFETY: OpenThread returned a unique owned handle.
    let thread = unsafe { OwnedHandle::from_raw_handle(thread as RawHandle) };
    // SAFETY: Query the opened thread itself, rather than trusting the snapshot's numeric ID.
    if unsafe { GetProcessIdOfThread(thread.as_raw_handle() as HANDLE) } != pid {
        return Err("Initial thread no longer belongs to the pinned owned process.".into());
    }
    ensure_alive(process)?;
    // SAFETY: Ownership is registered, the original process is alive, and this handle identifies
    // its only initial thread. CREATE_SUSPENDED must have left exactly one suspension to release.
    let previous = unsafe { ResumeThread(thread.as_raw_handle() as HANDLE) };
    if previous == u32::MAX {
        return Err(std::io::Error::last_os_error().to_string());
    }
    if previous != 1 {
        return Err(format!(
            "Unexpected initial thread suspend count {previous}; retire the owned process."
        ));
    }
    Ok(())
}
