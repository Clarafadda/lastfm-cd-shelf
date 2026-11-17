import asyncio
import os
import time
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()  # lit .env en local ; dans Docker, les variables arrivent par compose

API_KEY = os.environ.get("LASTFM_API_KEY", "")
USER = os.environ.get("LASTFM_USER", "")
TTL = int(os.environ.get("CACHE_TTL_SECONDS", "120"))
HISTORY_SECONDS = int(os.environ.get("HISTORY_SECONDS", str(24 * 3600)))  # fenêtre d'écoutes affichées

LASTFM_URL = "https://ws.audioscrobbler.com/2.0/"
def is_allowed_image_host(host):
    # Domaines d'images de Last.fm (ils varient : lastfm.*, lastfm-img.*, lastfm-img2.*)
    return bool(host) and host.startswith("lastfm") and host.endswith(
        (".freetls.fastly.net", ".akamaized.net")
    )
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI()

_cache = {"data": None, "fetched_at": 0.0}  # réponse Last.fm normalisée
_lock = asyncio.Lock()                       # un seul appel Last.fm à la fois
_covers = {}                                 # url -> (octets, type, instant)


async def fetch_from_lastfm():
    """Toutes les écoutes des dernières 24 h, plus le morceau en cours (sans date)."""
    cutoff = int(time.time()) - HISTORY_SECONDS
    tracks = []
    saw_nowplaying = False
    page = 1
    per_page = 200  # maximum accepté par Last.fm
    async with httpx.AsyncClient(timeout=5) as client:
        while page <= 10:  # garde-fou : 2000 écoutes maximum
            params = {
                "method": "user.getrecenttracks",
                "user": USER,
                "api_key": API_KEY,
                "format": "json",
                "limit": per_page,
                "page": page,
            }
            r = await client.get(LASTFM_URL, params=params)
            r.raise_for_status()
            payload = r.json()
            if "error" in payload:  # Last.fm peut répondre 200 avec une erreur dedans
                raise RuntimeError(f"Erreur Last.fm {payload['error']}")
            if isinstance(batch, dict):
                batch = [batch]
            if not batch:
                break
            kept = []
            for t in batch:
                if t.get("@attr", {}).get("nowplaying") == "true":
                    if not saw_nowplaying:
                        kept.append(t)
                        saw_nowplaying = True
                    continue
                try:
                    uts = int(t["date"]["uts"])
                except (KeyError, TypeError, ValueError):
                    continue
                if uts >= cutoff:
                    kept.append(t)
            tracks.extend(kept)
            # Dès qu'une écoute sort de la fenêtre, les pages suivantes sont plus vieilles
            if len(kept) < len(batch) or len(batch) < per_page:
                break
            page += 1
    return tracks


def normalize(raw_tracks):
    tracks = []
    for t in raw_tracks:
        images = {i["size"]: i["#text"] for i in t.get("image", [])}
        cover = images.get("extralarge") or images.get("large") or ""
        now = t.get("@attr", {}).get("nowplaying") == "true"
        tracks.append({
            "name": t["name"],
            "artist": t["artist"]["#text"],
            "album": t["album"]["#text"],
            "cover": f"/api/cover?u={quote(cover, safe='')}" if cover else None,
            "nowplaying": now,
            "played_at": None if now else int(t["date"]["uts"]),
        })
    return tracks


@app.get("/api/recent")
async def recent():
    async with _lock:
        age = time.time() - _cache["fetched_at"]
        if _cache["data"] is not None and age < TTL:
            return {**_cache["data"], "stale": False}
        try:
            print("Appel à Last.fm", flush=True)
            tracks = await fetch_from_lastfm()
            data = {
                "user": USER,
                "fetched_at": int(time.time()),
                "tracks": normalize(tracks),
            }
            _cache.update(data=data, fetched_at=time.time())
            return {**data, "stale": False}
        except Exception as e:
            # On ne logue que le type : le message httpx peut contenir l'URL, donc la clé
            print(f"Échec Last.fm : {type(e).__name__}", flush=True)
            if _cache["data"] is not None:
                return {**_cache["data"], "stale": True}  # vieilles données > rien
            return JSONResponse(
                status_code=502,
                content={"error": "Last.fm ne répond pas pour le moment. Réessaie dans quelques instants."},
            )


@app.get("/api/cover")
async def cover(u: str = Query(...)):
    parsed = urlparse(u)
    if parsed.scheme != "https" or not is_allowed_image_host(parsed.hostname):
        raise HTTPException(status_code=400, detail="Pochette non autorisée")

    hit = _covers.get(u)
    if hit and time.time() - hit[2] < 86400:
        body, ctype, _ = hit
    else:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(u)
            r.raise_for_status()
            ctype = r.headers.get("content-type", "")
            if not ctype.startswith("image/"):
                raise ValueError("pas une image")
        except Exception:
            raise HTTPException(status_code=502, detail="Pochette indisponible")
        body = r.content
        if len(_covers) > 500:
            _covers.clear()
        _covers[u] = (body, ctype, time.time())

    return Response(body, media_type=ctype, headers={"Cache-Control": "public, max-age=86400"})

@app.get("/health")
async def health():
    return {"status": "ok"}   # ne contacte pas Last.fm, donc ne compte pas dans les appels

# En dernier : sinon "/" capterait aussi les routes /api
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")