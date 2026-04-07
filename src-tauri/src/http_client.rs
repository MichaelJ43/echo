use crate::persistence::{AuthConfig, KeyValue};
use crate::secrets;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;
use std::time::Instant;
use url::Url;

/// Max bytes read from disk for multipart/binary bodies (single-part cap).
const MAX_HTTP_BODY_BYTES: u64 = 50 * 1024 * 1024;

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent(concat!("Echo/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("reqwest HTTP client")
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultipartPartPayload {
    pub enabled: bool,
    pub key: String,
    pub part_kind: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub file_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryBodyPayload {
    pub path: String,
    #[serde(default)]
    pub content_type: Option<String>,
}

/// Metadata for desktop request history (no URL/body; written to `request_history.log`).
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RequestLogContext {
    pub request_id: String,
    pub request_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestConfig {
    pub method: String,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub query_params: Vec<KeyValue>,
    pub body: String,
    pub body_type: String,
    pub auth: AuthConfig,
    pub variables: HashMap<String, String>,
    /// Active environment id (UUID) for `{{secret:name}}` → `echo_<id>_name` keychain lookup.
    #[serde(default)]
    pub environment_id: String,
    #[serde(default)]
    pub multipart_parts: Option<Vec<MultipartPartPayload>>,
    #[serde(default)]
    pub binary_body: Option<BinaryBodyPayload>,
    #[serde(default)]
    pub request_log: Option<RequestLogContext>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub duration_ms: u64,
}

fn substitute(s: &str, vars: &HashMap<String, String>) -> String {
    let mut out = s.to_string();
    for (k, v) in vars {
        let needle = format!("{{{{{}}}}}", k);
        out = out.replace(&needle, v);
    }
    out
}

fn secret_placeholder_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\{\{secret:([a-zA-Z0-9_.-]+)\}\}").expect("secret placeholder regex")
    })
}

/// Replaces `{{secret:NAME}}` with keychain values; collects substituted values for log masking.
fn apply_secret_placeholders(s: &str, environment_id: &str) -> Result<(String, Vec<String>), String> {
    let re = secret_placeholder_regex();
    let mut out = s.to_string();
    let mut acc = Vec::new();
    loop {
        let Some(cap) = re.captures(&out) else {
            break;
        };
        let name = cap.get(1).unwrap().as_str();
        let full = cap.get(0).unwrap().as_str();
        let val = secrets::get_secret_for_placeholder(environment_id, name)?;
        acc.push(val.clone());
        out = out.replacen(full, &val, 1);
    }
    Ok((out, acc))
}

fn substitute_env_and_secrets(
    s: &str,
    vars: &HashMap<String, String>,
    environment_id: &str,
) -> Result<(String, Vec<String>), String> {
    let after_env = substitute(s, vars);
    apply_secret_placeholders(&after_env, environment_id)
}

fn merge_secret_vecs(mask_acc: &mut Vec<String>, mut extra: Vec<String>) {
    mask_acc.append(&mut extra);
}

pub(crate) fn mask_for_log(s: &str, secrets: &[String]) -> String {
    let uniq: std::collections::HashSet<String> = secrets.iter().cloned().collect();
    let mut ordered: Vec<String> = uniq.into_iter().collect();
    ordered.sort_by_key(|a| std::cmp::Reverse(a.len()));
    let mut out = s.to_string();
    for sec in ordered {
        if sec.is_empty() {
            continue;
        }
        out = out.replace(&sec, "*****");
    }
    out
}

fn append_query(
    url: &mut Url,
    query: &[KeyValue],
    vars: &HashMap<String, String>,
    environment_id: &str,
    mask_acc: &mut Vec<String>,
) -> Result<(), String> {
    for q in query {
        if !q.enabled || q.key.is_empty() {
            continue;
        }
        let (k, sec_k) = substitute_env_and_secrets(&q.key, vars, environment_id)?;
        let (v, sec_v) = substitute_env_and_secrets(&q.value, vars, environment_id)?;
        merge_secret_vecs(mask_acc, sec_k);
        merge_secret_vecs(mask_acc, sec_v);
        url.query_pairs_mut().append_pair(&k, &v);
    }
    Ok(())
}

fn build_base_url(
    raw: &str,
    query: &[KeyValue],
    vars: &HashMap<String, String>,
    environment_id: &str,
    mask_acc: &mut Vec<String>,
) -> Result<Url, String> {
    let (resolved, sec) = substitute_env_and_secrets(raw, vars, environment_id)?;
    merge_secret_vecs(mask_acc, sec);
    let mut url = Url::parse(&resolved).map_err(|e| {
        format!(
            "Invalid URL: {e} ({})",
            mask_for_log(&resolved, mask_acc)
        )
    })?;
    append_query(&mut url, query, vars, environment_id, mask_acc)?;
    Ok(url)
}

/// Sends the configured HTTP request via `reqwest` (TLS for `https://` URLs).
/// CodeQL `rust/cleartext-transmission` is a false positive for this HTTP client; suppression
/// is configured in `.github/codeql/codeql-config.yml` and applied via `.github/workflows/codeql.yml`.
pub async fn send_request(config: HttpRequestConfig) -> Result<HttpResponsePayload, String> {
    let mut mask_acc: Vec<String> = Vec::new();
    let environment_id = config.environment_id.as_str();

    let client = http_client();

    let mut url = build_base_url(
        &config.url,
        &config.query_params,
        &config.variables,
        environment_id,
        &mut mask_acc,
    )?;

    if let AuthConfig::ApiKey {
        key,
        value,
        add_to,
    } = &config.auth
    {
        if add_to == "query" {
            let (k, sec_k) = substitute_env_and_secrets(key, &config.variables, environment_id)?;
            let (v, sec_v) = substitute_env_and_secrets(value, &config.variables, environment_id)?;
            merge_secret_vecs(&mut mask_acc, sec_k);
            merge_secret_vecs(&mut mask_acc, sec_v);
            url.query_pairs_mut().append_pair(&k, &v);
        }
    }

    let method = reqwest::Method::from_bytes(config.method.as_bytes())
        .map_err(|e| mask_for_log(&format!("Invalid method: {e}"), &mask_acc))?;

    let mut req = client.clone().request(method, url);

    for h in &config.headers {
        if !h.enabled || h.key.is_empty() {
            continue;
        }
        let (name, sec_n) = substitute_env_and_secrets(&h.key, &config.variables, environment_id)?;
        let (value, sec_v) = substitute_env_and_secrets(&h.value, &config.variables, environment_id)?;
        merge_secret_vecs(&mut mask_acc, sec_n);
        merge_secret_vecs(&mut mask_acc, sec_v);
        req = req.header(name, value);
    }

    match &config.auth {
        AuthConfig::None => {}
        AuthConfig::Bearer { token } => {
            let (t, sec) = substitute_env_and_secrets(token, &config.variables, environment_id)?;
            merge_secret_vecs(&mut mask_acc, sec);
            req = req.bearer_auth(t);
        }
        AuthConfig::Basic { username, password } => {
            let (u, sec_u) = substitute_env_and_secrets(username, &config.variables, environment_id)?;
            let (p, sec_p) = substitute_env_and_secrets(password, &config.variables, environment_id)?;
            merge_secret_vecs(&mut mask_acc, sec_u);
            merge_secret_vecs(&mut mask_acc, sec_p);
            req = req.basic_auth(u, Some(p));
        }
        AuthConfig::ApiKey {
            key,
            value,
            add_to,
        } => {
            if add_to == "header" {
                let (k, sec_k) = substitute_env_and_secrets(key, &config.variables, environment_id)?;
                let (v, sec_v) = substitute_env_and_secrets(value, &config.variables, environment_id)?;
                merge_secret_vecs(&mut mask_acc, sec_k);
                merge_secret_vecs(&mut mask_acc, sec_v);
                req = req.header(k, v);
            }
        }
    }

    req = match config.body_type.as_str() {
        "multipart" => {
            let parts = config
                .multipart_parts
                .as_ref()
                .ok_or_else(|| "multipart body requires multipartParts".to_string())?;
            let mut form = reqwest::multipart::Form::new();
            for p in parts {
                if !p.enabled || p.key.trim().is_empty() {
                    continue;
                }
                let (key, sec_k) = substitute_env_and_secrets(&p.key, &config.variables, environment_id)?;
                merge_secret_vecs(&mut mask_acc, sec_k);
                match p.part_kind.as_str() {
                    "text" => {
                        let raw = p.text.as_deref().unwrap_or("");
                        let (text, sec) = substitute_env_and_secrets(raw, &config.variables, environment_id)?;
                        merge_secret_vecs(&mut mask_acc, sec);
                        form = form.text(key, text);
                    }
                    "file" => {
                        let path_raw = p.file_path.as_ref().ok_or_else(|| {
                            "Multipart file part missing filePath.".to_string()
                        })?;
                        let (path_res, sec) = substitute_env_and_secrets(path_raw, &config.variables, environment_id)?;
                        merge_secret_vecs(&mut mask_acc, sec);
                        let bytes = std::fs::read(Path::new(&path_res)).map_err(|e| {
                            // Avoid embedding OS paths in user-visible errors (CodeQL, privacy).
                            format!(
                                "Could not read multipart file ({}).",
                                e.kind()
                            )
                        })?;
                        if bytes.len() as u64 > MAX_HTTP_BODY_BYTES {
                            return Err("File exceeds maximum size (50 MiB).".to_string());
                        }
                        let fname = p
                            .file_name
                            .as_deref()
                            .filter(|s| !s.is_empty())
                            .or_else(|| {
                                Path::new(&path_res)
                                    .file_name()
                                    .and_then(|s| s.to_str())
                            })
                            .unwrap_or("file");
                        let part = reqwest::multipart::Part::bytes(bytes).file_name(fname.to_string());
                        form = form.part(key, part);
                    }
                    _ => {}
                }
            }
            req.multipart(form)
        }
        "binary" => {
            let bb = config
                .binary_body
                .as_ref()
                .ok_or_else(|| "binary body requires binaryBody".to_string())?;
            let (path_res, sec) = substitute_env_and_secrets(&bb.path, &config.variables, environment_id)?;
            merge_secret_vecs(&mut mask_acc, sec);
            let bytes = std::fs::read(Path::new(&path_res)).map_err(|e| {
                format!(
                    "Could not read binary body file ({}).",
                    e.kind()
                )
            })?;
            if bytes.len() as u64 > MAX_HTTP_BODY_BYTES {
                return Err("File exceeds maximum size (50 MiB).".to_string());
            }
            let ct_raw = bb
                .content_type
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("application/octet-stream");
            let (ct_exp, sec_ct) = substitute_env_and_secrets(ct_raw, &config.variables, environment_id)?;
            merge_secret_vecs(&mut mask_acc, sec_ct);
            req.header(reqwest::header::CONTENT_TYPE, ct_exp).body(bytes)
        }
        "json" | "raw" if !config.body.is_empty() => {
            let (b, sec) = substitute_env_and_secrets(&config.body, &config.variables, environment_id)?;
            merge_secret_vecs(&mut mask_acc, sec);
            if config.body_type == "json" {
                req.header(
                    reqwest::header::CONTENT_TYPE,
                    "application/json; charset=utf-8",
                )
                .body(b)
            } else {
                req.body(b)
            }
        }
        "form" if !config.body.is_empty() => {
            let (b, sec) = substitute_env_and_secrets(&config.body, &config.variables, environment_id)?;
            merge_secret_vecs(&mut mask_acc, sec);
            req.header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded; charset=utf-8",
            )
            .body(b)
        }
        _ => req,
    };

    let start = Instant::now();
    let resp = req
        .send()
        .await
        .map_err(|e| mask_for_log(&e.to_string(), &mask_acc))?;
    let duration_ms = start.elapsed().as_millis() as u64;

    let status = resp.status().as_u16();
    let status_text = resp
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let mut headers: Vec<(String, String)> = Vec::new();
    for (name, value) in resp.headers().iter() {
        if let Ok(v) = value.to_str() {
            headers.push((name.as_str().to_string(), v.to_string()));
        }
    }

    let body = resp
        .text()
        .await
        .map_err(|e| mask_for_log(&e.to_string(), &mask_acc))?;

    Ok(HttpResponsePayload {
        status,
        status_text,
        headers,
        body,
        duration_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn substitute_replaces_variables() {
        let mut v = HashMap::new();
        v.insert("host".to_string(), "example.com".to_string());
        assert_eq!(
            substitute("https://{{host}}/path", &v),
            "https://example.com/path"
        );
    }

    #[test]
    fn build_base_url_appends_query() {
        let q = vec![KeyValue {
            key: "a".to_string(),
            value: "1".to_string(),
            enabled: true,
            entry_kind: None,
        }];
        let mut acc = Vec::new();
        let u = build_base_url(
            "https://httpbin.org/get",
            &q,
            &HashMap::new(),
            "",
            &mut acc,
        )
        .unwrap();
        assert!(u.as_str().contains("a=1"));
    }

    #[test]
    fn mask_for_log_replaces_longest_first() {
        let s = "tok2 and tok22";
        let masked = mask_for_log(s, &["tok22".into(), "tok2".into()]);
        assert!(!masked.contains("tok22"));
        assert!(!masked.contains("tok2"));
        assert!(masked.contains("*****"));
    }
}
