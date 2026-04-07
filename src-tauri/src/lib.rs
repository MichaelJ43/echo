mod http_client;
mod persistence;
mod secrets;

use persistence::{export_to_path, import_from_path, load_workspace, save_workspace, AppState};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppPaths {
    app_data_dir: String,
    collections_file: String,
}

#[tauri::command]
fn get_paths(app: tauri::AppHandle) -> Result<AppPaths, String> {
    let dir = persistence::app_data_dir(&app)?;
    let collections = dir.join("collections.json");
    Ok(AppPaths {
        app_data_dir: dir.to_string_lossy().into_owned(),
        collections_file: collections.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn load_state(app: tauri::AppHandle) -> Result<AppState, String> {
    load_workspace(&app)
}

#[tauri::command]
fn save_state(app: tauri::AppHandle, state: AppState) -> Result<(), String> {
    save_workspace(&app, &state)
}

#[tauri::command]
async fn send_http_request(
    config: http_client::HttpRequestConfig,
) -> Result<http_client::HttpResponsePayload, String> {
    http_client::send_request(config).await
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(Path::new(&path), contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_workspace_file(path: String) -> Result<AppState, String> {
    import_from_path(Path::new(&path))
}

#[tauri::command]
fn export_workspace_file(path: String, state: AppState) -> Result<(), String> {
    export_to_path(Path::new(&path), &state)
}

/// Opens a URL in the system default browser (WebView `window.open` is unreliable on desktop).
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    open::that(url).map_err(|e| e.to_string())
}

/// Opens the parent directory of `path` in the system file manager (Explorer, Finder, etc.).
#[tauri::command]
fn open_containing_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    let dir = p
        .parent()
        .ok_or_else(|| "Path has no parent directory".to_string())?;
    open::that(dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_secret_keys(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    secrets::list_secret_keys(&app)
}

#[tauri::command]
fn list_secret_logical_names_for_env(
    app: tauri::AppHandle,
    environment_id: String,
) -> Result<Vec<String>, String> {
    secrets::list_secret_logical_names_for_env(&app, &environment_id)
}

#[tauri::command]
fn set_secret(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    secrets::set_secret(&app, key, value)
}

#[tauri::command]
fn delete_secret(app: tauri::AppHandle, key: String) -> Result<(), String> {
    secrets::delete_secret(&app, key)
}

#[tauri::command]
fn delete_secrets_for_environment(
    app: tauri::AppHandle,
    environment_id: String,
) -> Result<usize, String> {
    secrets::delete_secrets_for_environment(&app, &environment_id)
}

#[tauri::command]
fn resolve_secret_placeholder_rows(
    rows: Vec<secrets::SecretPlaceholderRowInput>,
) -> Result<Vec<secrets::SecretPlaceholderResolution>, String> {
    secrets::resolve_secret_placeholder_rows(rows)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_paths,
            load_state,
            save_state,
            send_http_request,
            read_text_file,
            write_text_file,
            import_workspace_file,
            export_workspace_file,
            open_external_url,
            open_containing_folder,
            list_secret_keys,
            list_secret_logical_names_for_env,
            set_secret,
            delete_secret,
            delete_secrets_for_environment,
            resolve_secret_placeholder_rows
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = persistence::ensure_workspace(&handle) {
                    eprintln!("echo: workspace init: {e}");
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Echo");
}
