/**
 * Apparence : feuille de style publique et réglages dans l'administration.
 */
'use strict';

const crypto = require('node:crypto');
const express = require('express');
const A = require('../appearance');
const { HttpError, str } = require('../util');

/* ---------- Public ----------
// Adresse sans extension « .css » : les caches de type « Cache Assets » (Nginx Proxy Manager) ne la conservent pas */
const publicRouter = express.Router();

publicRouter.get('/apparence', (req, res) => {
  const css = A.appearanceCss();
  const etag = '"' + crypto.createHash('sha1').update(css).digest('base64url') + '"';
  res.set('Content-Type', 'text/css; charset=utf-8');
  res.set('Cache-Control', 'no-cache'); // revalidé à chaque visite (réponse 304 si inchangé)
  res.set('ETag', etag);
  if (req.get('if-none-match') === etag) return res.status(304).end();
  res.send(css);
});

publicRouter.get('/fonts.css', (req, res) => {
  res.set('Content-Type', 'text/css; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(A.allFontsCss());
});

/* ---------- Administration ---------- */
const adminRouter = express.Router();

adminRouter.get('/appearance', (req, res) => {
  res.json({
    appearance: A.getAppearance(),
    presets: A.PRESETS,
    custom_themes: A.getCustomThemes(),
    fonts: A.FONTS.map(({ id, family, cat }) => ({ id, family, cat })),
    font_roles: A.FONT_ROLES,
    color_roles: A.COLOR_ROLES,
    sections: A.SECTIONS,
    nav_items: A.NAV_ITEMS,
  });
});

adminRouter.put('/appearance', (req, res) => {
  const css = String(req.body?.css || '');
  if (css.length > 50_000) throw new HttpError(400, 'Le CSS personnalisé est trop long (50 000 caractères maximum).');
  A.setAppearance(req.body || {});
  res.json({ ok: true, appearance: A.getAppearance() });
});

/** Enregistre l'apparence actuelle (couleurs, polices, CSS) comme thème réutilisable. */
adminRouter.post('/themes', (req, res) => {
  const name = str(req.body?.name, 60);
  if (!name) throw new HttpError(400, 'Donnez un nom au thème.');
  const a = A.sanitizeAppearance(req.body || {});
  const list = A.getCustomThemes();
  if (list.length >= 30) throw new HttpError(400, '30 thèmes personnels au maximum : supprimez-en un.');
  const theme = { id: 'perso-' + crypto.randomBytes(4).toString('hex'), name, colors: a.colors, fonts: a.fonts, css: a.css };
  list.push(theme);
  A.setCustomThemes(list);
  res.status(201).json(theme);
});

adminRouter.delete('/themes/:id', (req, res) => {
  const list = A.getCustomThemes();
  const next = list.filter((t) => t.id !== req.params.id);
  if (next.length === list.length) throw new HttpError(404, 'Thème introuvable.');
  A.setCustomThemes(next);
  res.json({ ok: true });
});

module.exports = { publicRouter, adminRouter };
