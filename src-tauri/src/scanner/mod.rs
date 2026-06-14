use anyhow::{anyhow, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbRule {
    pub id: String,
    pub description: String,
    pub severity: String,
    pub pattern: String,
    pub tags: Option<String>, // JSON array of strings
    pub source: String,       // "builtin" | "gitleaks"
    pub enabled: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub rule: String,
    pub description: String,
    pub severity: String,
    pub line: usize,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub file_id: String,
    pub risk_level: String,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRulesResult {
    pub added: u32,
    pub updated: u32,
    pub skipped_invalid: u32,
    pub total: u32,
}

// ── Severity helpers ──────────────────────────────────────────────────────────

pub fn severity_rank(s: &str) -> u8 {
    match s {
        "critical" => 4,
        "high" => 3,
        "medium" => 2,
        "low" => 1,
        _ => 0,
    }
}

fn severity_from_tags(tags: &[String]) -> &'static str {
    let joined = tags.join(" ").to_lowercase();
    if joined.contains("private-key") || joined.contains("private_key") {
        "critical"
    } else if joined.contains("api-key")
        || joined.contains("secret")
        || joined.contains("token")
        || joined.contains("password")
        || joined.contains("credential")
        || joined.contains("key")
    {
        "high"
    } else {
        "medium"
    }
}

fn redact(s: &str) -> String {
    let len = s.len();
    if len <= 8 {
        return "*".repeat(len);
    }
    format!("{}…{}", &s[..4], "*".repeat(8))
}

// ── Scan logic ────────────────────────────────────────────────────────────────

pub fn scan_content(file_id: &str, content: &str, rules: &[DbRule]) -> ScanResult {
    // Compile rules — skip any with invalid patterns
    let compiled: Vec<(Regex, &DbRule)> = rules
        .iter()
        .filter_map(|r| Regex::new(&r.pattern).ok().map(|re| (re, r)))
        .collect();

    let mut findings: Vec<Finding> = Vec::new();

    for (line_no, line) in content.lines().enumerate() {
        for (re, rule) in &compiled {
            if let Some(m) = re.find(line) {
                // One finding per rule per line
                let already = findings
                    .iter()
                    .any(|f| f.rule == rule.id && f.line == line_no + 1);
                if already {
                    continue;
                }
                findings.push(Finding {
                    rule: rule.id.clone(),
                    description: rule.description.clone(),
                    severity: rule.severity.clone(),
                    line: line_no + 1,
                    snippet: redact(m.as_str()),
                });
            }
        }
    }

    let risk_level = findings
        .iter()
        .max_by_key(|f| severity_rank(&f.severity))
        .map(|f| f.severity.as_str())
        .unwrap_or("clean")
        .to_string();

    ScanResult { file_id: file_id.to_string(), risk_level, findings }
}

// ── Default (builtin) rules ───────────────────────────────────────────────────

pub fn default_rules() -> Vec<DbRule> {
    let now = chrono::Utc::now().to_rfc3339();
    let raw: &[(&str, &str, &str, &str)] = &[
        ("private_key",            "Private key block",                          "critical", r#"-----BEGIN\s+(RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY"#),
        ("aws_access_key",         "AWS access key ID",                          "critical", r#"AKIA[0-9A-Z]{16}"#),
        ("aws_secret",             "AWS secret access key assignment",           "critical", r#"(?i)aws[_\-\s]secret[_\-\s]access[_\-\s]key\s*[=:]\s*[a-zA-Z0-9/+=]{40}"#),
        ("anthropic_key",          "Anthropic API key",                          "critical", r#"sk-ant-[a-zA-Z0-9\-_]{90,}"#),
        ("openai_key",             "OpenAI API key",                             "critical", r#"sk-[a-zA-Z0-9]{48}"#),
        ("github_token",           "GitHub personal access token",               "critical", r#"gh[psoure]_[a-zA-Z0-9]{36,}"#),
        ("stripe_secret",          "Stripe secret key",                          "critical", r#"sk_live_[a-zA-Z0-9]{24,}"#),
        ("connection_string_creds","Credentials in connection string",           "high",     r#"[a-zA-Z]+://[^:\s]+:[^@\s]{6,}@"#),
        ("password_assignment",    "Hardcoded password assignment",              "high",     r#"(?i)(password|passwd|pwd)\s*[=:]\s*[^\s]{8,}"#),
        ("secret_assignment",      "Hardcoded secret/token assignment",          "high",     r#"(?i)(secret|token|api[_\-]?key)\s*[=:]\s*[a-zA-Z0-9\-_./+=]{16,}"#),
        ("bearer_token",           "Bearer token in header",                     "high",     r#"(?i)authorization\s*:\s*Bearer\s+[a-zA-Z0-9\-_./+=]{20,}"#),
        ("generic_api_key",        "Generic API key value",                      "medium",   r#"(?i)api[_\-]?key\s*[=:]\s*[a-zA-Z0-9\-_]{20,}"#),
        ("email_address",          "Email address",                              "low",      r#"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"#),
    ];

    raw.iter()
        .map(|(id, desc, sev, pat)| DbRule {
            id: id.to_string(),
            description: desc.to_string(),
            severity: sev.to_string(),
            pattern: pat.to_string(),
            tags: None,
            source: "builtin".to_string(),
            enabled: true,
            updated_at: now.clone(),
        })
        .collect()
}

// ── Gitleaks rule fetcher ─────────────────────────────────────────────────────

#[derive(Deserialize)]
struct GitleaksConfig {
    #[serde(default)]
    rules: Vec<GitleaksRuleRaw>,
}

#[derive(Deserialize)]
struct GitleaksRuleRaw {
    id: String,
    description: String,
    regex: String,
    #[serde(default)]
    tags: Vec<String>,
}

pub async fn fetch_gitleaks_rules() -> Result<(Vec<DbRule>, UpdateRulesResult)> {
    let url =
        "https://raw.githubusercontent.com/gitleaks/gitleaks/main/config/gitleaks.toml";

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let body = client
        .get(url)
        .header("User-Agent", "MDownManager/1.0")
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;

    let config: GitleaksConfig = toml::from_str(&body)
        .map_err(|e| anyhow!("Failed to parse Gitleaks TOML: {e}"))?;

    let now = chrono::Utc::now().to_rfc3339();
    let mut rules: Vec<DbRule> = Vec::new();
    let mut skipped = 0u32;

    for raw in config.rules {
        // Validate the regex before storing
        if Regex::new(&raw.regex).is_err() {
            skipped += 1;
            continue;
        }

        let severity = severity_from_tags(&raw.tags).to_string();
        let tags_json = serde_json::to_string(&raw.tags).unwrap_or_default();

        rules.push(DbRule {
            id: format!("gl_{}", raw.id),
            description: raw.description,
            severity,
            pattern: raw.regex,
            tags: Some(tags_json),
            source: "gitleaks".to_string(),
            enabled: true,
            updated_at: now.clone(),
        });
    }

    let total = rules.len() as u32;
    let result = UpdateRulesResult {
        added: 0,   // caller fills this in after DB diff
        updated: 0,
        skipped_invalid: skipped,
        total,
    };

    Ok((rules, result))
}
