/**
 * Tableaux d'honneur des mini-jeux (« En retard », « En cavale »).
 * Les jeux appellent « api/scores » relativement à leur page : Nginx renvoie
 * /jeux/<jeu>/api/scores vers /api/games/<jeu>/scores.
 * Format attendu par les jeux : tableau de { name, score, t, won | level }.
 */
'use strict';

const express = require('express');
const { db } = require('../db');
const { HttpError, int, rateLimit } = require('../util');

const GAMES = ['retard', 'cavale'];
const TOP = 100;

function gameParam(req) {
  if (!GAMES.includes(req.params.game)) throw new HttpError(404, 'Jeu inconnu.');
  return req.params.game;
}

function board(game) {
  return db.prepare('SELECT name, score, won, level, t FROM game_scores WHERE game = ? ORDER BY score DESC, t ASC LIMIT ?')
    .all(game, TOP)
    .map((r) => (game === 'retard' ? { name: r.name, score: r.score, won: !!r.won, t: r.t } : { name: r.name, score: r.score, level: r.level, t: r.t }));
}

const publicRouter = express.Router();

publicRouter.get('/games/:game/scores', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(board(gameParam(req)));
});

// 6 scores par minute et par appareil : les jeux affichent « Doucement ! » en cas de code 429
publicRouter.post('/games/:game/scores', rateLimit('game', 6, 60_000), (req, res) => {
  const game = gameParam(req);
  const b = req.body || {};
  const name = String(b.name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  if (!name) throw new HttpError(400, 'Pseudo manquant.');
  const score = int(Math.floor(Number(b.score)), 0, 10_000_000, 'Score');
  const now = Date.now();
  const t = Number.isFinite(+b.t) && Math.abs(+b.t - now) < 86400_000 ? Math.floor(+b.t) : now;
  db.prepare('INSERT INTO game_scores (game, name, score, won, level, t) VALUES (?, ?, ?, ?, ?, ?)')
    .run(game, name, score, b.won ? 1 : 0, Math.max(0, Math.min(999, Math.floor(+b.level) || 0)), t);
  res.json(board(game));
});

/* ---------- Administration ---------- */
const adminRouter = express.Router();

adminRouter.get('/games/scores', (req, res) => {
  const out = {};
  for (const g of GAMES) {
    out[g] = db.prepare('SELECT id, name, score, won, level, created_at FROM game_scores WHERE game = ? ORDER BY score DESC, t ASC LIMIT 50').all(g);
  }
  res.json(out);
});

adminRouter.delete('/games/scores/:id', (req, res) => {
  db.prepare('DELETE FROM game_scores WHERE id = ?').run(int(req.params.id, 1, 1e12));
  res.json({ ok: true });
});

adminRouter.delete('/games/:game/scores', (req, res) => {
  db.prepare('DELETE FROM game_scores WHERE game = ?').run(gameParam(req));
  res.json({ ok: true });
});

module.exports = { publicRouter, adminRouter };
