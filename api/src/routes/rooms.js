/**
 * « Dormir sur place » : chambres du lieu de réception.
 * - publicRouter : liste des chambres, demande de réservation, photos
 * - adminRouter  : réservations, prix et fiches des chambres, envoi de photos
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const { db, MEDIA_DIR, getContent, getPrivate, roomsWithStatus, bookingAmount } = require('../db');
const { HttpError, str, int, oneOf, email, rateLimit, toCsv, imageType } = require('../util');
const { verifyCaptcha } = require('../captcha');
const mailer = require('../mailer');

const NIGHTS = ['both', 'sat'];

/** Libellés des deux formules, calculés à partir de la date du mariage (le samedi). */
function nightLabels(content) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(content.date || '');
  if (!m) return { both: 'Vendredi et samedi', sat: 'Samedi uniquement' };
  const sat = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const fri = new Date(sat.getTime() - 86400_000);
  const fmt = (d, opts) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts }).format(d);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const friStr = fmt(fri, { weekday: 'long', day: 'numeric' }); // « vendredi 18 »
  const satStr = fmt(sat, { weekday: 'long', day: 'numeric', month: 'long' }); // « samedi 19 août »
  return { both: `${cap(friStr)} et ${satStr}`, sat: `${cap(satStr)} uniquement` };
}

/** Prix : nombre ≥ 0 ou null si vide. */
function price(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, 'Prix invalide.');
  return Math.round(n * 100) / 100;
}

/* =========================================================
   Routes publiques
   ========================================================= */
const publicRouter = express.Router();

publicRouter.get('/rooms', (req, res) => {
  const content = getContent();
  res.set('Cache-Control', 'no-store');
  res.json({
    onsite: content.onsite,
    nights: nightLabels(content),
    code_required: !!(getPrivate('invite_code') || '').trim(),
    // Aucune donnée personnelle : seulement « disponible » ou non
    rooms: roomsWithStatus().map((r) => ({
      id: r.id, code: r.code, name: r.name, short_name: r.short_name, floor: r.floor, area: r.area,
      capacity: r.capacity, beds: r.beds, bath: r.bath, private_bath: r.private_bath, baby_bed: r.baby_bed,
      description: r.description, price_both: r.price_both, price_sat: r.price_sat,
      per_bed: r.per_bed, beds_free: r.bookable ? r.beds_free : 0,
      available: r.bookable && !r.full, bookable: r.bookable,
      x: r.x, y: r.y, w: r.w, h: r.h, bed_icon: r.bed_icon, photos: r.photos,
    })),
  });
});

/** Insertion atomique : on revérifie la disponibilité dans la transaction. */
const bookRoomTx = db.transaction((d) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(d.room_id);
  if (!room) throw new HttpError(404, 'Chambre introuvable.');
  if (!room.bookable) throw new HttpError(400, 'Cette chambre n’est pas proposée à la réservation.');
  if (room.price_mode === 'bed') {
    // Dortoir loué au lit : plusieurs réservations tant qu'il reste des lits
    const used = db.prepare("SELECT COALESCE(SUM(persons), 0) AS n FROM room_bookings WHERE room_id = ? AND status != 'cancelled'").get(d.room_id).n;
    const free = Math.max(0, room.capacity - used);
    if (!free) throw new HttpError(409, `Désolé, il n’y a plus de lit libre dans « ${room.name} ». Choisissez une autre chambre.`);
    if (d.persons > free) throw new HttpError(409, `Il ne reste que ${free} lit${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''} dans « ${room.name} ».`);
  } else {
    const taken = db.prepare("SELECT 1 FROM room_bookings WHERE room_id = ? AND status != 'cancelled'").get(d.room_id);
    if (taken) throw new HttpError(409, `Désolé, « ${room.name} » vient d’être réservée. Choisissez une autre chambre.`);
    if (d.persons > room.capacity) throw new HttpError(400, `« ${room.name} » accueille ${room.capacity} personne(s) au maximum.`);
  }
  db.prepare(`INSERT INTO room_bookings (room_id, first_name, last_name, email, phone, persons, nights, message)
              VALUES (@room_id, @first_name, @last_name, @email, @phone, @persons, @nights, @message)`).run(d);
  return room;
});

publicRouter.post('/room-bookings', rateLimit('room', 10, 10 * 60_000), (req, res) => {
  const b = req.body || {};
  if (str(b.website)) throw new HttpError(400, 'Requête refusée.'); // champ piège anti-robots
  const expected = (getPrivate('invite_code') || '').trim();
  if (expected && str(b.code, 100).toLowerCase() !== expected.toLowerCase()) {
    throw new HttpError(403, "Code d'invitation incorrect. Il figure sur votre faire-part.");
  }
  const content = getContent();
  if (!content.onsite.open) throw new HttpError(403, 'Les réservations de chambres sont closes. Contactez-nous directement.');
  verifyCaptcha(b.captcha_token, b.captcha_answer);
  const d = {
    room_id: int(b.room_id, 1, 1e9, 'Chambre'),
    first_name: str(b.first_name, 80),
    last_name: str(b.last_name, 80),
    email: email(b.email),
    phone: str(b.phone, 40),
    persons: int(b.persons, 1, 20, 'Nombre de personnes'),
    nights: NIGHTS.includes(b.nights) ? b.nights : null,
    message: str(b.message, 2000),
  };
  if (!d.first_name || !d.last_name) throw new HttpError(400, 'Merci d’indiquer votre prénom et votre nom.');
  if (!d.email) throw new HttpError(400, 'Merci d’indiquer votre adresse e-mail : les modalités de règlement vous y seront envoyées.');
  if (!d.nights) throw new HttpError(400, 'Merci de choisir vos nuits.');
  const room = bookRoomTx(d);
  const labels = nightLabels(content);
  const what = room.price_mode === 'bed' ? `${d.persons} lit${d.persons > 1 ? 's' : ''} dans « ${room.name} »` : `« ${room.name} »`;
  res.json({
    ok: true,
    message: `Merci ${d.first_name} ! Votre demande pour ${what} (${labels[d.nights].toLowerCase()}) est enregistrée.`,
  });
});

/** Photos : noms de fichiers aléatoires, donc cache long sans risque. */
publicRouter.get('/media/rooms/:file', (req, res) => {
  const file = req.params.file;
  if (!/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(file)) throw new HttpError(404, 'Image introuvable.');
  res.set('Cache-Control', 'public, max-age=2592000, immutable');
  res.sendFile(path.join(MEDIA_DIR, file), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Image introuvable.' });
  });
});

/* =========================================================
   Routes d'administration (montées après requireAdmin)
   ========================================================= */
const adminRouter = express.Router();

adminRouter.get('/rooms', (req, res) => {
  res.json({ rooms: roomsWithStatus(), nights: nightLabels(getContent()) });
});

/** Mise à jour partielle : on peut n'envoyer que les prix. */
adminRouter.put('/rooms/:id', (req, res) => {
  const id = int(req.params.id, 1, 1e9);
  const cur = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
  if (!cur) throw new HttpError(404, 'Chambre introuvable.');
  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const next = {
    id,
    name: has('name') ? str(b.name, 80) || cur.name : cur.name,
    short_name: has('short_name') ? str(b.short_name, 20) || cur.short_name : cur.short_name,
    area: has('area') ? str(b.area, 30) : cur.area,
    capacity: has('capacity') ? int(b.capacity, 1, 20, 'Capacité') : cur.capacity,
    beds: has('beds') ? str(b.beds, 200) : cur.beds,
    bath: has('bath') ? str(b.bath, 200) : cur.bath,
    private_bath: has('private_bath') ? (b.private_bath ? 1 : 0) : cur.private_bath,
    baby_bed: has('baby_bed') ? (b.baby_bed ? 1 : 0) : cur.baby_bed,
    description: has('description') ? str(b.description, 1500) : cur.description,
    price_both: has('price_both') ? price(b.price_both) : cur.price_both,
    price_sat: has('price_sat') ? price(b.price_sat) : cur.price_sat,
    price_mode: has('price_mode') ? oneOf(b.price_mode, ['room', 'bed'], 'room') : cur.price_mode,
    bookable: has('bookable') ? (b.bookable ? 1 : 0) : cur.bookable,
  };
  if (next.price_mode === 'room' && cur.price_mode === 'bed') {
    const n = db.prepare("SELECT COUNT(*) AS n FROM room_bookings WHERE room_id = ? AND status != 'cancelled'").get(id).n;
    if (n > 1) throw new HttpError(409, `« ${cur.name} » a ${n} réservations au lit : n’en gardez qu’une avant de la louer en entier.`);
  }
  db.prepare(`UPDATE rooms SET name=@name, short_name=@short_name, area=@area, capacity=@capacity, beds=@beds, bath=@bath,
              private_bath=@private_bath, baby_bed=@baby_bed, description=@description, price_both=@price_both,
              price_sat=@price_sat, price_mode=@price_mode, bookable=@bookable WHERE id=@id`).run(next);
  res.json({ ok: true });
});

/* ---------- Photos ---------- */
const MAX_PHOTOS = 20;
adminRouter.post(
  '/rooms/:id/photos',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }),
  (req, res) => {
    const id = int(req.params.id, 1, 1e9);
    if (!db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(id)) throw new HttpError(404, 'Chambre introuvable.');
    const count = db.prepare('SELECT COUNT(*) AS n FROM room_photos WHERE room_id = ?').get(id).n;
    if (count >= MAX_PHOTOS) throw new HttpError(400, `${MAX_PHOTOS} photos maximum par chambre.`);
    const buf = req.body;
    const ext = Buffer.isBuffer(buf) ? imageType(buf) : null;
    if (!ext) throw new HttpError(400, 'Format non reconnu : envoyez une photo JPEG, PNG ou WebP.');
    const filename = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(MEDIA_DIR, filename), buf);
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM room_photos WHERE room_id = ?').get(id).m;
    const info = db.prepare('INSERT INTO room_photos (room_id, filename, sort) VALUES (?, ?, ?)').run(id, filename, maxSort + 1);
    res.json({ id: info.lastInsertRowid, url: `/api/media/rooms/${filename}` });
  },
);

adminRouter.delete('/photos/:id', (req, res) => {
  const photo = db.prepare('SELECT * FROM room_photos WHERE id = ?').get(int(req.params.id, 1, 1e9));
  if (!photo) throw new HttpError(404, 'Photo introuvable.');
  db.prepare('DELETE FROM room_photos WHERE id = ?').run(photo.id);
  fs.rm(path.join(MEDIA_DIR, photo.filename), { force: true }, () => {});
  res.json({ ok: true });
});

/** Déplace une photo d'un cran (dir = -1 vers le début, 1 vers la fin). La première sert de couverture. */
adminRouter.put('/photos/:id/move', (req, res) => {
  const photo = db.prepare('SELECT * FROM room_photos WHERE id = ?').get(int(req.params.id, 1, 1e9));
  if (!photo) throw new HttpError(404, 'Photo introuvable.');
  const dir = req.body?.dir === -1 ? -1 : 1;
  db.transaction(() => {
    const list = db.prepare('SELECT id FROM room_photos WHERE room_id = ? ORDER BY sort, id').all(photo.room_id).map((p) => p.id);
    const i = list.indexOf(photo.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const upd = db.prepare('UPDATE room_photos SET sort = ? WHERE id = ?');
    list.forEach((pid, k) => upd.run(k, pid));
  })();
  res.json({ ok: true });
});

/* ---------- Réservations ---------- */
const STATUSES = ['pending', 'payment', 'confirmed', 'cancelled'];
const bookingRow = (id) => {
  const b = db.prepare(`SELECT b.*, r.name AS room_name, r.floor, r.price_both, r.price_sat, r.price_mode FROM room_bookings b
                        JOIN rooms r ON r.id = b.room_id WHERE b.id = ?`).get(id);
  return b && { ...b, amount: bookingAmount(b) };
};

/** Envoie le mail « règlement en cours » ; renvoie l'état de l'envoi sans faire échouer l'enregistrement. */
async function paymentMail(id) {
  const b = bookingRow(id);
  if (!b) return { mail: 'error', mail_error: 'Réservation introuvable.' };
  if (!b.email) return { mail: 'no-email' };
  if (!mailer.isConfigured()) return { mail: 'not-configured' };
  try {
    await mailer.sendPaymentMail(b, nightLabels(getContent()));
    db.prepare("UPDATE room_bookings SET mail_sent_at = datetime('now') WHERE id = ?").run(id);
    return { mail: 'sent', to: b.email };
  } catch (err) {
    return { mail: 'error', mail_error: err.message };
  }
}
function bookingFrom(b, cur = {}) {
  const v = { ...cur, ...b };
  const d = {
    room_id: int(v.room_id, 1, 1e9, 'Chambre'),
    first_name: str(v.first_name, 80),
    last_name: str(v.last_name, 80),
    email: email(v.email),
    phone: str(v.phone, 40),
    persons: int(v.persons ?? 1, 1, 20, 'Personnes'),
    nights: oneOf(v.nights, NIGHTS, 'both'),
    message: str(v.message, 2000),
    notes: str(v.notes, 2000),
    status: oneOf(v.status, STATUSES, 'pending'),
  };
  if (!d.first_name && !d.last_name) throw new HttpError(400, 'Le nom est obligatoire.');
  return d;
}

/** Une chambre entière : une seule réservation active. Un dortoir loué au lit : autant que de lits. */
function checkRoomFree(d, excludeId = 0) {
  if (d.status === 'cancelled') return;
  const room = db.prepare('SELECT name, capacity, price_mode FROM rooms WHERE id = ?').get(d.room_id);
  if (!room) throw new HttpError(404, 'Chambre introuvable.');
  if (room.price_mode === 'bed') {
    const used = db.prepare(`SELECT COALESCE(SUM(persons), 0) AS n FROM room_bookings
                             WHERE room_id = ? AND status != 'cancelled' AND id != ?`).get(d.room_id, excludeId).n;
    const free = Math.max(0, room.capacity - used);
    if (d.persons > free) throw new HttpError(409, `« ${room.name} » : ${free} lit${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''} seulement (${room.capacity} au total).`);
    return;
  }
  const other = db.prepare(`SELECT first_name, last_name FROM room_bookings
                            WHERE room_id = ? AND status != 'cancelled' AND id != ?`).get(d.room_id, excludeId);
  if (other) {
    throw new HttpError(409, `« ${room.name} » est déjà réservée par ${other.first_name} ${other.last_name}. Annulez d’abord cette réservation.`);
  }
  if (d.persons > room.capacity) throw new HttpError(400, `« ${room.name} » accueille ${room.capacity} personne(s) au maximum.`);
}

adminRouter.get('/room-bookings', (req, res) => {
  res.json(db.prepare(`SELECT b.*, r.name AS room_name, r.floor, r.price_both, r.price_sat, r.price_mode FROM room_bookings b
                       JOIN rooms r ON r.id = b.room_id ORDER BY b.created_at DESC, b.id DESC`).all()
    .map((b) => ({ ...b, amount: bookingAmount(b) })));
});

adminRouter.post('/room-bookings', async (req, res) => {
  const d = bookingFrom(req.body || {});
  const info = db.transaction(() => {
    checkRoomFree(d);
    return db.prepare(`INSERT INTO room_bookings (room_id, first_name, last_name, email, phone, persons, nights, message, notes, status)
                       VALUES (@room_id, @first_name, @last_name, @email, @phone, @persons, @nights, @message, @notes, @status)`).run(d);
  })();
  const id = Number(info.lastInsertRowid);
  const mail = d.status === 'payment' && mailer.getTemplate().auto ? await paymentMail(id) : {};
  res.json({ id, ...mail });
});

adminRouter.put('/room-bookings/:id', async (req, res) => {
  const id = int(req.params.id, 1, 1e9);
  const cur = db.prepare('SELECT * FROM room_bookings WHERE id = ?').get(id);
  if (!cur) throw new HttpError(404, 'Réservation introuvable.');
  const d = bookingFrom(req.body || {}, cur);
  db.transaction(() => {
    checkRoomFree(d, id);
    db.prepare(`UPDATE room_bookings SET room_id=@room_id, first_name=@first_name, last_name=@last_name, email=@email, phone=@phone,
                persons=@persons, nights=@nights, message=@message, notes=@notes, status=@status, updated_at=datetime('now')
                WHERE id=@id`).run({ ...d, id });
  })();
  // Passage à « règlement en cours » : mail automatique à l'invité
  const mail = d.status === 'payment' && cur.status !== 'payment' && mailer.getTemplate().auto ? await paymentMail(id) : {};
  res.json({ ok: true, ...mail });
});

/** Renvoi manuel du mail « règlement ». */
adminRouter.post('/room-bookings/:id/mail', async (req, res) => {
  const r = await paymentMail(int(req.params.id, 1, 1e9));
  if (r.mail === 'no-email') throw new HttpError(400, 'Cette réservation n’a pas d’adresse e-mail.');
  if (r.mail === 'not-configured') throw new HttpError(400, 'Configurez d’abord le serveur d’envoi (bloc « Mail »).');
  if (r.mail === 'error') throw new HttpError(502, r.mail_error);
  res.json({ ok: true, ...r });
});

/* ---------- Mail : réglages SMTP et modèle ---------- */
adminRouter.get('/mail-settings', (req, res) => {
  res.json({ smtp: mailer.publicSmtp(), template: mailer.getTemplate(), default_template: mailer.DEFAULT_TEMPLATE, sample: sampleVars() });
});
adminRouter.put('/mail-settings/smtp', (req, res) => {
  mailer.setSmtp(req.body || {});
  res.json({ ok: true, smtp: mailer.publicSmtp() });
});
adminRouter.put('/mail-settings/template', (req, res) => {
  mailer.setTemplate(req.body || {});
  res.json({ ok: true, template: mailer.getTemplate() });
});
/** Réservation fictive pour l'aperçu et le mail d'essai. */
const sampleVars = () => mailer.bookingVars({ first_name: 'Camille', last_name: 'Exemple', room_name: 'Chambre 3', persons: 2, nights: 'both', price_mode: 'room', amount: 80 },
  nightLabels(getContent()));
/** Mail d'essai : le modèle rempli avec une réservation fictive. */
adminRouter.post('/mail-settings/test', rateLimit('mail-test', 20, 10 * 60_000), async (req, res) => {
  const to = email(req.body?.to);
  if (!to) throw new HttpError(400, 'Indiquez l’adresse qui recevra le mail d’essai.');
  const t = mailer.getTemplate();
  const vars = sampleVars();
  await mailer.sendMail(to, `[Essai] ${mailer.fill(t.subject, vars, false)}`, mailer.fill(t.html, vars, true));
  res.json({ ok: true });
});

adminRouter.delete('/room-bookings/:id', (req, res) => {
  db.prepare('DELETE FROM room_bookings WHERE id = ?').run(int(req.params.id, 1, 1e9));
  res.json({ ok: true });
});

const STATUS = { pending: 'En attente', payment: 'Règlement en cours', confirmed: 'Confirmée', cancelled: 'Annulée' };
adminRouter.get('/room-bookings.csv', (req, res) => {
  const labels = nightLabels(getContent());
  const rows = db.prepare(`SELECT b.*, r.name AS room_name, r.floor, r.price_both, r.price_sat, r.price_mode FROM room_bookings b
                           JOIN rooms r ON r.id = b.room_id ORDER BY r.sort, b.created_at`).all();
  const csv = toCsv(rows, [
    { label: 'Chambre', key: 'room_name' }, { label: 'Étage', value: (r) => (r.floor === 'rdc' ? 'RDC' : 'Étage') },
    { label: 'Prénom', key: 'first_name' }, { label: 'Nom', key: 'last_name' }, { label: 'Personnes', key: 'persons' },
    { label: 'Nuits', value: (r) => labels[r.nights] }, { label: 'Statut', value: (r) => STATUS[r.status] },
    { label: 'Lits / personnes', value: (r) => (r.price_mode === 'bed' ? `${r.persons} lit(s)` : `${r.persons} pers.`) },
    { label: 'Prix (€)', value: (r) => { const p = bookingAmount(r); return p === null ? '' : String(p).replace('.', ','); } },
    { label: 'E-mail', key: 'email' }, { label: 'Téléphone', key: 'phone' }, { label: 'Message', key: 'message' },
    { label: 'Notes internes', key: 'notes' }, { label: 'Date de demande', key: 'created_at' },
  ]);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="chambres-sur-place.csv"');
  res.send(csv);
});

module.exports = { publicRouter, adminRouter, nightLabels };
