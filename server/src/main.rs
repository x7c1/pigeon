use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};
use std::process::Command;

#[derive(Deserialize)]
#[serde(tag = "action")]
enum Request {
    #[serde(rename = "send")]
    Send {
        file: String,
        start_line: Option<u64>,
        end_line: Option<u64>,
        /// "old" for deleted lines, "new" (or absent) for current/added lines
        side: Option<String>,
        code: String,
        question: String,
        tmux_target: String,
        debug_html: Option<String>,
    },
    #[serde(rename = "list-sessions")]
    ListSessions,
}

#[derive(Serialize)]
struct SendResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
struct ListSessionsResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    sessions: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Read a message using Native Messaging protocol (4-byte little-endian length prefix)
fn read_message() -> io::Result<String> {
    let mut len_bytes = [0u8; 4];
    io::stdin().read_exact(&mut len_bytes)?;
    let len = u32::from_le_bytes(len_bytes) as usize;

    let mut buf = vec![0u8; len];
    io::stdin().read_exact(&mut buf)?;
    String::from_utf8(buf).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

/// Write a response using Native Messaging protocol
fn write_message(msg: &str) {
    let bytes = msg.as_bytes();
    let len = (bytes.len() as u32).to_le_bytes();
    let _ = io::stdout().write_all(&len);
    let _ = io::stdout().write_all(bytes);
    let _ = io::stdout().flush();
}

fn write_json(value: &impl Serialize) {
    let json = serde_json::to_string(value).expect("Failed to serialize response");
    write_message(&json);
}

fn format_message(
    file: &str,
    start_line: Option<u64>,
    end_line: Option<u64>,
    side: Option<&str>,
    code: &str,
    question: &str,
) -> String {
    let mut msg = String::new();

    // File location
    msg.push_str(file);
    match (start_line, end_line) {
        (Some(s), Some(e)) if s != e => msg.push_str(&format!(":{s}-{e}")),
        (Some(s), _) => msg.push_str(&format!(":{s}")),
        _ => {}
    }
    if side == Some("old") {
        msg.push_str(" (deleted lines)");
    }
    msg.push('\n');

    // Code (truncate at char boundary to avoid panic on multibyte strings)
    let truncated_code = if code.len() > 2000 {
        let end = code
            .char_indices()
            .map(|(i, _)| i)
            .take_while(|&i| i <= 2000)
            .last()
            .unwrap_or(0);
        format!("{}...(truncated)", &code[..end])
    } else {
        code.to_string()
    };
    msg.push_str("```\n");
    msg.push_str(&truncated_code);
    msg.push_str("\n```\n");

    // Question
    if !question.is_empty() {
        msg.push_str(question);
    } else {
        msg.push_str("Explain this code");
    }

    msg
}

/// Find tmux binary path. Chrome Native Messaging launches with a minimal PATH,
/// so we check common locations where package managers install tmux.
fn find_tmux() -> String {
    let candidates = [
        "/opt/homebrew/bin/tmux", // Homebrew on Apple Silicon
        "/usr/local/bin/tmux",    // Homebrew on Intel Mac / Linux manual install
        "/usr/bin/tmux",          // System package manager
    ];
    for path in candidates {
        if std::path::Path::new(path).exists() {
            return path.to_string();
        }
    }
    "tmux".to_string()
}

fn send_to_tmux(message: &str, target: &str) -> Result<(), String> {
    let tmux = find_tmux();

    Command::new(&tmux)
        .args(["send-keys", "-t", target, message])
        .status()
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    Command::new(&tmux)
        .args(["send-keys", "-t", target, "Enter"])
        .status()
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    Ok(())
}

fn list_sessions() -> Result<Vec<String>, String> {
    let tmux = find_tmux();

    let output = Command::new(&tmux)
        .args(["list-sessions", "-F", "#{session_name}"])
        .output()
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux list-sessions failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let sessions: Vec<String> = stdout.lines().map(|s| s.to_string()).collect();
    Ok(sessions)
}

fn handle_request(req: Request) {
    match req {
        Request::Send {
            file,
            start_line,
            end_line,
            side,
            code,
            question,
            tmux_target,
            debug_html,
        } => {
            // Write debug HTML to file when file path extraction failed
            if let Some(ref html) = debug_html {
                if let Ok(home) = std::env::var("HOME") {
                    let debug_path = format!("{home}/.config/pigeon/debug.json");
                    let _ = std::fs::write(&debug_path, html);
                }
            }

            let message = format_message(
                &file,
                start_line,
                end_line,
                side.as_deref(),
                &code,
                &question,
            );

            match send_to_tmux(&message, &tmux_target) {
                Ok(()) => write_json(&SendResponse {
                    ok: true,
                    error: None,
                }),
                Err(e) => write_json(&SendResponse {
                    ok: false,
                    error: Some(e),
                }),
            }
        }
        Request::ListSessions => match list_sessions() {
            Ok(sessions) => write_json(&ListSessionsResponse {
                ok: true,
                sessions: Some(sessions),
                error: None,
            }),
            Err(e) => write_json(&ListSessionsResponse {
                ok: false,
                sessions: None,
                error: Some(e),
            }),
        },
    }
}

fn main() {
    // Native Messaging Host receives messages one at a time.
    // Chrome starts and stops the process as needed.
    while let Ok(raw) = read_message() {
        let req: Request = match serde_json::from_str(&raw) {
            Ok(r) => r,
            Err(e) => {
                write_json(&SendResponse {
                    ok: false,
                    error: Some(format!("Invalid JSON: {e}")),
                });
                continue;
            }
        };

        handle_request(req);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_send_request() {
        let json = r#"{
            "action": "send",
            "file": "src/main.rs",
            "start_line": 10,
            "end_line": 20,
            "side": "new",
            "code": "fn main() {}",
            "question": "What does this do?",
            "tmux_target": "my-session"
        }"#;
        let req: Request = serde_json::from_str(json).unwrap();
        match req {
            Request::Send {
                file,
                tmux_target,
                question,
                ..
            } => {
                assert_eq!(file, "src/main.rs");
                assert_eq!(tmux_target, "my-session");
                assert_eq!(question, "What does this do?");
            }
            _ => panic!("Expected Send variant"),
        }
    }

    #[test]
    fn test_deserialize_list_sessions_request() {
        let json = r#"{"action": "list-sessions"}"#;
        let req: Request = serde_json::from_str(json).unwrap();
        assert!(matches!(req, Request::ListSessions));
    }

    #[test]
    fn test_deserialize_send_with_optional_fields() {
        let json = r#"{
            "action": "send",
            "file": "lib.rs",
            "code": "let x = 1;",
            "question": "",
            "tmux_target": "dev"
        }"#;
        let req: Request = serde_json::from_str(json).unwrap();
        match req {
            Request::Send {
                start_line,
                end_line,
                side,
                debug_html,
                ..
            } => {
                assert!(start_line.is_none());
                assert!(end_line.is_none());
                assert!(side.is_none());
                assert!(debug_html.is_none());
            }
            _ => panic!("Expected Send variant"),
        }
    }

    #[test]
    fn test_deserialize_unknown_action_fails() {
        let json = r#"{"action": "unknown"}"#;
        let result: Result<Request, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_format_message_basic() {
        let msg = format_message(
            "src/main.rs",
            Some(10),
            Some(20),
            None,
            "fn main() {}",
            "Explain",
        );
        assert!(msg.contains("src/main.rs:10-20"));
        assert!(msg.contains("fn main() {}"));
        assert!(msg.contains("Explain"));
    }

    #[test]
    fn test_format_message_deleted_lines() {
        let msg = format_message("old.rs", Some(5), None, Some("old"), "deleted code", "Why?");
        assert!(msg.contains("old.rs:5 (deleted lines)"));
    }

    #[test]
    fn test_format_message_empty_question() {
        let msg = format_message("file.rs", None, None, None, "code", "");
        assert!(msg.contains("Explain this code"));
    }

    #[test]
    fn test_serialize_send_response_ok() {
        let resp = SendResponse {
            ok: true,
            error: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert_eq!(json, r#"{"ok":true}"#);
    }

    #[test]
    fn test_serialize_send_response_error() {
        let resp = SendResponse {
            ok: false,
            error: Some("something went wrong".to_string()),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains(r#""ok":false"#));
        assert!(json.contains(r#""error":"something went wrong""#));
    }

    #[test]
    fn test_serialize_list_sessions_response_ok() {
        let resp = ListSessionsResponse {
            ok: true,
            sessions: Some(vec!["pigeon".to_string(), "dev".to_string()]),
            error: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains(r#""ok":true"#));
        assert!(json.contains(r#""sessions":["pigeon","dev"]"#));
    }

    #[test]
    fn test_serialize_list_sessions_response_error() {
        let resp = ListSessionsResponse {
            ok: false,
            sessions: None,
            error: Some("tmux not found".to_string()),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains(r#""ok":false"#));
        assert!(json.contains(r#""error":"tmux not found""#));
        assert!(!json.contains("sessions"));
    }
}
