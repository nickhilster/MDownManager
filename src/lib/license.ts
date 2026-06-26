import { invoke } from "@tauri-apps/api/core";

export type Tier = "free" | "individual" | "commercial" | "nonprofit";

export type Feature = "agent_api" | "auto_scan" | "semantic_search";

export type BrandingVariant = "free" | "individual" | "commercial" | "nonprofit";

export interface ActiveLicense {
  tier: Tier;
  features: Feature[];
  branding_variant: BrandingVariant;
  org_name: string | null;
  /** Unix timestamp seconds, or null for the implicit free tier */
  expires_at: number | null;
}

export const FREE_LICENSE: ActiveLicense = {
  tier: "free",
  features: [],
  branding_variant: "free",
  org_name: null,
  expires_at: null,
};

export function hasFeature(license: ActiveLicense, feature: Feature): boolean {
  return license.features.includes(feature);
}

export const getLicense = () => invoke<ActiveLicense>("get_license");

export const activateLicense = (token: string) =>
  invoke<ActiveLicense>("activate_license", { token });

export const deactivateLicense = () => invoke<void>("deactivate_license");

/** Maps a tier to the text shown in the splash screen branding strip. */
export function splashStripLabel(license: ActiveLicense): string {
  switch (license.tier) {
    case "nonprofit":
      return "Non-profit Edition · Powered by Teambotics";
    case "commercial":
      return "Powered by Teambotics";
    case "individual":
      return "Individual Edition · Powered by Teambotics";
    case "free":
    default:
      return "Free Edition";
  }
}
