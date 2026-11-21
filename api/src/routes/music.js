/**
 * Chansons proposées par les invités pour la piste de danse, et lien avec Spotify.
 *
 * - Les invités proposent jusqu'à 3 chansons dans le formulaire de réponse (lien Spotify, recherche ou texte libre).
 * - L'extrait se joue avec le lecteur intégré officiel de Spotify (open.spotify.com/embed), sans clé.
 * - Si les mariés connectent leur compte Spotify dans l'administration, le serveur peut :
 *     · chercher des titres pour les invités (avec le jeton des mariés, limité à 10 résultats par Spotify) ;
 *     · ajouter les chansons à une playlist des mariés.
 *   Spotify exige pour cela une application « Development Mode » dont le propriétaire a Spotify Premium (règles de 2026).
 */
'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { db, getPrivate, setPrivate } = require('../db');
const { HttpError, str, int, rateLimit } = require('../util');

// Adresses de Spotify (remplaçables pour les tests automatisés)
const ACCOUNTS = process.env.SPOTIFY_ACCOUNTS_URL || 'https://accounts.spotify.com';
const API = process.env.SPOTIFY_API_URL || 'https://api.spotify.com/v1';
const OEMBED = process.env.SPOTIFY_OEMBED_URL || 'https://open.spotify.com/oembed';
const SCOPES = 'playlist-modify-private playlist-modify-public playlist-read-private';

db.exec(`
CREATE TABLE IF NOT EXISTS songs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id    INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  guest_name  TEXT NOT NULL DEFAULT '',
  title       TEXT NOT NULL,
  artist      TEXT NOT NULL DEFAULT '',
  spotify_id  TEXT NOT NULL DEFAULT '',
  image       TEXT NOT NULL DEFAULT '',
  added_at    TEXT,                               -- ajoutée à la playlist Spotify
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/* ---------- Outils ---------- */
const TRACK_ID = /^[A-Za-z0-9]{22}$/;
/** Identifiant de morceau depuis un lien open.spotify.com, un URI spotify:track: ou l'identifiant seul. */
function trackId(v) {
  const s = String(v || '').trim();
  const m = s.match(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/) || s.match(/^([A-Za-z0-9]{22})$/);
  return m ? m[1] : '';
}
const safeImage = (u) => (/^https:\/\/(i\.scdn\.co|[a-z0-9-]+\.spotifycdn\.com)\/image\/[a-z0-9]+$/i.test(String(u || '')) ? String(u) : '');

/** Chansons envoyées avec une réponse : [{ title, artist, spotify_id, image }] (3 au maximum). */
function parseSongs(raw) {
  let list = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw || '[]'); } catch { list = []; } }
  if (!Array.isArray(list)) return [];
  return list.slice(0, 3).map((s) => ({
    title: str(s?.title, 150),
    artist: str(s?.artist, 150),
    spotify_id: trackId(s?.spotify_id || s?.url),
    image: safeImage(s?.image),
  })).filter((s) => s.title || s.spotify_id);
}
/** Enregistre les chansons d'une réponse (remplace celles déjà proposées par le même invité et pas encore ajoutées). */
function saveSongs(guestId, guestName, songs) {
  if (!songs.length) return;
  db.transaction(() => {
    if (guestId) db.prepare('DELETE FROM songs WHERE guest_id = ? AND added_at IS NULL').run(guestId);
    const ins = db.prepare('INSERT INTO songs (guest_id, guest_name, title, artist, spotify_id, image) VALUES (?, ?, ?, ?, ?, ?)');
    for (const s of songs) {
      const dup = s.spotify_id && db.prepare('SELECT 1 FROM songs WHERE spotify_id = ? AND guest_id IS ?').get(s.spotify_id, guestId);
      if (!dup) ins.run(guestId, guestName || '', s.title || 'Titre à préciser', s.artist, s.spotify_id, s.image);
    }
  })();
}

/* ---------- Spotify : réglages et jetons ---------- */
function getCfg() {
  try { return JSON.parse(getPrivate('spotify') || '{}'); } catch { return {}; }
}
const setCfg = (c) => setPrivate('spotify', JSON.stringify(c));
const connected = (c = getCfg()) => !!(c.client_id && c.client_secret && c.refresh_token);

function basicAuth(c) { return 'Basic ' + Buffer.from(`${c.client_id}:${c.client_secret}`).toString('base64'); }
async function tokenRequest(c, params) {
  const r = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(c), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `Spotify refuse la connexion (${j.error_description || j.error || r.status}).`);
  return j;
}
/** Jeton d'accès valide (renouvelé automatiquement avec le jeton de rafraîchissement). */
async function accessToken() {
  const c = getCfg();
  if (!connected(c)) throw new HttpError(503, 'Spotify n’est pas connecté.');
  if (c.access_token && c.expires_at > Date.now() + 60_000) return c.access_token;
  const j = await tokenRequest(c, { grant_type: 'refresh_token', refresh_token: c.refresh_token });
  c.access_token = j.access_token;
  c.expires_at = Date.now() + (j.expires_in || 3600) * 1000;
  if (j.refresh_token) c.refresh_token = j.refresh_token;
  setCfg(c);
  return c.access_token;
}
async function spotify(path, opts = {}) {
  const token = await accessToken();
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || r.status;
    if (r.status === 401 || r.status === 403) throw new HttpError(502, `Spotify refuse l’accès (${msg}). Reconnectez Spotify dans l’administration.`);
    throw new HttpError(502, `Erreur Spotify : ${msg}`);
  }
  return j;
}
const simplify = (t) => ({
  id: t.id,
  title: t.name,
  artist: (t.artists || []).map((a) => a.name).join(', '),
  image: safeImage((t.album?.images || []).slice(-1)[0]?.url || (t.album?.images || [])[0]?.url),
});
async function search(q) {
  const j = await spotify(`/search?type=track&limit=8&q=${encodeURIComponent(q)}`);
  return (j.tracks?.items || []).filter((t) => TRACK_ID.test(t.id)).map(simplify);
}

/** Adresse de retour à déclarer dans l'application Spotify (le site doit être en HTTPS, sauf 127.0.0.1). */
function redirectUri(req) {
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}/api/spotify/callback`;
}

/* =========================================================
   Routes publiques
   ========================================================= */
const publicRouter = express.Router();

publicRouter.get('/music/config', (req, res) => res.json({ search: connected() }));

/** Titre et pochette d'un lien Spotify collé par un invité (oEmbed public de Spotify, sans clé). */
publicRouter.get('/music/lookup', rateLimit('music-lookup', 30, 60_000), async (req, res) => {
  const id = trackId(req.query.url);
  if (!id) throw new HttpError(400, 'Lien Spotify non reconnu : copiez le lien d’un titre (Partager → Copier le lien du titre).');
  let title = '', image = '';
  try {
    const r = await fetch(`${OEMBED}?url=${encodeURIComponent(`https://open.spotify.com/track/${id}`)}`, { signal: AbortSignal.timeout(6000) });
    if (r.ok) { const j = await r.json(); title = str(j.title, 150); image = safeImage(j.thumbnail_url); }
  } catch { /* Spotify injoignable : on garde le lien seul */ }
  let artist = '';
  if (connected()) { try { const t = await spotify(`/tracks/${id}`); ({ title, artist } = simplify(t)); image = image || simplify(t).image; } catch { /* titre de l'oEmbed */ } }
  res.json({ id, title, artist, image });
});

publicRouter.get('/music/search', rateLimit('music-search', 40, 60_000), async (req, res) => {
  const q = str(req.query.q, 100);
  if (q.length < 2) return res.json([]);
  if (!connected()) throw new HttpError(503, 'Recherche indisponible : collez plutôt un lien Spotify ou écrivez le titre.');
  res.json(await search(q));
});

/** Retour de Spotify après autorisation. Le cookie d'administration n'est pas envoyé par le navigateur à ce retour
    (SameSite) : la requête est validée par le paramètre « state », aléatoire et à usage unique, créé par l'admin. */
publicRouter.get('/spotify/callback', async (req, res) => {
  const c = getCfg();
  const back = (msg) => res.redirect(`/admin/?spotify=${encodeURIComponent(msg)}#music`);
  if (req.query.error) return back('refus');
  if (!c.state || req.query.state !== c.state || Date.now() - (c.state_at || 0) > 15 * 60_000) return back('expire');
  try {
    const j = await tokenRequest(c, { grant_type: 'authorization_code', code: String(req.query.code || ''), redirect_uri: redirectUri(req) });
    c.access_token = j.access_token; c.refresh_token = j.refresh_token; c.expires_at = Date.now() + (j.expires_in || 3600) * 1000;
    delete c.state; delete c.state_at;
    setCfg(c);
    const me = await spotify('/me');
    c.user = me.display_name || me.id || ''; c.user_id = me.id || '';
    setCfg({ ...getCfg(), user: c.user, user_id: c.user_id });
    back('ok');
  } catch {
    back('erreur');
  }
});

/* =========================================================
   Administration (montée sous /api/admin)
   ========================================================= */
const adminRouter = express.Router();

function adminState(req) {
  const c = getCfg();
  return {
    songs: db.prepare(`SELECT s.*, g.name AS guest_current FROM songs s LEFT JOIN guests g ON g.id = s.guest_id
                       ORDER BY s.added_at IS NOT NULL, s.created_at DESC, s.id DESC`).all(),
    spotify: {
      configured: !!(c.client_id && c.client_secret),
      connected: connected(c),
      client_id: c.client_id || '',
      user: c.user || '',
      playlist: c.playlist_id ? { id: c.playlist_id, name: c.playlist_name || '', url: `https://open.spotify.com/playlist/${c.playlist_id}` } : null,
      redirect_uri: redirectUri(req),
    },
  };
}

adminRouter.get('/music', (req, res) => res.json(adminState(req)));

adminRouter.put('/music/spotify', (req, res) => {
  const c = getCfg();
  const id = str(req.body?.client_id, 64), secret = str(req.body?.client_secret, 64);
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new HttpError(400, 'Le Client ID Spotify fait 32 caractères (chiffres et lettres a à f).');
  if (secret && !/^[a-f0-9]{32}$/i.test(secret)) throw new HttpError(400, 'Le Client Secret Spotify fait 32 caractères (chiffres et lettres a à f).');
  if (id !== c.client_id) { delete c.refresh_token; delete c.access_token; delete c.user; }
  c.client_id = id;
  if (secret) c.client_secret = secret;
  if (!c.client_secret) throw new HttpError(400, 'Indiquez aussi le Client Secret.');
  setCfg(c);
  res.json(adminState(req));
});

/** Adresse d'autorisation Spotify (le navigateur des mariés y est envoyé). */
adminRouter.post('/music/spotify/login', (req, res) => {
  const c = getCfg();
  if (!c.client_id || !c.client_secret) throw new HttpError(400, 'Enregistrez d’abord le Client ID et le Client Secret.');
  c.state = crypto.randomBytes(16).toString('hex');
  c.state_at = Date.now();
  setCfg(c);
  const url = `${ACCOUNTS}/authorize?` + new URLSearchParams({
    response_type: 'code', client_id: c.client_id, scope: SCOPES, redirect_uri: redirectUri(req), state: c.state, show_dialog: 'true',
  });
  res.json({ url });
});

adminRouter.post('/music/spotify/disconnect', (req, res) => {
  const c = getCfg();
  for (const k of ['refresh_token', 'access_token', 'expires_at', 'user', 'user_id']) delete c[k];
  setCfg(c);
  res.json(adminState(req));
});

/** Choisit la playlist : création d'une nouvelle, ou lien vers une playlist existante des mariés. */
adminRouter.post('/music/playlist', async (req, res) => {
  const c = getCfg();
  const link = str(req.body?.url, 300);
  if (link) {
    const m = link.match(/playlist[/:]([A-Za-z0-9]{22})/) || link.match(/^([A-Za-z0-9]{22})$/);
    if (!m) throw new HttpError(400, 'Lien de playlist Spotify non reconnu.');
    const p = await spotify(`/playlists/${m[1]}?fields=id,name`);
    Object.assign(c, getCfg(), { playlist_id: p.id, playlist_name: p.name });
  } else {
    const name = str(req.body?.name, 100) || 'Mariage – propositions des invités';
    const p = await spotify('/me/playlists', { method: 'POST', body: JSON.stringify({ name, public: false, description: 'Chansons proposées par nos invités' }) });
    Object.assign(c, getCfg(), { playlist_id: p.id, playlist_name: p.name });
  }
  setCfg(c);
  res.json(adminState(req));
});

adminRouter.get('/music/search', async (req, res) => {
  const q = str(req.query.q, 100);
  res.json(q.length < 2 ? [] : await search(q));
});

/** Associe une chanson proposée à un morceau Spotify (choisi dans la recherche ou par lien). */
adminRouter.put('/music/:id', (req, res) => {
  const id = int(req.params.id, 1, 1e9);
  const s = db.prepare('SELECT * FROM songs WHERE id = ?').get(id);
  if (!s) throw new HttpError(404, 'Chanson introuvable.');
  const sid = trackId(req.body?.spotify_id || req.body?.url);
  if ((req.body?.spotify_id || req.body?.url) && !sid) throw new HttpError(400, 'Lien Spotify non reconnu.');
  db.prepare('UPDATE songs SET title = ?, artist = ?, spotify_id = ?, image = ? WHERE id = ?').run(
    str(req.body?.title ?? s.title, 150) || s.title, str(req.body?.artist ?? s.artist, 150), sid || s.spotify_id, safeImage(req.body?.image) || s.image, id,
  );
  res.json(adminState(req));
});

async function addToPlaylist(ids) {
  const c = getCfg();
  if (!c.playlist_id) throw new HttpError(400, 'Choisissez d’abord la playlist Spotify.');
  const rows = ids.map((id) => db.prepare('SELECT * FROM songs WHERE id = ?').get(id)).filter((s) => s && s.spotify_id && !s.added_at);
  for (let i = 0; i < rows.length; i += 100) {
    await spotify(`/playlists/${c.playlist_id}/items`, { method: 'POST', body: JSON.stringify({ uris: rows.slice(i, i + 100).map((s) => `spotify:track:${s.spotify_id}`) }) });
  }
  const mark = db.prepare("UPDATE songs SET added_at = datetime('now') WHERE id = ?");
  rows.forEach((s) => mark.run(s.id));
  return rows.length;
}
adminRouter.post('/music/:id/add', async (req, res) => {
  const n = await addToPlaylist([int(req.params.id, 1, 1e9)]);
  if (!n) throw new HttpError(400, 'Cette chanson n’a pas encore de morceau Spotify associé.');
  res.json(adminState(req));
});
adminRouter.post('/music/add-all', async (req, res) => {
  const ids = db.prepare("SELECT id FROM songs WHERE spotify_id != '' AND added_at IS NULL").all().map((r) => r.id);
  const n = await addToPlaylist(ids);
  res.json({ ...adminState(req), added: n });
});

adminRouter.delete('/music/:id', (req, res) => {
  db.prepare('DELETE FROM songs WHERE id = ?').run(int(req.params.id, 1, 1e9));
  res.json(adminState(req));
});

module.exports = { publicRouter, adminRouter, parseSongs, saveSongs };
