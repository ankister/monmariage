/**
 * Le combat des témoins — jeu de combat en relais entre les témoins du marié et ceux de la mariée.
 * Prénoms des mariés et témoins : attributs data-* de <body>, remplis au démarrage du conteneur
 * (PRENOM_MARIE, PRENOM_MARIEE, TEMOINS_MARIE, TEMOINS_MARIEE). Musique et sons synthétisés (Web Audio).
 */
'use strict';
{
/* =====================================================================
   Configuration : noms des mariés et des témoins
   ===================================================================== */
const W = 960, H = 540, GROUND = 468, WALL_L = 40, WALL_R = 920;
const $ = (s) => document.querySelector(s);

/* Format d'un témoin : Prénom:Sexe[:Peau[:Cheveux]]
   Sexe H ou F ; Peau 1 (très claire) à 6 (foncée) ; Cheveux : noir, brun, chatain, blond, roux, gris, blanc, chauve.
   Peau et cheveux sont facultatifs : sans eux, ils sont tirés du prénom (toujours les mêmes pour un prénom donné). */
const HAIR_NAMES = { noir: '#1b1310', brun: '#3a2416', chatain: '#7a4a22', 'châtain': '#7a4a22', blond: '#d9b066', roux: '#b5562b', gris: '#a9a5a0', blanc: '#e9e6e1', chauve: 'none' };
function parseWitnesses(str, fallbackSex) {
  return String(str || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 4).map((s) => {
    const [rawName, rawSex, rawSkin, rawHair] = s.split(/\s*[:/]\s*/);
    const sex = /^[HhFf]$/.test(rawSex || '') ? rawSex.toUpperCase() : fallbackSex;
    const skin = /^[1-6]$/.test(rawSkin || '') ? +rawSkin : null;
    const hair = HAIR_NAMES[(rawHair || '').toLowerCase()] || null;
    return { name: (rawName || '').trim().slice(0, 16) || 'Témoin', sex, skin, hair };
  });
}
let CFG;
/** Valeur injectée par le serveur ; marqueur non remplacé ou vide = valeur d'exemple. */
const injected = (v, def) => (!v || /^__[A-Z_]+__$/.test(v) || v.includes('${') ? def : v);
function readCfg() {
  const D = document.body.dataset;
  const marie = injected(D.marie, 'Hugo').slice(0, 20);
  const mariee = injected(D.mariee, 'Léa').slice(0, 20);
  let tm = parseWitnesses(injected(D.tm, 'Julien:H, Camille:F'), 'H');
  let tf = parseWitnesses(injected(D.tf, 'Sarah:F, Thomas:H'), 'F');
  if (!tm.length) tm = [{ name: 'Témoin mystère', sex: 'H' }];
  if (!tf.length) tf = [{ name: 'Témoin mystère', sex: 'F' }];
  CFG = {
    marie: { key: 'marie', bride: marie, label: `Team ${marie}`, long: `les témoins de ${marie}`, members: tm },
    mariee: { key: 'mariee', bride: mariee, label: `Team ${mariee}`, long: `les témoins de ${mariee}`, members: tf },
  };
}

/* Apparence : une palette par équipe, variée selon le témoin */
// Teintes de peau, de la plus claire (1) à la plus foncée (6)
const SKINS = ['#f7dcc4', '#f0c8a2', '#dba67e', '#c08458', '#8f5a38', '#5e3a24'];
const HAIRS = ['#3a2416', '#1b1310', '#7a4a22', '#c08a3e', '#5b3a2a', '#2c1d17'];
const OUTFITS = {
  marie: ['#2c3d66', '#3b4f80', '#26304d', '#43557a'],
  mariee: ['#c4587d', '#a8496c', '#d0789a', '#b65d8a'],
};
const ACCENT = { marie: '#e0b354', mariee: '#f6d9e2' };
function makeLook(team, m, i) {
  const seed = [...m.name].reduce((a, c) => a + c.charCodeAt(0), 0) + i * 7;
  return {
    skin: m.skin ? SKINS[m.skin - 1] : SKINS[seed % SKINS.length],
    hair: m.hair || HAIRS[(seed >> 1) % HAIRS.length],
    outfit: OUTFITS[team][i % 4], accent: ACCENT[team], long: m.sex === 'F',
  };
}

/* =====================================================================
   Sons (synthétisés, aucun fichier)
   ===================================================================== */
let actx = null, soundOn = true;
function beep(type) {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    const p = { hit: [180, 60, .12, 'square', .18], block: [520, 400, .06, 'triangle', .12], swing: [300, 500, .07, 'sine', .05],
      pop: [700, 1400, .15, 'triangle', .14], ko: [220, 55, .7, 'sawtooth', .2], bell: [880, 880, .5, 'sine', .15], go: [440, 880, .25, 'square', .1] }[type];
    o.type = p[3]; o.frequency.setValueAtTime(p[0], t); o.frequency.exponentialRampToValueAtTime(p[1], t + p[2]);
    g.gain.setValueAtTime(p[4], t); g.gain.exponentialRampToValueAtTime(.001, t + p[2]);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + p[2] + .02);
  } catch { soundOn = false; }
}


/* =====================================================================
   Musique de combat : composition originale en style « arcade », jouée par le navigateur
   (synthétiseur Web Audio, aucun fichier). Boucle de 8 mesures en la mineur, 150 battements/min.
   ===================================================================== */
const _ = null;
const SONG = {
  bpm: 150,
  // Fondamentale de chaque mesure (demi-tons par rapport au la 440 Hz) : Am Am F G Am Am F E
  roots: [-12, -12, -16, -14, -12, -12, -16, -17],
  lead: [
    [12, _, 12, 10, 12, _, 7, _, 8, _, 7, _, 3, _, 5, _],
    [7, _, 7, 5, 7, _, 3, _, 5, _, 3, _, 0, _, _, _],
    [8, _, 8, 7, 8, _, 12, _, 15, _, 12, _, 8, _, 7, _],
    [10, _, 10, 8, 10, _, 14, _, 17, _, 15, _, 14, _, 10, _],
    [12, _, 12, 10, 12, _, 7, _, 8, _, 7, _, 3, _, 5, _],
    [7, _, 7, 5, 7, _, 3, _, 5, _, 7, _, 8, _, 10, _],
    [12, _, _, 12, 15, _, 12, _, 8, _, 12, _, 15, _, 17, _],
    [19, _, _, 14, _, _, 11, _, 14, _, 11, _, 7, _, 11, _],
  ],
  chord: { '-12': [0, 3, 7], '-16': [0, 4, 7], '-14': [0, 4, 7], '-17': [0, 4, 7] },
};
const Music = { on: true, playing: false, step: 0, next: 0, timer: null, gain: null, noise: null };
const freq = (n) => 440 * 2 ** (n / 12);
function musicCtx() {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  if (!Music.gain) {
    Music.gain = actx.createGain(); Music.gain.gain.value = .5; Music.gain.connect(actx.destination);
    const len = actx.sampleRate * .3, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    Music.noise = buf;
  }
  return actx;
}
function tone(t, f, dur, type, vol, cutoff) {
  const o = actx.createOscillator(), g = actx.createGain(), lp = actx.createBiquadFilter();
  o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = cutoff || 3000;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  o.connect(lp).connect(g).connect(Music.gain); o.start(t); o.stop(t + dur + .02);
}
function drum(t, kind) {
  if (kind === 'kick') {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + .12);
    g.gain.setValueAtTime(.55, t); g.gain.exponentialRampToValueAtTime(.001, t + .16);
    o.connect(g).connect(Music.gain); o.start(t); o.stop(t + .18);
    return;
  }
  const src = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter();
  src.buffer = Music.noise; f.type = kind === 'snare' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 'snare' ? 1800 : 7000;
  const dur = kind === 'snare' ? .14 : .04;
  g.gain.setValueAtTime(kind === 'snare' ? .32 : .12, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  src.connect(f).connect(g).connect(Music.gain); src.start(t); src.stop(t + dur + .01);
}
function playStep(i, t) {
  const bar = Math.floor(i / 16) % 8, s16 = i % 16, root = SONG.roots[bar], six = 60 / SONG.bpm / 4;
  // Batterie : grosse caisse, caisse claire, charleston
  if (s16 === 0 || s16 === 8 || s16 === 10) drum(t, 'kick');
  if (s16 === 4 || s16 === 12) drum(t, 'snare');
  if (s16 % 2 === 0) drum(t, 'hat');
  // Basse en octaves sur chaque croche
  if (s16 % 2 === 0) tone(t, freq(root - 12 + (s16 % 4 === 2 ? 12 : 0)), six * 1.8, 'square', .16, 900);
  // Arpège discret des accords
  const ch = SONG.chord[root];
  tone(t, freq(root + 12 + ch[s16 % 3]), six * .9, 'triangle', .05, 4000);
  // Mélodie principale
  const n = SONG.lead[bar][s16];
  if (n !== null) tone(t, freq(n), six * 2.2, 'sawtooth', .1, 2600);
}
function musicStart() {
  if (!Music.on || Music.playing) return;
  try { musicCtx(); if (actx.state === 'suspended') actx.resume(); } catch { return; }
  Music.playing = true; Music.step = 0; Music.next = actx.currentTime + .08;
  Music.gain.gain.cancelScheduledValues(actx.currentTime); Music.gain.gain.setValueAtTime(.5, actx.currentTime);
  const six = 60 / SONG.bpm / 4;
  Music.timer = setInterval(() => {
    while (Music.next < actx.currentTime + .15) { playStep(Music.step, Music.next); Music.next += six; Music.step = (Music.step + 1) % 128; }
  }, 25);
}
function musicStop(fade = .4) {
  if (!Music.playing) return;
  Music.playing = false; clearInterval(Music.timer);
  try { Music.gain.gain.setTargetAtTime(.0001, actx.currentTime, fade / 3); setTimeout(() => { if (!Music.playing) Music.gain.gain.value = .5; }, fade * 1000 + 300); } catch { /* rien */ }
}
/** Petite fanfare de victoire. */
function fanfare() {
  if (!Music.on) return;
  try { musicCtx(); } catch { return; }
  const t0 = actx.currentTime + .5;
  [[0, .15], [4, .15], [7, .15], [12, .45], [7, .15], [12, .9]].reduce((t, [n, d]) => { tone(t, freq(n + 3), d * 1.1, 'square', .12, 3000); tone(t, freq(n - 9), d * 1.1, 'triangle', .1, 2000); return t + d; }, t0);
}

/* =====================================================================
   Commandes : clavier, tactile, ordinateur
   ===================================================================== */
const KEYMAP = {
  solo: { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW', 'Space'], block: ['ArrowDown', 'KeyS'],
    punch: ['KeyJ', 'KeyF'], kick: ['KeyK', 'KeyG'], special: ['KeyL', 'KeyH'] },
  p1: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], block: ['KeyS'], punch: ['KeyF'], kick: ['KeyG'], special: ['KeyH'] },
  p2: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], block: ['ArrowDown'], punch: ['KeyK', 'Numpad1'], kick: ['KeyL', 'Numpad2'], special: ['Semicolon', 'KeyM', 'Numpad3'] },
};
const down = new Set();
const touch = {};
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input')) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
  if (game && game.running && /Arrow|Space/.test(e.code)) e.preventDefault();
  down.add(e.code);
});
addEventListener('keyup', (e) => down.delete(e.code));
addEventListener('blur', () => down.clear());
$('#pad').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-k]'); if (!b) return;
  e.preventDefault(); b.setPointerCapture(e.pointerId); touch[b.dataset.k] = true; b.classList.add('on');
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('#pad').addEventListener(ev, (e) => { const b = e.target.closest('[data-k]'); if (!b) return; touch[b.dataset.k] = false; b.classList.remove('on'); });
}
function readKeys(map, withTouch) {
  const r = {};
  for (const k in map) r[k] = map[k].some((c) => down.has(c)) || (withTouch && !!touch[k]);
  return r;
}

/* =====================================================================
   Combattants
   ===================================================================== */
const MOVES = {
  punch: { start: 4, active: 4, rec: 9, dmg: 5, reach: 66, top: 128, bot: 98, stun: 14, bstun: 9, push: 5 },
  kick: { start: 8, active: 5, rec: 15, dmg: 9, reach: 88, top: 90, bot: 52, stun: 19, bstun: 12, push: 9 },
  air: { start: 4, active: 14, rec: 4, dmg: 8, reach: 74, top: 80, bot: 30, stun: 17, bstun: 10, push: 7 },
  special: { start: 12, active: 1, rec: 18 },
};

class Fighter {
  constructor(team, member, idx, side) {
    this.team = team; this.name = member.name; this.sex = member.sex; this.idx = idx;
    this.look = makeLook(team, member, idx);
    this.reset(side);
    this.hp = 100; this.energy = 20; this.hits = 0; this.dealt = 0;
  }
  reset(side) {
    this.x = side < 0 ? 250 : 710; this.y = GROUND; this.vx = 0; this.vy = 0;
    this.face = side < 0 ? 1 : -1; this.state = 'idle'; this.t = 0; this.move = null; this.hasHit = false;
    this.stun = 0; this.anim = 0; this.blocking = false; this.prev = {}; this.combo = 0;
  }
  get air() { return this.y < GROUND - 0.5; }
  busy() { return ['attack', 'hit', 'ko', 'win', 'enter'].includes(this.state); }
}

/* =====================================================================
   Partie
   ===================================================================== */
let game = null;
const cv = $('#cv'), ctx = cv.getContext('2d'), mainCtx = ctx;
function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();

function newGame(playerTeam, mode) {
  const other = playerTeam === 'marie' ? 'mariee' : 'marie';
  const left = mode === 2 ? 'marie' : playerTeam, right = mode === 2 ? 'mariee' : other;
  const teams = [left, right].map((key, s) => ({
    key, cfg: CFG[key], ctrl: mode === 2 ? (s === 0 ? 'p1' : 'p2') : (s === 0 ? 'solo' : 'cpu'),
    roster: CFG[key].members.map((m, i) => new Fighter(key, m, i, s ? 1 : -1)), cur: 0,
  }));
  game = { mode, playerTeam: left, teams, projectiles: [], sparks: [], texts: [], bout: 1, timer: 60 * 60,
    phase: 'intro', phaseT: 0, shake: 0, slow: 0, running: true, paused: false, frames: 0, ai: [{}, {}], aiT: [0, 0], winner: null };
  startBout(true);
  $('#menu').hidden = true; $('#end').hidden = true;
  musicStop(.05); setTimeout(musicStart, 120);
}
const fighterOf = (s) => game.teams[s].roster[game.teams[s].cur];

function startBout(first) {
  const [a, b] = [fighterOf(0), fighterOf(1)];
  for (const [f, s] of [[a, -1], [b, 1]]) {
    const keepX = !first && f.state !== 'enter' && f.hp > 0 && f.entered;
    if (!keepX) f.reset(s);
    else { f.state = 'idle'; f.t = 0; f.move = null; f.stun = 0; }
    f.entered = true;
  }
  game.timer = 60 * 60; game.phase = 'intro'; game.phaseT = 0; game.projectiles = [];
  beep('bell');
}

/* ---------- Physique et coups ---------- */
function act(f, o, inp, s) {
  const p = f.prev; const pressed = (k) => inp[k] && !p[k];
  f.prev = { ...inp };
  if (f.state === 'ko' || f.state === 'win') return;
  if (f.state === 'hit') { if (--f.stun <= 0 && !f.air) f.state = 'idle'; return; }
  if (f.state === 'blockstun') { f.vx *= .8; if (--f.stun <= 0) f.state = 'idle'; return; }
  if (f.state === 'attack') {
    f.t++;
    const m = MOVES[f.move];
    if (f.move === 'special' && f.t === m.start) spawnProjectile(f);
    if (f.move !== 'air' && f.t >= m.start + m.active + m.rec) { f.state = 'idle'; f.move = null; }
    if (f.move === 'air' && !f.air) { f.state = 'idle'; f.move = null; }
    if (!f.air) f.vx *= .7;
    return;
  }
  // Orientation vers l'adversaire
  if (!f.air) f.face = o.x >= f.x ? 1 : -1;
  const back = f.face === 1 ? inp.left : inp.right;
  f.blocking = !f.air && (inp.block || (back && o.state === 'attack'));
  if (pressed('special') && f.energy >= 50 && !f.air) return startMove(f, 'special');
  if (pressed('punch') && !f.air) return startMove(f, 'punch');
  if (pressed('kick')) return startMove(f, f.air ? 'air' : 'kick');
  if (f.air) return;
  if (inp.block) { f.vx = 0; f.state = 'block'; return; }
  if (pressed('up')) { f.vy = -16.5; f.vx = (inp.right - inp.left) * 4.6; f.state = 'jump'; return; }
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  f.vx = dir * (dir === f.face ? 4.4 : 3.3);
  f.state = dir ? 'walk' : 'idle';
}
function startMove(f, m) {
  f.state = 'attack'; f.move = m; f.t = 0; f.hasHit = false; f.blocking = false;
  if (m === 'special') { f.energy -= 50; beep('pop'); } else beep('swing');
}
function spawnProjectile(f) {
  game.projectiles.push({ x: f.x + f.face * 50, y: f.y - 104, vx: f.face * 8.5, owner: f, kind: f.sex === 'F' ? 'bouquet' : 'bouchon', life: 120, rot: 0 });
}
function physics(f) {
  if (f.state === 'enter') {
    f.x += f.face * 4; if ((f.face === 1 && f.x >= 250) || (f.face === -1 && f.x <= 710)) { f.state = 'idle'; }
    f.anim++; return;
  }
  f.vy += .9; f.x += f.vx; f.y += f.vy;
  if (f.y >= GROUND) { f.y = GROUND; f.vy = 0; if (f.state === 'jump') f.state = 'idle'; if (f.state === 'hit' && f.stun <= 0) f.state = 'idle'; }
  f.x = Math.max(WALL_L, Math.min(WALL_R, f.x));
  f.anim++;
}
function hurtbox(f) { return { x1: f.x - 24, x2: f.x + 24, y1: f.y - (f.state === 'block' ? 140 : 150), y2: f.y }; }
function overlap(a, b) { return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1; }

function resolveHits(f, o) {
  if (f.state !== 'attack' || f.move === 'special' || f.hasHit) return;
  const m = MOVES[f.move];
  if (f.t < m.start || f.t >= m.start + m.active) return;
  const reachX = f.x + f.face * m.reach;
  const box = { x1: Math.min(f.x, reachX), x2: Math.max(f.x, reachX), y1: f.y - m.top, y2: f.y - m.bot };
  if (!overlap(box, hurtbox(o)) || o.state === 'ko') return;
  f.hasHit = true;
  applyHit(o, f, m.dmg, m.stun, m.bstun, m.push * f.face, reachX - f.face * 10, f.y - (m.top + m.bot) / 2);
}
function applyHit(o, f, dmg, stun, bstun, push, hx, hy) {
  const blocked = o.blocking && !o.air && (o.state === 'block' || o.state === 'idle' || o.state === 'walk' || o.state === 'blockstun');
  if (blocked) {
    o.hp -= Math.max(1, dmg * .15); o.state = 'blockstun'; o.stun = bstun; o.vx = push * .6;
    o.energy = Math.min(100, o.energy + 3); spark(hx, hy, '#cfe3ff', 6); beep('block');
  } else {
    o.hp -= dmg; o.state = 'hit'; o.stun = stun; o.vx = push; if (o.air) o.vy = -4;
    f.combo = (o.combo_from === f && o.recent > 0) ? f.combo + 1 : 1; o.combo_from = f; o.recent = stun + 8;
    f.hits++; f.dealt += dmg;
    f.energy = Math.min(100, f.energy + 7); o.energy = Math.min(100, o.energy + 4);
    spark(hx, hy, '#ffe28a', 12); beep('hit'); game.shake = 6;
    if (f.combo >= 2) floatText(`${f.combo} coups !`, f.x, f.y - 190, '#ffe28a');
  }
  if (o.hp <= 0) { o.hp = 0; ko(o, f); }
}
function projectiles() {
  for (const p of game.projectiles) {
    p.x += p.vx; p.rot += .3; p.life--;
    const target = [fighterOf(0), fighterOf(1)].find((f) => f !== p.owner);
    if (target && target.state !== 'ko' && overlap({ x1: p.x - 16, x2: p.x + 16, y1: p.y - 16, y2: p.y + 16 }, hurtbox(target))) {
      applyHit(target, p.owner, 13, 20, 12, Math.sign(p.vx) * 10, p.x, p.y);
      p.life = 0;
    }
    // Deux projectiles se neutralisent
    for (const q of game.projectiles) if (q !== p && q.life > 0 && p.life > 0 && Math.abs(q.x - p.x) < 24 && q.owner !== p.owner) {
      p.life = q.life = 0; spark(p.x, p.y, '#fff', 14); beep('pop');
    }
    if (p.x < 0 || p.x > W) p.life = 0;
  }
  game.projectiles = game.projectiles.filter((p) => p.life > 0);
}
function separate(a, b) {
  const d = b.x - a.x, min = 46;
  if (Math.abs(d) < min && Math.abs(a.y - b.y) < 120 && a.state !== 'ko' && b.state !== 'ko') {
    const push = (min - Math.abs(d)) / 2 * (d >= 0 ? 1 : -1);
    a.x -= push; b.x += push;
    a.x = Math.max(WALL_L, Math.min(WALL_R, a.x)); b.x = Math.max(WALL_L, Math.min(WALL_R, b.x));
  }
}
function spark(x, y, c, n) {
  for (let i = 0; i < n; i++) game.sparks.push({ x, y, vx: (Math.random() - .5) * 9, vy: (Math.random() - .7) * 8, life: 18 + Math.random() * 10, c });
}
function floatText(txt, x, y, c) { game.texts.push({ txt, x, y, c, life: 50 }); }

function ko(o, f) {
  o.state = 'ko'; o.vy = -7; o.vx = f.face * 5; o.stun = 999;
  game.phase = 'ko'; game.phaseT = 0; game.slow = 50; game.shake = 14; beep('ko');
  game.lastKO = { loser: o, winner: f };
}

/* ---------- Intelligence de l'ordinateur ---------- */
function cpu(s) {
  const f = fighterOf(s), o = fighterOf(1 - s);
  const lvl = Math.min(.92, .5 + (game.bout - 1) * .07 + fighterOf(1).idx * .04);
  const intent = game.ai[s];
  // Les coups sont des appuis brefs
  intent.punch = intent.kick = intent.special = intent.up = false;
  if (--game.aiT[s] > 0) return intent;
  const dist = Math.abs(o.x - f.x), toward = o.x > f.x ? 'right' : 'left', away = toward === 'right' ? 'left' : 'right';
  Object.assign(intent, { left: false, right: false, block: false });
  const proj = game.projectiles.find((p) => p.owner !== f && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(f.x - p.x) < 230);
  const r = Math.random();
  game.aiT[s] = Math.round(16 - lvl * 10 + Math.random() * 8);
  if (proj && r < lvl) { if (Math.random() < .55) intent.up = true; else intent.block = true; return intent; }
  if (o.state === 'attack' && dist < 120 && r < lvl * .55) { intent.block = true; game.aiT[s] = 14; return intent; }
  if (dist > 280 && f.energy >= 50 && r < .3 + lvl * .2) { intent.special = true; return intent; }
  if (dist > 100) {
    intent[toward] = true;
    if (Math.random() < .08) { intent.up = true; }
    game.aiT[s] = 6 + Math.round(Math.random() * 8);
    return intent;
  }
  const c = Math.random();
  if (c < .42) intent.punch = true;
  else if (c < .74) intent.kick = true;
  else if (c < .84) { intent[away] = true; game.aiT[s] = 12; }
  else if (c < .92) { intent.up = true; intent[toward] = true; game.aiKickSoon = s; }
  else { intent.block = true; }
  return intent;
}

/* ---------- Boucle principale ---------- */
let last = 0, acc = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(100, ts - last); last = ts;
  if (!game) { drawScene(); drawMenuScene(); return; }
  if (game.running && !game.paused) {
    acc += dt;
    while (acc >= 1000 / 60) { acc -= 1000 / 60; if (game.slow > 0 && game.slow-- % 2) continue; step(); }
  }
  draw();
}

function inputs(s) {
  const t = game.teams[s];
  if (t.ctrl === 'cpu') {
    const i = cpu(s);
    const f = fighterOf(s);
    if (game.aiKickSoon === s && f.air && f.vy > -6) { i.kick = true; game.aiKickSoon = null; }
    return i;
  }
  return readKeys(KEYMAP[t.ctrl], t.ctrl !== 'p2');
}

function step() {
  game.frames++;
  const a = fighterOf(0), b = fighterOf(1);
  if (game.phase === 'intro') {
    game.phaseT++;
    for (const f of [a, b]) physics(f);
    if (game.phaseT === 100) beep('go');
    if (game.phaseT >= 120 && a.state !== 'enter' && b.state !== 'enter') { game.phase = 'fight'; game.phaseT = 0; }
  } else if (game.phase === 'fight') {
    act(a, b, inputs(0), 0); act(b, a, inputs(1), 1);
    for (const f of [a, b]) physics(f);
    separate(a, b);
    resolveHits(a, b); resolveHits(b, a);
    projectiles();
    for (const f of [a, b]) if (f.recent > 0) f.recent--;
    if (--game.timer <= 0) timeUp(a, b);
  } else if (game.phase === 'ko') {
    game.phaseT++;
    for (const f of [a, b]) physics(f);
    if (game.phaseT === 50) {
      const w = game.lastKO.winner; w.state = 'win'; w.anim = 0;
    }
    if (game.phaseT >= 150) nextFighter();
  }
  for (const sp of game.sparks) { sp.x += sp.vx; sp.y += sp.vy; sp.vy += .4; sp.life--; }
  game.sparks = game.sparks.filter((s) => s.life > 0);
  for (const t of game.texts) { t.y -= .8; t.life--; }
  game.texts = game.texts.filter((t) => t.life > 0);
  if (game.shake > 0) game.shake--;
}
function timeUp(a, b) {
  const loser = a.hp === b.hp ? (Math.random() < .5 ? a : b) : (a.hp < b.hp ? a : b);
  floatText('Temps écoulé !', W / 2, 200, '#ffe28a');
  loser.hp = 0; ko(loser, loser === a ? b : a);
}
function nextFighter() {
  const { loser, winner } = game.lastKO;
  const s = game.teams[0].roster.includes(loser) ? 0 : 1;
  const t = game.teams[s];
  t.cur++;
  if (t.cur >= t.roster.length) { t.cur = t.roster.length - 1; return finish(1 - s); }
  // Le vainqueur récupère un peu et reste en place ; le témoin suivant entre en courant
  winner.hp = Math.min(100, winner.hp + 25); winner.state = 'idle';
  const n = fighterOf(s);
  n.reset(s ? 1 : -1); n.x = s ? W + 60 : -60; n.state = 'enter'; n.face = s ? -1 : 1; n.entered = true;
  winner.x = s ? Math.min(winner.x, 560) : Math.max(winner.x, 400);
  game.bout++;
  game.timer = 60 * 60; game.phase = 'intro'; game.phaseT = 0; game.projectiles = [];
  beep('bell');
}
function finish(ws) {
  game.running = false; game.winner = ws;
  musicStop(.8); fanfare();
  const wt = game.teams[ws], lt = game.teams[1 - ws];
  const all = [...game.teams[0].roster, ...game.teams[1].roster];
  const mvp = all.reduce((m, f) => (f.dealt > m.dealt ? f : m), all[0]);
  const survivors = wt.roster.filter((f) => f.hp > 0).length;
  $('#endTitle').textContent = `Victoire des témoins de ${wt.cfg.bride} !`;
  const you = game.mode === 1 ? (ws === 0 ? 'Bravo, ton équipe l’emporte !' : `Perdu : ${wt.cfg.long} gardent l’honneur… pour cette fois.`) : '';
  $('#endText').textContent = `${you} ${lt.cfg.label} s’incline en ${game.bout} combat${game.bout > 1 ? 's' : ''}.`.trim();
  $('#endStats').innerHTML = [
    ['Meilleur témoin', mvp.name],
    ['Témoins encore debout', `${survivors} / ${wt.roster.length}`],
    ['Durée', `${Math.round(game.frames / 60)} s`],
  ].map(([l, v]) => `<div><b>${esc(v)}</b>${esc(l)}</div>`).join('');
  // Score (1 joueur) : victoire = 1000 + témoins debout + vie restante + rapidité ; défaite = dégâts infligés
  const mine = game.teams[0], secs = Math.round(game.frames / 60);
  lastScore = null;
  if (game.mode === 1) {
    const won = ws === 0;
    const score = won
      ? 1000 + survivors * 400 + Math.round(mine.roster.reduce((s, f) => s + f.hp, 0) * 5) + Math.max(0, 240 - secs) * 3
      : Math.round(mine.roster.reduce((s, f) => s + f.dealt, 0) * 4);
    if (score > 0) lastScore = { score, won, level: mine.key === 'mariee' ? 2 : 1 };
    $('#scoreTxt').textContent = score.toLocaleString('fr-FR');
    $('#pseudo').value = readPseudo();
  }
  saved = false;
  $('#saveForm').hidden = !lastScore; $('#saveMsg').textContent = '';
  setTimeout(() => { $('#end').hidden = false; (lastScore ? $('#pseudo') : $('#again')).focus(); }, 300);
}

/* ---------- Tableau d'honneur (partagé via l'API du site, sinon sur l'appareil) ---------- */
const API = 'api/scores', LS_SCORES = 'jeu-temoins-scores', LS_NAME = 'jeu-pseudo';
let board = [], online = false, lastEntry = null, lastScore = null, saved = false;
function readPseudo() { try { return localStorage.getItem(LS_NAME) || ''; } catch { return ''; } }
function readLocal() { try { const a = JSON.parse(localStorage.getItem(LS_SCORES) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function writeLocal(a) { try { localStorage.setItem(LS_SCORES, JSON.stringify(a)); } catch { /* stockage indisponible */ } }
const sortBoard = (a) => a.filter((x) => x && typeof x.name === 'string' && Number.isFinite(x.score)).sort((a, b) => b.score - a.score || a.t - b.t);
const teamLabel = (e) => `Team ${e.level === 2 ? CFG.mariee.bride : CFG.marie.bride}${e.won ? ' · victoire' : ''}`;
async function loadBoard() {
  try {
    const r = await fetch(API, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!r.ok) throw 0; const j = await r.json(); if (!Array.isArray(j)) throw 0;
    online = true; board = sortBoard(j);
  } catch { online = false; board = sortBoard(readLocal()); }
  renderBoard();
}
function renderBoard() {
  $('#boardNote').textContent = online ? 'Classement partagé entre tous les invités (parties à 1 joueur).' : 'Scores enregistrés sur cet appareil.';
  const ol = $('#boardList'); ol.textContent = '';
  if (!board.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Aucun score pour l’instant. Défends l’honneur de ton équipe !'; ol.append(li); return; }
  board.slice(0, 10).forEach((e, i) => {
    const li = document.createElement('li');
    if (lastEntry && e.t === lastEntry.t && e.name === lastEntry.name) li.className = 'me';
    const c = (cls, txt) => { const sp = document.createElement('span'); sp.className = cls; sp.textContent = txt; li.append(sp); };
    c('rk', (i + 1) + (i ? 'e' : 'er')); c('nm', e.name); c('st', teamLabel(e)); c('sc', Math.floor(e.score).toLocaleString('fr-FR'));
    ol.append(li);
  });
}
const rankOf = (e) => board.findIndex((x) => x === e || (x.t === e.t && x.name === e.name)) + 1;
async function saveScore(name) {
  const entry = { name, ...lastScore, t: Date.now() };
  if (online) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
      if (r.ok) {
        board = sortBoard(await r.json());
        lastEntry = board.find((e) => e.name === entry.name && e.score === entry.score && Math.abs(e.t - entry.t) < 60000) || entry;
        renderBoard(); return rankOf(lastEntry);
      }
      if (r.status === 429) return -2;
    } catch { /* hors ligne */ }
  }
  const l = sortBoard(readLocal().concat(entry)).slice(0, 100); writeLocal(l);
  if (!online) board = l; lastEntry = entry; renderBoard();
  return online ? -1 : rankOf(entry);
}
$('#saveForm').addEventListener('submit', async (ev) => {
  ev.preventDefault(); if (saved || !lastScore) return;
  const name = $('#pseudo').value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  if (!name) { $('#pseudo').focus(); return; }
  try { localStorage.setItem(LS_NAME, name); } catch { /* rien */ }
  saved = true; $('#saveForm').hidden = true; $('#saveMsg').textContent = 'Enregistrement…';
  const rk = await saveScore(name);
  try { if (window.parent !== window) parent.postMessage({ jeu: 'score' }, '*'); } catch { /* rien */ }
  $('#saveMsg').textContent = rk > 0 ? `Score enregistré, ${name} : ${rk === 1 ? '1re' : rk + 'e'} place !`
    : rk === -2 ? 'Doucement ! Réessaie dans quelques secondes.'
    : rk === -1 ? 'Le classement partagé ne répond pas : score gardé sur cet appareil.' : 'Score enregistré.';
  if (rk === -2) { saved = false; $('#saveForm').hidden = false; }
  $('#again').focus();
});
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* =====================================================================
   Dessin
   ===================================================================== */
const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
(function paintBackground() {
  const g = bg.getContext('2d');
  // Mur et lumière chaude
  let gr = g.createLinearGradient(0, 0, 0, 330);
  gr.addColorStop(0, '#2a0f24'); gr.addColorStop(1, '#5a2346');
  g.fillStyle = gr; g.fillRect(0, 0, W, 340);
  // Poutres
  g.fillStyle = '#1f0a19';
  for (let x = -20; x < W; x += 160) g.fillRect(x, 0, 18, 330);
  g.fillRect(0, 40, W, 14);
  // Fenêtres en arc avec nuit étoilée
  for (const x of [120, 400, 680]) {
    g.save(); g.beginPath(); g.moveTo(x, 260); g.lineTo(x, 130); g.arc(x + 80, 130, 80, Math.PI, 0); g.lineTo(x + 160, 260); g.closePath();
    const wg = g.createLinearGradient(0, 50, 0, 260); wg.addColorStop(0, '#16163a'); wg.addColorStop(1, '#3b2a5a');
    g.fillStyle = wg; g.fill(); g.clip();
    g.fillStyle = '#fff8';
    for (let i = 0; i < 14; i++) g.fillRect(x + ((i * 53) % 160), 60 + ((i * 37) % 190), 2, 2);
    g.restore();
    g.strokeStyle = '#e0b35466'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x, 260); g.lineTo(x, 130); g.arc(x + 80, 130, 80, Math.PI, 0); g.lineTo(x + 160, 260); g.stroke();
    g.beginPath(); g.moveTo(x + 80, 50); g.lineTo(x + 80, 260); g.moveTo(x, 170); g.lineTo(x + 160, 170); g.stroke();
  }
  // Table d'honneur et pièce montée
  g.fillStyle = '#f4ece6'; g.fillRect(260, 286, 440, 52);
  g.fillStyle = '#e4d6cf'; g.fillRect(260, 330, 440, 8);
  g.fillStyle = '#e0b354'; for (let x = 270; x < 700; x += 40) { g.beginPath(); g.arc(x, 300, 4, 0, 7); g.fill(); }
  const cake = [[480, 252, 70, 34], [480, 226, 52, 28], [480, 204, 36, 24]];
  for (const [cx, cy, w, h] of cake) { g.fillStyle = '#fffaf4'; g.fillRect(cx - w / 2, cy, w, h); g.fillStyle = '#f3c6cf'; g.fillRect(cx - w / 2, cy + h - 6, w, 4); }
  g.fillStyle = '#e0b354'; g.fillRect(476, 190, 8, 14);
  // Bougies
  for (const x of [330, 400, 560, 630]) { g.fillStyle = '#fffaf4'; g.fillRect(x - 3, 266, 6, 20); g.fillStyle = '#ffd27a'; g.beginPath(); g.ellipse(x, 261, 4, 7, 0, 0, 7); g.fill(); }
  // Parquet en perspective
  gr = g.createLinearGradient(0, 338, 0, H);
  gr.addColorStop(0, '#6b3b23'); gr.addColorStop(1, '#3b1d10');
  g.fillStyle = gr; g.fillRect(0, 338, W, H - 338);
  g.strokeStyle = '#2a120a88'; g.lineWidth = 1.5;
  for (let i = -12; i <= 12; i++) { g.beginPath(); g.moveTo(W / 2 + i * 30, 338); g.lineTo(W / 2 + i * 140, H); g.stroke(); }
  for (const y of [360, 390, 428, 476, 530]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // Halo de la piste de danse
  gr = g.createRadialGradient(W / 2, GROUND, 20, W / 2, GROUND, 420);
  gr.addColorStop(0, '#ffe2a855'); gr.addColorStop(1, '#ffe2a800');
  g.fillStyle = gr; g.fillRect(0, 338, W, H - 338);
})();

function drawLights(t) {
  // Guirlande lumineuse animée
  ctx.strokeStyle = '#1a0a14'; ctx.lineWidth = 2;
  for (let k = 0; k < 2; k++) {
    const y0 = 70 + k * 26;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, y0 + Math.sin(x / 120 + k) * 22);
    ctx.stroke();
    for (let x = 20 + k * 30; x < W; x += 60) {
      const y = y0 + Math.sin(x / 120 + k) * 22 + 8;
      const glow = .6 + .4 * Math.sin(t / 20 + x);
      ctx.fillStyle = `rgba(255,214,140,${.18 * glow})`; ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,228,170,${.7 + .3 * glow})`; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
    }
  }
}

function drawScene() {
  ctx.drawImage(bg, 0, 0, W, H);
  drawLights(performance.now() / 16);
}

/** Dessine un témoin : costume pour les hommes, robe pour les femmes, couleur de l'équipe. */
function drawFighter(f, opts = {}, ctx = mainCtx) {
  const L = f.look, st = f.state, a = f.anim;
  ctx.save();
  ctx.translate(f.x, f.y);
  // Ombre au sol
  if (!opts.noShadow) {
    ctx.fillStyle = '#0006';
    const sh = Math.max(.4, 1 - (GROUND - f.y) / 200);
    ctx.beginPath(); ctx.ellipse(0, GROUND - f.y, 34 * sh, 8 * sh, 0, 0, 7); ctx.fill();
  }
  ctx.scale(f.face, 1);
  if (st === 'ko' && !f.air) { ctx.rotate(-Math.PI / 2 * Math.min(1, f.stun > 0 ? 1 : 1)); ctx.translate(0, -18); }
  else if (st === 'hit') ctx.rotate(-.18);
  const bob = st === 'idle' || st === 'block' ? Math.sin(a / 9) * 2 : 0;
  const crouch = st === 'block' || st === 'blockstun' ? 10 : 0;
  const hipY = -62 + crouch, shY = -112 + bob + crouch, headY = -134 + bob + crouch;
  const m = f.move, tt = f.t;
  const swing = st === 'walk' ? Math.sin(a / 5) : 0;
  const atkPhase = st === 'attack' ? Math.min(1, tt / (MOVES[m].start || 1)) : 0;

  // ---- Jambes ----
  const legColor = L.long ? L.skin : L.outfit;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const leg = (fx, fy, kx, ky, w) => {
    ctx.strokeStyle = legColor; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = L.long ? '#e0b354' : '#1b1414';
    ctx.beginPath(); ctx.ellipse(fx + 6, fy - 2, 11, 5, 0, 0, 7); ctx.fill();
  };
  if (f.air || st === 'jump') {
    leg(-12, hipY + 40, -2, hipY + 26, L.long ? 8 : 13);
    if (m === 'air' && st === 'attack') leg(62, hipY + 18, 30, hipY + 12, L.long ? 8 : 13);
    else leg(14, hipY + 42, 18, hipY + 22, L.long ? 8 : 13);
  } else if (st === 'attack' && m === 'kick') {
    const k = tt < MOVES.kick.start ? atkPhase : (tt < MOVES.kick.start + MOVES.kick.active ? 1 : .5);
    leg(-14, 0, -8, hipY + 32, L.long ? 8 : 13);
    leg(20 + 60 * k, hipY - 10 * k + 50 * (1 - k), 22 + 18 * k, hipY + 20 - 14 * k, L.long ? 8 : 13);
  } else if (st === 'ko') {
    leg(-10, 0, -6, hipY + 32, 12); leg(14, 0, 10, hipY + 32, 12);
  } else {
    leg(-14 + swing * 14, 0, -8 + swing * 6, hipY + 32 - crouch / 2, L.long ? 8 : 13);
    leg(14 - swing * 14, 0, 10 - swing * 6, hipY + 32 - crouch / 2, L.long ? 8 : 13);
  }

  // ---- Corps : robe ou costume ----
  if (L.long) {
    ctx.fillStyle = L.outfit;
    ctx.beginPath(); ctx.moveTo(-18, hipY - 4); ctx.lineTo(18, hipY - 4); ctx.lineTo(30, hipY + 40); ctx.quadraticCurveTo(0, hipY + 48, -30, hipY + 40); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-17, shY, 34, hipY - shY + 4, 10); ctx.fill();
    ctx.fillStyle = L.accent; ctx.fillRect(-17, hipY - 8, 34, 5);
  } else {
    ctx.fillStyle = L.outfit;
    ctx.beginPath(); ctx.roundRect(-19, shY, 38, hipY - shY + 10, 9); ctx.fill();
    ctx.fillStyle = '#fbf7f2';
    ctx.beginPath(); ctx.moveTo(-8, shY); ctx.lineTo(8, shY); ctx.lineTo(0, shY + 26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = f.team === 'marie' ? '#e0b354' : '#e892b2';
    ctx.beginPath(); ctx.moveTo(-3, shY + 3); ctx.lineTo(3, shY + 3); ctx.lineTo(4, shY + 24); ctx.lineTo(0, shY + 28); ctx.lineTo(-4, shY + 24); ctx.closePath(); ctx.fill();
    // Boutonnière
    ctx.fillStyle = L.accent; ctx.beginPath(); ctx.arc(11, shY + 12, 4, 0, 7); ctx.fill();
  }

  // ---- Bras ----
  const armW = L.long ? 7 : 10, sleeve = L.long ? L.skin : L.outfit;
  const arm = (hx, hy, ex, ey) => {
    ctx.strokeStyle = sleeve; ctx.lineWidth = armW;
    ctx.beginPath(); ctx.moveTo(0, shY + 8); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(hx, hy, 6, 0, 7); ctx.fill();
  };
  if (st === 'attack' && m === 'punch') {
    const k = tt < MOVES.punch.start ? atkPhase : (tt < MOVES.punch.start + MOVES.punch.active ? 1 : .4);
    arm(-8, shY + 30, -14, shY + 18);
    arm(20 + 44 * k, shY + 10, 12 + 20 * k, shY + 10);
  } else if (st === 'attack' && m === 'special') {
    const k = Math.min(1, tt / MOVES.special.start);
    arm(10 + 40 * k, shY + 4 - 20 * (1 - k), 10 + 18 * k, shY + 2);
    arm(6 + 36 * k, shY + 12, 8 + 14 * k, shY + 12);
  } else if (st === 'block' || st === 'blockstun') {
    arm(22, shY - 12, 18, shY + 12); arm(16, shY - 4, 12, shY + 18);
  } else if (st === 'win') {
    arm(10, shY - 50 - Math.abs(Math.sin(a / 8)) * 6, 6, shY - 22); arm(-14, shY + 34, -14, shY + 18);
  } else if (st === 'hit' || st === 'ko') {
    arm(-26, shY - 6, -16, shY + 6); arm(-18, shY + 30, -18, shY + 14);
  } else {
    arm(18 + swing * 6, shY + 34, 12, shY + 20); arm(-14 - swing * 6, shY + 34, -12, shY + 20);
  }

  // ---- Tête ----
  const bald = L.hair === 'none';
  if (L.long && !bald) { // cheveux longs, dans le dos (côté opposé au regard)
    ctx.fillStyle = L.hair;
    ctx.beginPath(); ctx.roundRect(-21, headY - 8, 18, 40, 9); ctx.fill();
  }
  ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(0, headY, 16, 0, 7); ctx.fill();
  ctx.fillStyle = bald ? L.skin : L.hair;
  if (!bald) { ctx.beginPath(); ctx.arc(0, headY - 3, 16.5, Math.PI * 1.02, Math.PI * 2.02); ctx.fill(); }
  if (bald) { ctx.fillStyle = '#ffffff40'; ctx.beginPath(); ctx.ellipse(-4, headY - 10, 6, 3, -.4, 0, 7); ctx.fill(); }
  else if (L.long) { ctx.beginPath(); ctx.arc(-12, headY - 12, 8, 0, 7); ctx.fill(); ctx.fillStyle = L.accent; ctx.beginPath(); ctx.arc(-6, headY - 16, 3, 0, 7); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(-16, headY - 4); ctx.quadraticCurveTo(-4, headY - 26, 16, headY - 6); ctx.lineTo(10, headY - 2); ctx.closePath(); ctx.fill(); }
  // Visage
  ctx.fillStyle = '#2a1a14'; ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 2;
  if (st === 'hit' || st === 'ko') {
    ctx.beginPath(); ctx.moveTo(4, headY - 4); ctx.lineTo(10, headY + 2); ctx.moveTo(10, headY - 4); ctx.lineTo(4, headY + 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(8, headY + 9, 3, 0, 7); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(8, headY - 2, 2.2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(7, headY + 6, 4, .1, Math.PI - .4); ctx.stroke();
    if (st === 'attack') { ctx.beginPath(); ctx.moveTo(4, headY - 7); ctx.lineTo(12, headY - 5); ctx.stroke(); }
  }
  ctx.restore();
}

function drawProjectile(p) {
  ctx.save(); ctx.translate(p.x, p.y);
  if (p.kind === 'bouchon') {
    // Traînée de mousse de champagne
    for (let i = 1; i < 7; i++) { ctx.fillStyle = `rgba(255,246,214,${.5 - i * .06})`; ctx.beginPath(); ctx.arc(-Math.sign(p.vx) * i * 9, Math.sin(p.rot + i) * 3, 7 - i * .6, 0, 7); ctx.fill(); }
    ctx.rotate(p.rot);
    ctx.fillStyle = '#c99a5b'; ctx.beginPath(); ctx.roundRect(-9, -7, 18, 14, 4); ctx.fill();
    ctx.fillStyle = '#e0b354'; ctx.fillRect(-9, -7, 5, 14);
  } else {
    ctx.rotate(p.rot);
    ctx.strokeStyle = '#4f7a3f'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-18, (i - 1) * 6); ctx.stroke(); }
    for (const [x, y, c] of [[0, -6, '#f3c6cf'], [6, 2, '#fffaf4'], [-4, 5, '#e892b2'], [3, -1, '#f6d9e2'], [-6, -3, '#fffaf4']]) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

function hudBar(x, y, w, h, v, max, col, flip) {
  ctx.fillStyle = '#00000088'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#3a1028'; ctx.fillRect(x, y, w, h);
  const vw = w * Math.max(0, v) / max;
  ctx.fillStyle = col; ctx.fillRect(flip ? x + w - vw : x, y, vw, h);
}
function drawHUD() {
  ctx.textBaseline = 'alphabetic';
  for (let s = 0; s < 2; s++) {
    const t = game.teams[s], f = fighterOf(s), flip = s === 1;
    const x = s ? W - 30 - 380 : 30;
    const hpCol = f.hp > 50 ? '#7fd18b' : f.hp > 25 ? '#f2c14e' : '#ff7a6b';
    hudBar(x, 22, 380, 20, f.hp, 100, hpCol, flip);
    ctx.font = '600 20px Fredoka, system-ui'; ctx.fillStyle = '#fbeff2'; ctx.textAlign = s ? 'right' : 'left';
    ctx.fillText(f.name, s ? x + 380 : x, 66);
    ctx.font = '500 14px Fredoka, system-ui'; ctx.fillStyle = s ? '#f3c6cf' : '#b9c8ef';
    const ctrl = t.ctrl === 'cpu' ? 'ordinateur' : t.ctrl === 'solo' ? 'toi' : t.ctrl === 'p1' ? 'joueur 1' : 'joueur 2';
    ctx.fillText(`${t.cfg.label} · ${ctrl}`, s ? x + 380 : x, 84);
    // Jauge spéciale
    hudBar(s ? x + 380 - 160 : x, 92, 160, 7, f.energy, 100, f.energy >= 50 ? '#e0b354' : '#8a6a3a', flip);
    // Équipiers restants
    t.roster.forEach((m, i) => {
      const cx = s ? x + 380 - 12 - i * 26 : x + 12 + i * 26;
      ctx.beginPath(); ctx.arc(cx, 116, 10, 0, 7);
      ctx.fillStyle = m.hp <= 0 ? '#3a1028' : (i === t.cur ? (t.key === 'mariee' ? '#c4587d' : '#3b4f80') : '#ffffff33'); ctx.fill();
      ctx.strokeStyle = '#e0b354'; ctx.lineWidth = i === t.cur ? 2 : 1; ctx.stroke();
      ctx.fillStyle = '#fbeff2'; ctx.font = '600 11px Fredoka, system-ui'; ctx.textAlign = 'center';
      ctx.fillText(m.name[0].toUpperCase(), cx, 120);
      if (m.hp <= 0) { ctx.strokeStyle = '#ff7a6b'; ctx.beginPath(); ctx.moveTo(cx - 7, 109); ctx.lineTo(cx + 7, 123); ctx.stroke(); }
    });
  }
  // Minuteur
  ctx.textAlign = 'center'; ctx.fillStyle = '#1c0816cc';
  ctx.beginPath(); ctx.roundRect(W / 2 - 34, 14, 68, 44, 10); ctx.fill();
  ctx.strokeStyle = '#e0b354'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = '700 28px Fredoka, system-ui'; ctx.fillStyle = game.timer < 600 ? '#ff9b93' : '#fbeff2';
  ctx.fillText(Math.ceil(game.timer / 60), W / 2, 47);
  ctx.font = '500 13px Fredoka, system-ui'; ctx.fillStyle = '#dcb6c7';
  ctx.fillText(`Combat ${game.bout}`, W / 2, 76);
}

function banner(big, small) {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1c0816aa'; ctx.fillRect(0, 200, W, 120);
  ctx.font = "400 72px 'Great Vibes', cursive"; ctx.fillStyle = '#f3c6cf';
  ctx.fillText(big, W / 2, 268);
  if (small) { ctx.font = '600 22px Fredoka, system-ui'; ctx.fillStyle = '#e0b354'; ctx.fillText(small, W / 2, 302); }
}

function draw() {
  ctx.save();
  if (game.shake) ctx.translate((Math.random() - .5) * game.shake, (Math.random() - .5) * game.shake);
  drawScene();
  const a = fighterOf(0), b = fighterOf(1);
  // Le combattant qui attaque passe devant
  const order = a.state === 'attack' ? [b, a] : [a, b];
  for (const f of order) drawFighter(f);
  for (const p of game.projectiles) drawProjectile(p);
  for (const s of game.sparks) { ctx.globalAlpha = Math.min(1, s.life / 12); ctx.fillStyle = s.c; ctx.fillRect(s.x - 2, s.y - 2, 4, 4); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const t of game.texts) { ctx.globalAlpha = Math.min(1, t.life / 20); ctx.font = '700 24px Fredoka, system-ui'; ctx.fillStyle = t.c; ctx.fillText(t.txt, t.x, t.y); }
  ctx.globalAlpha = 1;
  ctx.restore();
  drawHUD();
  if (game.phase === 'intro') {
    if (game.phaseT < 90) banner(`${a.name} contre ${b.name}`, `Combat ${game.bout} · ${game.teams[0].cfg.label} contre ${game.teams[1].cfg.label}`);
    else banner('Que la fête commence !');
  } else if (game.phase === 'ko') {
    banner('K.O. !', game.phaseT > 50 ? `${game.lastKO.winner.name} reste sur la piste` : '');
  }
}

/* ---------- Écran de choix : petits portraits des équipes ---------- */
function drawMenuScene() {
  ctx.fillStyle = '#1c081699'; ctx.fillRect(0, 0, W, H);
}
function buildMenu() {
  $('#teams').innerHTML = ['marie', 'mariee'].map((k) => `
    <button class="team t-${k}" data-team="${k}">
      <canvas aria-hidden="true"></canvas>
      <b>${esc(CFG[k].label)}</b>
      <small>${esc(CFG[k].members.map((m) => m.name).join(' · '))}</small>
    </button>`).join('');
  for (const btn of document.querySelectorAll('[data-team]')) teamPreviewSafe(btn.querySelector('canvas'), btn.dataset.team);
}
function teamPreviewSafe(cvs, key) {
  const c = cvs.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
  cvs.width = 120 * dpr; cvs.height = 90 * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const members = CFG[key].members;
  const n = members.length, gap = Math.min(30, 100 / n);
  members.forEach((m, i) => {
    const f = new Fighter(key, m, i, -1);
    f.x = 0; f.y = 0; f.face = key === 'marie' ? 1 : -1; f.anim = i * 13;
    c.save(); c.translate(60 + (i - (n - 1) / 2) * gap, 86); c.scale(.5, .5);
    drawFighter(f, { noShadow: true }, c);
    c.restore();
  });
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-team]');
  if (!t) return;
  const mode = +document.querySelector('[name=mode]:checked').value;
  lastChoice = { team: t.dataset.team, mode };
  newGame(t.dataset.team, mode);
  if (actx && actx.state === 'suspended') actx.resume();
});
let lastChoice = null;

function togglePause() {
  if (!game || !game.running) return;
  game.paused = !game.paused;
  $('#pause').hidden = !game.paused;
  if (game.paused) musicStop(.2); else musicStart();
  if (game.paused) $('#resume').focus();
}
$('#pauseBtn').addEventListener('click', togglePause);
$('#resume').addEventListener('click', togglePause);
$('#quit').addEventListener('click', () => { musicStop(.2); game = null; $('#pause').hidden = true; $('#menu').hidden = false; });
$('#again').addEventListener('click', () => lastChoice && newGame(lastChoice.team, lastChoice.mode));
$('#change').addEventListener('click', () => { musicStop(.2); game = null; $('#end').hidden = true; $('#menu').hidden = false; });
$('#musicBtn').addEventListener('click', (e) => {
  Music.on = !Music.on; e.currentTarget.textContent = `Musique : ${Music.on ? 'oui' : 'non'}`; e.currentTarget.setAttribute('aria-pressed', Music.on);
  if (!Music.on) musicStop(.2); else if (game && game.running && !game.paused) musicStart();
});
$('#soundBtn').addEventListener('click', (e) => {
  soundOn = !soundOn; e.currentTarget.textContent = `Bruitages : ${soundOn ? 'oui' : 'non'}`; e.currentTarget.setAttribute('aria-pressed', soundOn);
});

readCfg();
document.fonts?.ready.then(buildMenu);
buildMenu();
loadBoard();
requestAnimationFrame(loop);
document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.running && !game.paused) togglePause(); });
// Intégré à la page des jeux : on indique notre hauteur pour ajuster le cadre
if (document.documentElement.classList.contains('embed') && window.parent !== window) {
  const tell = () => { try { parent.postMessage({ jeu: 'hauteur', h: Math.ceil(document.body.getBoundingClientRect().height) }, '*'); } catch { /* rien */ } };
  const embedObserver = new ResizeObserver(tell); embedObserver.observe(document.body); tell();
}
}
