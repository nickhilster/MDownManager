use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

const OLLAMA_BASE: &str = "http://localhost:11434";
const EMBED_MODEL: &str = "nomic-embed-text";

// ── Summary prompt ────────────────────────────────────────────────────────────

fn summary_prompt(content: &str) -> String {
    let snippet = &content[..content.len().min(4000)];
    format!(
        "Write exactly 2 sentences summarizing this Markdown document. \
        First sentence: what it covers. Second sentence: what it is useful for or who benefits from it. \
        Be specific — reference the actual subject matter, not generic descriptions. No preamble.\n\n\
        ---\n{snippet}\n---\n\nSummary:"
    )
}

// ── Public dispatch ───────────────────────────────────────────────────────────

/// `model` is a namespaced id: "ollama/llama3.2", "anthropic/claude-haiku-4-5-20251001", etc.
/// `api_key` is required for non-Ollama providers.
pub async fn generate_summary(content: &str, model: &str, api_key: Option<&str>) -> Result<String> {
    let (provider, model_name) = split_model(model);
    match provider {
        "ollama"    => generate_ollama(content, model_name).await,
        "anthropic" => generate_anthropic(content, model_name, api_key.ok_or_else(|| anyhow!("Missing Anthropic key"))?).await,
        "openai"    => generate_openai(content, model_name, api_key.ok_or_else(|| anyhow!("Missing OpenAI key"))?, "https://api.openai.com/v1/chat/completions").await,
        "deepseek"  => generate_openai(content, model_name, api_key.ok_or_else(|| anyhow!("Missing DeepSeek key"))?, "https://api.deepseek.com/v1/chat/completions").await,
        "google"    => generate_google(content, model_name, api_key.ok_or_else(|| anyhow!("Missing Google key"))?).await,
        other       => Err(anyhow!("Unknown provider: {other}")),
    }
}

fn split_model(model: &str) -> (&str, &str) {
    match model.split_once('/') {
        Some((p, m)) => (p, m),
        None => ("ollama", model), // backward compat
    }
}

/// Returns all available models: Ollama models + cloud placeholders for providers with keys.
pub async fn list_all_models(
    anthropic_key: bool,
    openai_key: bool,
    deepseek_key: bool,
    google_key: bool,
) -> Vec<String> {
    let mut models: Vec<String> = Vec::new();

    // Ollama models
    if let Ok(ollama_models) = list_ollama_models().await {
        for m in ollama_models {
            models.push(format!("ollama/{m}"));
        }
    }

    // Cloud models — one sensible default per provider with a key
    if anthropic_key {
        models.push("anthropic/claude-haiku-4-5-20251001".to_string());
        models.push("anthropic/claude-sonnet-4-5".to_string());
    }
    if openai_key {
        models.push("openai/gpt-4o-mini".to_string());
        models.push("openai/gpt-4o".to_string());
    }
    if deepseek_key {
        models.push("deepseek/deepseek-chat".to_string());
    }
    if google_key {
        models.push("google/gemini-2.0-flash".to_string());
        models.push("google/gemini-1.5-flash".to_string());
    }

    models
}

// ── Embedding ─────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct EmbedRequest<'a> {
    model: &'a str,
    input: &'a str,
}

#[derive(Deserialize)]
struct EmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

pub async fn embed(text: &str) -> Result<Vec<f32>> {
    let client = reqwest::Client::new();
    let resp: EmbedResponse = client
        .post(format!("{OLLAMA_BASE}/api/embed"))
        .json(&EmbedRequest { model: EMBED_MODEL, input: text })
        .send()
        .await?
        .json()
        .await?;

    resp.embeddings
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("Ollama returned empty embeddings"))
}

// ── Ollama generation ─────────────────────────────────────────────────────────

#[derive(Serialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaGenerateResponse {
    response: String,
}

async fn generate_ollama(content: &str, model: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()?;

    let resp: OllamaGenerateResponse = client
        .post(format!("{OLLAMA_BASE}/api/generate"))
        .json(&OllamaGenerateRequest {
            model: model.to_string(),
            prompt: summary_prompt(content),
            stream: false,
        })
        .send()
        .await?
        .json()
        .await?;

    Ok(resp.response.trim().to_string())
}

// ── Ollama model discovery ────────────────────────────────────────────────────

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<ModelInfo>,
}

#[derive(Deserialize)]
struct ModelInfo {
    name: String,
}

async fn list_ollama_models() -> Result<Vec<String>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    let resp: TagsResponse = client
        .get(format!("{OLLAMA_BASE}/api/tags"))
        .send()
        .await?
        .json()
        .await?;

    let names = resp
        .models
        .into_iter()
        .map(|m| m.name)
        .filter(|n| !n.contains("embed") && !n.contains("nomic"))
        .collect();

    Ok(names)
}

// ── Anthropic (Messages API) ──────────────────────────────────────────────────

#[derive(Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    messages: Vec<AnthropicMessage<'a>>,
}

#[derive(Serialize)]
struct AnthropicMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[derive(Deserialize)]
struct AnthropicContent {
    text: String,
}

async fn generate_anthropic(content: &str, model: &str, api_key: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()?;

    let resp: AnthropicResponse = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&AnthropicRequest {
            model,
            max_tokens: 256,
            messages: vec![AnthropicMessage {
                role: "user",
                content: &summary_prompt(content),
            }],
        })
        .send()
        .await?
        .json()
        .await?;

    resp.content
        .into_iter()
        .next()
        .map(|c| c.text.trim().to_string())
        .ok_or_else(|| anyhow!("Anthropic returned empty response"))
}

// ── OpenAI-compatible (OpenAI + DeepSeek share the same schema) ───────────────

#[derive(Serialize)]
struct OpenAIRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    messages: Vec<OpenAIMessage<'a>>,
}

#[derive(Serialize)]
struct OpenAIMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIChoiceMessage,
}

#[derive(Deserialize)]
struct OpenAIChoiceMessage {
    content: String,
}

async fn generate_openai(content: &str, model: &str, api_key: &str, endpoint: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()?;

    let resp: OpenAIResponse = client
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&OpenAIRequest {
            model,
            max_tokens: 256,
            messages: vec![OpenAIMessage {
                role: "user",
                content: &summary_prompt(content),
            }],
        })
        .send()
        .await?
        .json()
        .await?;

    resp.choices
        .into_iter()
        .next()
        .map(|c| c.message.content.trim().to_string())
        .ok_or_else(|| anyhow!("OpenAI returned empty choices"))
}

// ── Google Gemini ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct GeminiRequest<'a> {
    contents: Vec<GeminiContent<'a>>,
}

#[derive(Serialize)]
struct GeminiContent<'a> {
    parts: Vec<GeminiPart<'a>>,
}

#[derive(Serialize)]
struct GeminiPart<'a> {
    text: &'a str,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: GeminiCandidateContent,
}

#[derive(Deserialize)]
struct GeminiCandidateContent {
    parts: Vec<GeminiResponsePart>,
}

#[derive(Deserialize)]
struct GeminiResponsePart {
    text: String,
}

async fn generate_google(content: &str, model: &str, api_key: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()?;

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    );

    let prompt = summary_prompt(content);
    let resp: GeminiResponse = client
        .post(&url)
        .json(&GeminiRequest {
            contents: vec![GeminiContent {
                parts: vec![GeminiPart { text: &prompt }],
            }],
        })
        .send()
        .await?
        .json()
        .await?;

    resp.candidates
        .into_iter()
        .next()
        .and_then(|c| c.content.parts.into_iter().next())
        .map(|p| p.text.trim().to_string())
        .ok_or_else(|| anyhow!("Google returned empty candidates"))
}

// ── Health ────────────────────────────────────────────────────────────────────

pub async fn health_check() -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_default();
    client
        .get(format!("{OLLAMA_BASE}/api/tags"))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}
