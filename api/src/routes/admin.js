/**
 * Routes d'administration (toutes protégées par session, sauf /login).
 */
'use strict';

const express = require('express');
const { db, getContent, setContent, getPrivate, setPrivate, gitesWithAvailability } = require('../db');
const roomRoutes = require('./rooms');
const siteRoutes = require('./site');
const auth = require('../auth');
const { HttpError, str, int, num, oneOf, email, url, nameKey, rateLimit, toCsv, isValidTimezone } = require('../util');

const router = express.Router();

/* ---------- Authentification ---------- */
router.post('/login', rateLimit('login', 10, 15 * 60_000), (req, res) => {
  const stored = getPrivate('admin_password_hash');
  if (!stored) throw new HttpError(503, "Aucun mot de passe administrateur n'est configuré (voir le README).");
  if (!auth.verifyPassword(str(req.body?.password, 200), stored)) throw new HttpError(401, 'Mot de passe incorrect.');
  auth.createSession(res, req);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

router.use(auth.requireAdmin);

router.get('/me', (req, res) => res.json({ ok: true }));

/* ---------- Tableau de bord ---------- */
router.get('/stats', (req, res) => {
  const g = db.prepare(`
    SELECT
      COUNT(*)                                                   AS households,
      SUM(status = 'yes')                                        AS yes,
      SUM(status = 'no')                                         AS no,
      SUM(status = 'pending')                                    AS pending,
      COALESCE(SUM(CASE WHEN status = 'yes' THEN adults END), 0)   AS adults,
      COALESCE(SUM(CASE WHEN status = 'yes' THEN children END), 0) AS children,
      COALESCE(SUM(CASE WHEN status = 'yes' THEN veggie END), 0)   AS veggie
    FROM guests`).get();
  const diets = db.prepare(`SELECT id, name, diet FROM guests WHERE status = 'yes' AND diet != '' ORDER BY name`).all();
  const messages = db.prepare(`SELECT id, name, message, responded_at FROM guests
                               WHERE message != '' ORDER BY responded_at DESC LIMIT 5`).all();
  const gites = gitesWithAvailability().filter((x) => x.bookable);
  const rooms = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(EXISTS (SELECT 1 FROM room_bookings b WHERE b.room_id = r.id AND b.status != 'cancelled')) AS taken,
           SUM(r.capacity) AS beds
    FROM rooms r WHERE r.bookable = 1`).get();
  const roomBookings = db.prepare(`
    SELECT COALESCE(SUM(b.persons), 0) AS persons,
           COALESCE(SUM(b.status = 'pending'), 0) AS pending,
           COALESCE(SUM(CASE WHEN b.nights = 'sat' THEN r.price_sat ELSE r.price_both END), 0) AS amount
    FROM room_bookings b JOIN rooms r ON r.id = b.room_id WHERE b.status != 'cancelled'`).get();
  res.json({
    onsite: {
      rooms: rooms.total || 0, taken: rooms.taken || 0, beds: rooms.beds || 0,
      persons: roomBookings.persons, pending: roomBookings.pending, amount: roomBookings.amount,
    },
    guests: { households: g.households || 0, yes: g.yes || 0, no: g.no || 0, pending: g.pending || 0, adults: g.adults, children: g.children, veggie: g.veggie },
    diets,
    messages,
    lodging: {
      capacity: gites.reduce((s, x) => s + x.capacity, 0),
      reserved: gites.reduce((s, x) => s + x.reserved, 0),
      pending: gites.reduce((s, x) => s + x.pending_count, 0),
    },
  });
});

/* ---------- Invités ---------- */
function guestFrom(b) {
  const name = str(b.name, 150);
  if (name.length < 2) throw new HttpError(400, 'Le nom est obligatoire.');
  const status = oneOf(b.status, ['pending', 'yes', 'no'], 'pending');
  const d = {
    name, name_key: nameKey(name), email: email(b.email), phone: str(b.phone, 40), status,
    adults: int(b.adults ?? 1, 0, 50, 'Adultes'), children: int(b.children ?? 0, 0, 50, 'Enfants'),
    veggie: int(b.veggie ?? 0, 0, 100, 'Menus végétariens'),
    diet: str(b.diet, 500), message: str(b.message, 2000), notes: str(b.notes, 2000),
  };
  if (d.veggie > d.adults + d.children) throw new HttpError(400, 'Plus de menus végétariens que de personnes.');
  return d;
}

router.get('/guests', (req, res) => {
  res.json(db.prepare('SELECT * FROM guests ORDER BY name COLLATE NOCASE').all());
});

router.post('/guests', (req, res) => {
  const d = guestFrom(req.body || {});
  const info = db.prepare(`INSERT INTO guests (name, name_key, email, phone, status, adults, children, veggie, diet, message, notes, source, responded_at)
    VALUES (@name, @name_key, @email, @phone, @status, @adults, @children, @veggie, @diet, @message, @notes, 'admin',
            CASE WHEN @status = 'pending' THEN NULL ELSE datetime('now') END)`).run(d);
  res.json({ id: info.lastInsertRowid });
});

/** Ajout en lot : un foyer par ligne (ex. coller une liste depuis un tableur). */
router.post('/guests/bulk', (req, res) => {
  const lines = str(req.body?.text, 50000).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const ins = db.prepare(`INSERT INTO guests (name, name_key, adults, source) VALUES (?, ?, ?, 'admin')`);
  const exists = db.prepare('SELECT 1 FROM guests WHERE name_key = ?');
  let added = 0, skipped = 0;
  db.transaction(() => {
    for (const line of lines.slice(0, 1000)) {
      // Format accepté : "Nom" ou "Nom;2" (nombre d'adultes attendus)
      const [rawName, rawAdults] = line.split(/[;\t]/);
      const name = str(rawName, 150);
      if (name.length < 2 || exists.get(nameKey(name))) { skipped++; continue; }
      const adults = Number.parseInt(rawAdults, 10);
      ins.run(name, nameKey(name), Number.isFinite(adults) && adults >= 0 && adults <= 50 ? adults : 1);
      added++;
    }
  })();
  res.json({ added, skipped });
});

router.put('/guests/:id', (req, res) => {
  const d = guestFrom(req.body || {});
  const info = db.prepare(`UPDATE guests SET name=@name, name_key=@name_key, email=@email, phone=@phone, status=@status,
      adults=@adults, children=@children, veggie=@veggie, diet=@diet, message=@message, notes=@notes, updated_at=datetime('now'),
      responded_at = CASE WHEN @status = 'pending' THEN NULL ELSE COALESCE(responded_at, datetime('now')) END
      WHERE id=@id`).run({ ...d, id: int(req.params.id, 1, 1e9) });
  if (!info.changes) throw new HttpError(404, 'Invité introuvable.');
  res.json({ ok: true });
});

router.delete('/guests/:id', (req, res) => {
  db.prepare('DELETE FROM guests WHERE id = ?').run(int(req.params.id, 1, 1e9));
  res.json({ ok: true });
});

const STATUS_LABEL = { yes: 'Présent', no: 'Absent', pending: 'Sans réponse' };
router.get('/guests.csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM guests ORDER BY name COLLATE NOCASE').all();
  const csv = toCsv(rows, [
    { label: 'Nom', key: 'name' }, { label: 'Réponse', value: (r) => STATUS_LABEL[r.status] },
    { label: 'Adultes', key: 'adults' }, { label: 'Enfants', key: 'children' },
    { label: 'E-mail', key: 'email' }, { label: 'Téléphone', key: 'phone' },
    { label: 'Menus végétariens', key: 'veggie' }, { label: 'Allergies / intolérances', key: 'diet' }, { label: 'Message', key: 'message' },
    { label: 'Notes internes', key: 'notes' }, { label: 'Date de réponse', key: 'responded_at' },
  ]);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="invites.csv"');
  res.send(csv);
});

/* ---------- Lieux ---------- */
function placeFrom(b) {
  const name = str(b.name, 150);
  if (!name) throw new HttpError(400, 'Le nom du lieu est obligatoire.');
  return {
    kind: oneOf(b.kind, ['mairie', 'eglise', 'photos', 'salle', 'autre'], 'autre'), name, address: str(b.address, 300),
    lat: num(b.lat, -90, 90), lng: num(b.lng, -180, 180), time: str(b.time, 50), description: str(b.description, 1000),
    sort: Number.isFinite(+b.sort) ? +b.sort : 0,
  };
}

router.get('/places', (req, res) => res.json(db.prepare('SELECT * FROM places ORDER BY sort, id').all()));
router.post('/places', (req, res) => {
  const info = db.prepare(`INSERT INTO places (kind, name, address, lat, lng, time, description, sort)
    VALUES (@kind, @name, @address, @lat, @lng, @time, @description, @sort)`).run(placeFrom(req.body || {}));
  res.json({ id: info.lastInsertRowid });
});
router.put('/places/:id', (req, res) => {
  db.prepare(`UPDATE places SET kind=@kind, name=@name, address=@address, lat=@lat, lng=@lng, time=@time,
              description=@description, sort=@sort WHERE id=@id`).run({ ...placeFrom(req.body || {}), id: int(req.params.id, 1, 1e9) });
  res.json({ ok: true });
});
router.delete('/places/:id', (req, res) => {
  db.prepare('DELETE FROM places WHERE id = ?').run(int(req.params.id, 1, 1e9));
  res.json({ ok: true });
});

/* ---------- Gîtes ---------- */
function giteFrom(b) {
  const name = str(b.name, 150);
  if (!name) throw new HttpError(400, "Le nom de l'hébergement est obligatoire.");
  return {
    name, address: str(b.address, 300), lat: num(b.lat, -90, 90), lng: num(b.lng, -180, 180),
    capacity: int(b.capacity ?? 0, 0, 1000, 'Capacité'), price: str(b.price, 100), contact: str(b.contact, 200),
    url: url(b.url), description: str(b.description, 1000), bookable: b.bookable ? 1 : 0,
    sort: Number.isFinite(+b.sort) ? +b.sort : 0,
  };
}

router.get('/gites', (req, res) => res.json(gitesWithAvailability()));
router.post('/gites', (req, res) => {
  const info = db.prepare(`INSERT INTO gites (name, address, lat, lng, capacity, price, contact, url, description, bookable, sort)
    VALUES (@name, @address, @lat, @lng, @capacity, @price, @contact, @url, @description, @bookable, @sort)`).run(giteFrom(req.body || {}));
  res.json({ id: info.lastInsertRowid });
});
router.put('/gites/:id', (req, res) => {
  db.prepare(`UPDATE gites SET name=@name, address=@address, lat=@lat, lng=@lng, capacity=@capacity, price=@price,
              contact=@contact, url=@url, description=@description, bookable=@bookable, sort=@sort WHERE id=@id`)
    .run({ ...giteFrom(req.body || {}), id: int(req.params.id, 1, 1e9) });
  res.json({ ok: true });
});
router.delete('/gites/:id', (req, res) => {
  db.prepare('DELETE FROM gites WHERE id = ?').run(int(req.params.id, 1, 1e9));
  res.json({ ok: true });
});

/* ---------- Réservations ---------- */
router.get('/bookings', (req, res) => {
  res.json(db.prepare(`SELECT b.*, g.name AS gite_name FROM bookings b JOIN gites g ON g.id = b.gite_id
                       ORDER BY b.created_at DESC`).all());
});

/** Vérifie qu'une réservation (nouvelle ou modifiée) tient dans la capacité du gîte. */
function checkCapacity(giteId, persons, status, excludeId) {
  if (status === 'cancelled') return;
  const g = db.prepare('SELECT name, capacity FROM gites WHERE id = ?').get(giteId);
  if (!g) throw new HttpError(404, 'Hébergement introuvable.');
  const used = db.prepare(`SELECT COALESCE(SUM(persons), 0) AS n FROM bookings
                           WHERE gite_id = ? AND status != 'cancelled' AND id != ?`).get(giteId, excludeId || 0).n;
  if (used + persons > g.capacity) {
    throw new HttpError(409, `Capacité dépassée pour « ${g.name} » : ${g.capacity - used} place(s) disponible(s). Augmentez la capacité du gîte si besoin.`);
  }
}

function bookingFrom(b) {
  const name = str(b.name, 150);
  if (name.length < 2) throw new HttpError(400, 'Le nom est obligatoire.');
  return {
    gite_id: int(b.gite_id, 1, 1e9, 'Hébergement'), name, email: email(b.email), phone: str(b.phone, 40),
    persons: int(b.persons ?? 1, 1, 100, 'Personnes'), nights: str(b.nights, 300), message: str(b.message, 2000),
    status: oneOf(b.status, ['pending', 'confirmed', 'cancelled'], 'pending'),
  };
}

router.post('/bookings', (req, res) => {
  const d = bookingFrom(req.body || {});
  const info = db.transaction(() => {
    checkCapacity(d.gite_id, d.persons, d.status);
    return db.prepare(`INSERT INTO bookings (gite_id, name, email, phone, persons, nights, message, status)
                       VALUES (@gite_id, @name, @email, @phone, @persons, @nights, @message, @status)`).run(d);
  })();
  res.json({ id: info.lastInsertRowid });
});

router.put('/bookings/:id', (req, res) => {
  const id = int(req.params.id, 1, 1e9);
  const current = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!current) throw new HttpError(404, 'Réservation introuvable.');
  const d = bookingFrom({ ...current, ...(req.body || {}) }); // permet de ne changer que le statut
  db.transaction(() => {
    checkCapacity(d.gite_id, d.persons, d.status, id);
    db.prepare(`UPDATE bookings SET gite_id=@gite_id, name=@name, email=@email, phone=@phone, persons=@persons,
                nights=@nights, message=@message, status=@status, updated_at=datetime('now') WHERE id=@id`).run({ ...d, id });
  })();
  res.json({ ok: true });
});

router.delete('/bookings/:id', (req, res) => {
  db.prepare('DELETE FROM bookings WHERE id = ?').run(int(req.params.id, 1, 1e9));
  res.json({ ok: true });
});

const BOOKING_LABEL = { pending: 'En attente', confirmed: 'Confirmée', cancelled: 'Annulée' };
router.get('/bookings.csv', (req, res) => {
  const rows = db.prepare(`SELECT b.*, g.name AS gite_name FROM bookings b JOIN gites g ON g.id = b.gite_id
                           ORDER BY g.sort, g.name, b.created_at`).all();
  const csv = toCsv(rows, [
    { label: 'Hébergement', key: 'gite_name' }, { label: 'Nom', key: 'name' }, { label: 'Personnes', key: 'persons' },
    { label: 'Nuits', key: 'nights' }, { label: 'Statut', value: (r) => BOOKING_LABEL[r.status] },
    { label: 'E-mail', key: 'email' }, { label: 'Téléphone', key: 'phone' }, { label: 'Message', key: 'message' },
    { label: 'Date de demande', key: 'created_at' },
  ]);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="reservations.csv"');
  res.send(csv);
});

/* ---------- Contenu du site ---------- */
router.get('/content', (req, res) => res.json(getContent()));

router.put('/content', (req, res) => {
  const b = req.body || {};
  const cur = getContent();
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);
  const tz = str(b.timezone, 60) || cur.timezone;
  if (!isValidTimezone(tz)) throw new HttpError(400, 'Fuseau horaire invalide.');
  const date = str(b.date, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date)) throw new HttpError(400, 'Date et heure du mariage invalides.');
  const deadline = str(b.rsvp_deadline, 10);
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new HttpError(400, 'Date limite de réponse invalide.');

  const next = {
    couple: str(b.couple, 120) || cur.couple,
    date, timezone: tz,
    duration_hours: int(b.duration_hours ?? 12, 1, 72, 'Durée'),
    rsvp_deadline: deadline,
    welcome: str(b.welcome, 3000),
    contact_email: email(b.contact_email),
    contact_phone: str(b.contact_phone, 40),
    nights: (Array.isArray(b.nights) ? b.nights : []).map((n) => str(n, 60)).filter(Boolean).slice(0, 10),
    theme: {
      title: str(b.theme?.title, 120),
      description: str(b.theme?.description, 3000),
      dress_code: str(b.theme?.dress_code, 1500),
      colors: (Array.isArray(b.theme?.colors) ? b.theme.colors : []).map(hex).filter(Boolean).slice(0, 8),
    },
    menu_intro: str(b.menu_intro, 1000),
    menu: (Array.isArray(b.menu) ? b.menu : []).slice(0, 20).map((s) => ({
      title: str(s?.title, 100),
      items: (Array.isArray(s?.items) ? s.items : []).map((i) => str(i, 300)).filter(Boolean).slice(0, 30),
    })).filter((s) => s.title || s.items.length),
    menu_note: str(b.menu_note, 500),
    options: { rsvp_open: !!b.options?.rsvp_open, rsvp_guest_list_only: !!b.options?.rsvp_guest_list_only },
    logo: {
      mode: oneOf(b.logo?.mode, ['ornament', 'image', 'html'], 'ornament'),
      image: cur.logo.image, // l'image se change via /admin/logo
      height: int(b.logo?.height ?? cur.logo.height, 30, 400, 'Hauteur du logo'),
      html: typeof b.logo?.html === 'string' ? b.logo.html.slice(0, 20000) : cur.logo.html,
    },
    onsite: {
      open: !!b.onsite?.open,
      venue: str(b.onsite?.venue, 120),
      intro: str(b.onsite?.intro, 3000),
      note: str(b.onsite?.note, 1500),
    },
  };
  setContent(next);
  res.json({ ok: true });
});

/* ---------- Sécurité ---------- */
router.get('/security', (req, res) => res.json({ invite_code: getPrivate('invite_code') || '' }));

router.put('/security/invite-code', (req, res) => {
  setPrivate('invite_code', str(req.body?.invite_code, 100));
  res.json({ ok: true });
});

router.put('/security/password', rateLimit('pwd', 10, 15 * 60_000), (req, res) => {
  const current = str(req.body?.current, 200);
  const next = String(req.body?.next || '');
  if (!auth.verifyPassword(current, getPrivate('admin_password_hash'))) throw new HttpError(401, 'Mot de passe actuel incorrect.');
  if (next.length < 10) throw new HttpError(400, 'Le nouveau mot de passe doit faire au moins 10 caractères.');
  setPrivate('admin_password_hash', auth.hashPassword(next));
  auth.destroyAllSessions();
  auth.createSession(res, req); // on garde la session courante
  res.json({ ok: true });
});

/* ---------- Chambres sur place (voir routes/rooms.js) ---------- */
router.use(roomRoutes.adminRouter);
router.use(siteRoutes.adminRouter);

module.exports = router;
