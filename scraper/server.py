#!/usr/bin/env python3
"""Achilles Command - ponte local para o google-maps-scraper (gosom).

Sem dependencias externas: usa apenas Python stdlib + Docker instalado.
O navegador/Netlify nunca executa scraping diretamente. Ele cria um job aqui,
este processo dispara o container gosom/google-maps-scraper e depois devolve
os resultados normalizados.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_dotenv(ROOT / ".env")

HOST = os.getenv("SCRAPER_HOST", "127.0.0.1")
PORT = int(os.getenv("SCRAPER_PORT", "8765"))
SECRET = os.getenv("SCRAPER_BRIDGE_SECRET", "").strip()
IMAGE = os.getenv("GOSOM_IMAGE", "gosom/google-maps-scraper:latest").strip()
CONCURRENCY = max(1, min(int(os.getenv("SCRAPER_CONCURRENCY", "2")), 8))

JOBS: dict[str, dict] = {}
LOCK = threading.Lock()


def clean_text(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value).strip()


def number(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def integer(value, default=0):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def parse_result_file(path: Path) -> list[dict]:
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="replace").strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [x for x in parsed if isinstance(x, dict)]
        if isinstance(parsed, dict):
            if isinstance(parsed.get("results"), list):
                return [x for x in parsed["results"] if isinstance(x, dict)]
            return [parsed]
    except json.JSONDecodeError:
        pass

    rows = []
    for line in text.splitlines():
        line = line.strip().rstrip(",")
        if not line:
            continue
        try:
            obj = json.loads(line)
            if isinstance(obj, dict):
                rows.append(obj)
        except json.JSONDecodeError:
            continue
    return rows


def normalize_place(row: dict) -> dict:
    emails = row.get("emails") or []
    if isinstance(emails, str):
        emails = [e.strip() for e in re.split(r"[,;\s]+", emails) if "@" in e]
    elif not isinstance(emails, list):
        emails = []

    source_id = clean_text(row.get("place_id") or row.get("cid") or row.get("data_id") or row.get("link"))
    return {
        "sourceId": source_id,
        "company": clean_text(row.get("title") or row.get("name")),
        "category": clean_text(row.get("category")),
        "phone": clean_text(row.get("phone")),
        "emails": emails[:8],
        "website": clean_text(row.get("website")),
        "address": clean_text(row.get("address") or row.get("complete_address")),
        "mapsUrl": clean_text(row.get("link") or row.get("google_maps_url")),
        "latitude": number(row.get("latitude"), None),
        "longitude": number(row.get("longitude"), None),
        "rating": number(row.get("review_rating") or row.get("rating"), 0),
        "reviewCount": integer(row.get("review_count") or row.get("reviews"), 0),
        "status": clean_text(row.get("status")),
    }


def run_job(job_id: str, query: str, depth: int, email: bool) -> None:
    job_dir = DATA_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "queries.txt").write_text(query + "\n", encoding="utf-8")
    result_path = job_dir / "results.json"

    # O volume nomeado evita baixar os browsers do Playwright a cada busca.
    mount = f"{job_dir.resolve()}:/workspace"
    cmd = [
        "docker", "run", "--rm",
        "-v", "gmaps-playwright-cache:/opt",
        "-v", mount,
        IMAGE,
        "-input", "/workspace/queries.txt",
        "-results", "/workspace/results.json",
        "-json",
        "-depth", str(depth),
        "-lang", "pt",
        "-c", str(CONCURRENCY),
        "-exit-on-inactivity", "3m",
    ]
    if email:
        cmd.append("-email")

    with LOCK:
        JOBS[job_id].update({"status": "running", "startedAt": time.time()})

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "Falha no scraper")[-3500:]
            raise RuntimeError(detail)

        rows = parse_result_file(result_path)
        normalized = [normalize_place(row) for row in rows]
        normalized = [r for r in normalized if r.get("company")]

        # Deduplicacao simples antes de devolver ao Command.
        unique = []
        seen = set()
        for row in normalized:
            key = row.get("sourceId") or re.sub(r"\D", "", row.get("phone", "")) or (row.get("company", "") + row.get("address", "")).lower()
            if key in seen:
                continue
            seen.add(key)
            unique.append(row)

        with LOCK:
            JOBS[job_id].update({
                "status": "completed",
                "completedAt": time.time(),
                "resultCount": len(unique),
                "results": unique,
            })
    except subprocess.TimeoutExpired:
        with LOCK:
            JOBS[job_id].update({"status": "failed", "error": "Busca excedeu 15 minutos."})
    except FileNotFoundError:
        with LOCK:
            JOBS[job_id].update({"status": "failed", "error": "Docker nao encontrado. Instale/abra o Docker Desktop."})
    except Exception as exc:
        with LOCK:
            JOBS[job_id].update({"status": "failed", "error": str(exc)[:3500]})


class Handler(BaseHTTPRequestHandler):
    server_version = "AchillesScraperBridge/1.0"

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, x-achilles-secret")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def json_response(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.cors()
        self.end_headers()
        self.wfile.write(body)

    def authorized(self) -> bool:
        if not SECRET:
            return True
        return secrets.compare_digest(self.headers.get("x-achilles-secret", ""), SECRET)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if not self.authorized():
            return self.json_response(401, {"error": "Nao autorizado"})
        path = urlparse(self.path).path.rstrip("/")
        if path == "/health":
            return self.json_response(200, {"status": "ok", "image": IMAGE})
        match = re.fullmatch(r"/jobs/([a-zA-Z0-9_-]+)", path)
        if match:
            job_id = match.group(1)
            with LOCK:
                job = JOBS.get(job_id)
                payload = dict(job) if job else None
            if not payload:
                return self.json_response(404, {"error": "Job nao encontrado"})
            return self.json_response(200, payload)
        return self.json_response(404, {"error": "Rota nao encontrada"})

    def do_POST(self):
        if not self.authorized():
            return self.json_response(401, {"error": "Nao autorizado"})
        path = urlparse(self.path).path.rstrip("/")
        if path != "/jobs":
            return self.json_response(404, {"error": "Rota nao encontrada"})

        try:
            length = min(int(self.headers.get("Content-Length", "0")), 65536)
            data = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self.json_response(400, {"error": "JSON invalido"})

        query = clean_text(data.get("query"))[:250]
        depth = max(1, min(integer(data.get("depth"), 1), 5))
        email = bool(data.get("email", False))
        if not query:
            return self.json_response(400, {"error": "query obrigatoria"})

        job_id = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
        payload = {
            "jobId": job_id,
            "query": query,
            "status": "pending",
            "createdAt": time.time(),
            "resultCount": 0,
        }
        with LOCK:
            JOBS[job_id] = payload
        thread = threading.Thread(target=run_job, args=(job_id, query, depth, email), daemon=True)
        thread.start()
        return self.json_response(202, payload)


if __name__ == "__main__":
    if not SECRET:
        print("AVISO: SCRAPER_BRIDGE_SECRET vazio. Use um segredo antes de expor por tunnel.")
    print(f"Achilles Scraper Bridge em http://{HOST}:{PORT}")
    print(f"Imagem: {IMAGE}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
