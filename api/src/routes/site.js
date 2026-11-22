/**
 * Réglages du site : logo, favicon et statistiques de visite Umami.
 *
 * Umami : le script et les envois de statistiques passent par notre propre domaine
 * (/api/stats/…), relayés vers votre instance Umami. Avantages : aucune modification
 * de la politique de sécurité (CSP), adresse de votre Umami jamais exposée,
 * et le suivi n'est pas bloqué par les bloqueurs de publicité courants.
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const { db, DATA_DIR, getContent, setContent, getPrivate, setPrivate } = require('../db');
const { HttpError, str, url, rateLimit, imageType } = require('../util');

const SITE_MEDIA = path.join(DATA_DIR, 'media', 'site');
fs.mkdirSync(SITE_MEDIA, { recursive: true });

/* ---------- Réglages Umami (stockés côté privé) ---------- */
function getUmami() {
  try {
    return { script_url: '', website_id: '', dashboard_url: '', ...JSON.parse(getPrivate('umami') || '{}') };
  } catch {
    return { script_url: '', website_id: '', dashboard_url: '' };
  }
}
const umamiEnabled = (u = getUmami()) => !!(u.script_url && u.website_id);

/* =========================================================
   Routes publiques
   ========================================================= */
const publicRouter = express.Router();

/** Indique aux pages invités s'il faut charger le suivi (sans révéler l'adresse de Umami). */
publicRouter.get('/stats/config', (req, res) => {
  const u = getUmami();
  res.set('Cache-Control', 'no-store');
  res.json(umamiEnabled(u) ? { enabled: true, website_id: u.website_id } : { enabled: false });
});

/** Script de suivi Umami, récupéré sur votre instance puis mis en cache 1 h. */
let scriptCache = { url: '', body: '', at: 0 };
publicRouter.get('/stats/script.js', async (req, res) => {
  const u = getUmami();
  if (!umamiEnabled(u)) throw new HttpError(404, 'Statistiques désactivées.');
  if (scriptCache.url !== u.script_url || Date.now() - scriptCache.at > 3600_000) {
    let r;
    try {
      r = await fetch(u.script_url, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new HttpError(502, 'Umami injoignable depuis le serveur du site.');
    }
    if (!r.ok) throw new HttpError(502, `Umami a répondu ${r.status} pour le script.`);
    scriptCache = { url: u.script_url, body: await r.text(), at: Date.now() };
  }
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(scriptCache.body);
});

/** Journal des erreurs du relais, au plus une fois par heure et par message (diagnostic dans les logs du conteneur). */
const warned = new Map();
function warnOnce(msg) {
  if (Date.now() - (warned.get(msg) || 0) < 3600_000) return;
  warned.set(msg, Date.now());
  console.warn(msg);
}

/** Relais des statistiques vers Umami (le script les envoie à <data-host-url>/api/send). */
publicRouter.post('/stats/api/send', rateLimit('stats', 300, 10 * 60_000), async (req, res) => {
  const u = getUmami();
  if (!umamiEnabled(u)) return res.status(204).end();
  const target = new URL('/api/send', u.script_url).toString();
  try {
    const r = await fetch(target, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        'Content-Type': 'application/json',
        // Umami en a besoin pour la géolocalisation, l'appareil et le navigateur
        'User-Agent': req.get('user-agent') || '',
        'X-Forwarded-For': req.ip,
        'Accept-Language': req.get('accept-language') || '',
        // Jeton de session renvoyé par Umami et réutilisé par son script
        ...(req.get('x-umami-cache') ? { 'x-umami-cache': req.get('x-umami-cache') } : {}),
      },
      body: JSON.stringify(req.body || {}),
    });
    const body = await r.text();
    if (!r.ok) warnOnce(`[stats] Umami a refusé une visite (${r.status}) : ${body.slice(0, 200)}`);
    res.status(r.status).type('application/json').send(body);
  } catch (err) {
    warnOnce(`[stats] Umami injoignable depuis le serveur du site : ${err.message}`);
    res.status(204).end(); // une panne de Umami ne doit jamais gêner les invités
  }
});

/** Logo envoyé depuis l'admin. */
publicRouter.get('/media/site/:file', (req, res) => {
  const file = req.params.file;
  if (!/^logo-[a-f0-9]{16}\.(png|jpg|webp)$/.test(file)) throw new HttpError(404, 'Image introuvable.');
  res.set('Cache-Control', 'public, max-age=2592000, immutable');
  res.sendFile(path.join(SITE_MEDIA, file), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Image introuvable.' });
  });
});


/* =========================================================
   Favicon (icône de l'onglet) personnalisé
   ========================================================= */
const FAVICON_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', svg: 'image/svg+xml' };
function faviconType(buf) {
  const t = imageType(buf);
  if (t) return t;
  if (buf.length > 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'ico';
  const head = buf.subarray(0, 1000).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'svg';
  return null;
}
function getFavicon() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'favicon'").get();
  try { return row ? JSON.parse(row.value) : null; } catch { return null; }
}
function setFavicon(v) {
  if (v) db.prepare("INSERT INTO settings (key, value) VALUES ('favicon', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(v));
  else db.prepare("DELETE FROM settings WHERE key = 'favicon'").run();
}

/** Icône de l'onglet : celle envoyée dans l'admin, sinon l'icône par défaut du site. */
publicRouter.get('/favicon', (req, res) => {
  const f = getFavicon();
  if (!f || !/^favicon-[a-f0-9]{16}\.(png|jpg|webp|ico|svg)$/.test(f.file)) return res.redirect(302, '/favicon.svg');
  res.set('Cache-Control', 'no-cache');
  res.type(FAVICON_TYPES[f.file.split('.').pop()]);
  // Un SVG ne doit jamais pouvoir exécuter de script, même ouvert directement
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.sendFile(path.join(SITE_MEDIA, f.file), (err) => { if (err && !res.headersSent) res.redirect(302, '/favicon.svg'); });
});

/* =========================================================
   Routes d'administration
   ========================================================= */
const adminRouter = express.Router();

adminRouter.get('/umami', (req, res) => res.json(getUmami()));

adminRouter.put('/umami', (req, res) => {
  const b = req.body || {};
  const next = {
    script_url: url(b.script_url),
    website_id: str(b.website_id, 64).toLowerCase(),
    dashboard_url: url(b.dashboard_url),
  };
  if (next.script_url && !/\.js(\?.*)?$/i.test(next.script_url)) {
    throw new HttpError(400, 'L’adresse du script doit se terminer par .js (ex. https://stats.exemple.fr/script.js).');
  }
  if (next.website_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(next.website_id)) {
    throw new HttpError(400, 'L’identifiant du site Umami doit ressembler à 1a2b3c4d-1234-5678-9abc-1234567890ab.');
  }
  setPrivate('umami', JSON.stringify(next));
  scriptCache = { url: '', body: '', at: 0 };
  res.json({ ok: true, enabled: umamiEnabled(next) });
});

/** Teste depuis le serveur que le script Umami est bien joignable. */
adminRouter.post('/umami/test', async (req, res) => {
  const u = getUmami();
  if (!umamiEnabled(u)) throw new HttpError(400, 'Renseignez d’abord l’adresse du script et l’identifiant du site.');
  try {
    const r = await fetch(u.script_url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new HttpError(502, `Umami a répondu ${r.status}. Vérifiez l’adresse du script.`);
    const body = await r.text();
    if (!/umami|data-website-id|website/i.test(body)) throw new HttpError(502, 'Le fichier trouvé ne ressemble pas au script Umami.');
    res.json({ ok: true, message: 'Umami est joignable depuis le serveur du site ✓' });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, 'Impossible de joindre Umami depuis le serveur du site (adresse, DNS ou réseau Docker).');
  }
});

/** Envoi du logo (PNG, JPEG ou WebP). */
adminRouter.post('/logo', express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '4mb' }), (req, res) => {
  const buf = req.body;
  const ext = Buffer.isBuffer(buf) ? imageType(buf) : null;
  if (!ext) throw new HttpError(400, 'Format non reconnu : envoyez une image PNG (fond transparent conseillé), JPEG ou WebP.');
  const filename = `logo-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(SITE_MEDIA, filename), buf);
  const content = getContent();
  const old = content.logo.image;
  content.logo = { ...content.logo, image: filename, mode: 'image' };
  setContent(content);
  if (old) fs.rm(path.join(SITE_MEDIA, old), { force: true }, () => {});
  res.json({ ok: true, url: `/api/media/site/${filename}` });
});

adminRouter.delete('/logo', (req, res) => {
  const content = getContent();
  const old = content.logo.image;
  content.logo = { ...content.logo, image: '', mode: content.logo.mode === 'image' ? 'ornament' : content.logo.mode };
  setContent(content);
  if (old) fs.rm(path.join(SITE_MEDIA, old), { force: true }, () => {});
  res.json({ ok: true });
});


adminRouter.get('/favicon', (req, res) => {
  const f = getFavicon();
  res.json({ custom: !!f, url: '/api/favicon', updated: f ? f.updated : null });
});

/** Envoi du favicon : PNG, ICO, SVG, WebP ou JPEG (1 Mo maximum). */
adminRouter.post('/favicon', express.raw({ type: () => true, limit: '1mb' }), (req, res) => {
  const buf = req.body;
  const ext = Buffer.isBuffer(buf) && buf.length ? faviconType(buf) : null;
  if (!ext) throw new HttpError(400, 'Format non reconnu : envoyez une image PNG (carrée, 512 × 512 px conseillé), ICO ou SVG.');
  const filename = `favicon-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(SITE_MEDIA, filename), buf);
  const old = getFavicon();
  setFavicon({ file: filename, updated: Date.now() });
  if (old?.file) fs.rm(path.join(SITE_MEDIA, old.file), { force: true }, () => {});
  res.json({ ok: true, custom: true, url: '/api/favicon' });
});

adminRouter.delete('/favicon', (req, res) => {
  const old = getFavicon();
  setFavicon(null);
  if (old?.file) fs.rm(path.join(SITE_MEDIA, old.file), { force: true }, () => {});
  res.json({ ok: true, custom: false });
});

module.exports = { publicRouter, adminRouter, getUmami, umamiEnabled };
