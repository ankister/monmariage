/**
 * Authentification de l'administration.
 * - Mot de passe haché avec scrypt (module crypto natif de Node, aucune dépendance).
 * - Session : jeton aléatoire dans un cookie HttpOnly ; seul son empreinte SHA-256 est stockée en base.
 */
'use strict';

const crypto = require('node:crypto');
const { db, getPrivate, setPrivate } = require('./db');

const COOKIE = 'mm_admin';
const SESSION_DAYS = 14;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof password !== 'string') return false;
  const [algo, N, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(actual, expected);
}

/**
 * Au premier démarrage, initialise le mot de passe admin depuis l'environnement :
 * ADMIN_PASSWORD_HASH (recommandé) ou, à défaut, ADMIN_PASSWORD (haché immédiatement).
 * Ensuite, c'est la base qui fait foi (le mot de passe se change depuis l'admin).
 */
function initAdminPassword() {
  if (getPrivate('admin_password_hash')) return;
  const fromHash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
  const fromPlain = process.env.ADMIN_PASSWORD || '';
  if (fromHash.startsWith('scrypt$')) {
    setPrivate('admin_password_hash', fromHash);
    console.log('[auth] Mot de passe admin initialisé depuis ADMIN_PASSWORD_HASH.');
  } else if (fromPlain) {
    setPrivate('admin_password_hash', hashPassword(fromPlain));
    console.warn('[auth] Mot de passe admin initialisé depuis ADMIN_PASSWORD. Vous pouvez maintenant retirer cette variable du fichier .env.');
  } else {
    console.warn('[auth] AUCUN mot de passe admin défini : renseignez ADMIN_PASSWORD_HASH dans .env puis redémarrez.');
  }
}

function initInviteCode() {
  if (getPrivate('invite_code') === null) setPrivate('invite_code', (process.env.INVITE_CODE || '').trim());
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(res, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), now, now + SESSION_DAYS * 86400_000);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure, // true derrière NPM en HTTPS (X-Forwarded-Proto)
    path: '/api',
    maxAge: SESSION_DAYS * 86400_000,
  });
}

function readToken(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

function destroySession(req, res) {
  const token = readToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(COOKIE, { path: '/api' });
}

/** Supprime toutes les sessions (après un changement de mot de passe). */
function destroyAllSessions() {
  db.prepare('DELETE FROM sessions').run();
}

/** Le visiteur a-t-il une session d'administration valide ? */
function isAdmin(req) {
  const token = readToken(req);
  if (!token) return false;
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(sha256(token));
  return !!row && row.expires_at > Date.now();
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Session expirée, merci de vous reconnecter.' });
}

module.exports = {
  hashPassword, verifyPassword, initAdminPassword, initInviteCode,
  createSession, destroySession, destroyAllSessions, requireAdmin, isAdmin,
};
