"""
Issue a signed MDownManager license token.

Usage:
    python scripts/issue_license.py --tier individual --days 365
    python scripts/issue_license.py --tier commercial --days 365
    python scripts/issue_license.py --tier nonprofit --org "Feeding America" --days 730

The private key must exist at ~/.mdownmanager/license_private.pem.
Run scripts/generate_license_keys.py first if you haven't already.

Tiers (all paid tiers unlock the full feature set; they differ in
licensing terms, not capabilities):
    individual  - single user, unlimited vaults
    commercial  - up to 10 seats, commercial use rights
    nonprofit   - free for registered non-profits (use --org)
"""
import argparse
import pathlib
import time

import jwt
from cryptography.hazmat.primitives.serialization import load_pem_private_key

# Must match the Feature enum in src-tauri/src/license/types.rs
_ALL_PAID_FEATURES = [
    "agent_api",
    "auto_scan",
    "semantic_search",
]

_PRIV_KEY_PATH = pathlib.Path.home() / ".mdownmanager" / "license_private.pem"


def _load_private_key():
    if not _PRIV_KEY_PATH.exists():
        raise FileNotFoundError(
            f"Private key not found at {_PRIV_KEY_PATH}. "
            "Run: python scripts/generate_license_keys.py"
        )
    return load_pem_private_key(_PRIV_KEY_PATH.read_bytes(), password=None)


def issue(tier: str, days: int, org_name: str | None = None) -> str:
    if tier not in ("individual", "commercial", "nonprofit"):
        raise ValueError(
            f"Invalid tier: {tier!r}. Must be 'individual', 'commercial', or 'nonprofit'."
        )

    now = int(time.time())
    payload: dict = {
        "iss": "teambotics",
        "iat": now,
        "exp": now + days * 86400,
        "tier": tier,
        "features": _ALL_PAID_FEATURES,
        "branding_variant": tier,
    }
    if tier == "nonprofit" and org_name:
        payload["org_name"] = org_name

    private_key = _load_private_key()
    return jwt.encode(payload, private_key, algorithm="RS256")


def main() -> None:
    parser = argparse.ArgumentParser(description="Issue an MDownManager license token.")
    parser.add_argument(
        "--tier", required=True, choices=["individual", "commercial", "nonprofit"]
    )
    parser.add_argument("--days", type=int, default=365, help="Token validity in days (default: 365)")
    parser.add_argument("--org", default=None, help="Organisation name (nonprofit only)")
    args = parser.parse_args()

    token = issue(args.tier, args.days, args.org)

    print()
    print(f"Tier:    {args.tier}")
    print(f"Expires: {args.days} days from now")
    if args.org:
        print(f"Org:     {args.org}")
    print()
    print("License token (send this to the customer):")
    print()
    print(token)
    print()


if __name__ == "__main__":
    main()
