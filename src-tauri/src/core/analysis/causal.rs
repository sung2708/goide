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

const CORRELATION_GATE: f32 = 0.60;
const CONFIRMED_GATE: f32 = 0.70;
const MAX_CANDIDATES_PER_SOURCE: usize = 128;
const SCORE_EPSILON: f32 = 1e-6;

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/").to_ascii_lowercase()
}

fn path_matches(candidate_path: &str, hint_path: &str) -> bool {
    let normalized_candidate = normalize_path(candidate_path);
    let normalized_hint = normalize_path(hint_path);
    normalized_candidate == normalized_hint
        || normalized_candidate.ends_with(&format!("/{normalized_hint}"))
}

fn candidate_hint_match(
    candidate: &RuntimeSignal,
    static_hint: Option<&StaticCounterpartHint>,
) -> bool {
    let Some(hint) = static_hint else {
        return false;
    };
    let (Some(candidate_path), Some(candidate_line), Some(candidate_column)) = (
        candidate.sample_relative_path.as_deref(),
        candidate.sample_line,
        candidate.sample_column,
    ) else {
        return false;
    };

    path_matches(candidate_path, &hint.relative_path)
        && candidate_line == hint.line
        && candidate_column == hint.column
}

fn correlation_score(
    _source: &RuntimeSignal,
    candidate: &RuntimeSignal,
    static_hint: Option<&StaticCounterpartHint>,
) -> f32 {
    let mut score = CORRELATION_GATE;
    if candidate_hint_match(candidate, static_hint) {
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

    let mut enriched = Vec::with_capacity(signals.len());
    for (source_index, source) in signals.iter().enumerate() {
        let mut output = source.clone();
        let mut best: Option<(&RuntimeSignal, f32)> = None;
        let mut best_tie_count = 0usize;
        let expected_peer_wait_reason = opposite_wait_reason(&source.wait_reason);
        if expected_peer_wait_reason.is_empty() {
            enriched.push(output);
            continue;
        }

        let candidate_indexes: Vec<usize> = signals
            .iter()
            .enumerate()
            .filter_map(|(index, candidate)| {
                if candidate.thread_id == source.thread_id {
                    return None;
                }
                let candidate_reason = candidate.wait_reason.to_ascii_lowercase();
                if !candidate_reason.contains(expected_peer_wait_reason) {
                    return None;
                }
                Some(index)
            })
            .collect();

        if candidate_indexes.is_empty() {
            enriched.push(output);
            continue;
        }

        let sampled_indexes: Vec<usize> = if candidate_indexes.len() <= MAX_CANDIDATES_PER_SOURCE {
            candidate_indexes
        } else {
            let hinted_candidate_index = static_hint.and_then(|hint| {
                candidate_indexes.iter().copied().find(|candidate_index| {
                    candidate_hint_match(&signals[*candidate_index], Some(hint))
                })
            });
            let step = candidate_indexes.len().div_ceil(MAX_CANDIDATES_PER_SOURCE);
            let offset = source_index % step;
            let mut sampled = candidate_indexes
                .into_iter()
                .skip(offset)
                .step_by(step)
                .collect::<Vec<_>>();

            // Preserve static hint precision even when large sets require sampling.
            if let Some(hinted_index) = hinted_candidate_index {
                if !sampled.contains(&hinted_index) {
                    if sampled.len() < MAX_CANDIDATES_PER_SOURCE {
                        sampled.push(hinted_index);
                    } else {
                        sampled.pop();
                        sampled.push(hinted_index);
                    }
                }
            }

            sampled
        };

        for candidate_index in sampled_indexes {
            let candidate = &signals[candidate_index];
            if candidate.thread_id == source.thread_id {
                continue;
            }

            let score = correlation_score(source, candidate, static_hint);
            if score <= 0.0 {
                continue;
            }

            if best
                .map(|(_, current)| score > current + SCORE_EPSILON)
                .unwrap_or(true)
            {
                best = Some((candidate, score));
                best_tie_count = 1;
            } else if best
                .map(|(_, current)| (score - current).abs() <= SCORE_EPSILON)
                .unwrap_or(false)
            {
                best_tie_count += 1;
            }
        }

        if let Some((candidate, score)) = best {
            let ambiguous_baseline =
                best_tie_count > 1 && (score - CORRELATION_GATE).abs() <= SCORE_EPSILON;
            if ambiguous_baseline {
                enriched.push(output);
                continue;
            }
            if score >= CORRELATION_GATE {
                output.correlation_id = Some(correlation_id(
                    &source.scope_key,
                    source.thread_id,
                    candidate.thread_id,
                ));

                // Confirmed requires score threshold AND a precision static hint match.
                let hint_matched = candidate_hint_match(candidate, static_hint);
                if let (Some(path), Some(line), Some(column)) = (
                    candidate.sample_relative_path.clone(),
                    candidate.sample_line,
                    candidate.sample_column,
                ) {
                    output.counterpart_relative_path = Some(path);
                    output.counterpart_line = Some(line);
                    output.counterpart_column = Some(column);
                }

                if score >= CONFIRMED_GATE && hint_matched {
                    output.counterpart_confidence = Some("confirmed".to_string());
                } else {
                    output.counterpart_confidence = Some("likely".to_string());
                }
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
            scope_relative_path: "main.go".to_string(),
            scope_line: line,
            scope_column: 4,
            relative_path: "main.go".to_string(),
            line,
            column: 4,
            sample_relative_path: Some("main.go".to_string()),
            sample_line: Some(line),
            sample_column: Some(4),
            correlation_id: None,
            counterpart_relative_path: None,
            counterpart_line: None,
            counterpart_column: None,
            counterpart_confidence: None,
        }
    }

    #[test]
    fn enriches_with_confirmed_when_runtime_matches_static_hint_precision() {
        // Source line 10, candidate line 15. Static hint matches candidate exactly (line 15).
        let signals = vec![signal(10, "chan receive", 10), signal(11, "chan send", 15)];
        let hint = StaticCounterpartHint {
            relative_path: "main.go".to_string(),
            line: 15,
            column: 4,
            confidence: "predicted".to_string(),
        };

        let enriched = enrich_runtime_signals_with_correlation(&signals, Some(&hint));
        let receiver = enriched.iter().find(|s| s.thread_id == 10).unwrap();

        // Base 0.60 + static match 0.20 = 0.80 (>= 0.70 confirmed gate)
        assert_eq!(
            receiver.counterpart_confidence.as_deref(),
            Some("confirmed")
        );
    }

    #[test]
    fn enriches_with_likely_when_static_hint_exists_but_does_not_match_candidate() {
        // Source line 10, candidate line 15. Static hint suggests line 99.
        // Should NOT be confirmed because candidate 15 != hint 99.
        let signals = vec![signal(10, "chan receive", 10), signal(11, "chan send", 15)];
        let hint = StaticCounterpartHint {
            relative_path: "main.go".to_string(),
            line: 99,
            column: 4,
            confidence: "predicted".to_string(),
        };

        let enriched = enrich_runtime_signals_with_correlation(&signals, Some(&hint));
        let receiver = enriched.iter().find(|s| s.thread_id == 10).unwrap();

        // Base 0.60 + NO boost = 0.60 (likely)
        assert_eq!(receiver.counterpart_confidence.as_deref(), Some("likely"));
        assert_eq!(receiver.counterpart_line, Some(15));
    }

    #[test]
    fn leaves_signal_without_counterpart_for_non_channel_states() {
        let signals = vec![signal(10, "semacquire", 10), signal(11, "semacquire", 11)];
        let enriched = enrich_runtime_signals_with_correlation(&signals, None);
        assert!(enriched
            .iter()
            .all(|item| item.counterpart_line.is_none() && item.correlation_id.is_none()));
    }

    #[test]
    fn enriches_with_likely_when_static_hint_is_missing() {
        // Source line 10, candidate line 15. No static hint.
        let signals = vec![signal(10, "chan receive", 10), signal(11, "chan send", 15)];

        let enriched = enrich_runtime_signals_with_correlation(&signals, None);
        let receiver = enriched.iter().find(|s| s.thread_id == 10).unwrap();

        // Should reach 0.60 score (base gate) which passes the correlation threshold.
        assert!(receiver.correlation_id.is_some());
        assert_eq!(receiver.counterpart_confidence.as_deref(), Some("likely"));
        assert_eq!(receiver.counterpart_line, Some(15));
    }

    #[test]
    fn correlates_even_when_thread_ids_are_far_apart() {
        let signals = vec![
            signal(10, "chan receive", 10),
            signal(10_000, "chan send", 15),
        ];
        let enriched = enrich_runtime_signals_with_correlation(&signals, None);
        let receiver = enriched.iter().find(|s| s.thread_id == 10).unwrap();
        assert!(receiver.correlation_id.is_some());
        assert_eq!(receiver.counterpart_confidence.as_deref(), Some("likely"));
        assert_eq!(receiver.counterpart_line, Some(15));
    }

    #[test]
    fn keeps_correlation_active_for_large_signal_sets() {
        let mut signals = Vec::new();
        signals.push(signal(1, "chan receive", 10));
        for index in 0..220 {
            signals.push(signal(1000 + index, "chan send", 20 + index as usize));
        }
        let hint = StaticCounterpartHint {
            relative_path: "main.go".to_string(),
            line: 42,
            column: 4,
            confidence: "predicted".to_string(),
        };
        let enriched = enrich_runtime_signals_with_correlation(&signals, Some(&hint));
        let receiver = enriched.iter().find(|s| s.thread_id == 1).unwrap();
        assert!(
            receiver.correlation_id.is_some(),
            "large snapshots should still produce runtime correlation"
        );
    }

    #[test]
    fn keeps_static_hint_candidate_when_sampling_large_signal_sets() {
        let mut signals = Vec::new();
        signals.push(signal(1, "chan receive", 10));
        for index in 0..220 {
            signals.push(signal(1000 + index, "chan send", 20 + index as usize));
        }
        let hint = StaticCounterpartHint {
            relative_path: "main.go".to_string(),
            line: 239,
            column: 4,
            confidence: "predicted".to_string(),
        };
        let enriched = enrich_runtime_signals_with_correlation(&signals, Some(&hint));
        let receiver = enriched.iter().find(|s| s.thread_id == 1).unwrap();

        assert_eq!(receiver.counterpart_line, Some(239));
        assert_eq!(
            receiver.counterpart_confidence.as_deref(),
            Some("confirmed"),
            "sampling should not drop the static-hint candidate"
        );
    }

    #[test]
    fn skips_ambiguous_baseline_ties_without_hint_match() {
        let signals = vec![
            signal(10, "chan receive", 10),
            signal(11, "chan send", 15),
            signal(12, "chan send", 25),
        ];
        let enriched = enrich_runtime_signals_with_correlation(&signals, None);
        let receiver = enriched.iter().find(|s| s.thread_id == 10).unwrap();
        assert!(receiver.correlation_id.is_none());
        assert!(receiver.counterpart_line.is_none());
        assert!(receiver.counterpart_confidence.is_none());
    }
}
