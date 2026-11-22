/**
 * Séjour sur place (chambres du lieu) : nombre de nuits fixé dans l'administration,
 * et période de priorité réservée à la famille et aux témoins (liste d'attente pour les autres).
 */
'use strict';

const { db } = require('./db');
const { nameKey } = require('./util');

const DAY = 86400_000;
const ymd = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};
const iso = (d) => d.toISOString().slice(0, 10);
// « 1er » pour le premier du mois (« jeudi 1er janvier »)
const fmt = (d, opts) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts }).format(d).replace(/(^|\s)1(?=\s|$)/, '$11er');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** « vendredi 18 et samedi 19 août » / « jeudi 17, vendredi 18 et samedi 19 août » (mois répété s'il change). */
function joinDays(days) {
  const parts = days.map((d, i) => {
    const next = days[i + 1];
    const sameMonth = next && next.getUTCMonth() === d.getUTCMonth();
    return fmt(d, sameMonth ? { weekday: 'long', day: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long' });
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}` : parts[0];
}

/** Nuits proposées : nombre de nuits et date d'arrivée (par défaut, la dernière nuit est celle du mariage). */
function stayInfo(content) {
  const o = content.onsite || {};
  const nights = Math.min(7, Math.max(1, Number.parseInt(o.nights, 10) || 2));
  const wedding = ymd(content.date);
  const arrival = ymd(o.arrival) || (wedding ? new Date(wedding.getTime() - (nights - 1) * DAY) : null);
  const short = `${nights} nuit${nights > 1 ? 's' : ''}`;
  if (!arrival) return { nights, arrival: null, departure: null, short, label: short, dates: '' };
  const days = Array.from({ length: nights }, (_, i) => new Date(arrival.getTime() + i * DAY));
  const departure = new Date(arrival.getTime() + nights * DAY);
  return {
    nights, short,
    arrival: iso(arrival), departure: iso(departure),
    label: `${nights > 1 ? 'Nuits du' : 'Nuit du'} ${joinDays(days)}`, // « Nuits du vendredi 18 et samedi 19 août »
    dates: `arrivée le ${fmt(arrival, { weekday: 'long', day: 'numeric', month: 'long' })}, départ le ${fmt(departure, { weekday: 'long', day: 'numeric', month: 'long' })}`,
  };
}

/** Date du jour dans le fuseau du mariage (AAAA-MM-JJ). */
function today(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Priorité famille / témoins : active jusqu'à la date choisie incluse. */
function priorityInfo(content) {
  const o = content.onsite || {};
  const until = ymd(o.priority_until);
  const enabled = !!o.priority && !!until;
  const active = enabled && today(content.timezone) <= iso(until);
  return {
    enabled, active,
    until: until ? iso(until) : '',
    until_label: until ? fmt(until, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '',
    open_label: until ? fmt(new Date(until.getTime() + DAY), { weekday: 'long', day: 'numeric', month: 'long' }) : '',
  };
}

/**
 * Invité prioritaire (famille, témoin) correspondant au nom saisi :
 * même nom (ordre libre), ou prénom et nom tous présents dans le nom du foyer (« Marie et Paul Durand »).
 */
function findPriorityGuest(firstName, lastName) {
  const words = nameKey(`${firstName} ${lastName}`).split(' ').filter(Boolean);
  if (words.length < 2) return null;
  return db.prepare('SELECT id, name, name_key FROM guests WHERE room_priority = 1').all().find((g) => {
    const gw = new Set(g.name_key.split(' '));
    return words.every((w) => gw.has(w));
  }) || null;
}

module.exports = { stayInfo, priorityInfo, findPriorityGuest };
