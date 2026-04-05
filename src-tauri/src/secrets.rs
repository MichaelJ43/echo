//! OS keychain / credential manager storage for `{{secret:NAME}}` placeholders.
//! Key names are listed in `secret_index.json` (values never touch disk).

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

const KEYRING_SERVICE: &str = "echo/dev.echo.app/secrets";

/// Allowed characters for `{{secret:NAME}}` — must stay in sync with `http_client` placeholder regex
/// and `secretPlaceholders.ts`.
fn is_valid_secret_name_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.')
}

pub fn validate_secret_key(key: &str) -> Result<(), String> {
    if key.is_empty() {
        return Err("Secret name is required.".into());
    }
    if !key.chars().all(is_valid_secret_name_char) {
        return Err(
            "Secret name may only contain letters, digits, underscores, hyphens, and periods."
                .into(),
        );
    }
    Ok(())
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("secret_index.json"))
        .map_err(|e| e.to_string())
}

fn keyring_entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, key).map_err(|e| e.to_string())
}

/// Read password from host credential store (no app handle needed).
pub fn get_secret(key: &str) -> Result<String, String> {
    validate_secret_key(key)?;
    let entry = keyring_entry(key)?;
    entry
        .get_password()
        .map_err(|_| format!("Unknown or unreadable secret '{key}'."))
}

pub fn load_secret_index(app: &AppHandle) -> Result<Vec<String>, String> {
    let path = index_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut keys: Vec<String> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    keys.sort();
    keys.dedup();
    Ok(keys)
}

fn save_secret_index(app: &AppHandle, keys: BTreeSet<String>) -> Result<(), String> {
    let path = index_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let list: Vec<String> = keys.into_iter().collect();
    let json = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn set_secret(app: &AppHandle, key: String, value: String) -> Result<(), String> {
    validate_secret_key(&key)?;
    let entry = keyring_entry(&key)?;
    entry.set_password(&value).map_err(|e| e.to_string())?;
    let mut keys: BTreeSet<String> = load_secret_index(app)?.into_iter().collect();
    keys.insert(key);
    save_secret_index(app, keys)
}

pub fn delete_secret(app: &AppHandle, key: String) -> Result<(), String> {
    validate_secret_key(&key)?;
    if let Ok(entry) = keyring_entry(&key) {
        let _ = entry.delete_credential();
    }
    let mut keys: BTreeSet<String> = load_secret_index(app)?.into_iter().collect();
    keys.remove(&key);
    save_secret_index(app, keys)
}

pub fn list_secret_keys(app: &AppHandle) -> Result<Vec<String>, String> {
    load_secret_index(app)
}

#[cfg(test)]
mod tests {
    use super::validate_secret_key;

    #[test]
    fn validate_accepts_hyphen_and_dot() {
        validate_secret_key("api-key").expect("hyphen");
        validate_secret_key("stripe.api_key").expect("dot");
        validate_secret_key("v1").expect("starts with digit");
    }

    #[test]
    fn validate_rejects_space_and_colon() {
        assert!(validate_secret_key("a b").is_err());
        assert!(validate_secret_key("a:b").is_err());
    }
}
