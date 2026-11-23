/**
 * Accès au site réservé aux invités (activable dans l'administration).
 *
 * - Un mot de passe commun aux invités, haché avec scrypt (comme celui de l'administration).
 * - Session invité : jeton aléatoire dans un cookie HttpOnly « mm_site » valable sur tout le site ;
 *   seule son empreinte SHA-256 est stockée en base.
 * - Nginx demande à l'API (/api/access/check) si chaque page peut être affichée (auth_request),
 *   et l'API refuse elle-même ses routes publiques sans session : rien n'est lisible sans le mot de passe.
 * - Une session administrateur ouvre aussi le site (aperçu par les mariés).
 */
'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { db, getPrivate, setPrivate } = require('./db');
const auth = require('./auth');
const { HttpError, str, rateLimit } = require('./util');

const COOKIE = 'mm_site';
const SESSION_DAYS = 180;

db.exec(`CREATE TABLE IF NOT EXISTS site_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
)`);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function getAccess() {
  try {
    return { enabled: false, hash: '', ...JSON.parse(getPrivate('site_access') || '{}') };
  } catch {
    return { enabled: false, hash: '' };
  }
}
const setAccess = (a) => setPrivate('site_access', JSON.stringify({ enabled: !!a.enabled, hash: a.hash || '' }));

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      try { return decodeURIComponent(v.join('=')); } catch { return null; }
    }
  }
  return null;
}

function hasValidSession(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return false;
  const row = db.prepare('SELECT expires_at FROM site_sessions WHERE token_hash = ?').get(sha256(token));
  return !!row && row.expires_at > Date.now();
}

/** Ouvre une session invité (cookie valable sur tout le site). */
function createSiteSession(req, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('DELETE FROM site_sessions WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO site_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), now, now + SESSION_DAYS * 86400_000);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax', // le lien reçu par message ou par e-mail doit fonctionner
    secure: req.secure,
    path: '/',
    maxAge: SESSION_DAYS * 86400_000,
  });
}

/** Le visiteur peut-il voir le site ? */
function canView(req) {
  return !getAccess().enabled || hasValidSession(req);
}

/** Routes de l'API toujours accessibles (page de connexion, apparence, santé, statistiques).
 *  Statistiques : le script Umami envoie ses mesures sans cookie (credentials « omit » par défaut) ;
 *  sans cette exception, chaque visite était refusée (401) quand le site est réservé aux invités. */
const OPEN = [/^\/access\//, /^\/health$/, /^\/favicon$/, /^\/apparence$/, /^\/fonts\.css$/,
  /^\/stats\/(config|script\.js|api\/send)$/,
  /^\/export\/(invites|chambres)\.csv$/]; // Google Sheets : protégé par sa propre clé secrète

/** Middleware : refuse les routes publiques de l'API sans session quand l'accès est restreint. */
function guard(req, res, next) {
  if (OPEN.some((re) => re.test(req.path)) || canView(req)) return next();
  res.status(401).json({ error: 'Ce site est réservé aux invités : merci de saisir le mot de passe.', access: 'required' });
}

/* =========================================================
   Routes publiques : /api/access/…
   ========================================================= */
const publicRouter = express.Router();

/** Interrogée par Nginx avant chaque page (auth_request) : 204 = autorisé, 401 = page de connexion. */
publicRouter.get('/access/check', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(canView(req) ? 204 : 401).end();
});

publicRouter.get('/access/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const a = getAccess();
  res.json({ enabled: a.enabled, granted: !a.enabled || hasValidSession(req) });
});

publicRouter.post('/access/login', rateLimit('site-login', 15, 15 * 60_000), (req, res) => {
  const a = getAccess();
  if (!a.enabled) return res.json({ ok: true });
  if (!auth.verifyPassword(str(req.body?.password, 200), a.hash)) {
    throw new HttpError(401, 'Mot de passe incorrect. Il figure sur votre faire-part.');
  }
  createSiteSession(req, res);
  res.json({ ok: true });
});

publicRouter.post('/access/logout', (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM site_sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

/* =========================================================
   Administration : /api/admin/access
   ========================================================= */
const adminRouter = express.Router();

adminRouter.get('/access', (req, res) => {
  const a = getAccess();
  res.json({ enabled: a.enabled, has_password: !!a.hash });
});

adminRouter.put('/access', (req, res) => {
  const a = getAccess();
  const password = String(req.body?.password || '');
  if (password) {
    if (password.length < 4 || password.length > 100) throw new HttpError(400, 'Le mot de passe des invités doit faire entre 4 et 100 caractères.');
    a.hash = auth.hashPassword(password);
    db.prepare('DELETE FROM site_sessions').run(); // les invités devront saisir le nouveau mot de passe
  }
  a.enabled = !!req.body?.enabled;
  if (a.enabled && !a.hash) throw new HttpError(400, 'Choisissez d’abord le mot de passe des invités.');
  setAccess(a);
  if (a.enabled) createSiteSession(req, res); // les mariés gardent l'accès au site
  res.json({ ok: true, enabled: a.enabled, has_password: !!a.hash });
});

/** Déconnecte tous les invités (ils devront ressaisir le mot de passe). */
adminRouter.post('/access/logout-all', (req, res) => {
  db.prepare('DELETE FROM site_sessions').run();
  createSiteSession(req, res);
  res.json({ ok: true });
});

module.exports = { publicRouter, adminRouter, guard, createSiteSession, hasValidSession };
