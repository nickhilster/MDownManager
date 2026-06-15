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
