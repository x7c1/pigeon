use serde::Deserialize;
use std::io::{self, Read, Write};
use std::process::Command;

#[derive(Deserialize)]
struct AskRequest {
    file: String,
    start_line: Option<u64>,
    end_line: Option<u64>,
    /// "old" for deleted lines, "new" (or absent) for current/added lines
    side: Option<String>,
    code: String,
    question: String,
    tmux_target: Option<String>,
    debug_html: Option<String>,
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

/// Resolve tmux target: config file > extension request > default
fn resolve_tmux_target(req_target: Option<&str>) -> String {
    // 1. Config file takes precedence (machine-level override)
    if let Ok(home) = std::env::var("HOME") {
        let config_path = format!("{home}/.config/pigeon/config");
        if let Ok(contents) = std::fs::read_to_string(&config_path) {
            for line in contents.lines() {
                let line = line.trim();
                if let Some(val) = line.strip_prefix("tmux_target=") {
                    let val = val.trim();
                    if !val.is_empty() {
                        return val.to_string();
                    }
                }
            }
        }
    }

    // 2. Use repo name from extension if provided
    if let Some(t) = req_target {
        if !t.is_empty() {
            return t.to_string();
        }
    }

    // 3. Default
    "claude".to_string()
}

fn format_message(req: &AskRequest) -> String {
    let mut msg = String::new();

    // File location
    msg.push_str(&req.file);
    match (req.start_line, req.end_line) {
        (Some(s), Some(e)) if s != e => msg.push_str(&format!(":{s}-{e}")),
        (Some(s), _) => msg.push_str(&format!(":{s}")),
        _ => {}
    }
    if req.side.as_deref() == Some("old") {
        msg.push_str(" (deleted lines)");
    }
    msg.push('\n');

    // Code (truncate at char boundary to avoid panic on multibyte strings)
    let code = if req.code.len() > 2000 {
        let end = req
            .code
            .char_indices()
            .map(|(i, _)| i)
            .take_while(|&i| i <= 2000)
            .last()
            .unwrap_or(0);
        format!("{}...(truncated)", &req.code[..end])
    } else {
        req.code.clone()
    };
    msg.push_str("```\n");
    msg.push_str(&code);
    msg.push_str("\n```\n");

    // Question
    if !req.question.is_empty() {
        msg.push_str(&req.question);
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

fn main() {
    // Native Messaging Host receives messages one at a time.
    // Chrome starts and stops the process as needed.
    while let Ok(raw) = read_message() {
        let req: AskRequest = match serde_json::from_str(&raw) {
            Ok(r) => r,
            Err(e) => {
                write_message(&format!(r#"{{"ok":false,"error":"Invalid JSON: {e}"}}"#));
                continue;
            }
        };

        // Write debug HTML to file when file path extraction failed
        if let Some(ref html) = req.debug_html {
            if let Ok(home) = std::env::var("HOME") {
                let debug_path = format!("{home}/.config/pigeon/debug.json");
                let _ = std::fs::write(&debug_path, html);
            }
        }

        let message = format_message(&req);
        let target = resolve_tmux_target(req.tmux_target.as_deref());

        match send_to_tmux(&message, &target) {
            Ok(()) => write_message(r#"{"ok":true}"#),
            Err(e) => write_message(&format!(r#"{{"ok":false,"error":"{e}"}}"#)),
        }
    }
}
