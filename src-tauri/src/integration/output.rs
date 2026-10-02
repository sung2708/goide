//! Drain arbitrary tool output without allocating an unbounded line.
use tokio::io::{AsyncRead, AsyncReadExt};
const LINE_LIMIT: usize = 16 * 1024;
pub async fn stream_lines(
    mut reader: impl AsyncRead + Unpin,
    mut receive: impl FnMut(String),
) -> std::io::Result<()> {
    let mut emitted = 0usize;
    let mut truncated = false;
    let mut emit = |line: String| {
        if emitted + line.len() < 2 * 1024 * 1024 && !truncated {
            emitted += line.len() + 1;
            receive(line);
        } else if !truncated {
            truncated = true;
            receive("[Tool output truncated after 2 MiB; remaining output is drained.]".into());
        }
    };
    let mut chunk = [0; 8192];
    let mut pending = Vec::<u8>::new();
    loop {
        let count = reader.read(&mut chunk).await?;
        if count == 0 {
            break;
        }
        pending.extend_from_slice(&chunk[..count]);
        loop {
            if let Some(newline) = pending
                .iter()
                .position(|byte| *byte == b'\n')
                .filter(|index| *index <= LINE_LIMIT)
            {
                let mut line: Vec<_> = pending.drain(..=newline).collect();
                line.pop();
                if line.last() == Some(&b'\r') {
                    line.pop();
                }
                emit(String::from_utf8_lossy(&line).into_owned());
            } else if pending.len() > LINE_LIMIT {
                let mut end = LINE_LIMIT;
                while end > LINE_LIMIT - 4
                    && pending.get(end).is_some_and(|byte| *byte & 0xc0 == 0x80)
                {
                    end -= 1;
                }
                emit(
                    String::from_utf8_lossy(&pending.drain(..end).collect::<Vec<_>>()).into_owned(),
                );
            } else {
                break;
            }
        }
    }
    if !pending.is_empty() {
        emit(String::from_utf8_lossy(&pending).into_owned());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn drains_long_unterminated_output_with_bounded_utf8_chunks() {
        let text = "Ω🦀".repeat(100000);
        let mut lines = vec![];
        stream_lines(text.as_bytes(), |line| lines.push(line))
            .await
            .unwrap();
        assert!(lines.iter().all(|line| line.len() <= LINE_LIMIT));
        assert_eq!(lines.concat(), text);
        let mut lines = vec![];
        stream_lines("one\r\n\r\nlast".as_bytes(), |line| lines.push(line))
            .await
            .unwrap();
        assert_eq!(lines, ["one", "", "last"]);
        let mut lines = vec![];
        stream_lines("x".repeat(3 * 1024 * 1024).as_bytes(), |line| {
            lines.push(line)
        })
        .await
        .unwrap();
        assert!(lines.last().unwrap().contains("truncated"));
        assert!(lines.concat().len() < 2 * 1024 * 1024 + 100);
    }
}
