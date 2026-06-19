# MDownManager

> Local-first Markdown knowledge base with semantic search, AI summaries, security scanning, and a local HTTP API.

Built by [Teambotics](https://teambotics.app) · [Download v0.3.0](https://github.com/nickhilster/MDownManager/releases/tag/v0.3.0) · Windows 10+

---

## Features

- **Vault** — Index any folder of `.md` files recursively
- **AI Summaries** — Automatic abstracts via Ollama or cloud LLMs (Anthropic, OpenAI, DeepSeek, Google)
- **Semantic Search** — Vector embeddings + cosine similarity; keyword and semantic modes
- **Security Scanner** — Detect secrets, credentials, and PII; 14+ rules including Gitleaks patterns
- **HTTP API** — Local REST API at `http://localhost:7734` for IDE agent integration
- **Categories** — Tag and browse files by category; manual or AI-assigned
- **Explorer** — Directory tree view of vault files with risk badges inline
- **GitHub Import** — Clone and index public repos directly

## Stack

Tauri 2 · Rust · React · TypeScript · SQLite (WAL) · WebView2

## Development

```bash
npm install
npm run tauri dev
```

## License

[Elastic License 2.0](LICENSE) — free for personal and non-commercial use.  
For commercial licensing: hello@teambotics.app
