/**
 * Fonctions utilitaires : validation, normalisation, limitation de débit, CSV, fuseaux horaires.
 */
'use strict';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Chaîne nettoyée, tronquée à `max` caractères. */
function str(v, max = 500) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/\u0000/g, '').trim().slice(0, max);
}

/** Entier borné ; lève une erreur 400 si invalide. */
function int(v, min, max, label = 'valeur') {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `${label} invalide (entre ${min} et ${max}).`);
  }
  return n;
}

/** Nombre décimal optionnel (coordonnées). */
function num(v, min, max) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, 'Coordonnée invalide.');
  return n;
}

function oneOf(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback;
}

function email(v) {
  const e = str(v, 200).toLowerCase();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Adresse e-mail invalide.');
  return e;
}

function url(v) {
  const u = str(v, 500);
  if (u && !/^https?:\/\//i.test(u)) throw new HttpError(400, 'Le lien doit commencer par http:// ou https://');
  return u;
}

/** "Élodie  DUPONT" -> "elodie dupont" (pour rapprocher une réponse d'un invité existant). */
function nameKey(v) {
  return str(v, 200)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* ---------- Limitation de débit en mémoire (suffisant pour un seul conteneur) ---------- */
const buckets = new Map();
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      return res.status(429).json({ error: 'Trop de tentatives, merci de réessayer dans quelques minutes.' });
    }
    hits.push(now);
    buckets.set(key, hits);
    next();
  };
}
// Nettoyage périodique
setInterval(() => {
  const now = Date.now();
  for (const [k, hits] of buckets) if (!hits.some((t) => now - t < 3600_000)) buckets.delete(k);
}, 600_000).unref();

/* ---------- CSV (séparateur « ; » et BOM pour Excel en français) ---------- */
function toCsv(rows, columns) {
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // évite l'injection de formules dans Excel
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => cell(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => cell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(';'));
  return '﻿' + [head, ...body].join('\r\n');
}

/* ---------- Fuseaux horaires ---------- */
/** Décalage (ms) du fuseau `tz` à l'instant `date`. */
function tzOffset(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2028-08-19T14:30" en heure locale de `tz` -> Date (instant UTC). */
function zonedToUtc(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || '');
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ts = guess - tzOffset(new Date(guess), tz);
  ts = guess - tzOffset(new Date(ts), tz); // seconde passe pour les changements d'heure
  return new Date(ts);
}

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

module.exports = { HttpError, str, int, num, oneOf, email, url, nameKey, rateLimit, toCsv, zonedToUtc, isValidTimezone };
