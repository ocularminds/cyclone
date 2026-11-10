"""Check deployed artifact bytes; requires Python, certifi and authenticated gh."""
import hashlib
import io
import json
import ssl
import subprocess
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
import certifi

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
artifact = json.loads((OUT / "archive.json").read_text())
run = json.loads(subprocess.check_output(["gh", "run", "view", "42779441127", "--json",
    "status,conclusion,headSha,url,jobs"], text=True, cwd=ROOT))
assert run["status"] == "completed" and run["conclusion"] == "success", run["status"]
with urllib.request.urlopen(artifact["url"], timeout=30,
                            context=ssl.create_default_context(cafile=certifi.where())) as response:
    status, mime, data = response.status, response.headers.get_content_type(), response.read()
assert status == 200
actual = hashlib.sha256(data).hexdigest()
assert actual == artifact["sha256"], (actual, artifact["sha256"])
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    assert archive.testzip() is None
    checksums = json.loads(archive.read("cyclone/SHA256SUMS.json"))
    for name, expected in checksums.items():
        assert hashlib.sha256(archive.read("cyclone/" + name)).hexdigest() == expected, name
    assert len(archive.namelist()) == artifact["files"]
result = {"checked_at": datetime.now(timezone.utc).isoformat(), "url": artifact["url"],
          "status": status, "content_type": mime, "bytes": len(data), "sha256": actual,
          "archive_crc_and_all_file_hashes": "pass", "files": artifact["files"],
          "deployment": {key: run[key] for key in ["status", "conclusion", "headSha", "url"]},
          "checks": [{"job": job["name"], "conclusion": job["conclusion"],
                      "steps": [{"name": s["name"], "conclusion": s["conclusion"]} for s in job["steps"]]}
                     for job in run["jobs"]]}
(OUT / "release.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({key: result[key] for key in ["url", "status", "bytes", "sha256", "files", "archive_crc_and_all_file_hashes"]}))
