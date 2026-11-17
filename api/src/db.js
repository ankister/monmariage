/**
 * Accès à la base SQLite (better-sqlite3, synchrone et très fiable pour ce volume).
 * Crée le schéma au démarrage et insère des données d'exemple si la base est vide.
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { defaultContent, defaultPlaces, defaultGites } = require('./seed');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'mariage.sqlite'));
db.pragma('journal_mode = WAL'); // lectures concurrentes sans blocage
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL              -- JSON
);

-- Valeurs privées (hash du mot de passe, code d'invitation) : jamais exposées publiquement
CREATE TABLE IF NOT EXISTS private_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS places (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL DEFAULT 'autre',   -- mairie | eglise | salle | autre
  name        TEXT NOT NULL,
  address     TEXT NOT NULL DEFAULT '',
  lat         REAL,
  lng         REAL,
  time        TEXT NOT NULL DEFAULT '',        -- ex. "14h30"
  description TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  address     TEXT NOT NULL DEFAULT '',
  lat         REAL,
  lng         REAL,
  capacity    INTEGER NOT NULL DEFAULT 0,      -- nombre de places couchage
  price       TEXT NOT NULL DEFAULT '',        -- texte libre : "35 €/pers./nuit"
  contact     TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  bookable    INTEGER NOT NULL DEFAULT 1,      -- 1 = réservable via le site, 0 = info seulement
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS guests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  name_key     TEXT NOT NULL,                  -- nom normalisé (sans accents/casse) pour rapprocher les réponses
  email        TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | yes | no
  adults       INTEGER NOT NULL DEFAULT 1,
  children     INTEGER NOT NULL DEFAULT 0,
  diet         TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',        -- notes internes (admin)
  source       TEXT NOT NULL DEFAULT 'admin',   -- admin | web
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_guests_name_key ON guests(name_key);

CREATE TABLE IF NOT EXISTS bookings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gite_id    INTEGER NOT NULL REFERENCES gites(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  persons    INTEGER NOT NULL DEFAULT 1,
  nights     TEXT NOT NULL DEFAULT '',        -- nuits souhaitées (texte libre / cases cochées)
  message    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_gite ON bookings(gite_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`);

/* ---------- Données d'exemple au premier démarrage ---------- */
function seedIfEmpty() {
  const hasContent = db.prepare("SELECT 1 FROM settings WHERE key = 'content'").get();
  if (!hasContent) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('content', ?)").run(JSON.stringify(defaultContent()));
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM places').get().n === 0) {
    const ins = db.prepare(`INSERT INTO places (kind, name, address, lat, lng, time, description, sort)
                            VALUES (@kind, @name, @address, @lat, @lng, @time, @description, @sort)`);
    defaultPlaces().forEach((p, i) => ins.run({ ...p, sort: i }));
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM gites').get().n === 0) {
    const ins = db.prepare(`INSERT INTO gites (name, address, lat, lng, capacity, price, contact, url, description, bookable, sort)
                            VALUES (@name, @address, @lat, @lng, @capacity, @price, @contact, @url, @description, @bookable, @sort)`);
    defaultGites().forEach((g, i) => ins.run({ ...g, sort: i }));
  }
}
seedIfEmpty();

/* ---------- Helpers ---------- */
function getContent() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'content'").get();
  // On fusionne avec les valeurs par défaut pour supporter les champs ajoutés dans de futures versions
  const base = defaultContent();
  const saved = row ? JSON.parse(row.value) : {};
  return deepMerge(base, saved);
}

function setContent(content) {
  db.prepare(`INSERT INTO settings (key, value) VALUES ('content', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(content));
}

function getPrivate(key) {
  const row = db.prepare('SELECT value FROM private_config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setPrivate(key, value) {
  db.prepare(`INSERT INTO private_config (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

/** Places restantes par gîte (les réservations annulées ne comptent pas). */
function gitesWithAvailability() {
  return db.prepare(`
    SELECT g.*,
           COALESCE(SUM(CASE WHEN b.status != 'cancelled' THEN b.persons END), 0) AS reserved,
           COALESCE(SUM(CASE WHEN b.status = 'pending' THEN 1 END), 0)            AS pending_count
    FROM gites g
    LEFT JOIN bookings b ON b.gite_id = g.id
    GROUP BY g.id
    ORDER BY g.sort, g.id
  `).all().map((g) => ({ ...g, bookable: !!g.bookable, remaining: Math.max(0, g.capacity - g.reserved) }));
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}

module.exports = { db, getContent, setContent, getPrivate, setPrivate, gitesWithAvailability };
