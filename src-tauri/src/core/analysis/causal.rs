use crate::integration::delve::RuntimeSignal;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StaticCounterpartHint {
    pub relative_path: String,
    pub line: usize,
    pub column: usize,
    pub confidence: String,
}

fn opposite_wait_reason(wait_reason: &str) -> &'static str {
    let normalized = wait_reason.trim().to_ascii_lowercase();
    if normalized == "chan receive" {
        "chan send"
    } else if normalized == "chan send" {
        "chan receive"
    } else {
        ""
    }
}

fn thread_proximity_score(source_thread_id: i64, candidate_thread_id: i64) -> f32 {
    let distance = source_thread_id.abs_diff(candidate_thread_id) as f32;
    1.0 / (1.0 + distance)
}

fn correlation_score(
    source: &RuntimeSignal,
    candidate: &RuntimeSignal,
    static_hint: Option<&StaticCounterpartHint>,
) -> f32 {
    let expected_peer_wait_reason = opposite_wait_reason(&source.wait_reason);
    if expected_peer_wait_reason.is_empty() {
        return 0.0;
    }

    let candidate_reason = candidate.wait_reason.to_ascii_lowercase();
    if !candidate_reason.contains(expected_peer_wait_reason) {
        return 0.0;
    }

    let mut score = 0.50;
    score += 0.30 * thread_proximity_score(source.thread_id, candidate.thread_id);
    if static_hint.is_some() {
        score += 0.20;
    }
    score.min(1.0)
}

fn correlation_id(scope_key: &str, source_thread_id: i64, target_thread_id: i64) -> String {
    format!("runtime-causal:{scope_key}:{source_thread_id}:{target_thread_id}")
}

pub fn enrich_runtime_signals_with_correlation(
    signals: &[RuntimeSignal],
    static_hint: Option<&StaticCounterpartHint>,
) -> Vec<RuntimeSignal> {
    if signals.is_empty() {
        return Vec::new();
    }

    // Performance guard: skip heavy O(N^2) correlation if there are too many signals.
    if signals.len() > 100 {
        return signals.to_vec();
    }

    let mut enriched = Vec::with_capacity(signals.len());
    for source in signals {
        let mut output = source.clone();
        let mut best: Option<(&RuntimeSignal, f32)> = None;

        for candidate in signals {
            if candidate.thread_id == source.thread_id {
                continue;
            }

            let score = correlation_score(source, candidate, static_hint);
            if score <= 0.0 {
                continue;
            }

            if best.map(|(_, current)| score > current).unwrap_or(true) {
                best = Some((candidate, score));
            }
        }

        if let Some((candidate, score)) = best {
            if score >= 0.70 {
                output.correlation_id =
                    Some(correlation_id(&source.scope_key, source.thread_id, candidate.thread_id));
                output.counterpart_relative_path = Some(candidate.relative_path.clone());
                output.counterpart_line = Some(candidate.line);
                output.counterpart_column = Some(candidate.column);
                output.counterpart_confidence = Some("likely".to_string());
            }
        }

        enriched.push(output);
    }

    enriched
}

#[cfg(test)]
mod tests {
    use super::{enrich_runtime_signals_with_correlation, StaticCounterpartHint};
    use crate::integration::delve::RuntimeSignal;

    fn signal(thread_id: i64, wait_reason: &str, line: usize) -> RuntimeSignal {
        RuntimeSignal {
            thread_id,
            status: wait_reason.to_string(),
            wait_reason: wait_reason.to_string(),
            confidence: "confirmed".to_string(),
            scope_key: "scope-A".to_string(),
            relative_path: "main.go".to_string(),
            line,
            column: 4,
            correlation_id: None,
            counterpart_relative_path: None,
            counterpart_line: None,
            counterpart_column: None,
            counterpart_confidence: None,
        }
    }

    #[test]
    fn enriches_with_likely_counterpart_when_pair_is_detected() {
        // Source is line 10, candidate is line 15. Static hint suggests line 22.
        let signals = vec![signal(10, "chan receive", 10), signal(11, "chan send", 15)];
        let hint = StaticCounterpartHint {
            relative_path: "main.go".to_string(),
            line: 22,
            column: 2,
            confidence: "predicted".to_string(),
        };

        let enriched = enrich_runtime_signals_with_correlation(&signals, Some(&hint));
        assert_eq!(enriched.len(), 2);

        let receiver = enriched
            .iter()
            .find(|item| item.wait_reason == "chan receive")
            .expect("receiver signal exists");
        
        // Should use candidate line (15), NOT the hint line (22)
        assert_eq!(receiver.counterpart_line, Some(15));
        assert_eq!(receiver.counterpart_relative_path.as_deref(), Some("main.go"));
        assert_eq!(receiver.counterpart_confidence.as_deref(), Some("likely"));
        assert!(receiver
            .correlation_id
            .as_deref()
            .unwrap_or_default()
            .starts_with("runtime-causal:scope-A:10:11"));
    }

    #[test]
    fn leaves_signal_without_counterpart_for_non_channel_states() {
        let signals = vec![signal(10, "semacquire", 10), signal(11, "semacquire", 11)];
        let enriched = enrich_runtime_signals_with_correlation(&signals, None);
        assert!(enriched
            .iter()
            .all(|item| item.counterpart_line.is_none() && item.correlation_id.is_none()));
    }
}
