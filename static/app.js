const shelf = document.getElementById("shelf");
const scene = document.getElementById("scene");
const statusEl = document.getElementById("status");
const infoTitle = document.getElementById("info-title");
const infoSub = document.getElementById("info-sub");
const infoMeta = document.getElementById("info-meta");
const counter = document.getElementById("counter");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const detailPanel = document.getElementById("detail");
const detailAlbum = document.getElementById("detail-album");
const detailArtist = document.getElementById("detail-artist");
const detailMeta = document.getElementById("detail-meta");
const detailTracks = document.getElementById("detail-tracks");
const detailClose = document.getElementById("detail-close");

const NO_COVER_HASH = "2a96cbd8b46e442fc41c2b86b821562f"; // image vide de Last.fm
const HISTORY_MS = 24 * 60 * 60 * 1000;  // on ne garde que les écoutes des dernières 24 h

let albums = [];   // un élément par album (le plus récent en premier)
let cds = [];      // les boutons correspondants
let current = 0;   // index du CD sélectionné
let detailOpen = false;

const keyOf = (a) => `${a.artist}||${a.album || a.name}`;

// Regroupe les écoutes par album, en gardant l'ordre (récent -> ancien).
// Le titre affiché est celui de l'écoute la plus récente de l'album.
function groupAlbums(tracks) {
  const groups = new Map();
  const cutoff = Date.now() - HISTORY_MS;
  for (const t of tracks) {
    if (t.played_at !== null && t.played_at * 1000 < cutoff) continue;  // hors des 24 h
    const key = keyOf(t);
    const g = groups.get(key);
    if (g) {
      g.plays += 1;
      g.tracks.push(t);
    } else {
      groups.set(key, { ...t, plays: 1, tracks: [t] });
    }
  }
  return [...groups.values()];  // tous les albums des dernières 24 h, sans limite
}

function timeAgo(uts) {
  const min = Math.round((Date.now() / 1000 - uts) / 60);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

function hueFrom(text) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function makeFallback(face, album) {
  face.classList.add("fallback");
  face.style.setProperty("--h", hueFrom(album.artist + album.album));
  face.textContent = (album.album || album.name || "?").charAt(0).toUpperCase();
}

function updateInfo() {
  const a = albums[current];
  if (!a) return;
  infoTitle.textContent = a.name;                                   // 1. le titre du morceau
  infoSub.textContent = [a.album, a.artist].filter(Boolean).join(" — "); // 2. album — artiste
  const when = a.nowplaying ? "En cours d'écoute" : `Écouté ${timeAgo(a.played_at)}`;
  infoMeta.textContent = `${when} · ${a.plays} écoute${a.plays > 1 ? "s" : ""} de cet album`;
  counter.textContent = `${current + 1} / ${albums.length}`;
  prevBtn.disabled = current === 0;
  nextBtn.disabled = current === albums.length - 1;
}

function renderDetail() {
  const a = albums[current];
  if (!a) return;
  detailAlbum.textContent = a.album || a.name;
  detailArtist.textContent = a.artist;
  detailMeta.textContent = `${a.plays} écoute${a.plays > 1 ? "s" : ""} sur les dernières 24 h`;
  detailTracks.replaceChildren();
  const seen = new Set();
  for (const t of a.tracks) {
    if (seen.has(t.name)) continue;  // un même titre peut avoir été joué plusieurs fois
    seen.add(t.name);
    const li = document.createElement("li");
    if (t.name === a.name) li.className = "current";
    li.textContent = t.name;
    const when = document.createElement("span");
    when.textContent = t.nowplaying ? "en cours d'écoute" : `écouté ${timeAgo(t.played_at)}`;
    li.appendChild(when);
    detailTracks.appendChild(li);
  }
}

function setDetail(open) {
  detailOpen = open;
  scene.classList.toggle("detail-open", open);
  detailPanel.classList.toggle("open", open);
  cds.forEach((el, i) => el.classList.toggle("detail", open && i === current));
  if (open) {
    renderDetail();
    detailClose.focus();
  }
}

function go(index) {
  if (albums.length === 0) return;
  if (detailOpen) setDetail(false);
  current = Math.max(0, Math.min(albums.length - 1, index));
  shelf.style.setProperty("--active", current);   // la rangée avance
  cds.forEach((el, i) => {
    el.classList.toggle("active", i === current);
    el.style.setProperty("--d", i - current);          // < 0 : déjà passé, reste devant
    el.classList.toggle("gone", i < current - 5);
  });
  updateInfo();
}

function buildCd(album, i) {
  const el = document.createElement("button");
  el.type = "button";
  el.tabIndex = -1;                    // la navigation passe par les boutons / le clavier
  el.className = "cd" + (album.nowplaying ? " now" : "");
  el.style.setProperty("--i", i);
  el.setAttribute("aria-label", `${album.album || album.name}, ${album.artist}`);

  const face = document.createElement("span");
  face.className = "face";
  if (album.cover && !album.cover.includes(NO_COVER_HASH)) {
    const img = new Image();
    img.alt = "";
    img.onerror = () => { face.replaceChildren(); makeFallback(face, album); };
    img.src = album.cover;             // /api/cover : servi par NOTRE serveur
    face.appendChild(img);
  } else {
    makeFallback(face, album);
  }
  el.appendChild(face);
  for (const name of ["right", "top"]) {   // l'épaisseur du boîtier
    const side = document.createElement("span");
    side.className = `side ${name}`;
    el.appendChild(side);
  }
  el.addEventListener("click", () => {
    if (i === current) setDetail(!detailOpen);  // clic sur le CD en avant = ouvrir/fermer la fiche
    else go(i);
  });
  return el;
}

function render(data) {
  const previousKey = albums[current] ? keyOf(albums[current]) : null;
  albums = groupAlbums(data.tracks);
  shelf.replaceChildren();
  cds = [];
  if (albums.length === 0) {
    statusEl.textContent = "Aucune écoute récente à afficher.";
    return;
  }
  albums.forEach((a, i) => {
    const el = buildCd(a, i);
    cds.push(el);
    shelf.appendChild(el);
  });
  const keep = albums.findIndex((a) => keyOf(a) === previousKey);
  go(keep >= 0 ? keep : 0);

  statusEl.classList.toggle("error", Boolean(data.stale));
  statusEl.textContent = data.stale
    ? `Last.fm ne répond pas : voici les dernières écoutes connues (${timeAgo(data.fetched_at)}).`
    : `Écoutes de ${data.user}, mises à jour ${timeAgo(data.fetched_at)}.`;
}

function showError(message) {
  statusEl.classList.add("error");
  statusEl.textContent = message;
}

async function load() {
  try {
    const res = await fetch("/api/recent");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur du serveur.");
    render(data);
  } catch (err) {
    const known = err instanceof TypeError || err instanceof SyntaxError;
    showError(known ? "Impossible de joindre le serveur pour le moment." : err.message);
  }
}

/* --- Navigation : boutons, molette, glissement, clavier --- */
detailClose.addEventListener("click", (e) => { e.stopPropagation(); setDetail(false); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && detailOpen) setDetail(false);
});
nextBtn.addEventListener("click", () => go(current + 1));
prevBtn.addEventListener("click", () => go(current - 1));

let lastWheel = 0;
scene.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  const now = performance.now();
  if (Math.abs(delta) < 4 || now - lastWheel < 300) return; // un cran à la fois
  lastWheel = now;
  go(current + (delta > 0 ? 1 : -1));
}, { passive: false });

let touchStart = null;
scene.addEventListener("touchstart", (e) => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
scene.addEventListener("touchend", (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const d = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
  if (Math.abs(d) > 40) go(current + (d < 0 ? 1 : -1)); // glisser vers le haut/gauche = suivant
  touchStart = null;
}, { passive: true });

document.addEventListener("keydown", (e) => {
  if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key)) { e.preventDefault(); go(current + 1); }
  if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); go(current - 1); }
});

load();
setInterval(load, 120000); // rafraîchit toutes les 2 min (comme le cache)