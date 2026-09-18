#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile

DEFAULT_ROOT = Path.home() / ".synthia-foundry"
IGNORE_DIRS = {
    ".git", "node_modules", ".next", "dist", "build", ".venv", "venv",
    "__pycache__", ".gradle", ".idea", ".cache"
}
TEXT_EXTS = {
    ".txt", ".md", ".json", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
    ".html", ".css", ".scss", ".py", ".sh", ".yml", ".yaml", ".toml", ".ini",
    ".xml", ".gradle", ".kt", ".java", ".sql", ".env.example", ".properties"
}

def load_env(path: Path):
    if not path.exists():
        return
    for raw in path.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        value = value.replace("$HOME", str(Path.home()))
        os.environ.setdefault(key, value)

def cfg(name: str, default: str = "") -> str:
    return os.environ.get(name, default)

def truthy(name: str, default: bool = False) -> bool:
    raw = cfg(name, "1" if default else "0").strip().lower()
    return raw in {"1", "true", "yes", "on"}

def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def log(root: Path, event: str, **data):
    record = {"ts": now_iso(), "event": event, **data}
    line = json.dumps(record, ensure_ascii=False)
    print(line, flush=True)
    (root / "logs").mkdir(parents=True, exist_ok=True)
    with (root / "logs" / "events.jsonl").open("a", encoding="utf-8") as f:
        f.write(line + "\n")

def safe_name(name: str) -> str:
    out = "".join(c if c.isalnum() or c in "._-" else "_" for c in name)
    return out[:120] or "drop"

def file_fingerprint(path: Path) -> str:
    if path.is_file():
        stat = path.stat()
        base = f"{path.name}:{stat.st_size}:{stat.st_mtime_ns}"
        if stat.st_size <= 64 * 1024 * 1024:
            base += ":" + sha256_file(path)
        return hashlib.sha256(base.encode()).hexdigest()
    h = hashlib.sha256()
    for p in sorted(x for x in path.rglob("*") if x.is_file()):
        try:
            st = p.stat()
            h.update(str(p.relative_to(path)).encode())
            h.update(str(st.st_size).encode())
            h.update(str(st.st_mtime_ns).encode())
        except OSError:
            pass
    return h.hexdigest()

def load_seen(root: Path) -> dict:
    p = root / "state" / "seen.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}

def save_seen(root: Path, seen: dict):
    p = root / "state" / "seen.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(seen, indent=2))
    tmp.replace(p)

def safe_extract_zip(src: Path, dest: Path):
    max_files = int(cfg("MAX_ZIP_FILES", "3000"))
    max_bytes = int(cfg("MAX_ZIP_BYTES", str(512 * 1024 * 1024)))
    with zipfile.ZipFile(src) as z:
        infos = z.infolist()
        if len(infos) > max_files:
            raise RuntimeError(f"ZIP has {len(infos)} files; limit is {max_files}")
        total = sum(i.file_size for i in infos)
        if total > max_bytes:
            raise RuntimeError(f"ZIP expands to {total} bytes; limit is {max_bytes}")
        root = dest.resolve()
        for info in infos:
            candidate = (dest / info.filename).resolve()
            if candidate != root and root not in candidate.parents:
                raise RuntimeError(f"Unsafe ZIP path: {info.filename}")
        z.extractall(dest)

def copy_drop(src: Path, input_dir: Path):
    input_dir.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        target = input_dir / safe_name(src.name)
        shutil.copytree(src, target, dirs_exist_ok=True)
        return target
    target = input_dir / safe_name(src.name)
    shutil.copy2(src, target)
    if src.suffix.lower() == ".zip":
        extracted = input_dir / (safe_name(src.stem) + "_extracted")
        extracted.mkdir(parents=True, exist_ok=True)
        safe_extract_zip(target, extracted)
        return extracted
    return target

def iter_files(root: Path):
    if root.is_file():
        yield root
        return
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if any(part in IGNORE_DIRS for part in p.parts):
            continue
        yield p

def looks_text(path: Path) -> bool:
    if path.suffix.lower() in TEXT_EXTS:
        return True
    mime, _ = mimetypes.guess_type(path.name)
    return bool(mime and (mime.startswith("text/") or "json" in mime or "javascript" in mime or "xml" in mime))

def inventory(project_root: Path):
    files = []
    for p in iter_files(project_root):
        try:
            st = p.stat()
            rel = str(p.relative_to(project_root if project_root.is_dir() else project_root.parent))
            files.append({
                "path": rel,
                "bytes": st.st_size,
                "sha256": sha256_file(p) if st.st_size <= 128 * 1024 * 1024 else None,
                "text": looks_text(p),
            })
        except OSError:
            pass
    return files

def detect_stack(project_root: Path):
    base = project_root if project_root.is_dir() else project_root.parent
    names = {p.name for p in iter_files(base)}
    kinds = []
    if "package.json" in names:
        kinds.append("node")
    if {"requirements.txt", "pyproject.toml", "setup.py"} & names:
        kinds.append("python")
    if {"build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"} & names:
        kinds.append("android-gradle")
    if any(n.endswith(".html") for n in names):
        kinds.append("web")
    return kinds or ["generic"]

def read_intent(src: Path) -> str:
    inbox = src.parent
    candidates = []
    if src.is_file():
        candidates += [inbox / f"{src.stem}.intent.txt", inbox / f"{src.name}.intent.txt"]
    else:
        candidates += [inbox / f"{src.name}.intent.txt"]
    for p in candidates:
        if p.exists():
            return p.read_text(errors="ignore")[:12000]
    return (
        "Turn this supplied material into a working, shippable product. Preserve the "
        "original intent and functionality. Fix concrete runtime/build blockers, create "
        "a usable first-run experience, and add the minimum product/release material "
        "needed to sell it. Do not delete supplied features merely to make tests pass."
    )

def context_packet(project_root: Path, inv: list[dict]) -> str:
    limit = int(cfg("MAX_PROMPT_CHARS", "70000"))
    used = 0
    chunks = []
    for item in inv:
        if not item.get("text") or item["bytes"] > 180000:
            continue
        p = project_root / item["path"] if project_root.is_dir() else project_root
        if not p.exists() or not p.is_file():
            continue
        try:
            text = p.read_text(errors="ignore")
        except Exception:
            continue
        room = limit - used
        if room <= 0:
            break
        text = text[:room]
        chunks.append(f"\n--- FILE: {item['path']} ---\n{text}")
        used += len(text)
    return "".join(chunks)

def build_prompt(intent: str, stack: list[str], inv: list[dict], packet: str, diagnostics: str) -> str:
    tree = "\n".join(f"- {x['path']} ({x['bytes']} bytes)" for x in inv[:1200])
    return f"""POCKET FOUNDRY BUILD JOB

GOAL
{intent}

PROJECT STACK
{', '.join(stack)}

CURRENT FILE INVENTORY
{tree}

PRE-BUILD DIAGNOSTICS
{diagnostics or 'none yet'}

SOURCE EXCERPTS
{packet}

RULES
- Work from the supplied implementation. Do not replace it with a generic mock.
- Preserve features and project-specific vocabulary.
- Fix the smallest real blockers first.
- Never request deletion of source files.
- Do not embed credentials, tokens, or private keys.
- Keep phone constraints in mind where relevant.
- Produce a runnable result, not placeholders.
- Add PRODUCT.md describing target user, problem, offer, pricing hypothesis, onboarding, and what proves value.
- Add RELEASE_CHECKLIST.md with exact build/test/deploy steps and unresolved blockers.
- Prefer complete file contents over vague snippets.
- Commands must be non-destructive build/test commands only.

RETURN EXACTLY ONE PAYLOAD:
<<<FOUNDRY_JSON>>>
{{
  "summary": "brief description",
  "files": [
    {{"path": "relative/path.ext", "content": "complete file contents"}}
  ],
  "commands": ["safe build or test command"]
}}
<<<END_FOUNDRY_JSON>>>
"""

def http_json(url: str, payload: dict, token: str = "", timeout: int = 180):
    body = json.dumps(payload).encode()
    headers = {"content-type": "application/json", "user-agent": "Synthia-Pocket-Foundry/1.0"}
    if token:
        headers["authorization"] = f"Bearer {token}"
        headers["x-terminal-token"] = token
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode(errors="replace")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"raw": raw}

def extract_model_text(obj) -> str:
    if isinstance(obj, str):
        return obj
    if isinstance(obj, dict):
        for key in ("text", "response", "output", "content", "result", "raw"):
            if key in obj:
                v = obj[key]
                if isinstance(v, str):
                    return v
                nested = extract_model_text(v)
                if nested:
                    return nested
        for v in obj.values():
            nested = extract_model_text(v)
            if nested:
                return nested
    if isinstance(obj, list):
        for v in obj:
            nested = extract_model_text(v)
            if nested:
                return nested
    return ""

def ask_agent(prompt: str) -> str:
    cmd = cfg("DEV_AGENT_CMD").strip()
    if cmd:
        p = subprocess.run(cmd, input=prompt, text=True, shell=True, capture_output=True, timeout=900)
        if p.returncode != 0:
            raise RuntimeError(f"DEV_AGENT_CMD failed: {p.stderr[-4000:]}")
        return p.stdout

    server = cfg("SYNTHIA_SERVER_URL").rstrip("/")
    mode = cfg("MODEL_MODE", "trident")
    if mode == "trident" and server:
        data = http_json(
            server + "/trident/generate",
            {"prompt": prompt, "head": "code", "use_rag": True},
            cfg("SYNTHIA_SERVER_TOKEN"),
            timeout=240,
        )
        text = extract_model_text(data)
        if text:
            return text
        raise RuntimeError("Trident returned no model text")
    raise RuntimeError("No coding agent configured")

def parse_payload(text: str) -> dict:
    start = "<<<FOUNDRY_JSON>>>"
    end = "<<<END_FOUNDRY_JSON>>>"
    if start not in text or end not in text:
        raise RuntimeError("Agent response did not contain FOUNDRY_JSON markers")
    raw = text.split(start, 1)[1].split(end, 1)[0].strip()
    data = json.loads(raw)
    if not isinstance(data, dict) or not isinstance(data.get("files", []), list):
        raise RuntimeError("Invalid Foundry payload")
    return data

def safe_target(workspace: Path, rel: str) -> Path:
    rel = rel.replace("\\", "/").lstrip("/")
    if not rel or ".." in Path(rel).parts:
        raise RuntimeError(f"Unsafe output path: {rel!r}")
    target = (workspace / rel).resolve()
    root = workspace.resolve()
    if target != root and root not in target.parents:
        raise RuntimeError(f"Output escapes workspace: {rel}")
    return target

def apply_payload(workspace: Path, payload: dict):
    written = []
    for item in payload.get("files", []):
        if not isinstance(item, dict):
            continue
        rel = str(item.get("path", "")).strip()
        content = item.get("content")
        if not rel or not isinstance(content, str):
            continue
        target = safe_target(workspace, rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        written.append(rel)
    return written

ALLOWED_PREFIXES = (
    "npm test", "npm run ", "npm ci", "npm install",
    "python -m ", "python3 -m ", "pytest", "npx tsc",
    "./gradlew test", "./gradlew assemble", "gradle test", "gradle assemble",
)

def allowed_command(cmd: str) -> bool:
    c = " ".join(cmd.strip().split())
    bad = ("rm ", "rm-", "sudo ", "su ", "curl ", "wget ", "git push", "gh ", "chmod 777", "mkfs", "dd ")
    return c.startswith(ALLOWED_PREFIXES) and not any(x in c for x in bad)

def run_cmd(command: str, cwd: Path, timeout=900):
    p = subprocess.run(command, shell=True, cwd=str(cwd), text=True, capture_output=True, timeout=timeout)
    return {
        "command": command,
        "returncode": p.returncode,
        "stdout": p.stdout[-12000:],
        "stderr": p.stderr[-12000:],
    }

def preflight(workspace: Path, stack: list[str]):
    results = []
    if "node" in stack:
        if truthy("ALLOW_INSTALL", True):
            if (workspace / "package-lock.json").exists():
                results.append(run_cmd("npm ci --no-audit --no-fund", workspace))
            elif (workspace / "package.json").exists():
                results.append(run_cmd("npm install --no-audit --no-fund", workspace))
        if truthy("RUN_TESTS", True) and (workspace / "package.json").exists():
            results.append(run_cmd("npm test --if-present", workspace))
            results.append(run_cmd("npm run build --if-present", workspace))
    if "python" in stack:
        results.append(run_cmd("python -m compileall -q .", workspace))
        if truthy("RUN_TESTS", True) and shutil.which("pytest"):
            results.append(run_cmd("pytest -q", workspace))
    return results

def diagnostics_text(results):
    return "\n\n".join(
        f"$ {r['command']}\nexit={r['returncode']}\n{r['stdout']}\n{r['stderr']}"
        for r in results
    )[-24000:]

def post_queue(job: dict):
    if not truthy("QUEUE_TO_SYNTHIA", True):
        return None
    server = cfg("SYNTHIA_SERVER_URL").rstrip("/")
    if not server:
        return None
    payload = {
        "source": "pocket-foundry",
        "target": "cynthia",
        "device_id": cfg("DEVICE_ID", "android-pocket-foundry"),
        "job": {
            "id": job["id"], "intent": job["intent"], "stack": job["stack"],
            "manifest": job["manifest"], "status": job["status"]
        }
    }
    try:
        return http_json(server + "/mcp/implement", payload, cfg("SYNTHIA_SERVER_TOKEN"), timeout=30)
    except Exception:
        return None

def package_workspace(workspace: Path, outbox: Path, job_id: str):
    outbox.mkdir(parents=True, exist_ok=True)
    base = outbox / f"{job_id}-result"
    archive = shutil.make_archive(str(base), "zip", root_dir=str(workspace))
    return Path(archive)

def process_drop(src: Path, root: Path):
    fp = file_fingerprint(src)
    short = fp[:10]
    job_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{safe_name(src.stem if src.is_file() else src.name)}-{short}"
    job_dir = root / "jobs" / job_id
    input_dir = job_dir / "input"
    work_dir = job_dir / "workspace"
    job_dir.mkdir(parents=True, exist_ok=False)

    copied_root = copy_drop(src, input_dir)
    if copied_root.is_dir():
        shutil.copytree(copied_root, work_dir, dirs_exist_ok=True)
    else:
        work_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(copied_root, work_dir / copied_root.name)

    inv = inventory(work_dir)
    stack = detect_stack(work_dir)
    intent = read_intent(src)
    pre = preflight(work_dir, stack)
    job = {
        "id": job_id,
        "source": str(src),
        "source_fingerprint": fp,
        "created_at": now_iso(),
        "status": "ingested",
        "intent": intent,
        "stack": stack,
        "manifest": inv,
        "preflight": pre,
        "written": [],
        "agent_summary": None,
        "result_zip": None,
    }
    (job_dir / "job.json").write_text(json.dumps(job, indent=2))
    log(root, "job_ingested", job_id=job_id, source=str(src), stack=stack, files=len(inv))

    packet = context_packet(work_dir, inv)
    prompt = build_prompt(intent, stack, inv, packet, diagnostics_text(pre))
    (job_dir / "prompt.txt").write_text(prompt, encoding="utf-8")

    last_error = None
    for attempt in range(1, int(cfg("MAX_AGENT_ATTEMPTS", "2")) + 1):
        try:
            answer = ask_agent(prompt if not last_error else prompt + f"\n\nPREVIOUS AGENT ERROR:\n{last_error}")
            (job_dir / f"agent-response-{attempt}.txt").write_text(answer, encoding="utf-8")
            payload = parse_payload(answer)
            written = apply_payload(work_dir, payload)
            job["written"] = written
            job["agent_summary"] = payload.get("summary")
            commands = [str(x) for x in payload.get("commands", []) if isinstance(x, str) and allowed_command(str(x))]
            command_results = [run_cmd(c, work_dir) for c in commands]
            post = preflight(work_dir, stack)
            job["agent_commands"] = command_results
            job["postflight"] = post
            job["status"] = "built"
            break
        except Exception as e:
            last_error = str(e)
            job["status"] = "agent_waiting"
            job["agent_error"] = last_error
            log(root, "agent_attempt_failed", job_id=job_id, attempt=attempt, error=last_error)

    if job["status"] != "built":
        post_queue(job)

    result = package_workspace(work_dir, root / "outbox", job_id)
    job["result_zip"] = str(result)
    job["completed_at"] = now_iso()
    (job_dir / "job.json").write_text(json.dumps(job, indent=2))
    log(root, "job_complete", job_id=job_id, status=job["status"], result=str(result))
    return job

def scan_once(root: Path):
    inbox = Path(cfg("INBOX_DIR", "/sdcard/Download/SynthiaInbox")).expanduser()
    inbox.mkdir(parents=True, exist_ok=True)
    seen = load_seen(root)
    candidates = []
    for p in sorted(inbox.iterdir(), key=lambda x: x.stat().st_mtime if x.exists() else 0):
        if p.name.startswith(".") or p.name.endswith(".intent.txt"):
            continue
        candidates.append(p)

    for p in candidates:
        try:
            fp = file_fingerprint(p)
            if seen.get(str(p)) == fp:
                continue
            # Avoid grabbing a file that is still being copied into Downloads.
            st1 = p.stat()
            time.sleep(2)
            st2 = p.stat()
            if st1.st_size != st2.st_size or st1.st_mtime_ns != st2.st_mtime_ns:
                continue
            process_drop(p, root)
            seen[str(p)] = fp
            save_seen(root, seen)
        except Exception as e:
            log(root, "drop_failed", source=str(p), error=str(e))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    root = DEFAULT_ROOT
    root.mkdir(parents=True, exist_ok=True)
    for d in ("jobs", "outbox", "logs", "state", "bin"):
        (root / d).mkdir(parents=True, exist_ok=True)
    load_env(root / "config.env")
    root = Path(cfg("WORK_ROOT", str(root))).expanduser()
    for d in ("jobs", "outbox", "logs", "state", "bin"):
        (root / d).mkdir(parents=True, exist_ok=True)

    log(root, "worker_start", pid=os.getpid(), once=args.once)
    if args.once:
        scan_once(root)
        return

    while True:
        try:
            scan_once(root)
        except Exception as e:
            log(root, "scan_error", error=str(e))
        time.sleep(max(5, int(cfg("POLL_SECONDS", "20"))))

if __name__ == "__main__":
    main()
