/**
 * Routes publiques (invités) : contenu du site, réponse RSVP, réservation de gîte, fichier agenda.
 */
'use strict';

const express = require('express');
const { db, getContent, getPrivate, gitesWithAvailability } = require('../db');
const { HttpError, str, int, email, nameKey, rateLimit, zonedToUtc } = require('../util');

const router = express.Router();

/** Vérifie le champ piège (honeypot) et le code d'invitation éventuel. */
function antiSpam(body) {
  if (str(body.website)) throw new HttpError(400, 'Requête refusée.'); // champ invisible rempli = robot
  const expected = (getPrivate('invite_code') || '').trim();
  if (expected && str(body.code, 100).toLowerCase() !== expected.toLowerCase()) {
    throw new HttpError(403, "Code d'invitation incorrect. Il figure sur votre faire-part.");
  }
}

router.get('/health', (req, res) => res.json({ ok: true }));

router.get('/content', (req, res) => {
  const content = getContent();
  const start = zonedToUtc(content.date, content.timezone);
  res.set('Cache-Control', 'no-store');
  res.json({
    content: { ...content, date_utc: start ? start.toISOString() : null },
    code_required: !!(getPrivate('invite_code') || '').trim(),
    places: db.prepare('SELECT id, kind, name, address, lat, lng, time, description FROM places ORDER BY sort, id').all(),
    gites: gitesWithAvailability().map((g) => ({
      id: g.id, name: g.name, address: g.address, lat: g.lat, lng: g.lng, capacity: g.capacity,
      price: g.price, contact: g.contact, url: g.url, description: g.description,
      bookable: g.bookable, remaining: g.remaining,
    })),
  });
});

router.post('/rsvp', rateLimit('rsvp', 10, 10 * 60_000), (req, res) => {
  const b = req.body || {};
  antiSpam(b);
  const content = getContent();
  if (!content.options.rsvp_open) throw new HttpError(403, 'Les réponses sont désormais closes. Contactez-nous directement.');

  const name = str(b.name, 150);
  if (name.length < 2) throw new HttpError(400, 'Merci d’indiquer votre nom.');
  const attending = b.attending === 'yes' || b.attending === true;
  const data = {
    name,
    name_key: nameKey(name),
    email: email(b.email),
    phone: str(b.phone, 40),
    status: attending ? 'yes' : 'no',
    adults: attending ? int(b.adults ?? 1, 0, 20, "Nombre d'adultes") : 0,
    children: attending ? int(b.children ?? 0, 0, 20, "Nombre d'enfants") : 0,
    diet: attending ? str(b.diet, 500) : '',
    message: str(b.message, 2000),
  };
  if (attending && data.adults + data.children === 0) throw new HttpError(400, 'Indiquez au moins une personne.');

  // Si l'invité existe déjà (ajouté par l'admin ou réponse précédente), on met à jour sa fiche
  const existing =
    db.prepare('SELECT id FROM guests WHERE name_key = ? ORDER BY id LIMIT 1').get(data.name_key) ||
    (data.email ? db.prepare("SELECT id FROM guests WHERE email = ? AND email != '' ORDER BY id LIMIT 1").get(data.email) : null);

  if (existing) {
    db.prepare(`UPDATE guests SET email = COALESCE(NULLIF(@email, ''), email), phone = COALESCE(NULLIF(@phone, ''), phone),
                status = @status, adults = @adults, children = @children, diet = @diet, message = @message,
                updated_at = datetime('now'), responded_at = datetime('now') WHERE id = @id`)
      .run({ ...data, id: existing.id });
  } else {
    db.prepare(`INSERT INTO guests (name, name_key, email, phone, status, adults, children, diet, message, source, responded_at)
                VALUES (@name, @name_key, @email, @phone, @status, @adults, @children, @diet, @message, 'web', datetime('now'))`)
      .run(data);
  }
  res.json({
    ok: true,
    message: attending
      ? 'Merci ! Votre présence est bien enregistrée. Nous avons hâte de vous voir.'
      : 'Merci de nous avoir répondu. Vous nous manquerez !',
  });
});

/** Réservation : la vérification de capacité et l'insertion sont atomiques (transaction). */
const bookTx = db.transaction((data) => {
  const gite = gitesWithAvailability().find((g) => g.id === data.gite_id);
  if (!gite) throw new HttpError(404, 'Hébergement introuvable.');
  if (!gite.bookable) throw new HttpError(400, 'Cet hébergement se réserve directement auprès du propriétaire.');
  if (gite.remaining <= 0) throw new HttpError(409, 'Désolé, cet hébergement est complet.');
  if (data.persons > gite.remaining) {
    throw new HttpError(409, `Il ne reste que ${gite.remaining} place(s) dans « ${gite.name} ».`);
  }
  db.prepare(`INSERT INTO bookings (gite_id, name, email, phone, persons, nights, message)
              VALUES (@gite_id, @name, @email, @phone, @persons, @nights, @message)`).run(data);
  return gite;
});

router.post('/bookings', rateLimit('booking', 10, 10 * 60_000), (req, res) => {
  const b = req.body || {};
  antiSpam(b);
  if (!getContent().options.bookings_open) throw new HttpError(403, 'Les réservations sont closes. Contactez-nous directement.');
  const data = {
    gite_id: int(b.gite_id, 1, 1e9, 'Hébergement'),
    name: str(b.name, 150),
    email: email(b.email),
    phone: str(b.phone, 40),
    persons: int(b.persons, 1, 50, 'Nombre de personnes'),
    nights: Array.isArray(b.nights) ? b.nights.map((n) => str(n, 60)).filter(Boolean).join(', ') : str(b.nights, 300),
    message: str(b.message, 2000),
  };
  if (data.name.length < 2) throw new HttpError(400, 'Merci d’indiquer votre nom.');
  if (!data.email && !data.phone) throw new HttpError(400, 'Indiquez un e-mail ou un téléphone pour que nous puissions vous recontacter.');
  const gite = bookTx(data);
  res.json({
    ok: true,
    message: `Merci ! Votre demande pour « ${gite.name} » est enregistrée. Nous vous confirmerons la réservation rapidement.`,
  });
});

/** Fichier .ics « Ajouter à mon agenda ». */
router.get('/calendar.ics', (req, res) => {
  const c = getContent();
  const start = zonedToUtc(c.date, c.timezone);
  if (!start) throw new HttpError(404, 'Date non définie.');
  const end = new Date(start.getTime() + (Number(c.duration_hours) || 12) * 3600_000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\r?\n/g, '\\n');
  const first = db.prepare('SELECT name, address FROM places ORDER BY sort, id LIMIT 1').get();
  const host = req.get('host') || 'mariage';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//monmariage//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:mariage-${fmt(start)}@${host}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc('Mariage ' + c.couple)}`,
    first ? `LOCATION:${esc(first.name + (first.address ? ', ' + first.address : ''))}` : null,
    `DESCRIPTION:${esc('Toutes les infos : ' + req.protocol + '://' + host)}`,
    'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${esc('Mariage ' + c.couple + ' dans une semaine')}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="mariage.ics"');
  res.send(lines.join('\r\n') + '\r\n');
});

module.exports = router;
