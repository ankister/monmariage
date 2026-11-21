/**
 * Livraison sous haute tension — jeu de conduite vu du ciel : livrer la pièce montée à la salle de réception
 * en échappant aux témoins qui veulent la voler. Prénoms et témoins : attributs data-* de <body>, remplis au
 * démarrage du conteneur (PRENOM_MARIE, PRENOM_MARIEE, TEMOINS_MARIE, TEMOINS_MARIEE). Sons synthétisés (Web Audio).
 */
'use strict';
{
const $ = (s) => document.querySelector(s);
let W = 960, H = 540;                        // vue logique (480 × 600 sur téléphone en portrait)
const T = 80;                                // taille d'une case de la ville
const N = 60;                                // ville de 60 × 60 cases
const TIME = 150 * 60;                       // 150 secondes

/* =====================================================================
   Configuration : noms
   ===================================================================== */
function parseWitnesses(str, sex) {
  return String(str || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
    .map((s) => ({ name: (s.split(/\s*[:/]\s*/)[0] || 'Témoin').slice(0, 16), sex }));
}
let CFG;
/** Valeur injectée par le serveur ; marqueur non remplacé ou vide = valeur d'exemple. */
const injected = (v, def) => (!v || /^__[A-Z_]+__$/.test(v) || v.includes('${') ? def : v);
function readCfg() {
  const D = document.body.dataset;
  const marie = injected(D.marie, 'Hugo').slice(0, 20), mariee = injected(D.mariee, 'Léa').slice(0, 20);
  let tm = parseWitnesses(injected(D.tm, 'Julien:H, Camille:F')), tf = parseWitnesses(injected(D.tf, 'Sarah:F, Thomas:H'));
  if (!tm.length) tm = [{ name: 'Témoin mystère' }];
  if (!tf.length) tf = [{ name: 'Témoin masqué' }];
  CFG = { marie, mariee, couple: `${mariee} & ${marie}`, chasers: [...tm.map((w) => ({ ...w, team: 'marie' })), ...tf.map((w) => ({ ...w, team: 'mariee' }))] };
  // Alternance des équipes dans l'ordre d'arrivée
  const a = CFG.chasers.filter((c) => c.team === 'marie'), b = CFG.chasers.filter((c) => c.team === 'mariee');
  CFG.order = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) CFG.order.push(a[i]); if (b[i]) CFG.order.push(b[i]); }
  $('#menuText').textContent = `La pièce montée de ${CFG.couple} t’attend dans la camionnette. Livre-la à la salle de réception avant le dessert. ${CFG.order.length} témoins vont tenter de la voler en route : ${CFG.order.map((c) => c.name).join(', ')}.`;
}

/* =====================================================================
   Ville (toujours la même : générateur pseudo-aléatoire à graine fixe)
   ===================================================================== */
const ROAD = 1, PARK = 2, WATER = 3, BRIDGE = 4, BLD = 0;
let grid, blocks, roadCols, roadRows, START, GOAL, venueBlock, shopBlock, pickups0;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function buildCity() {
  const R = rng(20280819);
  grid = new Uint8Array(N * N);
  const lines = () => { const a = [1]; let p = 1; while (true) { p += 5 + Math.floor(R() * 4); if (p >= N - 3) break; a.push(p); } a.push(N - 2); return a; };
  roadCols = lines(); roadRows = lines();
  const river = 29;
  roadRows = roadRows.filter((y) => y < river - 2 || y > river + 4);
  roadRows.push(river - 1, river + 3); roadRows.sort((a, b) => a - b);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (y >= river && y <= river + 2) grid[y * N + x] = WATER;
    else if (roadCols.includes(x) || roadRows.includes(y)) grid[y * N + x] = ROAD;
    else grid[y * N + x] = BLD;
    if (x === 0 || y === 0 || x === N - 1 || y === N - 1) grid[y * N + x] = BLD;
  }
  // Trois ponts
  const inner = roadCols.slice(1, -1);
  const bridges = [inner[1], inner[Math.floor(inner.length / 2)], inner[inner.length - 2]];
  for (const x of bridges) for (let y = river; y <= river + 2; y++) grid[y * N + x] = BRIDGE;
  // Pâtés de maisons
  blocks = [];
  for (let j = 0; j < roadRows.length - 1; j++) for (let i = 0; i < roadCols.length - 1; i++) {
    const x0 = roadCols[i] + 1, x1 = roadCols[i + 1] - 1, y0 = roadRows[j] + 1, y1 = roadRows[j + 1] - 1;
    if (x1 < x0 || y1 < y0 || grid[y0 * N + x0] === WATER) continue;
    const park = R() < .17;
    const b = { x0, x1, y0, y1, park, kind: park ? 'park' : 'bld', seed: Math.floor(R() * 1e6), roofs: [] };
    if (park) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * N + x] = PARK;
    blocks.push(b);
  }
  // Pâtisserie en haut à gauche, salle de réception en bas à droite
  shopBlock = blocks.find((b) => b.x0 > 1 && b.y0 > 1 && !b.park) || blocks[0];
  shopBlock.kind = 'shop'; shopBlock.park = false;
  const far = blocks.filter((b) => b.y0 > river + 4).sort((a, b) => (b.x1 + b.y1) - (a.x1 + a.y1));
  venueBlock = far[0]; venueBlock.kind = 'venue'; venueBlock.park = false;
  for (const b of [shopBlock, venueBlock]) for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) grid[y * N + x] = BLD;
  START = { x: (shopBlock.x1 + 1.5) * T, y: (shopBlock.y0 + 0.5) * T, a: Math.PI / 2 };
  START.x = (roadCols.find((c) => c > shopBlock.x1) + .5) * T;
  GOAL = { x: ((venueBlock.x0 + venueBlock.x1 + 1) / 2) * T, y: (venueBlock.y0 - .5) * T };
  // Toits : 1 à 4 bâtiments par pâté
  for (const b of blocks) {
    if (b.kind !== 'bld') continue;
    const r = rng(b.seed), w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    const splitX = w >= 3 && r() < .7 ? 1 + Math.floor(r() * (w - 1)) : 0;
    const splitY = h >= 3 && r() < .7 ? 1 + Math.floor(r() * (h - 1)) : 0;
    const xs = splitX ? [[0, splitX], [splitX, w]] : [[0, w]], ys = splitY ? [[0, splitY], [splitY, h]] : [[0, h]];
    for (const [ax, bx] of xs) for (const [ay, by] of ys) b.roofs.push({ x: ax, y: ay, w: bx - ax, h: by - ay, c: ROOF_COLORS[Math.floor(r() * ROOF_COLORS.length)], h2: r() });
  }
  // Bonus sur les routes
  const R2 = rng(77);
  pickups0 = [];
  const kinds = ['icing', 'icing', 'icing', 'icing', 'icing', 'icing', 'nitro', 'nitro', 'nitro', 'nitro', 'nitro', 'time', 'time', 'time', 'time'];
  for (const kind of kinds) {
    for (let tries = 0; tries < 200; tries++) {
      const x = 2 + Math.floor(R2() * (N - 4)), y = 2 + Math.floor(R2() * (N - 4));
      if (grid[y * N + x] !== ROAD) continue;
      if (Math.hypot(x * T - START.x, y * T - START.y) < 600) continue;
      pickups0.push({ x: (x + .5) * T, y: (y + .5) * T, kind }); break;
    }
  }
}
const ROOF_COLORS = ['#c9b8a6', '#b9a28c', '#a88f7a', '#d8c7b0', '#9fa7b2', '#b4785a', '#c48a5f', '#8f9a86', '#d0b49a'];
const tileAt = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return tx < 0 || ty < 0 || tx >= N || ty >= N ? BLD : grid[ty * N + tx]; };
const solid = (t) => t === BLD || t === WATER;
const drivable = (t) => t === ROAD || t === BRIDGE || t === PARK;

/* =====================================================================
   Sons et musique (synthétisés)
   ===================================================================== */
let actx = null, soundOn = true;
const Music = { on: true, playing: false, step: 0, next: 0, timer: null, gain: null, noise: null };
function audio() {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  if (!Music.gain) {
    Music.gain = actx.createGain(); Music.gain.gain.value = .45; Music.gain.connect(actx.destination);
    const len = actx.sampleRate * .4, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    Music.noise = buf;
  }
  return actx;
}
function sfx(kind) {
  if (!soundOn) return;
  try {
    audio(); const t = actx.currentTime;
    if (kind === 'crash' || kind === 'ram') {
      const s = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter();
      s.buffer = Music.noise; f.type = 'lowpass'; f.frequency.value = kind === 'crash' ? 900 : 1500;
      g.gain.setValueAtTime(.35, t); g.gain.exponentialRampToValueAtTime(.001, t + .25);
      s.connect(f).connect(g).connect(actx.destination); s.start(t); s.stop(t + .3);
    }
    const p = { ram: [[392, .12], [311, .18]], pickup: [[784, .06], [1046, .1]], steal: [[220, .12], [165, .25]], win: [], tick: [[1200, .03]] }[kind] || [];
    let tt = t;
    for (const [f, d] of p) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = kind === 'ram' ? 'square' : 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(.12, tt); g.gain.exponentialRampToValueAtTime(.001, tt + d);
      o.connect(g).connect(actx.destination); o.start(tt); o.stop(tt + d + .02); tt += d * .9;
    }
  } catch { soundOn = false; }
}
// Moteur : un oscillateur continu dont la hauteur suit la vitesse
const Engine = { o: null, g: null };
function engine(speed, on) {
  try {
    if (!soundOn || !on) { if (Engine.g) Engine.g.gain.setTargetAtTime(0, actx.currentTime, .05); return; }
    audio();
    if (!Engine.o) {
      Engine.o = actx.createOscillator(); Engine.g = actx.createGain(); const f = actx.createBiquadFilter();
      Engine.o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 600; Engine.g.gain.value = 0;
      Engine.o.connect(f).connect(Engine.g).connect(actx.destination); Engine.o.start();
    }
    Engine.o.frequency.setTargetAtTime(48 + Math.abs(speed) * 16, actx.currentTime, .05);
    Engine.g.gain.setTargetAtTime(.035, actx.currentTime, .1);
  } catch { /* son indisponible */ }
}
/* Musique de poursuite originale : ré mineur, 168 battements/min, boucle de 8 mesures */
const _ = null;
const SONG = {
  bpm: 168, roots: [-7, -7, -11, -9, -7, -7, -4, -2],
  lead: [
    [5, _, 5, 8, _, 5, 12, _, 10, _, 8, _, 5, _, 3, _],
    [5, _, 5, 8, _, 5, 12, _, 13, _, 12, _, 10, _, 8, _],
    [1, _, 1, 5, _, 1, 8, _, 6, _, 5, _, 1, _, 0, _],
    [3, _, 3, 7, _, 3, 10, _, 8, _, 7, _, 5, _, 3, _],
    [5, _, 5, 8, _, 5, 12, _, 10, _, 8, _, 5, _, 3, _],
    [17, _, 15, _, 13, _, 12, _, 10, _, 12, _, 13, _, 15, _],
    [8, _, 12, _, 15, _, 12, _, 8, _, 12, _, 15, _, 20, _],
    [10, _, 14, _, 17, _, 14, _, 10, 12, 14, 15, 17, _, _, _],
  ],
};
const freq = (n) => 440 * 2 ** (n / 12);
function tone(t, f, dur, type, vol, cut) {
  const o = actx.createOscillator(), g = actx.createGain(), lp = actx.createBiquadFilter();
  o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = cut || 3000;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  o.connect(lp).connect(g).connect(Music.gain); o.start(t); o.stop(t + dur + .02);
}
function drum(t, kind) {
  if (kind === 'kick') {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .11);
    g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .15);
    o.connect(g).connect(Music.gain); o.start(t); o.stop(t + .17); return;
  }
  const s = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter();
  s.buffer = Music.noise; f.type = kind === 'snare' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 'snare' ? 1900 : 7500;
  const d = kind === 'snare' ? .13 : .035;
  g.gain.setValueAtTime(kind === 'snare' ? .3 : .1, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  s.connect(f).connect(g).connect(Music.gain); s.start(t); s.stop(t + d + .01);
}
function playStep(i, t) {
  const bar = Math.floor(i / 16) % 8, s = i % 16, root = SONG.roots[bar], six = 60 / SONG.bpm / 4;
  if (s % 4 === 0) drum(t, 'kick');
  if (s === 4 || s === 12 || s === 14) drum(t, 'snare');
  drum(t, 'hat');
  tone(t, freq(root - 12 + (s % 2 ? 12 : 0)), six * .95, 'square', .13, 800);
  const n = SONG.lead[bar][s];
  if (n !== null) tone(t, freq(n), six * 2, 'square', .07, 2400);
}
function musicStart() {
  if (!Music.on || Music.playing) return;
  try { audio(); if (actx.state === 'suspended') actx.resume(); } catch { return; }
  Music.playing = true; Music.step = 0; Music.next = actx.currentTime + .08;
  Music.gain.gain.cancelScheduledValues(actx.currentTime); Music.gain.gain.setValueAtTime(.45, actx.currentTime);
  const six = 60 / SONG.bpm / 4;
  Music.timer = setInterval(() => { while (Music.next < actx.currentTime + .15) { playStep(Music.step, Music.next); Music.next += six; Music.step = (Music.step + 1) % 128; } }, 25);
}
function musicStop(fade = .4) {
  if (!Music.playing) return;
  Music.playing = false; clearInterval(Music.timer);
  try { Music.gain.gain.setTargetAtTime(.0001, actx.currentTime, fade / 3); setTimeout(() => { if (!Music.playing) Music.gain.gain.value = .45; }, fade * 1000 + 300); } catch { /* rien */ }
}
function fanfare(win) {
  if (!Music.on) return;
  try { audio(); } catch { return; }
  const t0 = actx.currentTime + .4;
  const notes = win ? [[0, .15], [4, .15], [7, .15], [12, .5], [7, .15], [12, .9]] : [[7, .3], [6, .3], [5, .3], [4, .9]];
  notes.reduce((t, [n, d]) => { tone(t, freq(n + 2), d, 'square', .1, 3000); tone(t, freq(n - 10), d, 'triangle', .1, 2000); return t + d; }, t0);
}

/* =====================================================================
   Commandes
   ===================================================================== */
const down = new Set(), touch = {};
const KEYS = { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], brake: ['Space'], nitro: ['ShiftLeft', 'ShiftRight', 'KeyN'] };
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
  e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* rien */ } touch[b.dataset.k] = true; b.classList.add('on');
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#pad').addEventListener(ev, (e) => { const b = e.target.closest('[data-k]'); if (b) { touch[b.dataset.k] = false; b.classList.remove('on'); } });
const input = () => { const r = {}; for (const k in KEYS) r[k] = KEYS[k].some((c) => down.has(c)) || !!touch[k]; return r; };

/* =====================================================================
   Voitures : physique arcade (adhérence latérale, dérapage, chocs)
   ===================================================================== */
class Car {
  constructor(x, y, a, o) {
    Object.assign(this, { x, y, a, vx: 0, vy: 0, r: 17, len: 46, wid: 24, max: 5.2, accel: .2, grip: .78, ...o });
    this.stuck = 0; this.rev = 0; this.hitCd = 0; this.stun = 0; this.steal = 0;
  }
  get speed() { return this.vx * Math.cos(this.a) + this.vy * Math.sin(this.a); }
  drive(c, surfaceSlow) {
    const fx = Math.cos(this.a), fy = Math.sin(this.a);
    let fv = this.vx * fx + this.vy * fy, lv = -this.vx * fy + this.vy * fx;
    const max = (this.boost > 0 ? this.max * 1.55 : this.max) * (surfaceSlow ? .62 : 1);
    if (c.up) fv += this.accel * (this.boost > 0 ? 1.6 : 1);
    if (c.down) fv -= fv > .3 ? .32 : .12;
    if (!c.up && !c.down) fv *= .985;
    fv = Math.max(-2.4, Math.min(max, fv * (fv > max ? .95 : 1)));
    const steerK = Math.min(1, Math.abs(fv) / 2.2) * Math.sign(fv);
    this.a += ((c.right ? 1 : 0) - (c.left ? 1 : 0)) * .058 * steerK * (c.brake ? 1.35 : 1);
    lv *= c.brake ? .965 : this.grip * (surfaceSlow ? .9 : 1);
    if (c.brake) fv *= .975;
    this.vx = fv * Math.cos(this.a) - lv * Math.sin(this.a);
    this.vy = fv * Math.sin(this.a) + lv * Math.cos(this.a);
    this.drift = Math.abs(lv);
  }
  /** Déplace et résout les collisions avec les murs ; renvoie la vitesse d'impact. */
  move() {
    this.x += this.vx; this.y += this.vy;
    let impact = 0;
    const tx = Math.floor(this.x / T), ty = Math.floor(this.y / T);
    for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
      const t = x < 0 || y < 0 || x >= N || y >= N ? BLD : grid[y * N + x];
      if (!solid(t)) continue;
      const cx = Math.max(x * T, Math.min(this.x, x * T + T)), cy = Math.max(y * T, Math.min(this.y, y * T + T));
      const dx = this.x - cx, dy = this.y - cy, d = Math.hypot(dx, dy);
      if (d < this.r && d > 0.0001) {
        const nx = dx / d, ny = dy / d, push = this.r - d;
        this.x += nx * push; this.y += ny * push;
        const vn = this.vx * nx + this.vy * ny;
        if (vn < 0) { impact = Math.max(impact, -vn); this.vx -= 1.35 * vn * nx; this.vy -= 1.35 * vn * ny; this.vx *= .8; this.vy *= .8; }
      }
    }
    return impact;
  }
}

/* =====================================================================
   Partie
   ===================================================================== */
const LEVELS = [
  { label: 'Tranquille', chasers: .6, speed: .86, first: 2, every: 26 * 60 },
  { label: 'Normal', chasers: 1, speed: .95, first: 2, every: 17 * 60 },
  { label: 'Témoins déchaînés', chasers: 1, speed: 1.04, first: 3, every: 10 * 60 },
];
let game = null;
const cv = $('#cv'), ctx = cv.getContext('2d');
function fit() {
  const narrow = $('#stage').clientWidth < 600;
  W = narrow ? 480 : 960; H = narrow ? 600 : 540;
  const dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fit();
const stageObserver = new ResizeObserver(fit); stageObserver.observe($('#stage'));

function newGame(lvl) {
  const L = LEVELS[lvl];
  const player = new Car(START.x, START.y, START.a, { player: true, max: 5.3 });
  player.cake = 100; player.nitro = 1; player.boost = 0;
  const roster = CFG.order.slice(0, Math.max(1, Math.round(CFG.order.length * L.chasers)));
  game = { lvl, L, player, roster, chasers: [], civ: [], pickups: pickups0.map((p) => ({ ...p })), fx: [], texts: [], skid: [],
    t: 0, time: TIME, running: true, paused: false, cam: { x: START.x, y: START.y }, shake: 0, dist: 0, hits: 0, steals: 0, field: null, fieldT: 0, nextSpawn: 90 };
  for (let i = 0; i < 14; i++) spawnCivilian();
  $('#menu').hidden = true; $('#end').hidden = true;
  say('C’est parti : direction la salle de réception !', '#ffe28a');
  musicStop(.05); setTimeout(musicStart, 120);
}

function randomRoadTile(far) {
  for (let i = 0; i < 400; i++) {
    const x = 1 + Math.floor(Math.random() * (N - 2)), y = 1 + Math.floor(Math.random() * (N - 2));
    if (grid[y * N + x] !== ROAD) continue;
    const px = (x + .5) * T, py = (y + .5) * T, d = Math.hypot(px - game.player.x, py - game.player.y);
    if (far && (d < far[0] || d > far[1])) continue;
    return { x, y, px, py };
  }
  return null;
}
function spawnCivilian() {
  const p = randomRoadTile([500, 3000]); if (!p) return;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => drivable(grid[(p.y + dy) * N + p.x + dx]) && grid[(p.y + dy) * N + p.x + dx] !== PARK);
  const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)] || [1, 0];
  const c = new Car(p.px, p.py, Math.atan2(dy, dx), { civ: true, color: ['#e9e4da', '#6f8fb3', '#b35b4c', '#5e7d5a', '#d9b45b', '#8d7aa8', '#555a63'][Math.floor(Math.random() * 7)], max: 2.3 });
  c.tx = p.x + dx; c.ty = p.y + dy; c.dir = [dx, dy];
  game.civ.push(c);
}
function spawnChaser() {
  const who = game.roster[game.chasers.length]; if (!who) return;
  const p = randomRoadTile([650, 1100]) || randomRoadTile(null); if (!p) return;
  const c = new Car(p.px, p.py, Math.atan2(game.player.y - p.py, game.player.x - p.px), {
    chaser: true, name: who.name, team: who.team, color: who.team === 'marie' ? '#2c3d66' : '#c4587d', max: 5.3 * game.L.speed + Math.random() * .2, accel: .19,
  });
  game.chasers.push(c);
  say(`${who.name} se lance à ta poursuite !`, who.team === 'marie' ? '#b9c8ef' : '#f3c6cf');
  sfx('ram');
}
function say(txt, c = '#fbeff2') { game.texts.push({ txt, c, life: 150 }); if (game.texts.length > 3) game.texts.shift(); }

/* ---------- Carte des distances vers la camionnette (guide les témoins dans les rues) ---------- */
function computeField() {
  const f = new Int16Array(N * N).fill(-1), q = new Int16Array(N * N * 2);
  const px = Math.floor(game.player.x / T), py = Math.floor(game.player.y / T);
  let h = 0, t = 0; f[py * N + px] = 0; q[t++] = px; q[t++] = py;
  while (h < t) {
    const x = q[h++], y = q[h++], d = f[y * N + x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const k = ny * N + nx; if (f[k] !== -1 || !drivable(grid[k])) continue;
      f[k] = d + 1; q[t++] = nx; q[t++] = ny;
    }
  }
  game.field = f;
}
function chaserAI(c) {
  const p = game.player, ctrl = { up: true, down: false, left: false, right: false, brake: false };
  if (c.stun > 0) { // vient de voler une part : s'éloigne en riant
    c.stun--; const away = Math.atan2(c.y - p.y, c.x - p.x); steerTo(c, away, ctrl); ctrl.up = true; return ctrl;
  }
  let tx = p.x + p.vx * 14, ty = p.y + p.vy * 14;
  const cx = Math.floor(c.x / T), cy = Math.floor(c.y / T);
  if (Math.hypot(p.x - c.x, p.y - c.y) > T * 1.6 && game.field) {
    let best = null, bd = game.field[cy * N + cx] < 0 ? 9999 : game.field[cy * N + cx];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (cy + dy) * N + cx + dx, d = game.field[k];
      if (d >= 0 && d < bd) { bd = d; best = [cx + dx, cy + dy]; }
    }
    if (best) { tx = (best[0] + .5) * T; ty = (best[1] + .5) * T; }
  }
  if (c.rev > 0) { c.rev--; ctrl.up = false; ctrl.down = true; ctrl.left = c.revDir < 0; ctrl.right = c.revDir > 0; return ctrl; }
  steerTo(c, Math.atan2(ty - c.y, tx - c.x), ctrl);
  if (Math.abs(c.speed) < .4) { if (++c.stuck > 45) { c.rev = 40; c.stuck = 0; c.revDir = Math.random() < .5 ? -1 : 1; } } else c.stuck = 0;
  return ctrl;
}
function steerTo(c, target, ctrl) {
  let d = target - c.a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  if (d > .08) ctrl.right = true; else if (d < -.08) ctrl.left = true;
  if (Math.abs(d) > 1.2 && Math.abs(c.speed) > 3.2) { ctrl.up = false; ctrl.brake = true; }
}
function civilianAI(c) {
  const tx = (c.tx + .5) * T, ty = (c.ty + .5) * T;
  if (Math.hypot(tx - c.x, ty - c.y) < 22) {
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !(dx === -c.dir[0] && dy === -c.dir[1]) && [ROAD, BRIDGE].includes(grid[(c.ty + dy) * N + c.tx + dx]));
    const keep = opts.find(([dx, dy]) => dx === c.dir[0] && dy === c.dir[1]);
    const pick = keep && Math.random() < .65 ? keep : opts[Math.floor(Math.random() * opts.length)] || [-c.dir[0], -c.dir[1]];
    c.dir = pick; c.tx += pick[0]; c.ty += pick[1];
  }
  const ctrl = { up: true, down: false, left: false, right: false, brake: false };
  steerTo(c, Math.atan2((c.ty + .5) * T - c.y, (c.tx + .5) * T - c.x), ctrl);
  return ctrl;
}

function collideCars(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
  if (d >= min || d === 0) return 0;
  const nx = dx / d, ny = dy / d, push = (min - d) / 2;
  a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
  const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (rel > 0) {
    const ma = a.civ ? 1.4 : 1, mb = b.civ ? 1.4 : 1, j = rel * 1.3 / (1 / ma + 1 / mb);
    a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny; b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
  }
  return Math.abs(rel);
}

function damage(n, why) {
  const p = game.player; p.cake = Math.max(0, p.cake - n);
  game.shake = Math.min(16, 4 + n);
  if (why) say(why, '#ff9b93');
  if (p.cake <= 0) finish(false, 'stolen');
}

function step() {
  const g = game, p = g.player; g.t++;
  if (--g.time <= 0) { g.time = 0; return finish(false, 'late'); }
  if (g.t % 60 === 0 && g.time < 15 * 60) sfx('tick');
  // Arrivée des témoins
  if (--g.nextSpawn <= 0 && g.chasers.length < g.roster.length) {
    spawnChaser(); g.nextSpawn = g.chasers.length < g.L.first ? 150 : g.L.every;
  }
  if (g.t - g.fieldT > 15) { computeField(); g.fieldT = g.t; }
  // Joueur
  const c = input();
  if (c.nitro && p.nitro > 0 && p.boost <= 0) { p.nitro--; p.boost = 150; say('Turbo !', '#ffe28a'); sfx('pickup'); }
  if (p.boost > 0) p.boost--;
  p.drive(c, tileAt(p.x, p.y) === PARK);
  const imp = p.move();
  if (imp > 3) { damage(Math.round((imp - 3) * 4), imp > 5 ? 'Aïe, le gâteau a heurté le mur !' : null); sfx('crash'); g.hits++; }
  if (p.drift > 2.2 && Math.abs(p.speed) > 2) g.skid.push({ x: p.x, y: p.y, a: p.a, life: 240 });
  g.dist += Math.hypot(p.vx, p.vy);
  // Autres voitures
  for (const ch of g.chasers) { ch.drive(chaserAI(ch), tileAt(ch.x, ch.y) === PARK); ch.move(); if (ch.hitCd > 0) ch.hitCd--; }
  for (const cv2 of g.civ) { cv2.drive(civilianAI(cv2), false); cv2.move(); }
  // Collisions entre voitures
  const all = [p, ...g.chasers, ...g.civ];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (Math.abs(a.x - b.x) > 60 || Math.abs(a.y - b.y) > 60) continue;
    const rel = collideCars(a, b);
    if (a === p && rel > 0) {
      if (b.chaser && b.hitCd === 0 && rel > 1.6) { damage(Math.min(16, Math.round(rel * 3)), `${b.name} te percute !`); b.hitCd = 50; sfx('ram'); g.hits++; }
      else if (b.civ && rel > 3) { damage(Math.round((rel - 3) * 3)); sfx('crash'); }
    }
  }
  // Vol d'une part : un témoin collé à la camionnette arrêtée
  for (const ch of g.chasers) {
    if (ch.stun > 0) continue;
    const close = Math.hypot(ch.x - p.x, ch.y - p.y) < 52 && Math.abs(p.speed) < 1.4;
    ch.steal = close ? ch.steal + 1 : Math.max(0, ch.steal - 2);
    if (ch.steal > 70) { ch.steal = 0; ch.stun = 200; g.steals++; damage(22, `${ch.name} a volé une part du gâteau !`); sfx('steal'); }
  }
  // Bonus
  for (const k of g.pickups) {
    if (k.taken || Math.hypot(k.x - p.x, k.y - p.y) > 34) continue;
    k.taken = true; sfx('pickup');
    if (k.kind === 'icing') { p.cake = Math.min(100, p.cake + 15); say('Un peu de glaçage : gâteau réparé !', '#ffe28a'); }
    if (k.kind === 'nitro') { p.nitro = Math.min(3, p.nitro + 1); say('Turbo en réserve (Maj ou 🚀)', '#ffe28a'); }
    if (k.kind === 'time') { g.time += 10 * 60; say('+10 secondes !', '#ffe28a'); }
  }
  // Arrivée
  if (Math.hypot(p.x - GOAL.x, p.y - GOAL.y) < 60) return finish(true);
  // Caméra en avance sur la camionnette
  g.cam.x += (p.x + p.vx * 22 - g.cam.x) * .1; g.cam.y += (p.y + p.vy * 22 - g.cam.y) * .1;
  for (const t of g.texts) t.life--; g.texts = g.texts.filter((t) => t.life > 0);
  for (const s of g.skid) s.life--; g.skid = g.skid.filter((s) => s.life > 0).slice(-400);
  if (g.shake > 0) g.shake--;
  engine(p.speed, true);
}

function finish(win, why) {
  const g = game; if (!g.running) return;
  g.running = false; engine(0, false); musicStop(.6); fanfare(win);
  const p = g.player, secs = Math.round(g.t / 60);
  const score = win ? Math.round(1000 + p.cake * 20 + g.time / 60 * 10 + g.lvl * 500) : 0;
  g.score = score;
  $('#endTitle').textContent = win ? 'Gâteau livré !' : why === 'late' ? 'Trop tard…' : 'Les témoins ont eu le gâteau !';
  $('#endText').textContent = win
    ? (p.cake > 80 ? `La pièce montée arrive presque intacte : ${CFG.couple} peuvent couper le gâteau !` : p.cake > 40 ? 'Quelques choux en moins, mais personne ne remarquera rien.' : 'Il reste… l’essentiel. Les invités se contenteront des dragées.')
    : why === 'late' ? 'Le dessert a été servi sans pièce montée. Retente ta chance !' : `${g.chasers.map((c) => c.name).join(', ') || 'Les témoins'} se partagent le gâteau dans le parking…`;
  $('#endStats').innerHTML = [
    ['État du gâteau', `${Math.round(p.cake)} %`],
    [win ? 'Score' : 'Parts volées', win ? score.toLocaleString('fr-FR') : String(g.steals)],
    ['Temps', `${secs} s`],
  ].map(([l, v]) => `<div><b>${esc(v)}</b>${esc(l)}</div>`).join('');
  lastScore = win ? { score, won: true, level: g.lvl } : null; saved = false;
  if (lastScore) { $('#scoreTxt').textContent = score.toLocaleString('fr-FR'); $('#pseudo').value = readPseudo(); }
  $('#saveForm').hidden = !lastScore; $('#saveMsg').textContent = '';
  setTimeout(() => { $('#end').hidden = false; (lastScore ? $('#pseudo') : $('#again')).focus(); }, 500);
}

/* ---------- Tableau d'honneur (partagé via l'API du site, sinon sur l'appareil) ---------- */
const API = 'api/scores', LS_SCORES = 'jeu-livraison-scores', LS_NAME = 'jeu-pseudo';
let board = [], online = false, lastEntry = null, lastScore = null, saved = false;
function readPseudo() { try { return localStorage.getItem(LS_NAME) || ''; } catch { return ''; } }
function readLocal() { try { const a = JSON.parse(localStorage.getItem(LS_SCORES) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function writeLocal(a) { try { localStorage.setItem(LS_SCORES, JSON.stringify(a)); } catch { /* stockage indisponible */ } }
const sortBoard = (a) => a.filter((x) => x && typeof x.name === 'string' && Number.isFinite(x.score)).sort((a, b) => b.score - a.score || a.t - b.t);
async function loadBoard() {
  try {
    const r = await fetch(API, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!r.ok) throw 0; const j = await r.json(); if (!Array.isArray(j)) throw 0;
    online = true; board = sortBoard(j);
  } catch { online = false; board = sortBoard(readLocal()); }
  renderBoard();
}
function renderBoard() {
  $('#boardNote').textContent = online ? 'Classement partagé entre tous les invités.' : 'Scores enregistrés sur cet appareil.';
  const ol = $('#boardList'); ol.textContent = '';
  if (!board.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Aucune livraison réussie pour l’instant. À toi de jouer !'; ol.append(li); return; }
  board.slice(0, 10).forEach((e, i) => {
    const li = document.createElement('li');
    if (lastEntry && e.t === lastEntry.t && e.name === lastEntry.name) li.className = 'me';
    const c = (cls, txt) => { const sp = document.createElement('span'); sp.className = cls; sp.textContent = txt; li.append(sp); };
    c('rk', (i + 1) + (i ? 'e' : 'er')); c('nm', e.name); c('st', (LEVELS[e.level] || LEVELS[1]).label); c('sc', Math.floor(e.score).toLocaleString('fr-FR'));
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
function drawCity(cx, cy) {
  const x0 = Math.max(0, Math.floor((cx - W / 2) / T) - 1), x1 = Math.min(N - 1, Math.floor((cx + W / 2) / T) + 1);
  const y0 = Math.max(0, Math.floor((cy - H / 2) / T) - 1), y1 = Math.min(N - 1, Math.floor((cy + H / 2) / T) + 1);
  const time = performance.now() / 1000;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = grid[y * N + x], px = x * T, py = y * T;
    if (t === ROAD || t === BRIDGE) {
      ctx.fillStyle = '#4a4550'; ctx.fillRect(px, py, T, T);
      const h = drivable(grid[y * N + x - 1]) && drivable(grid[y * N + x + 1]) && grid[y * N + x - 1] !== PARK;
      const v = drivable(grid[(y - 1) * N + x]) && drivable(grid[(y + 1) * N + x]) && grid[(y - 1) * N + x] !== PARK;
      ctx.fillStyle = '#efe6c8';
      if (h && !v) for (let i = 6; i < T; i += 26) ctx.fillRect(px + i, py + T / 2 - 2, 14, 4);
      if (v && !h) for (let i = 6; i < T; i += 26) ctx.fillRect(px + T / 2 - 2, py + i, 4, 14);
      if (t === BRIDGE) { ctx.fillStyle = '#9a8f86'; ctx.fillRect(px - 6, py, 6, T); ctx.fillRect(px + T, py, 6, T); }
    } else if (t === WATER) {
      ctx.fillStyle = '#3f86b3'; ctx.fillRect(px, py, T, T);
      ctx.strokeStyle = '#9fd2ee66'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); const yy = py + 16 + i * 24 + Math.sin(time * 2 + x + i) * 3; ctx.moveTo(px + 10, yy); ctx.quadraticCurveTo(px + 30, yy - 6, px + 50, yy); ctx.stroke(); }
    }
  }
  // Pâtés : trottoirs, toits, parcs
  for (const b of blocks) {
    const bx = b.x0 * T, by = b.y0 * T, bw = (b.x1 - b.x0 + 1) * T, bh = (b.y1 - b.y0 + 1) * T;
    if (bx > cx + W / 2 + 40 || by > cy + H / 2 + 40 || bx + bw < cx - W / 2 - 40 || by + bh < cy - H / 2 - 40) continue;
    ctx.fillStyle = '#cfc6b8'; ctx.fillRect(bx - 6, by - 6, bw + 12, bh + 12);
    if (b.kind === 'park') {
      ctx.fillStyle = '#7fb36a'; ctx.fillRect(bx, by, bw, bh);
      const r = rng(b.seed);
      ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(bx, by + bh * r()); ctx.quadraticCurveTo(bx + bw / 2, by + bh * r(), bx + bw, by + bh * r()); ctx.stroke();
      for (let i = 0; i < (bw * bh) / 2400; i++) {
        const tx = bx + 14 + r() * (bw - 28), ty = by + 14 + r() * (bh - 28), s = 10 + r() * 9;
        ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.arc(tx + 4, ty + 5, s, 0, 7); ctx.fill();
        ctx.fillStyle = r() < .5 ? '#4e8a45' : '#5f9a4c'; ctx.beginPath(); ctx.arc(tx, ty, s, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffffff22'; ctx.beginPath(); ctx.arc(tx - s / 3, ty - s / 3, s / 2.5, 0, 7); ctx.fill();
      }
      continue;
    }
    if (b.kind === 'venue' || b.kind === 'shop') { drawSpecial(b, bx, by, bw, bh, time); continue; }
    for (const r of b.roofs) {
      const rx = bx + r.x * T + 4, ry = by + r.y * T + 4, rw = r.w * T - 8, rh = r.h * T - 8;
      ctx.fillStyle = '#0000003a'; ctx.fillRect(rx + 9, ry + 9, rw, rh);
      ctx.fillStyle = r.c; ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = '#ffffff26'; ctx.fillRect(rx, ry, rw, 5); ctx.fillRect(rx, ry, 5, rh);
      ctx.fillStyle = '#00000022'; ctx.fillRect(rx, ry + rh - 5, rw, 5); ctx.fillRect(rx + rw - 5, ry, 5, rh);
      if (r.h2 > .45) { ctx.fillStyle = '#8b8f96'; ctx.fillRect(rx + rw * .2, ry + rh * .25, 18, 14); ctx.fillStyle = '#6d7178'; ctx.fillRect(rx + rw * .2 + 3, ry + rh * .25 + 3, 12, 8); }
      if (r.h2 < .3) { ctx.fillStyle = '#a7c7d9'; ctx.fillRect(rx + rw * .55, ry + rh * .55, 22, 22); }
    }
  }
}
function drawSpecial(b, bx, by, bw, bh, time) {
  if (b.kind === 'shop') {
    ctx.fillStyle = '#0000003a'; ctx.fillRect(bx + 12, by + 12, bw - 8, bh - 8);
    ctx.fillStyle = '#f3c6cf'; ctx.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
    ctx.fillStyle = '#fff'; for (let x = bx + 4; x < bx + bw - 4; x += 20) ctx.fillRect(x, by + bh - 22, 10, 18);
    label('Pâtisserie', bx + bw / 2, by + bh / 2, '#8a2f55');
    return;
  }
  // Salle de réception : jardin, allée, bâtiment, guirlande et anneau lumineux
  ctx.fillStyle = '#8cc074'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#e9dcc0'; ctx.fillRect(bx + bw / 2 - 18, by, 36, bh * .45);
  ctx.fillStyle = '#0000003a'; ctx.fillRect(bx + bw * .18 + 10, by + bh * .4 + 10, bw * .64, bh * .5);
  ctx.fillStyle = '#f4ece6'; ctx.fillRect(bx + bw * .18, by + bh * .4, bw * .64, bh * .5);
  ctx.fillStyle = '#c98a5f'; ctx.fillRect(bx + bw * .18, by + bh * .4, bw * .64, 14);
  label('Salle de réception', bx + bw / 2, by + bh * .66, '#8a2f55');
  for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#f3c6cf' : '#e0b354'; ctx.beginPath(); ctx.arc(bx + 20 + i * (bw - 40) / 8, by + 18, 5, 0, 7); ctx.fill(); }
  const pulse = 1 + Math.sin(time * 4) * .12;
  ctx.strokeStyle = '#e0b354'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(GOAL.x, GOAL.y, 40 * pulse, 0, 7); ctx.stroke();
  ctx.fillStyle = '#e0b35433'; ctx.fill();
}
function label(txt, x, y, col) {
  ctx.font = '700 18px Fredoka, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 5; ctx.strokeStyle = '#fffaf4'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
  ctx.textBaseline = 'alphabetic';
}

function drawCar(c) {
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
  const L = c.len, Wd = c.wid;
  ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.roundRect(-L / 2 + 4, -Wd / 2 + 5, L, Wd, 7); ctx.fill();
  if (c.player) {
    // Camionnette du pâtissier, pièce montée visible sur le toit vitré
    ctx.fillStyle = '#fffaf4'; ctx.beginPath(); ctx.roundRect(-L / 2 - 4, -Wd / 2 - 1, L + 8, Wd + 2, 7); ctx.fill();
    ctx.fillStyle = '#f3c6cf'; ctx.fillRect(-L / 2 - 2, -Wd / 2 + 1, 6, Wd - 2);
    ctx.fillStyle = '#5a6b80'; ctx.beginPath(); ctx.roundRect(L / 2 - 14, -Wd / 2 + 3, 10, Wd - 6, 3); ctx.fill();
    const k = game.player.cake / 100;
    for (const [r, col] of [[10, '#fff6ea'], [7, '#f3c6cf'], [4, '#fff6ea']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-6, 0, r * (.55 + .45 * k), 0, 7); ctx.fill(); }
    ctx.fillStyle = '#e0b354'; ctx.beginPath(); ctx.arc(-6, 0, 1.8, 0, 7); ctx.fill();
    if (game.player.boost > 0) { ctx.fillStyle = Math.random() < .5 ? '#ffd27a' : '#ff8a5b'; ctx.beginPath(); ctx.moveTo(-L / 2 - 4, -5); ctx.lineTo(-L / 2 - 18 - Math.random() * 10, 0); ctx.lineTo(-L / 2 - 4, 5); ctx.fill(); }
  } else {
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.roundRect(-L / 2, -Wd / 2, L, Wd, 8); ctx.fill();
    ctx.fillStyle = '#ffffff30'; ctx.fillRect(-L / 2 + 4, -Wd / 2 + 2, L - 8, 3);
    ctx.fillStyle = '#2b3340cc'; ctx.beginPath(); ctx.roundRect(L / 2 - 17, -Wd / 2 + 3, 9, Wd - 6, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-L / 2 + 6, -Wd / 2 + 4, 7, Wd - 8, 3); ctx.fill();
    if (c.chaser) { ctx.fillStyle = c.team === 'marie' ? '#e0b354' : '#fffaf4'; ctx.fillRect(-6, -Wd / 2, 4, Wd); ctx.fillRect(2, -Wd / 2, 4, Wd); }
  }
  ctx.fillStyle = '#fff3b0'; ctx.fillRect(L / 2 - 3, -Wd / 2 + 2, 3, 5); ctx.fillRect(L / 2 - 3, Wd / 2 - 7, 3, 5);
  ctx.restore();
  if (c.chaser) {
    ctx.font = '700 15px Fredoka, system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 4;
    ctx.strokeStyle = '#1c0816'; ctx.strokeText(c.name, c.x, c.y - 26);
    ctx.fillStyle = c.team === 'marie' ? '#b9c8ef' : '#f3c6cf'; ctx.fillText(c.name, c.x, c.y - 26);
    if (c.steal > 0) { ctx.fillStyle = '#1c0816aa'; ctx.fillRect(c.x - 20, c.y - 44, 40, 6); ctx.fillStyle = '#ff9b93'; ctx.fillRect(c.x - 20, c.y - 44, 40 * c.steal / 70, 6); }
  }
}

const ICON = { icing: '🍰', nitro: '🚀', time: '⏱' };
function draw() {
  const g = game, p = g ? g.player : null;
  const cam = g ? g.cam : { x: START.x + Math.sin(performance.now() / 4000) * 300, y: START.y + 200 };
  ctx.save();
  ctx.fillStyle = '#5c5560'; ctx.fillRect(0, 0, W, H);
  let sx = 0, sy = 0; if (g && g.shake) { sx = (Math.random() - .5) * g.shake; sy = (Math.random() - .5) * g.shake; }
  ctx.translate(Math.round(W / 2 - cam.x + sx), Math.round(H / 2 - cam.y + sy));
  drawCity(cam.x, cam.y);
  if (g) {
    ctx.fillStyle = '#1b17201f';
    for (const s of g.skid) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.globalAlpha = s.life / 240; ctx.fillRect(-14, -12, 6, 4); ctx.fillRect(-14, 8, 6, 4); ctx.restore(); }
    ctx.globalAlpha = 1;
    ctx.font = '26px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const k of g.pickups) {
      if (k.taken || Math.abs(k.x - cam.x) > W / 2 + 40 || Math.abs(k.y - cam.y) > H / 2 + 40) continue;
      const bob = Math.sin(performance.now() / 300 + k.x) * 3;
      ctx.fillStyle = '#fffaf4cc'; ctx.beginPath(); ctx.arc(k.x, k.y + bob, 20, 0, 7); ctx.fill();
      ctx.strokeStyle = '#e0b354'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillText(ICON[k.kind], k.x, k.y + bob + 1);
    }
    ctx.textBaseline = 'alphabetic';
    for (const c of g.civ) drawCar(c);
    for (const c of g.chasers) drawCar(c);
    drawCar(p);
  }
  ctx.restore();
  if (g) hud();
}

function hud() {
  const g = game, p = g.player;
  // Jauge du gâteau
  ctx.fillStyle = '#1c0816cc'; ctx.beginPath(); ctx.roundRect(14, 14, 250, 58, 12); ctx.fill();
  const msgY = W < 700 ? H - 150 : H - 40;
  ctx.font = '600 15px Fredoka, system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#fbeff2'; ctx.fillText('🎂 Gâteau', 26, 37);
  ctx.fillStyle = '#3a1028'; ctx.fillRect(26, 46, 226, 14);
  ctx.fillStyle = p.cake > 60 ? '#7fd18b' : p.cake > 30 ? '#f2c14e' : '#ff7a6b'; ctx.fillRect(26, 46, 226 * p.cake / 100, 14);
  ctx.textAlign = 'right'; ctx.fillStyle = '#fbeff2'; ctx.fillText(`${Math.round(p.cake)} %`, 252, 37);
  // Temps
  const s = Math.ceil(g.time / 60);
  const tx = W < 700 ? W - 74 : W / 2;
  ctx.textAlign = 'center'; ctx.fillStyle = '#1c0816cc'; ctx.beginPath(); ctx.roundRect(tx - 60, 14, 120, 50, 12); ctx.fill();
  ctx.font = '700 28px Fredoka, system-ui'; ctx.fillStyle = s <= 15 ? '#ff9b93' : '#fbeff2';
  ctx.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, tx, 50);
  // Turbo et distance
  ctx.fillStyle = '#1c0816cc'; ctx.beginPath(); ctx.roundRect(14, 80, 250, 34, 12); ctx.fill();
  ctx.font = '600 15px Fredoka, system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#fbeff2';
  const dist = Math.hypot(GOAL.x - p.x, GOAL.y - p.y) / T * 20;
  ctx.fillText(`${'🚀'.repeat(p.nitro) || 'Turbo : vide'}   ·   Salle : ${dist >= 1000 ? (dist / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(dist) + ' m'}`, 26, 102);
  // Flèche vers la salle
  const ang = Math.atan2(GOAL.y - p.y, GOAL.x - p.x), px = W / 2 + (p.x - g.cam.x), py = H / 2 + (p.y - g.cam.y);
  if (dist > 140) {
    ctx.save(); ctx.translate(px + Math.cos(ang) * 58, py + Math.sin(ang) * 58); ctx.rotate(ang);
    ctx.fillStyle = '#e0b354'; ctx.strokeStyle = '#1c0816'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
  }
  // Messages
  ctx.textAlign = 'center';
  g.texts.forEach((t, i) => {
    ctx.globalAlpha = Math.min(1, t.life / 30); ctx.font = '700 20px Fredoka, system-ui';
    ctx.lineWidth = 5; ctx.strokeStyle = '#1c0816'; ctx.strokeText(t.txt, W / 2, msgY - (g.texts.length - 1 - i) * 28);
    ctx.fillStyle = t.c; ctx.fillText(t.txt, W / 2, msgY - (g.texts.length - 1 - i) * 28);
  });
  ctx.globalAlpha = 1;
  minimap();
}
const mini = document.createElement('canvas');
function buildMinimap() {
  mini.width = N * 3; mini.height = N * 3; const m = mini.getContext('2d');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const t = grid[y * N + x];
    m.fillStyle = t === ROAD || t === BRIDGE ? '#d8cfc3' : t === PARK ? '#7fb36a' : t === WATER ? '#3f86b3' : '#5b4a55';
    m.fillRect(x * 3, y * 3, 3, 3);
  }
  for (const [b, c] of [[shopBlock, '#f3c6cf'], [venueBlock, '#e0b354']]) { m.fillStyle = c; m.fillRect(b.x0 * 3, b.y0 * 3, (b.x1 - b.x0 + 1) * 3, (b.y1 - b.y0 + 1) * 3); }
}
function minimap() {
  const g = game, S = W < 700 ? 110 : 150, k = S / (N * T), mx = W - S - 14, my = H - S - 14;
  ctx.fillStyle = '#1c0816cc'; ctx.beginPath(); ctx.roundRect(mx - 6, my - 6, S + 12, S + 12, 10); ctx.fill();
  ctx.globalAlpha = .9; ctx.drawImage(mini, mx, my, S, S); ctx.globalAlpha = 1;
  const dot = (x, y, c, r) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(mx + x * k, my + y * k, r, 0, 7); ctx.fill(); };
  dot(GOAL.x, GOAL.y, '#e0b354', 5 + Math.sin(performance.now() / 200));
  for (const c of g.chasers) dot(c.x, c.y, c.team === 'marie' ? '#7f9ad6' : '#ff8fb5', 3.2);
  dot(g.player.x, g.player.y, '#fff', 4); dot(g.player.x, g.player.y, '#e0458b', 2.4);
}

/* ---------- Boucle ---------- */
let last = 0, acc = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(100, ts - last); last = ts;
  if (game && game.running && !game.paused) { acc += dt; while (acc >= 1000 / 60) { acc -= 1000 / 60; step(); if (!game.running) break; } }
  draw();
}
function togglePause() {
  if (!game || !game.running) return;
  game.paused = !game.paused; $('#pause').hidden = !game.paused;
  if (game.paused) { musicStop(.2); engine(0, false); $('#resume').focus(); } else musicStart();
}
$('#start').addEventListener('click', () => { lastLvl = +document.querySelector('[name=lvl]:checked').value; newGame(lastLvl); });
let lastLvl = 1;
$('#pauseBtn').addEventListener('click', togglePause);
$('#resume').addEventListener('click', togglePause);
$('#quit').addEventListener('click', () => { musicStop(.2); engine(0, false); game = null; $('#pause').hidden = true; $('#menu').hidden = false; });
$('#again').addEventListener('click', () => newGame(lastLvl));
$('#toMenu').addEventListener('click', () => { game = null; $('#end').hidden = true; $('#menu').hidden = false; });
$('#musicBtn').addEventListener('click', (e) => {
  Music.on = !Music.on; e.currentTarget.textContent = `Musique : ${Music.on ? 'oui' : 'non'}`; e.currentTarget.setAttribute('aria-pressed', Music.on);
  if (!Music.on) musicStop(.2); else if (game && game.running && !game.paused) musicStart();
});
$('#soundBtn').addEventListener('click', (e) => {
  soundOn = !soundOn; e.currentTarget.textContent = `Bruitages : ${soundOn ? 'oui' : 'non'}`; e.currentTarget.setAttribute('aria-pressed', soundOn);
  if (!soundOn) engine(0, false);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.running && !game.paused) togglePause(); });

buildCity(); buildMinimap(); readCfg(); loadBoard();
requestAnimationFrame(loop);
// Intégré à la page des jeux : on indique notre hauteur pour ajuster le cadre
if (document.documentElement.classList.contains('embed') && window.parent !== window) {
  const tell = () => { try { parent.postMessage({ jeu: 'hauteur', h: Math.ceil(document.body.getBoundingClientRect().height) }, '*'); } catch { /* rien */ } };
  const embedObserver = new ResizeObserver(tell); embedObserver.observe(document.body); tell();
}
}
