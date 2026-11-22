/**
 * Stationnement autour des lieux de cérémonie (mairie, église) :
 * - publicRouter : GET /parking (page « Se garer »)
 * - adminRouter  : parkings (CRUD) et texte d'introduction
 */
'use strict';

const express = require('express');
const { db, getContent, setContent } = require('../db');
const { HttpError, str, int, num, oneOf } = require('../util');

db.exec(`
CREATE TABLE IF NOT EXISTS parkings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL DEFAULT 'parking',  -- parking | pmr (place(s) PMR isolée(s))
  name        TEXT NOT NULL,
  address     TEXT NOT NULL DEFAULT '',
  lat         REAL,
  lng         REAL,
  spots       INTEGER,                          -- nombre de places (facultatif)
  pmr_spots   INTEGER NOT NULL DEFAULT 0,       -- dont places PMR
  fee         TEXT NOT NULL DEFAULT '',         -- free | paid | '' (non précisé)
  description TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0
);
`);
// Lien « Stationnement » sous l'itinéraire d'un lieu du programme (activé par défaut pour la mairie)
const placeCols = db.prepare('PRAGMA table_info(places)').all().map((c) => c.name);
if (!placeCols.includes('parking_link')) {
  db.exec('ALTER TABLE places ADD COLUMN parking_link INTEGER NOT NULL DEFAULT 0');
  db.exec("UPDATE places SET parking_link = 1 WHERE kind = 'mairie'");
}

const DEFAULT_INTRO = 'Voici les parkings autour de la mairie et de l’église. Les places réservées aux personnes à mobilité réduite (PMR) sont signalées par ♿.';
const intro = () => { const p = getContent().parking; return typeof p?.intro === 'string' ? p.intro : DEFAULT_INTRO; };

function parkingFrom(b) {
  const name = str(b.name, 150);
  if (!name) throw new HttpError(400, 'Le nom du stationnement est obligatoire.');
  const kind = oneOf(b.kind, ['parking', 'pmr'], 'parking');
  const spots = b.spots === '' || b.spots === null || b.spots === undefined ? null : int(b.spots, 0, 100000, 'Nombre de places');
  const pmr = b.pmr_spots === '' || b.pmr_spots === null || b.pmr_spots === undefined ? 0 : int(b.pmr_spots, 0, 10000, 'Places PMR');
  return {
    kind, name, address: str(b.address, 300), lat: num(b.lat, -90, 90), lng: num(b.lng, -180, 180),
    spots, pmr_spots: kind === 'pmr' ? Math.max(1, pmr) : pmr,
    fee: oneOf(b.fee, ['free', 'paid', ''], ''), description: str(b.description, 1000),
    sort: Number.isFinite(+b.sort) ? +b.sort : 0,
  };
}

const list = () => db.prepare('SELECT * FROM parkings ORDER BY sort, id').all();

/* ---------- Public ---------- */
const publicRouter = express.Router();
publicRouter.get('/parking', (req, res) => {
  const places = db.prepare(`SELECT id, kind, name, address, lat, lng, time FROM places
                             WHERE kind IN ('mairie', 'eglise') OR parking_link = 1 ORDER BY sort, id`).all();
  res.json({ intro: intro(), places, parkings: list(), couple: getContent().couple });
});

/* ---------- Administration ---------- */
const adminRouter = express.Router();
adminRouter.get('/parkings', (req, res) => res.json({ intro: intro(), parkings: list() }));
adminRouter.post('/parkings', (req, res) => {
  const info = db.prepare(`INSERT INTO parkings (kind, name, address, lat, lng, spots, pmr_spots, fee, description, sort)
    VALUES (@kind, @name, @address, @lat, @lng, @spots, @pmr_spots, @fee, @description, @sort)`).run(parkingFrom(req.body || {}));
  res.json({ id: info.lastInsertRowid });
});
adminRouter.put('/parkings/:id', (req, res) => {
  db.prepare(`UPDATE parkings SET kind=@kind, name=@name, address=@address, lat=@lat, lng=@lng, spots=@spots, pmr_spots=@pmr_spots,
              fee=@fee, description=@description, sort=@sort WHERE id=@id`).run({ ...parkingFrom(req.body || {}), id: int(req.params.id, 1, 1e9) });
  res.json({ ok: true });
});
adminRouter.delete('/parkings/:id', (req, res) => {
  db.prepare('DELETE FROM parkings WHERE id = ?').run(int(req.params.id, 1, 1e9));
  res.json({ ok: true });
});
adminRouter.put('/parking-settings', (req, res) => {
  const c = getContent();
  c.parking = { ...(c.parking || {}), intro: str(req.body?.intro, 2000) };
  setContent(c);
  res.json({ ok: true, intro: intro() });
});

module.exports = { publicRouter, adminRouter };
