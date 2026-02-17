use serde::Deserialize;
use std::io::{self, Read, Write};
use std::process::Command;

#[derive(Deserialize)]
struct AskRequest {
    file: String,
    start_line: Option<u64>,
    end_line: Option<u64>,
    code: String,
    question: String,
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

fn tmux_target() -> String {
    // Read from ~/.config/pigeon/config
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
    msg.push('\n');

    // Code
    let code = if req.code.len() > 2000 {
        format!("{}...(truncated)", &req.code[..2000])
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

fn send_to_tmux(message: &str) -> Result<(), String> {
    let target = tmux_target();

    Command::new("tmux")
        .args(["send-keys", "-t", &target, message])
        .status()
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    Command::new("tmux")
        .args(["send-keys", "-t", &target, "Enter"])
        .status()
        .map_err(|e| format!("Failed to run tmux: {e}"))?;

    Ok(())
}

fn main() {
    // Native Messaging Host receives messages one at a time.
    // Chrome starts and stops the process as needed.
    loop {
        let raw = match read_message() {
            Ok(r) => r,
            Err(_) => break, // stdin closed = Chrome disconnected
        };

        let req: AskRequest = match serde_json::from_str(&raw) {
            Ok(r) => r,
            Err(e) => {
                write_message(&format!(r#"{{"ok":false,"error":"Invalid JSON: {e}"}}"#));
                continue;
            }
        };

        let message = format_message(&req);

        match send_to_tmux(&message) {
            Ok(()) => write_message(r#"{"ok":true}"#),
            Err(e) => write_message(&format!(r#"{{"ok":false,"error":"{e}"}}"#)),
        }
    }
}
