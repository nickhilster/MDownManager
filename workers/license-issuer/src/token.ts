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
