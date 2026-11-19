/**
 * Accès à la base SQLite (better-sqlite3, synchrone et très fiable pour ce volume).
 * Crée le schéma au démarrage et insère des données d'exemple si la base est vide.
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { defaultContent, defaultPlaces, defaultGites } = require('./seed');
const { defaultRooms } = require('./rooms-seed');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
// Photos des chambres (dans le même volume que la base : une seule chose à sauvegarder)
const MEDIA_DIR = path.join(DATA_DIR, 'media', 'rooms');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

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

-- Chambres du lieu de réception (« Dormir sur place »)
CREATE TABLE IF NOT EXISTS rooms (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,            -- identifiant stable (ch1…ch21)
  name         TEXT NOT NULL,
  short_name   TEXT NOT NULL,                   -- libellé affiché sur le plan
  floor        TEXT NOT NULL,                   -- rdc | etage
  area         TEXT NOT NULL DEFAULT '',
  capacity     INTEGER NOT NULL DEFAULT 2,      -- couchages (bébé compris)
  beds         TEXT NOT NULL DEFAULT '',
  bath         TEXT NOT NULL DEFAULT '',
  private_bath INTEGER NOT NULL DEFAULT 0,
  baby_bed     INTEGER NOT NULL DEFAULT 0,
  description  TEXT NOT NULL DEFAULT '',
  price_both   REAL,                            -- prix de la chambre pour vendredi + samedi
  price_sat    REAL,                            -- prix de la chambre pour le samedi seul
  bookable     INTEGER NOT NULL DEFAULT 1,      -- 0 = non proposée (ex. réservée aux mariés)
  x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, w REAL NOT NULL DEFAULT 100, h REAL NOT NULL DEFAULT 100,
  bed_icon     TEXT NOT NULL DEFAULT 'double',
  sort         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS room_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_room_photos_room ON room_photos(room_id);

CREATE TABLE IF NOT EXISTS room_bookings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  email      TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  persons    INTEGER NOT NULL DEFAULT 1,
  nights     TEXT NOT NULL DEFAULT 'both',    -- both = vendredi + samedi | sat = samedi seul
  message    TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',        -- notes internes (paiement…)
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_room_bookings_room ON room_bookings(room_id);

-- Tableaux d'honneur des mini-jeux (/jeux/)
CREATE TABLE IF NOT EXISTS game_scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game       TEXT NOT NULL,                   -- retard | cavale
  name       TEXT NOT NULL,
  score      INTEGER NOT NULL,
  won        INTEGER NOT NULL DEFAULT 0,      -- « Antoine est en retard » : arrivé à l'heure
  level      INTEGER NOT NULL DEFAULT 0,      -- « Antoine en cavale » : niveau atteint
  t          INTEGER NOT NULL,                -- horodatage (ms) utilisé par les jeux
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_scores ON game_scores(game, score DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`);

/* ---------- Migrations des bases créées par une version précédente ---------- */
const guestCols = db.prepare('PRAGMA table_info(guests)').all().map((c) => c.name);
if (!guestCols.includes('veggie')) {
  db.exec('ALTER TABLE guests ADD COLUMN veggie INTEGER NOT NULL DEFAULT 0'); // nombre de menus végétariens
}

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
  if (db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n === 0) {
    const ins = db.prepare(`INSERT INTO rooms (code, name, short_name, floor, area, capacity, beds, bath, private_bath, baby_bed,
                              description, x, y, w, h, bed_icon, sort)
                            VALUES (@code, @name, @short_name, @floor, @area, @capacity, @beds, @bath, @private_bath, @baby_bed,
                              @description, @x, @y, @w, @h, @bed_icon, @sort)`);
    db.transaction(() => defaultRooms().forEach((r) => ins.run(r)))();
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

/**
 * Chambres avec leurs photos et la réservation active éventuelle.
 * Les deux formules (ven.+sam. / sam. seul) incluent la nuit du samedi :
 * une chambre ne peut donc avoir qu'une seule réservation non annulée.
 */
function roomsWithStatus() {
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY sort, id').all();
  const photos = db.prepare('SELECT id, room_id, filename FROM room_photos ORDER BY sort, id').all();
  const active = db.prepare("SELECT * FROM room_bookings WHERE status != 'cancelled' ORDER BY id").all();
  return rooms.map((r) => ({
    ...r,
    private_bath: !!r.private_bath,
    baby_bed: !!r.baby_bed,
    bookable: !!r.bookable,
    photos: photos.filter((p) => p.room_id === r.id).map((p) => ({ id: p.id, url: `/api/media/rooms/${p.filename}` })),
    booking: active.find((b) => b.room_id === r.id) || null,
  }));
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

module.exports = { db, DATA_DIR, MEDIA_DIR, getContent, setContent, getPrivate, setPrivate, gitesWithAvailability, roomsWithStatus };
