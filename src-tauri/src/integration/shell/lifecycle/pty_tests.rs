use super::*;
use crate::integration::shell::{ensure_shell_session_for_test, owned_child};
use portable_pty::{CommandBuilder, PtySize};
use std::{io::Read, sync::mpsc};

#[tokio::test]
async fn real_terminal_disposal_closes_the_console_and_joins_its_reader() {
    for natural_exit in [false, true] {
        let pair = portable_pty::native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();
        let mut command = CommandBuilder::new(if natural_exit {
            "powershell.exe"
        } else {
            "ping.exe"
        });
        let args = if natural_exit {
            vec!["-NoLogo", "-NoProfile"]
        } else {
            vec!["-n", "90", "127.0.0.1"]
        };
        for arg in args {
            command.arg(arg);
        }
        let child = owned_child::own(pair.slave.spawn_command(command).unwrap()).unwrap();
        drop(pair.slave);
        let writer = pair.master.take_writer().unwrap();
        let mut reader = pair.master.try_clone_reader().unwrap();
        let (done, finished) = mpsc::channel();
        let reader_task = std::thread::spawn(move || {
            let mut bytes = [0; 4096];
            while reader.read(&mut bytes).is_ok_and(|count| count > 0) {}
            done.send(()).unwrap();
        });
        let store = ShellSessionStore::default();
        let created = ensure_shell_session_for_test(&store, "repo", "surface", None)
            .await
            .unwrap();
        {
            let mut state = store.lock().await;
            let session = state.sessions.get_mut(&created.shell_session_id).unwrap();
            session.reader_task.take().unwrap().join().unwrap();
            session.child = child;
            session.reader_task = Some(reader_task);
            *session.writer.lock().await = Some(writer);
            *session.master.lock().await = Some(pair.master);
        }
        if natural_exit {
            crate::integration::shell::write_shell_input_inner(
                store.clone(),
                &created.shell_session_id,
                "exit\r\n",
            )
            .await
            .unwrap();
            assert!(tokio::time::timeout(
                Duration::from_secs(15),
                crate::integration::shell::exit::wait_for_root(&store, &created.shell_session_id)
            )
            .await
            .unwrap()
            .unwrap());
        }
        dispose_shell_session_inner(store.clone(), &created.shell_session_id)
            .await
            .unwrap();
        finished.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(store.lock().await.sessions.is_empty());
        assert!(
            !crate::integration::shell::exit::wait_for_root(&store, &created.shell_session_id)
                .await
                .unwrap()
        );
    }
}
