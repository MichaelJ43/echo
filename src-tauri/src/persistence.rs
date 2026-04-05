use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValue {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub variables: Vec<KeyValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum AuthConfig {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "bearer")]
    Bearer { token: String },
    #[serde(rename = "basic")]
    Basic { username: String, password: String },
    #[serde(rename = "apiKey")]
    ApiKey {
        key: String,
        value: String,
        #[serde(rename = "addTo")]
        add_to: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestItem {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub environment_id: Option<String>,
    pub method: String,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub query_params: Vec<KeyValue>,
    pub body: String,
    #[serde(default = "default_body_type")]
    pub body_type: String,
    pub auth: AuthConfig,
    pub script: String,
}

fn default_body_type() -> String {
    "none".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "nodeType")]
pub enum CollectionNode {
    #[serde(rename = "folder")]
    Folder {
        id: String,
        name: String,
        children: Vec<CollectionNode>,
    },
    #[serde(rename = "request")]
    Request { #[serde(flatten)] request: RequestItem },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub version: u32,
    #[serde(default)]
    pub active_environment_id: Option<String>,
    pub environments: Vec<Environment>,
    pub collections: Vec<CollectionNode>,
    pub active_request_id: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        let env_id = Uuid::new_v4().to_string();
        let req_id = Uuid::new_v4().to_string();
        Self {
            version: 1,
            active_environment_id: None,
            environments: vec![Environment {
                id: env_id.clone(),
                name: "Default".to_string(),
                variables: vec![],
            }],
            collections: vec![CollectionNode::Folder {
                id: Uuid::new_v4().to_string(),
                name: "My collection".to_string(),
                children: vec![CollectionNode::Request {
                    request: RequestItem {
                        id: req_id,
                        name: "Example GET".to_string(),
                        environment_id: Some(env_id),
                        method: "GET".to_string(),
                        url: "https://httpbin.org/get".to_string(),
                        headers: vec![],
                        query_params: vec![],
                        body: String::new(),
                        body_type: "none".to_string(),
                        auth: AuthConfig::None,
                        script: String::new(),
                    },
                }],
            }],
            active_request_id: None,
        }
    }
}

pub fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
}

fn collections_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("collections.json"))
}

pub fn ensure_workspace(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = app_data_dir(app)?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let path = collections_path(app)?;
    if !path.exists() {
        let state = AppState::default();
        save_workspace(app, &state)?;
    }
    Ok(())
}

pub fn load_workspace(app: &tauri::AppHandle) -> Result<AppState, String> {
    let path = collections_path(app)?;
    if !path.exists() {
        return Ok(AppState::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub fn save_workspace(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let path = collections_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn export_to_path(path: &Path, state: &AppState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn import_from_path(path: &Path) -> Result<AppState, String> {
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}
