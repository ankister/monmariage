/**
 * Google Sheets (lecture seule) : deux tableaux CSV protégés par une clé secrète,
 * à importer avec =IMPORTDATA("…") — invités et réservations des chambres.
 * - publicRouter : GET /export/invites.csv?cle=… et /export/chambres.csv?cle=…
 * - adminRouter  : activation et changement de clé
 * Le site reste la référence : rien de ce qui est modifié dans le tableur ne revient sur le site.
 */
'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { db, getContent, getPrivate, setPrivate, bookingAmount } = require('../db');
const { HttpError, rateLimit, toCsv } = require('../util');

function getCfg() {
  try { return { enabled: false, token: '', ...JSON.parse(getPrivate('sheets_export') || '{}') }; } catch { return { enabled: false, token: '' }; }
}
const setCfg = (c) => setPrivate('sheets_export', JSON.stringify(c));
const newToken = () => crypto.randomBytes(24).toString('base64url');

function tokenOk(given, expected) {
  const a = Buffer.from(String(given || '')), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Date SQLite (UTC) → « AAAA-MM-JJ HH:MM » à l'heure du mariage (lue comme une date par Google Sheets). */
function localTime(s, tz) {
  if (!s) return '';
  const d = new Date(`${String(s).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return s;
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: tz || 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .format(d);
  } catch { return s; }
}

const GUEST_STATUS = { yes: 'Présent', no: 'Absent', pending: 'Sans réponse' };
const BOOKING_STATUS = { waitlist: 'Liste d’attente', pending: 'En attente', payment: 'Règlement en cours', confirmed: 'Confirmée', cancelled: 'Annulée' };
const CSV_OPTS = { sep: ',', bom: false, sheets: true };

function guestsCsv() {
  const tz = getContent().timezone;
  const rows = db.prepare('SELECT * FROM guests ORDER BY name COLLATE NOCASE').all();
  return toCsv(rows, [
    { label: 'Nom', key: 'name' }, { label: 'Réponse', value: (r) => GUEST_STATUS[r.status] || r.status },
    { label: 'Adultes', key: 'adults' }, { label: 'Enfants', key: 'children' },
    { label: 'E-mail', key: 'email' }, { label: 'Téléphone', key: 'phone' },
    { label: 'Menus végétariens', key: 'veggie' }, { label: 'Allergies / intolérances', key: 'diet' },
    { label: 'Prioritaire chambres', value: (r) => (r.room_priority ? 'oui' : '') },
    { label: 'Message', key: 'message' }, { label: 'Notes internes', key: 'notes' },
    { label: 'Date de réponse', value: (r) => localTime(r.responded_at, tz) },
  ], CSV_OPTS);
}

function bookingsCsv() {
  const tz = getContent().timezone;
  const rows = db.prepare(`SELECT b.*, r.name AS room_name, r.floor, r.price_both, r.price_sat, r.price_mode FROM room_bookings b
                           JOIN rooms r ON r.id = b.room_id ORDER BY r.sort, b.created_at, b.id`).all();
  return toCsv(rows, [
    { label: 'Chambre', key: 'room_name' }, { label: 'Étage', value: (r) => (r.floor === 'rdc' ? 'RDC' : 'Étage') },
    { label: 'Prénom', key: 'first_name' }, { label: 'Nom', key: 'last_name' },
    { label: 'Statut', value: (r) => BOOKING_STATUS[r.status] || r.status },
    { label: 'Prioritaire', value: (r) => (r.priority ? 'oui' : '') },
    { label: 'Personnes / lits', key: 'persons' }, { label: 'Type', value: (r) => (r.price_mode === 'bed' ? 'Lits en dortoir' : 'Chambre entière') },
    { label: 'Montant (€)', value: (r) => bookingAmount(r) ?? '' },
    { label: 'E-mail', key: 'email' }, { label: 'Téléphone', key: 'phone' }, { label: 'Message', key: 'message' },
    { label: 'Notes internes', key: 'notes' },
    { label: 'Date de demande', value: (r) => localTime(r.created_at, tz) },
    { label: 'Mail de règlement envoyé', value: (r) => localTime(r.mail_sent_at, tz) },
  ], CSV_OPTS);
}

/* ---------- Public (avec la clé) ---------- */
const publicRouter = express.Router();
const FEEDS = { 'invites.csv': guestsCsv, 'chambres.csv': bookingsCsv };
publicRouter.get('/export/:file', rateLimit('sheets', 120, 10 * 60_000), (req, res) => {
  const feed = FEEDS[req.params.file];
  const cfg = getCfg();
  // Même réponse si l'export est coupé ou la clé fausse : rien n'indique ce qui existe
  if (!feed || !cfg.enabled || !cfg.token || !tokenOk(req.query.cle, cfg.token)) throw new HttpError(404, 'Introuvable.');
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  res.type('text/csv; charset=utf-8').send(feed());
});

/* ---------- Administration ---------- */
const adminRouter = express.Router();
adminRouter.get('/sheets', (req, res) => res.json(getCfg()));
adminRouter.put('/sheets', (req, res) => {
  const c = getCfg();
  c.enabled = !!req.body?.enabled;
  if (c.enabled && !c.token) c.token = newToken();
  setCfg(c);
  res.json(c);
});
/** Nouvelle clé : les anciens liens (et les formules qui les utilisent) cessent de fonctionner. */
adminRouter.post('/sheets/new-key', (req, res) => {
  const c = getCfg();
  c.token = newToken();
  setCfg(c);
  res.json(c);
});

module.exports = { publicRouter, adminRouter };
