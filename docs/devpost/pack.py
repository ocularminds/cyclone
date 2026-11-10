"""Build a public, credential-free artifact archive with an explicit allowlist."""
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
DEST = ROOT / "app/public/submission/cyclone-artifacts.zip"
DEST.parent.mkdir(parents=True, exist_ok=True)
proof = ROOT / "docs/revision1/demo-dossier.json"
jwks = ROOT / "docs/revision1/demo-jwks.json"
keys = json.loads(jwks.read_text())["keys"]
assert keys and all("d" not in key for key in keys)
verified = subprocess.run(["node", str(ROOT / "relay/node_modules/@decionis/verify/dist/cli.js"),
    "--file", str(proof), "--jwks", str(jwks), "--json"], capture_output=True, text=True, check=True)
report = json.loads(verified.stdout)
assert report["verified"] and report["required_artifact_coverage_verified"]
assert report["trust_anchor"]["status"] == "UNESTABLISHED"
report["jwks_url"] = "proof/demo-jwks.json"
report["trust_anchor"]["source"] = "proof/demo-jwks.json"
(OUT / "proof-check.json").write_text(json.dumps(report, indent=2) + "\n")
files = {name: OUT / name for name in ["README.md", "story.md", "fields.json", "manifest.json", "proof-check.json", "contact.jpg"]}
files.update({"gallery/" + name: OUT / name for name in ["cover.png", "inspect.png", "amend.png", "locked.png", "receipt.png", "access.png"]})
files.update({"proof/demo-dossier.json": proof, "proof/demo-jwks.json": jwks})
files.update({"source/" + name: OUT / name for name in ["export.py", "copy.py", "pack.py"]})
for name in ["app-icon-1024.png", "logo-lockup-ink.svg", "logo-lockup-paper.svg", "logo-mark-ink.svg", "logo-mark-paper.svg", "cover-social-1200x630.png", "cover-1920x1080.png"]:
    files["brand/" + name] = ROOT / "design/brand1/assets" / name
for name in ["manrope-OFL.txt", "atkinsonhyperlegiblenext-OFL.txt"]:
    files["licenses/" + name] = ROOT / "design/brand1/fonts" / name
files["licenses/threejs-LICENSE"] = ROOT / "design/brand1/source/vendor/LICENSE"
hashes = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in sorted(files.items())}
with zipfile.ZipFile(DEST, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, path in sorted(files.items()):
        info = zipfile.ZipInfo("cyclone/" + name, date_time=(2026, 11, 10, 12, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, path.read_bytes())
    info = zipfile.ZipInfo("cyclone/SHA256SUMS.json", date_time=(2026, 11, 10, 12, 0, 0))
    archive.writestr(info, json.dumps(hashes, indent=2) + "\n")
with zipfile.ZipFile(DEST) as archive:
    assert archive.testzip() is None
result = {"file": str(DEST.relative_to(ROOT)), "bytes": DEST.stat().st_size,
          "sha256": hashlib.sha256(DEST.read_bytes()).hexdigest(), "files": len(files) + 1,
          "url": "https://ocularminds.github.io/cyclone/submission/cyclone-artifacts.zip",
          "proof_cli_exit": verified.returncode, "contains_private_keys": False}
(OUT / "archive.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))
