/**
 * Album photo partagé (photos et vidéos des invités), inspiré de Memtly / WeddingShare.
 *
 * - Ouvert uniquement à partir du jour du mariage (minuit, fuseau du mariage). Les envois restent possibles
 *   pendant N jours (réglable), la galerie reste ensuite visible.
 * - Avant l'ouverture, seuls les mariés connectés à l'administration peuvent l'essayer (aperçu).
 * - Les photos sont réduites dans le navigateur de l'invité (3000 px, JPEG) avant l'envoi : moins de données
 *   mobiles, et les métadonnées (position GPS…) disparaissent. Le navigateur envoie aussi une vignette.
 * - Format d'un envoi : corps = vignette JPEG (X-Thumb-Length octets) puis fichier original, écrit en flux sur le disque.
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const QRCode = require('qrcode-svg');
const yazl = require('yazl');
const { db, DATA_DIR, getContent } = require('../db');
const { HttpError, str, int, rateLimit, zonedToUtc, imageType } = require('../util');
const auth = require('../auth');

const DIR = path.join(DATA_DIR, 'media', 'album');
fs.mkdirSync(DIR, { recursive: true });
const PHOTO_MAX = 30 * 1024 * 1024;

db.exec(`
CREATE TABLE IF NOT EXISTS album_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,                 -- photo | video
  file       TEXT NOT NULL,
  thumb      TEXT NOT NULL DEFAULT '',
  size       INTEGER NOT NULL DEFAULT 0,
  width      INTEGER NOT NULL DEFAULT 0,
  height     INTEGER NOT NULL DEFAULT 0,
  uploader   TEXT NOT NULL DEFAULT '',
  approved   INTEGER NOT NULL DEFAULT 1,
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
// Envois de test des mariés : jamais montrés aux invités
if (!db.prepare('PRAGMA table_info(album_items)').all().some((c) => c.name === 'is_test')) {
  db.exec('ALTER TABLE album_items ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0');
}

/* ---------- Réglages et ouverture ---------- */
// schedule « auto » : du jour du mariage (minuit) pendant upload_days jours ; « custom » : dates choisies (open_at → close_at)
const DEFAULTS = { enabled: true, schedule: 'auto', upload_days: 7, open_at: '', close_at: '', allow_video: true, max_video_mb: 300, moderation: false };
function getSettings() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'album'").get();
  let s = {};
  try { s = row ? JSON.parse(row.value) : {}; } catch { /* défauts */ }
  return { ...DEFAULTS, ...s };
}
function setSettings(s) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('album', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(s));
}

/** État de l'album pour ce visiteur (les mariés connectés peuvent l'essayer avant le jour J). */
function status(req) {
  const s = getSettings(), c = getContent();
  let opens = null, closes = null;
  if (s.schedule === 'custom' && s.open_at && s.close_at) {
    opens = new Date(s.open_at); closes = new Date(s.close_at);
  } else {
    const day = String(c.date || '').slice(0, 10);
    opens = /^\d{4}-\d{2}-\d{2}$/.test(day) ? zonedToUtc(`${day}T00:00`, c.timezone || 'Europe/Paris') : null;
    closes = opens ? new Date(opens.getTime() + s.upload_days * 86400_000) : null;
  }
  const now = Date.now();
  const live = !!(s.enabled && opens && now >= opens.getTime());
  const admin = req ? auth.isAdmin(req) : false;
  return {
    enabled: s.enabled,
    opens_at: opens ? opens.toISOString() : null,
    closes_at: closes ? closes.toISOString() : null,
    open: live || (admin && s.enabled),
    upload_open: (live && now < closes.getTime()) || (admin && s.enabled),
    live,
    uploads_live: live && now < closes.getTime(),
    schedule: s.schedule,
    preview: admin && !live,
    allow_video: s.allow_video,
    max_video_mb: s.max_video_mb,
    moderation: s.moderation,
    couple: c.couple || '',
  };
}

const publicItem = (r) => ({
  id: r.id, kind: r.kind, w: r.width, h: r.height, by: r.uploader, at: r.created_at,
  src: `/api/media/album/${r.file}`, thumb: r.thumb ? `/api/media/album/${r.thumb}` : '',
  ...(r.is_test ? { test: true } : {}),
});

/** Type réel d'une vidéo d'après ses premiers octets. */
function videoType(buf) {
  if (buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    return /^qt/.test(brand) ? 'mov' : 'mp4';
  }
  if (buf.length > 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  return null;
}
const isGif = (b) => b.length > 6 && /^GIF8[79]a/.test(b.subarray(0, 6).toString('latin1'));

/* =========================================================
   Routes publiques
   ========================================================= */
const publicRouter = express.Router();

publicRouter.get('/album/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(status(req));
});

publicRouter.get('/album/items', (req, res) => {
  const st = status(req);
  res.set('Cache-Control', 'no-store');
  if (!st.open) return res.json({ items: [], total: 0 });
  const since = Number.parseInt(req.query.since, 10) || 0;
  const tests = auth.isAdmin(req) ? '' : 'AND is_test = 0';
  const rows = db.prepare(`SELECT * FROM album_items WHERE approved = 1 AND hidden = 0 ${tests} AND id > ? ORDER BY id DESC LIMIT 2000`).all(since);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM album_items WHERE approved = 1 AND hidden = 0 ${tests}`).get().n;
  res.json({ items: rows.map(publicItem), total });
});

/** Envoi d'une photo ou d'une vidéo (écrite en flux : une vidéo de 300 Mo ne passe pas en mémoire). */
publicRouter.post('/album/upload', rateLimit('album-upload', 300, 60 * 60_000), (req, res, next) => {
  const st = status(req), s = getSettings();
  if (!st.upload_open) return next(new HttpError(403, st.open ? 'Les envois sont terminés : merci pour vos souvenirs !' : 'L’album ouvrira le jour du mariage.'));
  const kind = req.get('x-kind') === 'video' ? 'video' : 'photo';
  if (kind === 'video' && !s.allow_video) return next(new HttpError(400, 'Les vidéos ne sont pas acceptées dans cet album.'));
  const thumbLen = Math.max(0, Math.min(2_000_000, Number.parseInt(req.get('x-thumb-length'), 10) || 0));
  const total = Number.parseInt(req.get('content-length'), 10) || 0;
  const max = (kind === 'video' ? s.max_video_mb * 1024 * 1024 : PHOTO_MAX) + thumbLen;
  if (!total || total > max) return next(new HttpError(413, kind === 'video' ? `Vidéo trop lourde (${s.max_video_mb} Mo maximum).` : 'Photo trop lourde.'));
  let uploader = '';
  try { uploader = str(decodeURIComponent(req.get('x-name') || ''), 40).replace(/[<>\u0000-\u001f]/g, ''); } catch { /* nom illisible */ }

  const id = crypto.randomBytes(8).toString('hex');
  const tmp = path.join(DIR, `.envoi-${id}`);
  const out = fs.createWriteStream(tmp, { flags: 'wx' });
  const thumbParts = []; let got = 0, head = Buffer.alloc(0), failed = false;
  const fail = (err) => {
    if (failed) return; failed = true;
    out.destroy(); fs.rm(tmp, { force: true }, () => {});
    req.unpipe?.(); req.resume();
    next(err);
  };
  req.on('data', (chunk) => {
    if (failed) return;
    let c = chunk;
    if (got < thumbLen) {
      const n = Math.min(thumbLen - got, c.length);
      thumbParts.push(c.subarray(0, n)); c = c.subarray(n);
    }
    got += chunk.length;
    if (got > max) return fail(new HttpError(413, 'Fichier trop lourd.'));
    if (c.length) {
      if (head.length < 64) head = Buffer.concat([head, c.subarray(0, 64 - head.length)]);
      if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); }
    }
  });
  req.on('error', () => fail(new HttpError(400, 'Envoi interrompu.')));
  req.on('aborted', () => fail(new HttpError(400, 'Envoi interrompu.')));
  req.on('end', () => {
    if (failed) return;
    out.end(() => {
      try {
        let ext = kind === 'video' ? videoType(head) : (imageType(head) || (isGif(head) ? 'gif' : null));
        if (!ext) throw new HttpError(400, kind === 'video' ? 'Format de vidéo non reconnu (MP4, MOV ou WebM).' : 'Format de photo non reconnu (JPEG, PNG, WebP ou GIF).');
        const file = `album-${id}.${ext}`;
        fs.renameSync(tmp, path.join(DIR, file));
        let thumb = '';
        const tb = Buffer.concat(thumbParts);
        if (tb.length && imageType(tb) === 'jpg') { thumb = `thumb-${id}.jpg`; fs.writeFileSync(path.join(DIR, thumb), tb); }
        const w = int(req.get('x-width') || 0, 0, 20000), h = int(req.get('x-height') || 0, 0, 20000);
        // Envoi des mariés avant l'ouverture (ou depuis la vérification) : marqué « test », jamais montré aux invités
        const isTest = auth.isAdmin(req) && (!st.uploads_live || req.get('x-test') === '1') ? 1 : 0;
        const info = db.prepare(`INSERT INTO album_items (kind, file, thumb, size, width, height, uploader, approved, is_test)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(kind, file, thumb, got - thumbLen, w, h, uploader, s.moderation && !isTest ? 0 : 1, isTest);
        res.status(201).json({ ok: true, id: info.lastInsertRowid, pending: !!s.moderation && !isTest, test: !!isTest });
      } catch (err) {
        fs.rm(tmp, { force: true }, () => {});
        next(err);
      }
    });
  });
});

/** QR code public de l'album (affiché dans le diaporama). */
publicRouter.get('/album/qr.svg', (req, res) => {
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const svg = new QRCode({ content: `${proto}://${req.get('host')}/album/`, padding: 1, width: 256, height: 256, color: '#1c1b1a', background: '#ffffff', ecl: 'M', join: true, container: 'svg-viewbox' }).svg();
  res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.send(svg);
});

/** Fichiers de l'album (vignettes, photos, vidéos avec lecture partielle « Range »). */
publicRouter.get('/media/album/:file', (req, res) => {
  const file = req.params.file;
  if (!/^(album|thumb)-[a-f0-9]{16}\.(jpg|png|webp|gif|mp4|mov|webm)$/.test(file)) throw new HttpError(404, 'Fichier introuvable.');
  const admin = auth.isAdmin(req);
  const row = db.prepare('SELECT * FROM album_items WHERE file = ? OR thumb = ?').get(file, file);
  if (!row || (!admin && (!status(req).open || row.hidden || !row.approved || row.is_test))) throw new HttpError(404, 'Fichier introuvable.');
  res.set('Cache-Control', 'private, max-age=86400');
  if (req.query.dl) res.attachment(`mariage-${String(row.id).padStart(4, '0')}${path.extname(row.file)}`);
  res.sendFile(path.join(DIR, file), (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable.' }); });
});

/* =========================================================
   Administration (montée sous /api/admin)
   ========================================================= */
const adminRouter = express.Router();

function adminState(req) {
  const rows = db.prepare('SELECT * FROM album_items ORDER BY id DESC').all();
  return {
    settings: getSettings(),
    status: status(null),
    items: rows.map((r) => ({ ...publicItem(r), approved: !!r.approved, hidden: !!r.hidden, test: !!r.is_test, size: r.size })),
    stats: {
      photos: rows.filter((r) => r.kind === 'photo').length,
      videos: rows.filter((r) => r.kind === 'video').length,
      pending: rows.filter((r) => !r.approved).length,
      tests: rows.filter((r) => r.is_test).length,
      bytes: rows.reduce((s, r) => s + r.size, 0),
    },
  };
}

adminRouter.get('/album', (req, res) => res.json(adminState(req)));

adminRouter.put('/album/settings', (req, res) => {
  const b = req.body || {}, cur = getSettings();
  const schedule = b.schedule === 'custom' ? 'custom' : b.schedule === 'auto' ? 'auto' : cur.schedule;
  const iso = (v, label) => {
    const d = new Date(String(v || ''));
    if (Number.isNaN(d.getTime())) throw new HttpError(400, `${label} : date invalide.`);
    return d.toISOString();
  };
  let openAt = cur.open_at, closeAt = cur.close_at;
  if (schedule === 'custom') {
    openAt = iso(b.open_at ?? cur.open_at, 'Ouverture de l’album');
    closeAt = iso(b.close_at ?? cur.close_at, 'Fin des envois');
    if (new Date(closeAt) <= new Date(openAt)) throw new HttpError(400, 'La fin des envois doit être après l’ouverture.');
  }
  setSettings({
    schedule, open_at: openAt, close_at: closeAt,
    enabled: 'enabled' in b ? !!b.enabled : cur.enabled,
    upload_days: 'upload_days' in b ? int(b.upload_days, 1, 365, 'Durée des envois') : cur.upload_days,
    allow_video: 'allow_video' in b ? !!b.allow_video : cur.allow_video,
    max_video_mb: 'max_video_mb' in b ? int(b.max_video_mb, 10, 2000, 'Taille maximale des vidéos') : cur.max_video_mb,
    moderation: 'moderation' in b ? !!b.moderation : cur.moderation,
  });
  res.json(adminState(req));
});

adminRouter.put('/album/:id', (req, res) => {
  const id = int(req.params.id, 1, 1e9);
  const b = req.body || {};
  if ('hidden' in b) db.prepare('UPDATE album_items SET hidden = ? WHERE id = ?').run(b.hidden ? 1 : 0, id);
  if ('approved' in b) db.prepare('UPDATE album_items SET approved = ? WHERE id = ?').run(b.approved ? 1 : 0, id);
  res.json(adminState(req));
});

adminRouter.post('/album/approve-all', (req, res) => {
  db.prepare('UPDATE album_items SET approved = 1 WHERE approved = 0').run();
  res.json(adminState(req));
});

adminRouter.delete('/album/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM album_items WHERE id = ?').get(int(req.params.id, 1, 1e9));
  if (!row) throw new HttpError(404, 'Élément introuvable.');
  db.prepare('DELETE FROM album_items WHERE id = ?').run(row.id);
  for (const f of [row.file, row.thumb]) if (f) fs.rm(path.join(DIR, f), { force: true }, () => {});
  res.json(adminState(req));
});

/** Supprime tous les envois de test. */
adminRouter.delete('/album/tests', (req, res) => {
  const rows = db.prepare('SELECT * FROM album_items WHERE is_test = 1').all();
  db.prepare('DELETE FROM album_items WHERE is_test = 1').run();
  for (const r of rows) for (const f of [r.file, r.thumb]) if (f) fs.rm(path.join(DIR, f), { force: true }, () => {});
  res.json({ ...adminState(req), removed: rows.length });
});

/** Vérifications côté serveur : réglages, écriture sur le disque, espace libre. */
adminRouter.get('/album/diagnostic', (req, res) => {
  const st = status(null), s = getSettings();
  let writable = false, free = null, total = null;
  try {
    const f = path.join(DIR, `.test-${crypto.randomBytes(4).toString('hex')}`);
    fs.writeFileSync(f, 'ok'); writable = fs.readFileSync(f, 'utf8') === 'ok'; fs.rmSync(f);
  } catch { writable = false; }
  try { const sf = fs.statfsSync(DIR); free = sf.bavail * sf.bsize; total = sf.blocks * sf.bsize; } catch { /* non disponible */ }
  res.json({ enabled: s.enabled, opens_at: st.opens_at, closes_at: st.closes_at, writable, free, total, max_video_mb: s.max_video_mb });
});

/** Test de taille : reçoit un gros fichier et le jette (vérifie les limites du proxy jusqu'au serveur). */
adminRouter.post('/album/test-upload', (req, res) => {
  let got = 0;
  req.on('data', (c) => { got += c.length; });
  req.on('end', () => res.json({ ok: true, bytes: got }));
  req.on('error', () => { if (!res.headersSent) res.status(400).json({ error: 'Envoi interrompu.' }); });
});

/** Tout l'album dans un fichier ZIP (sans recompression : photos et vidéos sont déjà compressées). */
adminRouter.get('/album/zip', (req, res) => {
  const rows = db.prepare(`SELECT * FROM album_items ${req.query.all ? '' : 'WHERE hidden = 0 AND approved = 1 AND is_test = 0'} ORDER BY id`).all();
  const zip = new yazl.ZipFile();
  for (const r of rows) {
    const who = (r.uploader || 'invite').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'invite';
    const p = path.join(DIR, r.file);
    if (fs.existsSync(p)) zip.addFile(p, `${String(r.id).padStart(4, '0')}-${who}${path.extname(r.file)}`, { compress: false });
  }
  zip.end();
  res.set('Content-Type', 'application/zip');
  res.attachment(`album-mariage-${new Date().toISOString().slice(0, 10)}.zip`);
  zip.outputStream.pipe(res);
});

/** QR code (SVG) d'une adresse du site, pour l'imprimer sur les tables. */
adminRouter.get('/album/qr.svg', (req, res) => {
  const url = str(req.query.url, 400);
  if (!/^https?:\/\/[^\s]+$/.test(url)) throw new HttpError(400, 'Adresse invalide.');
  const svg = new QRCode({ content: url, padding: 2, width: 512, height: 512, color: '#1c1b1a', background: '#ffffff', ecl: 'M', join: true, container: 'svg-viewbox' }).svg();
  res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  if (req.query.dl) res.attachment('qr-album-mariage.svg');
  res.send(svg);
});

module.exports = { publicRouter, adminRouter };
