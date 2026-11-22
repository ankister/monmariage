/**
 * Envoi d'e-mails aux invités (SMTP réglé depuis l'administration, sans variable de conteneur).
 * - réglages SMTP et modèle du mail « règlement en cours » conservés dans private_config
 * - le mot de passe SMTP n'est jamais renvoyé au navigateur
 */
'use strict';

const nodemailer = require('nodemailer');
const { getPrivate, setPrivate, getContent } = require('./db');
const { HttpError } = require('./util');

const SECURITY = ['ssl', 'starttls', 'none'];

const DEFAULT_TEMPLATE = {
  subject: 'Votre réservation pour notre mariage : règlement',
  html: `<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color: #2f2a25; line-height: 1.6;">
  <h1 style="font-weight: normal; font-size: 26px; margin: 0 0 16px;">Bonjour {{prenom}},</h1>
  <p>Merci pour votre réservation : nous avons hâte de vous retrouver le {{date_mariage}} !</p>
  <table style="border-collapse: collapse; width: 100%; margin: 16px 0; font-family: Arial, sans-serif; font-size: 15px;">
    <tr><td style="padding: 8px 0; border-bottom: 1px solid #e8e1d6;">Hébergement</td><td style="padding: 8px 0; border-bottom: 1px solid #e8e1d6; text-align: right;"><strong>{{chambre}}</strong> ({{quantite}})</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid #e8e1d6;">Nuits</td><td style="padding: 8px 0; border-bottom: 1px solid #e8e1d6; text-align: right;">{{nuits}}</td></tr>
    <tr><td style="padding: 8px 0;">Montant à régler</td><td style="padding: 8px 0; text-align: right; font-size: 18px;"><strong>{{montant}}</strong></td></tr>
  </table>
  <p><strong>Pour régler :</strong> [à compléter : virement (IBAN), Lydia, chèque…]</p>
  <p>Les draps et le ménage sont inclus. Pensez à apporter vos serviettes de toilette.</p>
  <p>À très vite,<br>{{couple}}</p>
</div>`,
};

function readJson(key) {
  try { return JSON.parse(getPrivate(key) || '{}'); } catch { return {}; }
}

function getSmtp() {
  const s = readJson('smtp');
  return {
    host: s.host || '', port: s.port || 0, security: SECURITY.includes(s.security) ? s.security : 'starttls',
    user: s.user || '', pass: s.pass || '', from_email: s.from_email || '', from_name: s.from_name || '', reply_to: s.reply_to || '',
  };
}

/** Réglages renvoyés à l'admin : sans le mot de passe. */
function publicSmtp() {
  const { pass, ...rest } = getSmtp();
  return { ...rest, has_pass: !!pass, configured: isConfigured() };
}

function isConfigured() {
  const s = getSmtp();
  return !!(s.host && s.from_email);
}

/** Enregistre les réglages ; mot de passe vide = inchangé (clear_pass pour l'effacer). */
function setSmtp(b = {}) {
  const cur = getSmtp();
  const txt = (v, max) => String(v ?? '').trim().slice(0, max);
  const email = (v) => {
    const s = txt(v, 200);
    if (s && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)) throw new HttpError(400, `Adresse e-mail invalide : ${s}`);
    return s;
  };
  const security = SECURITY.includes(b.security) ? b.security : 'starttls';
  const port = Number.parseInt(b.port, 10);
  const next = {
    host: txt(b.host, 200).replace(/[^a-zA-Z0-9.\-:[\]]/g, ''),
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : (security === 'ssl' ? 465 : security === 'starttls' ? 587 : 25),
    security,
    user: txt(b.user, 200),
    pass: b.clear_pass ? '' : (b.pass ? String(b.pass).slice(0, 500) : cur.pass),
    from_email: email(b.from_email),
    from_name: txt(b.from_name, 100).replace(/[\r\n"]/g, ''),
    reply_to: email(b.reply_to),
  };
  setPrivate('smtp', JSON.stringify(next));
}

function getTemplate() {
  const t = readJson('room_mail');
  return {
    subject: typeof t.subject === 'string' && t.subject ? t.subject : DEFAULT_TEMPLATE.subject,
    html: typeof t.html === 'string' && t.html ? t.html : DEFAULT_TEMPLATE.html,
    auto: t.auto !== false,
  };
}

function setTemplate(b = {}) {
  const subject = String(b.subject ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, 300);
  const html = String(b.html ?? '').slice(0, 100_000);
  setPrivate('room_mail', JSON.stringify({ subject, html, auto: b.auto !== false }));
}

function transport() {
  const s = getSmtp();
  if (!s.host || !s.from_email) throw new HttpError(400, 'Le serveur d’envoi des e-mails n’est pas configuré (Chambres → Mail).');
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.security === 'ssl',
    requireTLS: s.security === 'starttls',
    ignoreTLS: s.security === 'none',
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Remplace {{variable}} ; valeurs échappées en HTML, sauf pour le sujet (texte brut). */
function fill(text, vars, html) {
  return String(text).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) => {
    const key = k.toLowerCase();
    if (!(key in vars)) return m;
    return html ? escHtml(vars[key]) : String(vars[key]);
  });
}

const euro = (n) => (n === null || n === undefined ? 'à préciser'
  : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n));

/** Variables du modèle pour une réservation (b : ligne room_bookings jointe à rooms, avec amount). */
function bookingVars(b, nightLabels) {
  const c = getContent();
  let dateStr = '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(c.date || '');
  if (m) dateStr = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
  const perBed = b.price_mode === 'bed';
  return {
    prenom: b.first_name, nom: b.last_name,
    chambre: b.room_name,
    quantite: perBed ? `${b.persons} lit${b.persons > 1 ? 's' : ''}` : `${b.persons} personne${b.persons > 1 ? 's' : ''}`,
    nuits: (nightLabels[b.nights] || '').toLowerCase(),
    montant: euro(b.amount),
    couple: c.couple || '',
    date_mariage: dateStr,
  };
}

async function sendMail(to, subject, html) {
  const s = getSmtp();
  const t = transport();
  try {
    await t.sendMail({
      from: s.from_name ? { name: s.from_name, address: s.from_email } : s.from_email,
      to,
      replyTo: s.reply_to || undefined,
      subject,
      html,
      text: html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' : ').replace(/<\/(p|div|h\d|tr|li)>/gi, '\n')
        .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/^[ \t]+/gm, '').replace(/\n{3,}/g, '\n\n').trim(),
    });
  } catch (err) {
    throw new HttpError(502, `Envoi impossible : ${friendly(err)}`);
  } finally {
    t.close();
  }
}

function friendly(err) {
  const code = err.code || '';
  if (code === 'EAUTH') return 'identifiant ou mot de passe SMTP refusé.';
  if (code === 'ECONNECTION' || code === 'ECONNREFUSED') return 'connexion au serveur SMTP refusée (adresse, port ou sécurité).';
  if (code === 'ETIMEDOUT' || code === 'ESOCKET') return 'le serveur SMTP ne répond pas (adresse, port ou sécurité SSL/STARTTLS).';
  if (code === 'EDNS' || code === 'ENOTFOUND') return 'serveur SMTP introuvable (vérifiez son adresse).';
  if (code === 'EENVELOPE') return 'adresse du destinataire ou de l’expéditeur refusée.';
  return String(err.message || err).slice(0, 200);
}

/** Envoie le mail « règlement en cours » d'une réservation. */
async function sendPaymentMail(b, nightLabels) {
  if (!b.email) throw new HttpError(400, 'Cette réservation n’a pas d’adresse e-mail.');
  const t = getTemplate();
  const vars = bookingVars(b, nightLabels);
  await sendMail(b.email, fill(t.subject, vars, false), fill(t.html, vars, true));
}

module.exports = {
  DEFAULT_TEMPLATE, getSmtp, publicSmtp, setSmtp, isConfigured, getTemplate, setTemplate,
  bookingVars, fill, sendMail, sendPaymentMail,
};
