"""
Generate a new RSA-2048 key pair for MDownManager license signing.

Run once:
    python scripts/generate_license_keys.py

This will:
  - Save the PRIVATE key to ~/.mdownmanager/license_private.pem  (never commit this)
  - Print the PUBLIC key to paste into src-tauri/src/license/mod.rs (PUBLIC_KEY_PEM)

After replacing the public key, rebuild the app so it's baked into the binary.

NOTE: MDownManager uses its OWN key pair, separate from other Teambotics
products. A token issued for one product will not validate on another.
"""
import pathlib

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

priv = key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.TraditionalOpenSSL,
    encryption_algorithm=serialization.NoEncryption(),
)
pub = key.public_key().public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
)

out_dir = pathlib.Path.home() / ".mdownmanager"
out_dir.mkdir(parents=True, exist_ok=True)
priv_path = out_dir / "license_private.pem"
priv_path.write_bytes(priv)
try:
    priv_path.chmod(0o600)
except Exception:
    pass  # chmod is a no-op / best-effort on Windows

print("[OK] Private key saved to:", priv_path)
print()
print("Paste this into src-tauri/src/license/mod.rs as PUBLIC_KEY_PEM:")
print()
print(pub.decode())
