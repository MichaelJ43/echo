use crate::persistence::{AuthConfig, KeyValue};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;
use url::Url;

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

fn append_query(url: &mut Url, query: &[KeyValue], vars: &HashMap<String, String>) {
    for q in query {
        if !q.enabled || q.key.is_empty() {
            continue;
        }
        let k = substitute(&q.key, vars);
        let v = substitute(&q.value, vars);
        url.query_pairs_mut().append_pair(&k, &v);
    }
}

fn build_base_url(raw: &str, query: &[KeyValue], vars: &HashMap<String, String>) -> Result<Url, String> {
    let resolved = substitute(raw, vars);
    let mut url = Url::parse(&resolved).map_err(|e| format!("Invalid URL: {e}"))?;
    append_query(&mut url, query, vars);
    Ok(url)
}

pub async fn send_request(config: HttpRequestConfig) -> Result<HttpResponsePayload, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut url = build_base_url(&config.url, &config.query_params, &config.variables)?;

    if let AuthConfig::ApiKey {
        key,
        value,
        add_to,
    } = &config.auth
    {
        if add_to == "query" {
            let k = substitute(key, &config.variables);
            let v = substitute(value, &config.variables);
            url.query_pairs_mut().append_pair(&k, &v);
        }
    }

    let method = reqwest::Method::from_bytes(config.method.as_bytes())
        .map_err(|e| format!("Invalid method: {e}"))?;

    let mut req = client.request(method, url);

    for h in &config.headers {
        if !h.enabled || h.key.is_empty() {
            continue;
        }
        let name = substitute(&h.key, &config.variables);
        let value = substitute(&h.value, &config.variables);
        req = req.header(name, value);
    }

    match &config.auth {
        AuthConfig::None => {}
        AuthConfig::Bearer { token } => {
            let t = substitute(token, &config.variables);
            req = req.bearer_auth(t);
        }
        AuthConfig::Basic { username, password } => {
            let u = substitute(username, &config.variables);
            let p = substitute(password, &config.variables);
            req = req.basic_auth(u, Some(p));
        }
        AuthConfig::ApiKey {
            key,
            value,
            add_to,
        } => {
            if add_to == "header" {
                let k = substitute(key, &config.variables);
                let v = substitute(value, &config.variables);
                req = req.header(k, v);
            }
        }
    }

    req = match config.body_type.as_str() {
        "json" | "raw" if !config.body.is_empty() => {
            let b = substitute(&config.body, &config.variables);
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
            let b = substitute(&config.body, &config.variables);
            req.header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded; charset=utf-8",
            )
            .body(b)
        }
        _ => req,
    };

    let start = Instant::now();
    let resp = req.send().await.map_err(|e| e.to_string())?;
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

    let body = resp.text().await.map_err(|e| e.to_string())?;

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
        }];
        let u = build_base_url("https://httpbin.org/get", &q, &HashMap::new()).unwrap();
        assert!(u.as_str().contains("a=1"));
    }
}
