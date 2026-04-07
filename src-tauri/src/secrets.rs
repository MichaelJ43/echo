//! OS keychain / credential manager storage for `{{secret:NAME}}` placeholders.
//! Key names are listed in `secret_index.json` (values never touch disk).
//!
//! New keys use `echo_<environmentId>_<logicalName>` (UUID environment id). Legacy bare
//! logical names are still read for one release (`get_secret_for_placeholder`).

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

const KEYRING_SERVICE: &str = "echo/dev.echo.app/secrets";

/// UUID string length (`8-4-4-4-12`).
pub const ENVIRONMENT_ID_LEN: usize = 36;

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

fn is_uuid_simple(s: &str) -> bool {
    s.len() == ENVIRONMENT_ID_LEN
        && s.bytes().enumerate().all(|(i, b)| {
            match i {
                8 | 13 | 18 | 23 => b == b'-',
                _ => b.is_ascii_hexdigit(),
            }
        })
}

/// Validates a keyring key: legacy logical name only, or `echo_<uuid>_<logical>`.
pub fn validate_storage_key_full(key: &str) -> Result<(), String> {
    if validate_secret_key(key).is_ok() {
        return Ok(());
    }
    let Some(rest) = key.strip_prefix("echo_") else {
        return Err("Invalid secret storage key.".into());
    };
    if rest.len() < ENVIRONMENT_ID_LEN + 2 {
        return Err("Invalid secret storage key.".into());
    }
    let env_id = &rest[..ENVIRONMENT_ID_LEN];
    if rest.as_bytes().get(ENVIRONMENT_ID_LEN) != Some(&b'_') {
        return Err("Invalid secret storage key.".into());
    }
    if !is_uuid_simple(env_id) {
        return Err("Invalid secret storage key.".into());
    }
    let logical = &rest[ENVIRONMENT_ID_LEN + 1..];
    validate_secret_key(logical)
}

/// Builds `echo_<environmentId>_<logicalName>` for the OS keyring.
pub fn compose_storage_key(environment_id: &str, logical_name: &str) -> Result<String, String> {
    if environment_id.len() != ENVIRONMENT_ID_LEN || !is_uuid_simple(environment_id) {
        return Err("Invalid environment id for secret storage.".into());
    }
    validate_secret_key(logical_name)?;
    let key = format!("echo_{environment_id}_{logical_name}");
    validate_storage_key_full(&key)?;
    Ok(key)
}

/// Resolve `{{secret:logical}}` for HTTP: composed key first, then legacy bare name.
pub fn get_secret_for_placeholder(environment_id: &str, logical_name: &str) -> Result<String, String> {
    validate_secret_key(logical_name)?;
    if environment_id.is_empty() {
        return get_secret(logical_name);
    }
    let composed = compose_storage_key(environment_id, logical_name)?;
    match get_secret(&composed) {
        Ok(v) => Ok(v),
        Err(_) => get_secret(logical_name),
    }
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
    validate_storage_key_full(key)?;
    let entry = keyring_entry(key)?;
    entry
        .get_password()
        .map_err(|_| "Unknown or unreadable secret.".to_string())
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
    validate_storage_key_full(&key)?;
    let entry = keyring_entry(&key)?;
    entry.set_password(&value).map_err(|e| e.to_string())?;
    let mut keys: BTreeSet<String> = load_secret_index(app)?.into_iter().collect();
    keys.insert(key);
    save_secret_index(app, keys)
}

pub fn delete_secret(app: &AppHandle, key: String) -> Result<(), String> {
    validate_storage_key_full(&key)?;
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

/// Logical secret names that have a composed key for this environment (`echo_<envId>_…`).
pub fn list_secret_logical_names_for_env(
    app: &AppHandle,
    environment_id: &str,
) -> Result<Vec<String>, String> {
    if environment_id.len() != ENVIRONMENT_ID_LEN || !is_uuid_simple(environment_id) {
        return Err("Invalid environment id.".into());
    }
    let prefix = format!("echo_{environment_id}_");
    let all = load_secret_index(app)?;
    let mut out: Vec<String> = all
        .into_iter()
        .filter_map(|k| {
            k.strip_prefix(&prefix)
                .filter(|logical| validate_secret_key(logical).is_ok())
                .map(str::to_string)
        })
        .collect();
    out.sort();
    out.dedup();
    Ok(out)
}

/// Removes every keychain entry whose storage key starts with `echo_<environmentId>_`.
/// Call when an environment is deleted so secrets do not remain as orphans in the OS store.
pub fn delete_secrets_for_environment(
    app: &AppHandle,
    environment_id: &str,
) -> Result<usize, String> {
    if environment_id.len() != ENVIRONMENT_ID_LEN || !is_uuid_simple(environment_id) {
        return Err("Invalid environment id.".into());
    }
    let prefix = format!("echo_{environment_id}_");
    let all = load_secret_index(app)?;
    let to_remove: Vec<String> = all
        .into_iter()
        .filter(|k| k.starts_with(&prefix))
        .collect();
    let n = to_remove.len();
    for key in to_remove {
        delete_secret(app, key)?;
    }
    Ok(n)
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

    #[test]
    fn compose_storage_key_roundtrip() {
        let env = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
        let k = super::compose_storage_key(env, "api_key").unwrap();
        assert!(k.starts_with("echo_a1b2c3d4-e5f6-7890-abcd-ef1234567890_"));
        assert!(k.ends_with("_api_key"));
        super::validate_storage_key_full(&k).unwrap();
    }
}
