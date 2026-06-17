# MDownManager

> Transform your markdown vault into an intelligent, searchable knowledge base. Index, summarize, search semantically, and expose via API — all locally.

**Language:** [English](#) | [Français](#readme-fr) | [Español](#readme-es) | [Deutsch](#readme-de)

---

## Why MDownManager?

Most teams have scattered markdown documentation:
- README files buried in repos
- Decision logs aging in wikis
- Knowledge bases no one remembers they have
- Sensitive data trapped in unindexed files

**The problem:** Your vault is invisible to the systems that need it.

MdownManager turns scattered markdown into a **living knowledge system**:
- 📚 **Index everything** — Recursively scan folders and build a complete map
- 🤖 **AI summaries** — Automatic abstracts and key-point extraction
- 🔍 **Semantic search** — Find by meaning, not just keywords
- 🔒 **Security audit** — Detect exposed secrets, credentials, PII
- 🔌 **HTTP API** — Query your vault programmatically
- 🛡️ **Privacy-first** — All processing stays on your machine

---

## Quick Start

### 1. Download

[Get v0.3.0 — Explorer](https://github.com/nickhilster/MDownManager/releases/tag/v0.3.0) (Latest)

Windows 10+ | Python backend | Electron UI | MIT License

### 2. Install

1. Run the `.msi` installer
2. Launch MdownManager
3. Point it at a markdown folder
4. Wait for indexing to complete

### 3. Use It

**Search your vault:**
```
Query: "authentication flow"
→ Finds docs mentioning auth, login, OAuth, JWT — even if they use different words
```

**Expose via API:**
```bash
curl http://localhost:8000/search?q=deployment
curl http://localhost:8000/vault/docs/readme.md
```

**Check for security risks:**
```
MdownManager scans for:
- AWS_ACCESS_KEY_ID patterns
- Private RSA keys
- Database passwords
- API tokens
- Social security numbers
```

---

## Features in Detail

### 🔍 Semantic Search

Don't just search for keywords. Search for **meaning**.

```
Your vault has:
- docs/auth/oauth-guide.md (mentions "bearer tokens")
- docs/security/jwt-tokens.md (mentions "JWT")
- docs/onboarding/login-setup.md (mentions "session")

Query: "How do we authenticate?"
→ All three docs appear, because they're semantically related
```

### 🤖 AI-Powered Summaries

Every markdown file gets:
- **Abstract** — 1-2 sentence summary
- **Key points** — Bullet-point extraction
- **Related docs** — Automatic cross-references
- **Metadata** — Last updated, size, language detected

### 🔒 Security Audit

MdownManager scans for patterns that shouldn't be in docs:

| Pattern | Risk | Action |
|---------|------|--------|
| `AKIA...` (AWS key) | 🔴 Critical | Block export |
| `sk-...` (OpenAI key) | 🔴 Critical | Block export |
| `-----BEGIN RSA KEY-----` | 🔴 Critical | Block export |
| `password=` (in plain text) | 🟠 High | Warn before export |
| Phone numbers (10+ digits) | 🟡 Medium | Flag for review |

**You stay in control.** Review flagged docs before exporting to API.

### 🔌 HTTP API

Expose your indexed vault as a queryable service:

```javascript
// Search
fetch('http://localhost:8000/search?q=deployment&limit=10')
  .then(r => r.json())
  .then(results => console.log(results))

// Get a specific document
fetch('http://localhost:8000/vault/docs/architecture/system-design.md')
  .then(r => r.json())
  .then(doc => console.log(doc.summary, doc.keyPoints))

// List all indexed documents
fetch('http://localhost:8000/vault/list')
  .then(r => r.json())
  .then(docs => docs.forEach(d => console.log(d.path, d.summary)))
```

---

## How It Works

### Five-Stage Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    MDownManager Pipeline                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. VAULT DISCOVERY                                              │
│     Recursively scan folder → Find all .md files → Build index  │
│                                                                   │
│  2. AI SUMMARIZATION                                             │
│     Process each file → Extract key points → Generate abstract  │
│                                                                   │
│  3. SEMANTIC INDEXING                                            │
│     Create vector embeddings → Build similarity graph            │
│                                                                   │
│  4. SECURITY AUDIT                                               │
│     Scan for secrets → Flag PII → Rate risk level → Report      │
│                                                                   │
│  5. API EXPOSURE                                                 │
│     Spin up HTTP server → Serve search, retrieval, metadata     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    MDownManager                               │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─ Electron UI ─────────────────────────────────┐           │
│  │  • Folder selection                           │           │
│  │  • Search interface                           │           │
│  │  • Security audit results                     │           │
│  │  • API playground                             │           │
│  └───────────────────────────────────────────────┘           │
│                      ↓ (IPC)                                  │
│  ┌─ Python Backend ───────────────────────────────┐          │
│  │  • Markdown parsing (ast-based)                │          │
│  │  • Vector embeddings (transformers)            │          │
│  │  • Security scanning (regex + NLP)             │          │
│  │  • HTTP API server (FastAPI)                   │          │
│  │  • Local SQLite database                       │          │
│  └────────────────────────────────────────────────┘          │
│                      ↓                                        │
│  ┌─ Local Storage ────────────────────────────────┐          │
│  │  • SQLite index                                │          │
│  │  • Vector embeddings                           │          │
│  │  • Metadata cache                              │          │
│  │  • Audit logs                                  │          │
│  └────────────────────────────────────────────────┘          │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## Installation & Usage

### System Requirements

- **Windows 10+** (or Windows Server 2016+)
- **2GB RAM minimum** (4GB+ recommended for large vaults)
- **500MB free disk space** (for index + embeddings)
- **.NET Runtime 4.7.2+** (usually pre-installed)

### Install from MSI

1. Download `MdownManager_0.3.0_x64_en-US.msi`
2. Run the installer
3. Accept the license terms
4. Choose installation folder (default: `C:\Program Files\MdownManager`)
5. Launch from Start Menu

### First Run

```
1. Select a markdown folder
   • Any folder with .md files
   • Can be a git repo, wiki, knowledge base, or docs folder

2. Configure scanning
   • Recursive: Include subfolders? (default: yes)
   • Max file size: Skip huge files? (default: 10MB)
   • Extensions: Only .md or include .markdown, .mdown? (default: .md only)

3. Start indexing
   • Scans files → Generates summaries → Builds embeddings
   • Time depends on vault size (100 files ≈ 2-5 minutes)

4. Review security audit
   • Check for exposed secrets
   • Approve flagged documents
   • See risk summary

5. Start searching
   • Use semantic search interface
   • Query from HTTP API
   • Export safe results
```

### API Server

The HTTP API starts automatically on `http://localhost:8000`

```bash
# Check if API is ready
curl http://localhost:8000/health

# Search
curl "http://localhost:8000/search?q=deployment&limit=10"

# Get document metadata
curl "http://localhost:8000/vault/list"

# Retrieve a specific document
curl "http://localhost:8000/vault/docs/architecture.md"

# Security audit results
curl "http://localhost:8000/audit/summary"
```

---

## Use Cases

### 📖 For Documentation Teams

**Problem:** Docs are scattered across repos, wikis, and shared drives. Finding anything takes forever.

**Solution:** Point MdownManager at your docs folder. Search semantically. Expose via API so CI/CD pipelines can fetch relevant docs automatically.

### 🔐 For Security Teams

**Problem:** Credentials and secrets leak into documentation. Audits are manual and painful.

**Solution:** MdownManager scans your entire vault on a schedule. Flags exposed keys, passwords, and PII. You control what's safe to export.

### 🤖 For AI/ML Teams

**Problem:** Your LLM context is limited. You need to fetch relevant docs dynamically.

**Solution:** Index your knowledge base. Use the API to retrieve semantically relevant documents at inference time. No cloud calls, no cost per query.

### 🏢 For Enterprise Teams

**Problem:** Knowledge is trapped in Confluence, Notion, GitHub, SharePoint. You can't search across them.

**Solution:** Export markdown from each source. Point MdownManager at one unified folder. Search everything in one place.

---

## Security & Privacy

### ✅ No Data Leaves Your Machine

- All indexing runs locally
- Embeddings stored locally (SQLite)
- API server is local-only (`localhost:8000`)
- No cloud calls, no external services
- No telemetry, no tracking

### ✅ You Control the Vault

- You choose what folder to index
- You approve documents before API export
- You review all flagged security items
- You manage database locally

### ✅ Built for Sensitive Data

Designed for teams handling:
- Financial records
- Healthcare documentation
- Legal briefs
- Customer data
- Proprietary knowledge

---

## Feedback & Support

Found a bug? Have a feature idea? Want to share how you're using MdownManager?

**Email us:** [hello@teambotics.app](mailto:hello@teambotics.app?subject=MDownManager%20Feedback)

Please include:
- **What you're trying to do** (use case)
- **What happened** (bug) or **what you'd like** (feature)
- **Screenshots or logs** (if relevant)
- **Your setup** (vault size, file count, system specs)

We read every message and use your feedback to shape the product.

---

## Contributing

MdownManager is open source. We welcome:
- **Bug reports** — Found an issue? Open an issue
- **Feature requests** — Have an idea? Discuss it first
- **Pull requests** — Want to contribute code? We'd love that
- **Documentation** — Can you improve the docs? Yes, please

### Development Setup

```bash
# Clone the repo
git clone https://github.com/nickhilster/MDownManager.git
cd MDownManager

# Install Python dependencies
pip install -r requirements.txt

# Install Electron dependencies
cd ui && npm install && cd ..

# Run in development
python backend/server.py &
cd ui && npm start
```

### Project Structure

```
MDownManager/
├── backend/
│   ├── server.py          # FastAPI server
│   ├── indexer.py         # Markdown parsing & indexing
│   ├── embeddings.py      # Vector embeddings
│   ├── security.py        # Secret scanning
│   └── database.py        # SQLite management
├── ui/
│   ├── src/
│   │   ├── App.tsx        # Main window
│   │   ├── Search.tsx     # Search interface
│   │   ├── Audit.tsx      # Security audit UI
│   │   └── API.tsx        # API playground
│   ├── package.json
│   └── main.ts            # Electron main process
├── installer/
│   └── mdownmanager.nsi   # NSIS installer config
├── requirements.txt
├── LICENSE (MIT)
└── README.md (this file)
```

---

## Roadmap

### v0.3.0 (Current)
- ✅ Semantic search
- ✅ Security audit
- ✅ HTTP API
- ✅ AI summaries

### v0.4.0 (Planned)
- 📌 macOS support
- 📌 Linux support
- 📌 Obsidian vault integration
- 📌 Scheduled re-indexing
- 📌 Backup & restore

### v0.5.0 (Exploring)
- 🔮 Web UI (self-hosted)
- 🔮 Team vault sharing (local network)
- 🔮 Custom LLM integration
- 🔮 Slack bot integration

---

## License

MIT License. See [LICENSE](LICENSE) for details.

You're free to use, modify, and distribute MdownManager in personal and commercial projects.

---

## Credits

Built by [Teambotics](https://teambotics.app)

MdownManager uses:
- **Electron** — Cross-platform desktop framework
- **FastAPI** — Python web framework
- **Transformers** — Hugging Face embeddings
- **spaCy** — NLP entity recognition
- **SQLite** — Local database

---

## Telemetry & Privacy Policy

We collect **zero data**. MdownManager does not:
- ❌ Phone home
- ❌ Track usage
- ❌ Send telemetry
- ❌ Contact external services
- ❌ Store user information

Your vault is yours alone.

---

## FAQ

**Q: Can I use MdownManager with Obsidian vaults?**
A: Yes! Point it at your `.obsidian` folder. The markdown parser handles Obsidian-specific syntax.

**Q: Does it work with large vaults (10,000+ files)?**
A: Yes, but expect longer initial indexing (30-60 minutes). Subsequent searches are instant.

**Q: Can multiple people use the same vault?**
A: The local API makes it easy. Index once, expose via API, and have your team query it. Network sharing coming in v0.4.0.

**Q: What if I move or rename files?**
A: Re-run indexing to update the database. We're adding scheduled re-indexing in v0.4.0.

**Q: Can I export the index?**
A: Yes. The SQLite database and embeddings are in `%APPDATA%\MdownManager`. Back them up anytime.

**Q: Is there a Mac or Linux version?**
A: Not yet, but it's on the roadmap for v0.4.0. Let us know you want it: [hello@teambotics.app](mailto:hello@teambotics.app)

---

## Contact

**Website:** [teambotics.app](https://teambotics.app)  
**Product page:** [teambotics.app/MdownManager](https://teambotics.app/MdownManager)  
**Email:** [hello@teambotics.app](mailto:hello@teambotics.app)  
**GitHub:** [nickhilster/MDownManager](https://github.com/nickhilster/MDownManager)

---

**Made with ❤️ by [Teambotics](https://teambotics.app)**
