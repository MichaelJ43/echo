//! Append-only JSON-lines request history beside `collections.json` (`request_history.log`).
//! Stores metadata only (ids, names, method, status, duration, optional short error)—never bodies or URLs.

use crate::http_client::{HttpResponsePayload, RequestLogContext};
use crate::persistence::app_data_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::AppHandle;

const LOG_FILE: &str = "request_history.log";
const SETTINGS_FILE: &str = "request_log_settings.json";

const DEFAULT_MAX_ENTRIES: u32 = 500;
const MIN_MAX_ENTRIES: u32 = 50;
const MAX_MAX_ENTRIES: u32 = 50_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestLogEntry {
    pub ts: String,
    pub request_id: String,
    pub request_name: String,
    pub method: String,
    pub status: Option<u16>,
    pub duration_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestLogSettings {
    #[serde(default = "default_max_entries")]
    pub max_entries: u32,
}

fn default_max_entries() -> u32 {
    DEFAULT_MAX_ENTRIES
}

pub fn clamp_max_entries(n: u32) -> u32 {
    n.clamp(MIN_MAX_ENTRIES, MAX_MAX_ENTRIES)
}

fn log_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(LOG_FILE))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(SETTINGS_FILE))
}

pub fn load_max_entries(app: &AppHandle) -> u32 {
    let Ok(path) = settings_path(app) else {
        return DEFAULT_MAX_ENTRIES;
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return DEFAULT_MAX_ENTRIES;
    };
    let Ok(s) = serde_json::from_str::<RequestLogSettings>(&raw) else {
        return DEFAULT_MAX_ENTRIES;
    };
    clamp_max_entries(s.max_entries)
}

pub fn save_max_entries(app: &AppHandle, max_entries: u32) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let settings = RequestLogSettings {
        max_entries: clamp_max_entries(max_entries),
    };
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn truncate_err(s: &str) -> String {
    const MAX: usize = 240;
    if s.chars().count() <= MAX {
        return s.to_string();
    }
    s.chars().take(MAX).collect::<String>() + "…"
}

/// Records one send attempt (success or transport/HTTP-layer error). Best-effort; ignores I/O failures.
pub fn record_send_outcome(
    app: &AppHandle,
    ctx: &RequestLogContext,
    method: &str,
    duration_ms: u64,
    result: &Result<HttpResponsePayload, String>,
) {
    let ts = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let entry = match result {
        Ok(r) => RequestLogEntry {
            ts,
            request_id: ctx.request_id.clone(),
            request_name: ctx.request_name.clone(),
            method: method.to_string(),
            status: Some(r.status),
            duration_ms,
            error: None,
        },
        Err(e) => RequestLogEntry {
            ts,
            request_id: ctx.request_id.clone(),
            request_name: ctx.request_name.clone(),
            method: method.to_string(),
            status: None,
            duration_ms,
            error: Some(truncate_err(e)),
        },
    };
    let _ = append_line_and_trim(app, entry);
}

fn append_line_and_trim(app: &AppHandle, entry: RequestLogEntry) -> Result<(), String> {
    let max = load_max_entries(app);
    let path = log_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut lines: Vec<String> = Vec::new();
    if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        for line in raw.lines() {
            let t = line.trim();
            if !t.is_empty() {
                lines.push(t.to_string());
            }
        }
    }

    let new_line = serde_json::to_string(&entry).map_err(|e| e.to_string())?;
    lines.push(new_line);

    if lines.len() as u32 > max {
        let drop = lines.len() - max as usize;
        lines.drain(..drop);
    }

    let out = lines.join("\n") + "\n";
    let mut f = fs::File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(out.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_entries_newest_first(app: &AppHandle) -> Result<Vec<RequestLogEntry>, String> {
    let path = log_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut out: Vec<RequestLogEntry> = Vec::new();
    for line in raw.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        if let Ok(e) = serde_json::from_str::<RequestLogEntry>(t) {
            out.push(e);
        }
    }
    out.reverse();
    Ok(out)
}

pub fn trim_file_to_max(app: &AppHandle) -> Result<(), String> {
    let max = load_max_entries(app);
    let path = log_path(app)?;
    if !path.exists() {
        return Ok(());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = Vec::new();
    for line in raw.lines() {
        let t = line.trim();
        if !t.is_empty() {
            lines.push(t.to_string());
        }
    }
    if lines.len() as u32 <= max {
        return Ok(());
    }
    let drop = lines.len() - max as usize;
    lines.drain(..drop);
    let out = lines.join("\n") + "\n";
    fs::write(path, out).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_bounds() {
        assert_eq!(clamp_max_entries(10), MIN_MAX_ENTRIES);
        assert_eq!(clamp_max_entries(100_000), MAX_MAX_ENTRIES);
        assert_eq!(clamp_max_entries(500), 500);
    }
}
