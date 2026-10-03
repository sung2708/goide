//! Execution comes from DAP events; a pause/step acknowledgement is not a stop event.
use serde_json::Value;
#[derive(Default)]
pub(super) struct Execution {
    paused: Option<bool>,
    thread: Option<i64>,
    revision: u64,
}
impl Execution {
    pub(super) fn paused(&self) -> Option<bool> {
        self.paused
    }
    pub(super) fn thread(&self) -> Option<i64> {
        self.thread
    }
    pub(super) fn revision(&self) -> u64 {
        self.revision
    }
    pub(super) fn observe(&mut self, message: &Value) {
        match message["event"].as_str() {
            Some("stopped") => {
                self.paused = Some(true);
                self.thread = message["body"]["threadId"].as_i64().filter(|id| *id > 0);
                self.revision += 1;
            }
            Some("continued" | "exited" | "terminated") => {
                self.paused = Some(false);
                self.thread = None;
                self.revision += 1;
            }
            _ => {}
        }
    }
    pub(super) fn acknowledge(&mut self, command: &str, previous_revision: u64) {
        // A newer stopped event wins even if it precedes a fast continue/step response.
        if self.revision == previous_revision
            && matches!(
                command,
                "launch" | "continue" | "next" | "stepIn" | "stepOut" | "configurationDone"
            )
        {
            self.paused = Some(false);
            self.thread = None;
            self.revision += 1;
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn pause_acknowledgement_does_not_invent_a_stopped_state() {
        let mut state = Execution::default();
        state.acknowledge("launch", 0);
        let revision = state.revision();
        state.acknowledge("pause", revision);
        assert_eq!(state.paused(), Some(false));
        state.observe(&json!({ "event": "stopped", "body": { "threadId": 7 } }));
        assert_eq!(state.paused(), Some(true));
        assert_eq!(state.thread(), Some(7));
    }
    #[test]
    fn a_fast_new_breakpoint_wins_over_an_earlier_continue_acknowledgement() {
        let mut state = Execution::default();
        state.observe(&json!({ "event": "stopped", "body": { "threadId": 7 } }));
        let revision = state.revision();
        state.observe(&json!({ "event": "stopped", "body": { "threadId": 9 } }));
        state.acknowledge("continue", revision);
        assert_eq!(state.paused(), Some(true));
        assert_eq!(state.thread(), Some(9));
        state.observe(&json!({ "event": "continued" }));
        assert_eq!(state.paused(), Some(false));
        assert_eq!(state.thread(), None);
    }
}
