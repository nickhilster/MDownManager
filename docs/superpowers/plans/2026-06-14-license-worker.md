# License Issuer Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Worker that issues RS256-signed JWT license tokens for MdownManager's Free/Commercial/Nonprofit tiers, then wire the generated public key into the Rust app.

**Architecture:** A stateless Cloudflare Worker (`workers/license-issuer/`) with two endpoints: `POST /issue` (admin-authenticated, signs and returns a JWT) and `GET /public-key` (unauthenticated, returns the RSA public key PEM). The RSA private key lives in a Worker Secret. The matching public key is hardcoded in `src-tauri/src/license/mod.rs`. No database needed — the Worker is purely a signing oracle.

**Tech Stack:** Cloudflare Workers (TypeScript), `jose` (JWT signing, works in the Workers runtime), `wrangler` v3 (deploy + secrets), `vitest` (unit tests)

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `workers/license-issuer/package.json` | Node deps: `jose`, `wrangler`, `vitest`, `@cloudflare/workers-types` |
| `workers/license-issuer/tsconfig.json` | TypeScript config for Workers runtime |
| `workers/license-issuer/wrangler.toml` | Worker name, entry point, compatibility date |
| `workers/license-issuer/src/types.ts` | TypeScript types mirroring Rust `LicenseClaims` |
| `workers/license-issuer/src/token.ts` | `signLicenseToken(payload, privateKeyPem)` — pure signing logic |
| `workers/license-issuer/src/auth.ts` | `requireAdmin(request, env)` — checks `Authorization: Bearer <ADMIN_SECRET>` |
| `workers/license-issuer/src/index.ts` | Worker entry point: routes `POST /issue` and `GET /public-key` |
| `workers/license-issuer/src/index.test.ts` | Integration tests for both endpoints |

### Modified files
| File | Change |
|---|---|
| `src-tauri/src/license/mod.rs` | Replace placeholder `PUBLIC_KEY_PEM` with real RSA-2048 public key |

---

## Task 1: Scaffold the Worker project

**Files:**
- Create: `workers/license-issuer/package.json`
- Create: `workers/license-issuer/tsconfig.json`
- Create: `workers/license-issuer/wrangler.toml`

- [ ] **Step 1: Create the directory and package.json**

```bash
mkdir -p workers/license-issuer/src
```

Create `workers/license-issuer/package.json`:

```json
{
  "name": "license-issuer",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "dependencies": {
    "jose": "^5.9.6"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250109.0",
    "typescript": "^5.7.3",
    "vitest": "^3.0.4",
    "wrangler": "^3.109.2"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `workers/license-issuer/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create wrangler.toml**

Create `workers/license-issuer/wrangler.toml`:

```toml
name = "mdownmanager-license-issuer"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]
```

- [ ] **Step 4: Install dependencies**

```bash
cd workers/license-issuer && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Commit**

```bash
git add workers/license-issuer/package.json workers/license-issuer/package-lock.json workers/license-issuer/tsconfig.json workers/license-issuer/wrangler.toml
git commit -m "feat(worker): scaffold license-issuer Worker project"
```

---

## Task 2: Types

**Files:**
- Create: `workers/license-issuer/src/types.ts`

These types mirror the Rust `LicenseClaims` struct exactly. The JWT payload must serialize with snake_case keys (`agent_api`, not `AgentApi`).

- [ ] **Step 1: Create types.ts**

Create `workers/license-issuer/src/types.ts`:

```typescript
export type Tier = "free" | "commercial" | "nonprofit";

export type Feature = "agent_api" | "auto_scan" | "semantic_search";

export type BrandingVariant = "free" | "commercial" | "nonprofit";

/** Shape of the JWT payload — must match Rust LicenseClaims exactly. */
export interface LicenseClaims {
  iss: string;
  iat: number;
  exp: number;
  tier: Tier;
  features: Feature[];
  branding_variant: BrandingVariant;
  org_name?: string;
}

/** Request body for POST /issue */
export interface IssueRequest {
  tier: "commercial" | "nonprofit";
  org_name?: string;
  /** Token lifetime in days. Defaults to 365. */
  duration_days?: number;
}

export interface Env {
  /** RSA-2048 private key PEM stored as a Worker Secret */
  RSA_PRIVATE_KEY_PEM: string;
  /** RSA-2048 public key PEM stored as a Worker Secret (or plain var) */
  RSA_PUBLIC_KEY_PEM: string;
  /** Admin bearer token stored as a Worker Secret */
  ADMIN_SECRET: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add workers/license-issuer/src/types.ts
git commit -m "feat(worker): add license token types"
```

---

## Task 3: Token signing module + tests

**Files:**
- Create: `workers/license-issuer/src/token.ts`
- Create: `workers/license-issuer/src/token.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `workers/license-issuer/src/token.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { signLicenseToken, FULL_FEATURES } from "./token";
import { importSPKI, jwtVerify, importPKCS8 } from "jose";

// 512-bit key for fast tests only — never use in production
const TEST_PRIVATE_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7o4qne60TB3wo
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7o4qne60TB3wo
-----END PRIVATE KEY-----`;

// Vitest runs in Node so we can generate real keys
import { generateKeyPair, exportSPKI, exportPKCS8 } from "jose";

async function makeTestKeypair(): Promise<{ privatePem: string; publicPem: string }> {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
  });
  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);
  return { privatePem, publicPem };
}

describe("signLicenseToken", () => {
  it("issues a valid RS256 JWT with correct claims", async () => {
    const { privatePem, publicPem } = await makeTestKeypair();

    const token = await signLicenseToken(
      {
        tier: "commercial",
        features: ["agent_api", "auto_scan", "semantic_search"],
        branding_variant: "commercial",
        duration_days: 365,
      },
      privatePem
    );

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const pubKey = await importSPKI(publicPem, "RS256");
    const { payload } = await jwtVerify(token, pubKey, {
      issuer: "teambotics",
      algorithms: ["RS256"],
    });

    expect(payload.tier).toBe("commercial");
    expect(payload.features).toEqual(["agent_api", "auto_scan", "semantic_search"]);
    expect(payload.branding_variant).toBe("commercial");
    expect(payload.iss).toBe("teambotics");
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect((payload.exp as number) - (payload.iat as number)).toBe(365 * 24 * 60 * 60);
  });

  it("includes org_name for nonprofit tokens", async () => {
    const { privatePem, publicPem } = await makeTestKeypair();

    const token = await signLicenseToken(
      {
        tier: "nonprofit",
        features: FULL_FEATURES,
        branding_variant: "nonprofit",
        duration_days: 365,
        org_name: "Greenpeace UK",
      },
      privatePem
    );

    const pubKey = await importSPKI(publicPem, "RS256");
    const { payload } = await jwtVerify(token, pubKey, {
      issuer: "teambotics",
      algorithms: ["RS256"],
    });

    expect(payload.org_name).toBe("Greenpeace UK");
    expect(payload.tier).toBe("nonprofit");
  });

  it("omits org_name for commercial tokens", async () => {
    const { privatePem, publicPem } = await makeTestKeypair();

    const token = await signLicenseToken(
      {
        tier: "commercial",
        features: FULL_FEATURES,
        branding_variant: "commercial",
        duration_days: 365,
      },
      privatePem
    );

    const pubKey = await importSPKI(publicPem, "RS256");
    const { payload } = await jwtVerify(token, pubKey, {
      issuer: "teambotics",
      algorithms: ["RS256"],
    });

    expect(payload.org_name).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd workers/license-issuer && npm test
```

Expected: FAIL — `signLicenseToken` not found.

- [ ] **Step 3: Implement token.ts**

Create `workers/license-issuer/src/token.ts`:

```typescript
import { SignJWT, importPKCS8 } from "jose";
import type { Feature, Tier, BrandingVariant } from "./types";

export const FULL_FEATURES: Feature[] = ["agent_api", "auto_scan", "semantic_search"];

interface TokenPayload {
  tier: Tier;
  features: Feature[];
  branding_variant: BrandingVariant;
  duration_days: number;
  org_name?: string;
}

export async function signLicenseToken(
  payload: TokenPayload,
  privateKeyPem: string
): Promise<string> {
  const privateKey = await importPKCS8(privateKeyPem, "RS256");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + payload.duration_days * 24 * 60 * 60;

  const claims: Record<string, unknown> = {
    tier: payload.tier,
    features: payload.features,
    branding_variant: payload.branding_variant,
  };
  if (payload.org_name !== undefined) {
    claims.org_name = payload.org_name;
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("teambotics")
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);
}
```

- [ ] **Step 4: Run tests — must pass**

```bash
cd workers/license-issuer && npm test
```

Expected:
```
✓ issues a valid RS256 JWT with correct claims
✓ includes org_name for nonprofit tokens
✓ omits org_name for commercial tokens

Test Files  1 passed (1)
Tests       3 passed (3)
```

- [ ] **Step 5: Commit**

```bash
git add workers/license-issuer/src/token.ts workers/license-issuer/src/token.test.ts
git commit -m "feat(worker): add token signing module with tests"
```

---

## Task 4: Auth helper + main Worker router

**Files:**
- Create: `workers/license-issuer/src/auth.ts`
- Create: `workers/license-issuer/src/index.ts`

- [ ] **Step 1: Create auth.ts**

Create `workers/license-issuer/src/auth.ts`:

```typescript
import type { Env } from "./types";

/**
 * Returns a 401 Response if the request is missing or has a wrong admin secret.
 * Returns null if auth passes.
 */
export function requireAdmin(request: Request, env: Env): Response | null {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token !== env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
```

- [ ] **Step 2: Create index.ts**

Create `workers/license-issuer/src/index.ts`:

```typescript
import type { Env, IssueRequest } from "./types";
import { requireAdmin } from "./auth";
import { signLicenseToken, FULL_FEATURES } from "./token";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleIssue(request: Request, env: Env): Promise<Response> {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  let body: IssueRequest;
  try {
    body = await request.json<IssueRequest>();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (body.tier !== "commercial" && body.tier !== "nonprofit") {
    return json({ error: "tier must be 'commercial' or 'nonprofit'" }, 400);
  }

  const duration_days = body.duration_days ?? 365;
  if (!Number.isInteger(duration_days) || duration_days < 1 || duration_days > 3650) {
    return json({ error: "duration_days must be an integer between 1 and 3650" }, 400);
  }

  try {
    const token = await signLicenseToken(
      {
        tier: body.tier,
        features: FULL_FEATURES,
        branding_variant: body.tier,
        duration_days,
        org_name: body.org_name,
      },
      env.RSA_PRIVATE_KEY_PEM
    );
    return json({ token });
  } catch (err) {
    return json({ error: `Signing failed: ${String(err)}` }, 500);
  }
}

function handlePublicKey(env: Env): Response {
  return new Response(env.RSA_PUBLIC_KEY_PEM, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/issue") {
      return handleIssue(request, env);
    }

    if (request.method === "GET" && url.pathname === "/public-key") {
      return handlePublicKey(env);
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 3: Add integration tests**

Create `workers/license-issuer/src/index.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { generateKeyPair, exportPKCS8, exportSPKI, importSPKI, jwtVerify } from "jose";
import worker from "./index";
import type { Env } from "./types";

async function makeEnv(): Promise<Env> {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
  return {
    RSA_PRIVATE_KEY_PEM: await exportPKCS8(privateKey),
    RSA_PUBLIC_KEY_PEM: await exportSPKI(publicKey),
    ADMIN_SECRET: "test-secret-abc",
  };
}

function makeRequest(
  path: string,
  options: { method?: string; body?: unknown; secret?: string } = {}
): Request {
  const { method = "POST", body, secret = "test-secret-abc" } = options;
  return new Request(`https://example.com${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("POST /issue", () => {
  it("returns 401 with wrong secret", async () => {
    const env = await makeEnv();
    const req = makeRequest("/issue", { body: { tier: "commercial" }, secret: "wrong" });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid tier", async () => {
    const env = await makeEnv();
    const req = makeRequest("/issue", { body: { tier: "free" } });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(400);
  });

  it("issues a valid commercial token", async () => {
    const env = await makeEnv();
    const req = makeRequest("/issue", { body: { tier: "commercial" } });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);

    const { token } = await res.json<{ token: string }>();
    expect(typeof token).toBe("string");

    const pubKey = await importSPKI(env.RSA_PUBLIC_KEY_PEM, "RS256");
    const { payload } = await jwtVerify(token, pubKey, {
      issuer: "teambotics",
      algorithms: ["RS256"],
    });
    expect(payload.tier).toBe("commercial");
    expect(payload.features).toContain("agent_api");
  });

  it("issues a valid nonprofit token with org_name", async () => {
    const env = await makeEnv();
    const req = makeRequest("/issue", {
      body: { tier: "nonprofit", org_name: "Doctors Without Borders" },
    });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);

    const { token } = await res.json<{ token: string }>();
    const pubKey = await importSPKI(env.RSA_PUBLIC_KEY_PEM, "RS256");
    const { payload } = await jwtVerify(token, pubKey, { issuer: "teambotics" });
    expect(payload.tier).toBe("nonprofit");
    expect(payload.org_name).toBe("Doctors Without Borders");
  });
});

describe("GET /public-key", () => {
  it("returns the public key PEM", async () => {
    const env = await makeEnv();
    const req = new Request("https://example.com/public-key", { method: "GET" });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("-----BEGIN PUBLIC KEY-----");
  });
});

describe("unknown routes", () => {
  it("returns 404", async () => {
    const env = await makeEnv();
    const req = new Request("https://example.com/unknown", { method: "GET" });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Run all tests — must pass**

```bash
cd workers/license-issuer && npm test
```

Expected:
```
✓ token.test.ts (3 tests)
✓ index.test.ts (6 tests)

Test Files  2 passed (2)
Tests       9 passed (9)
```

- [ ] **Step 5: Commit**

```bash
git add workers/license-issuer/src/auth.ts workers/license-issuer/src/index.ts workers/license-issuer/src/index.test.ts
git commit -m "feat(worker): add Worker router, auth, and integration tests"
```

---

## Task 5: Generate RSA keypair, configure Worker secrets, update Rust app

**Files:**
- Modify: `src-tauri/src/license/mod.rs`

This task generates the real production RSA-2048 keypair, sets it in the Worker, and embeds the public key in the Rust app.

- [ ] **Step 1: Generate the keypair**

Run from `workers/license-issuer/`:

```bash
node -e "
const { generateKeyPairSync } = require('crypto');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
console.log('=== PRIVATE KEY (keep secret, set as Worker secret) ===');
console.log(privateKey);
console.log('=== PUBLIC KEY (embed in Rust app) ===');
console.log(publicKey);
"
```

Copy both keys somewhere safe (a password manager). The private key is used once to set the Worker secret and then discarded from your terminal. The public key goes into the Rust source.

- [ ] **Step 2: Set Worker secrets**

```bash
cd workers/license-issuer

# Paste the private key PEM when prompted (multi-line: paste all lines, then Ctrl-D on Unix / Ctrl-Z on Windows)
npx wrangler secret put RSA_PRIVATE_KEY_PEM

# Paste the public key PEM when prompted
npx wrangler secret put RSA_PUBLIC_KEY_PEM

# Set a strong random admin secret (generate one first)
npx wrangler secret put ADMIN_SECRET
```

To generate a strong admin secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store the admin secret in your password manager — you'll need it to issue tokens via `curl`.

- [ ] **Step 3: Update PUBLIC_KEY_PEM in the Rust app**

Open `src-tauri/src/license/mod.rs`. Replace:

```rust
const PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----
REPLACE_WITH_REAL_PUBLIC_KEY_PEM
-----END PUBLIC KEY-----";
```

With the actual public key from Step 1. Example (yours will be different):

```rust
const PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a2rwplBQLF29amygykE
... (your actual key lines) ...
MwIDAQAB
-----END PUBLIC KEY-----";
```

**Important:** Keep the exact PEM formatting — `-----BEGIN PUBLIC KEY-----` on its own line, base64 content, `-----END PUBLIC KEY-----` on its own line.

- [ ] **Step 4: Verify the Rust app still compiles**

```bash
cd src-tauri && cargo check
```

Expected: no errors. The `DecodingKey::from_rsa_pem` call will now succeed at runtime (previously it would fail immediately on the placeholder text).

- [ ] **Step 5: Run the Rust license tests**

```bash
cd src-tauri && cargo test license
```

Expected: all 5 tests still pass. The tests use ephemeral keypairs so the hardcoded key doesn't affect them.

- [ ] **Step 6: Commit the public key update**

```bash
git add src-tauri/src/license/mod.rs
git commit -m "feat(license): embed real RSA-2048 public key"
```

---

## Task 6: Deploy and smoke test

- [ ] **Step 1: Deploy the Worker**

```bash
cd workers/license-issuer && npx wrangler deploy
```

Expected output includes:
```
✓ Deployed mdownmanager-license-issuer
  https://mdownmanager-license-issuer.<your-account>.workers.dev
```

Note the Worker URL.

- [ ] **Step 2: Smoke test — public key endpoint**

```bash
curl https://mdownmanager-license-issuer.<your-account>.workers.dev/public-key
```

Expected: the RSA public key PEM printed to stdout.

- [ ] **Step 3: Smoke test — issue a commercial token**

```bash
curl -X POST https://mdownmanager-license-issuer.<your-account>.workers.dev/issue \
  -H "Authorization: Bearer <your-ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"tier": "commercial", "duration_days": 365}' \
  | jq .
```

Expected:
```json
{ "token": "eyJ..." }
```

- [ ] **Step 4: Issue a nonprofit token**

```bash
curl -X POST https://mdownmanager-license-issuer.<your-account>.workers.dev/issue \
  -H "Authorization: Bearer <your-ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"tier": "nonprofit", "org_name": "Test Org", "duration_days": 365}' \
  | jq .
```

Expected: `{ "token": "eyJ..." }`

- [ ] **Step 5: Paste the commercial token into the running app**

```bash
# In the project root:
npm run tauri dev
```

Go to Settings → License, paste the commercial token from Step 3, click Activate.

Expected:
- The tier badge changes to "Commercial"
- Agent API section becomes visible (no longer shows upgrade prompt)
- Settings footer shows "Commercial license · Powered by Teambotics"

- [ ] **Step 6: Verify rejection of wrong-secret requests**

```bash
curl -X POST https://mdownmanager-license-issuer.<your-account>.workers.dev/issue \
  -H "Authorization: Bearer wrong-secret" \
  -H "Content-Type: application/json" \
  -d '{"tier": "commercial"}' \
  | jq .
```

Expected: `{ "error": "Unauthorized" }` with HTTP 401.

- [ ] **Step 7: Commit**

```bash
git add workers/license-issuer/
git commit -m "feat(worker): deploy license issuer Worker"
```

---

## Self-Review Notes

- The `wrangler.toml` uses `nodejs_compat` flag because `jose` uses Node crypto APIs under the hood in the Workers runtime. Without it, key import will fail.
- `RSA_PUBLIC_KEY_PEM` is stored as a Worker Secret (not a plain env var) so it's version-controlled in the Worker's secret store, not in `wrangler.toml`. This means rotating the keypair requires updating both secrets and re-deploying.
- The Worker issues tokens for `commercial` and `nonprofit` tiers only — `free` is not a valid request tier since Free users don't need a token.
- Token expiry is enforced by the Rust app (`validate_exp = true`) with no grace period. If a token expires, the app silently falls back to Free.
- `duration_days` is capped at 3650 (10 years) server-side to prevent accidental perpetual tokens.
- The public key in `lib.rs` is committed to source control — this is correct and intentional. Public keys are not secret.
